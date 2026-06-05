import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";

import { cacheExtensionForContentType } from "./mediaKind";
import { yieldToUi } from "./yieldToUi";
import type { EncryptedMediaRef } from "./tierBMedia/types";

/** Legacy device key — used only to one-time migrate old `.enc` on-disk blobs to plaintext. */
const LEGACY_MEDIA_CACHE_KEY_SECURE_STORE = "mvpplus.deviceMediaCacheKey.v1";

/** Plain Tier B display files (photos/videos/audio) — persistent across restarts. */
const PERSISTENT_ROOT = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
const PLAIN_MEDIA_DIR = `${PERSISTENT_ROOT}mvpplus-tierb-media/`;
const LEGACY_ENC_DIR = `${PERSISTENT_ROOT}mvpplus-tierb-enc/`;
const LEGACY_ENC_DIR_CACHE = `${FileSystem.cacheDirectory ?? ""}mvpplus-tierb-enc/`;
const LEGACY_SESSION_DIR = `${FileSystem.cacheDirectory ?? PERSISTENT_ROOT}mvpplus-tierb-session/`;

let legacyEncDirMigrationPromise: Promise<void> | null = null;

async function migrateLegacyEncDirFromCache(): Promise<void> {
  if (!legacyEncDirMigrationPromise) {
    legacyEncDirMigrationPromise = (async () => {
      if (!FileSystem.cacheDirectory || !FileSystem.documentDirectory) return;
      if (FileSystem.cacheDirectory === FileSystem.documentDirectory) return;
      const legacyInfo = await FileSystem.getInfoAsync(LEGACY_ENC_DIR_CACHE);
      if (!legacyInfo.exists) return;
      await ensureDir(PLAIN_MEDIA_DIR);
      let names: string[] = [];
      try {
        names = await FileSystem.readDirectoryAsync(LEGACY_ENC_DIR_CACHE);
      } catch {
        return;
      }
      await ensureDir(LEGACY_ENC_DIR);
      for (const name of names) {
        if (!name.endsWith(".enc")) continue;
        const from = `${LEGACY_ENC_DIR_CACHE}${name}`;
        const to = `${LEGACY_ENC_DIR}${name}`;
        const destInfo = await FileSystem.getInfoAsync(to);
        if (destInfo.exists && (destInfo.size ?? 0) > 0) continue;
        try {
          await FileSystem.moveAsync({ from, to });
        } catch {
          /* best-effort */
        }
        await yieldToUi();
      }
    })();
  }
  await legacyEncDirMigrationPromise;
}

let legacyMediaKeyPromise: Promise<Uint8Array | null> | null = null;

async function legacyMediaCacheKey(): Promise<Uint8Array | null> {
  if (!legacyMediaKeyPromise) {
    legacyMediaKeyPromise = (async () => {
      try {
        const existing = await SecureStore.getItemAsync(LEGACY_MEDIA_CACHE_KEY_SECURE_STORE);
        if (!existing?.trim()) return null;
        const decoded = decodeBase64(existing.trim());
        if (decoded.length === nacl.secretbox.keyLength) return decoded;
      } catch {
        /* no legacy key */
      }
      return null;
    })();
  }
  return legacyMediaKeyPromise;
}

function safeObjectSlug(objectPath: string): string {
  return objectPath.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extensionForMediaRef(mediaRef: EncryptedMediaRef, plainBytes?: Uint8Array): string {
  const ct = mediaRef.contentType.toLowerCase();
  let ext = cacheExtensionForContentType(mediaRef.contentType);
  if (ext === "jpg" && plainBytes && plainBytes.length > 8) {
    const tag = String.fromCharCode(plainBytes[4], plainBytes[5], plainBytes[6], plainBytes[7]);
    if (tag === "ftyp") ext = "m4a";
  }
  if (ext === "jpg" && (ct.includes("audio") || ct.includes("3gp") || ct.includes("amr"))) {
    ext = ct.includes("3gp") || ct.includes("amr") ? "3gp" : "m4a";
  }
  return ext;
}

function plainCachePath(mediaRef: EncryptedMediaRef, plainBytes?: Uint8Array): string {
  const ext = extensionForMediaRef(mediaRef, plainBytes);
  return `${PLAIN_MEDIA_DIR}${safeObjectSlug(mediaRef.objectPath)}.${ext}`;
}

function legacyEncryptedCachePath(objectPath: string): string {
  return `${LEGACY_ENC_DIR}${safeObjectSlug(objectPath)}.enc`;
}

async function ensureDir(dir: string): Promise<void> {
  if (!dir) return;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function writePlainBytesToFile(path: string, plain: Uint8Array): Promise<void> {
  await yieldToUi();
  await FileSystem.writeAsStringAsync(path, encodeBase64(plain), { encoding: "base64" });
}

async function decryptLegacyEncFile(path: string): Promise<Uint8Array | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    const dot = raw.indexOf(".");
    if (dot <= 0) return null;
    const key = await legacyMediaCacheKey();
    if (!key) return null;
    const nonce = decodeBase64(raw.slice(0, dot));
    const boxed = decodeBase64(raw.slice(dot + 1));
    const opened = nacl.secretbox.open(boxed, nonce, key);
    return opened ?? null;
  } catch {
    return null;
  }
}

/** One-time: decrypt a pre-plaintext-build `.enc` blob into the new plain cache file. */
async function migrateLegacyEncryptedCacheToPlain(
  mediaRef: EncryptedMediaRef
): Promise<string | undefined> {
  await migrateLegacyEncDirFromCache();
  const encPath = legacyEncryptedCachePath(mediaRef.objectPath);
  const encInfo = await FileSystem.getInfoAsync(encPath);
  if (!encInfo.exists || (encInfo.size ?? 0) <= 0) return undefined;

  const plain = await decryptLegacyEncFile(encPath);
  if (!plain || plain.length === 0) return undefined;

  await ensureDir(PLAIN_MEDIA_DIR);
  const plainPath = plainCachePath(mediaRef, plain);
  await writePlainBytesToFile(plainPath, plain);
  try {
    await FileSystem.deleteAsync(encPath, { idempotent: true });
  } catch {
    /* best-effort */
  }
  return plainPath;
}

/** Persist decrypted Tier B media as a plain file on disk (display cache). */
export async function writeEncryptedMediaCache(
  mediaRef: EncryptedMediaRef,
  plainBytes: Uint8Array
): Promise<void> {
  await ensureDir(PLAIN_MEDIA_DIR);
  await writePlainBytesToFile(plainCachePath(mediaRef, plainBytes), plainBytes);
}

/** True when a plain on-disk cache file exists for this object. */
export async function hasEncryptedMediaCache(mediaRef: EncryptedMediaRef): Promise<boolean> {
  await ensureDir(PLAIN_MEDIA_DIR);
  const plainPath = plainCachePath(mediaRef);
  const info = await FileSystem.getInfoAsync(plainPath);
  if (info.exists && (info.size ?? 0) > 0) return true;
  const migrated = await migrateLegacyEncryptedCacheToPlain(mediaRef);
  return !!migrated;
}

/**
 * Returns a `file://` URI for expo-av / Image. Plain files live in document storage.
 */
export async function resolveSessionPlainMediaUri(
  mediaRef: EncryptedMediaRef,
  freshlyDecryptedPlain?: Uint8Array
): Promise<string> {
  await ensureDir(PLAIN_MEDIA_DIR);
  const plainPath = plainCachePath(mediaRef, freshlyDecryptedPlain);
  const plainInfo = await FileSystem.getInfoAsync(plainPath);
  if (plainInfo.exists && (plainInfo.size ?? 0) > 0) {
    return plainPath;
  }

  if (freshlyDecryptedPlain && freshlyDecryptedPlain.length > 0) {
    await writePlainBytesToFile(plainPath, freshlyDecryptedPlain);
    return plainPath;
  }

  const migrated = await migrateLegacyEncryptedCacheToPlain(mediaRef);
  if (migrated) return migrated;

  throw new Error("Tier B media cache missing.");
}

/** Remove on-disk Tier B display cache (e.g. sign-out / reset local data). */
export async function clearEncryptedMediaCaches(options?: {
  includeEncryptedAtRest?: boolean;
}): Promise<void> {
  const wipe = async (dir: string) => {
    if (!dir) return;
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
      }
    } catch {
      /* best-effort */
    }
  };
  if (options?.includeEncryptedAtRest) {
    await wipe(PLAIN_MEDIA_DIR);
    await wipe(LEGACY_ENC_DIR);
    await wipe(LEGACY_ENC_DIR_CACHE);
    await wipe(LEGACY_SESSION_DIR);
  } else {
    await wipe(LEGACY_SESSION_DIR);
  }
}
