import * as FileSystem from "expo-file-system/legacy";
import * as Random from "expo-random";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";

import { cacheExtensionForContentType } from "./mediaKind";
import { yieldToUi } from "./yieldToUi";
import type { EncryptedMediaRef } from "./tierBMedia/types";

const MEDIA_CACHE_KEY_SECURE_STORE = "mvpplus.deviceMediaCacheKey.v1";

const ENC_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}mvpplus-tierb-enc/`;
const SESSION_PLAIN_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}mvpplus-tierb-session/`;

let mediaKeyPromise: Promise<Uint8Array> | null = null;

async function getMediaCacheKey(): Promise<Uint8Array> {
  if (!mediaKeyPromise) {
    mediaKeyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(MEDIA_CACHE_KEY_SECURE_STORE);
      if (existing?.trim()) {
        const decoded = decodeBase64(existing.trim());
        if (decoded.length === nacl.secretbox.keyLength) return decoded;
      }
      const fresh = await Random.getRandomBytesAsync(nacl.secretbox.keyLength);
      await SecureStore.setItemAsync(MEDIA_CACHE_KEY_SECURE_STORE, encodeBase64(fresh));
      return fresh;
    })();
  }
  return mediaKeyPromise;
}

function safeObjectSlug(objectPath: string): string {
  return objectPath.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function encryptedCachePath(mediaRef: EncryptedMediaRef): string {
  return `${ENC_DIR}${safeObjectSlug(mediaRef.objectPath)}.enc`;
}

function sessionPlainPath(mediaRef: EncryptedMediaRef, plainBytes?: Uint8Array): string {
  const ct = mediaRef.contentType.toLowerCase();
  let ext = cacheExtensionForContentType(mediaRef.contentType);
  if (ext === "jpg" && plainBytes && plainBytes.length > 8) {
    const tag = String.fromCharCode(plainBytes[4], plainBytes[5], plainBytes[6], plainBytes[7]);
    if (tag === "ftyp") ext = "m4a";
  }
  if (ext === "jpg" && (ct.includes("audio") || ct.includes("3gp") || ct.includes("amr"))) {
    ext = ct.includes("3gp") || ct.includes("amr") ? "3gp" : "m4a";
  }
  return `${SESSION_PLAIN_DIR}${safeObjectSlug(mediaRef.objectPath)}.${ext}`;
}

async function ensureDir(dir: string): Promise<void> {
  if (!dir) return;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function encryptBytesToFile(path: string, plain: Uint8Array): Promise<void> {
  const key = await getMediaCacheKey();
  const nonce = await Random.getRandomBytesAsync(nacl.secretbox.nonceLength);
  const boxed = nacl.secretbox(plain, nonce, key);
  const payload = `${encodeBase64(nonce)}.${encodeBase64(boxed)}`;
  await FileSystem.writeAsStringAsync(path, payload, { encoding: "utf8" });
}

async function decryptFileToBytes(path: string): Promise<Uint8Array | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    const dot = raw.indexOf(".");
    if (dot <= 0) return null;
    const key = await getMediaCacheKey();
    const nonce = decodeBase64(raw.slice(0, dot));
    const boxed = decodeBase64(raw.slice(dot + 1));
    const opened = nacl.secretbox.open(boxed, nonce, key);
    return opened ?? null;
  } catch {
    return null;
  }
}

async function writePlainBytesToSession(path: string, plain: Uint8Array): Promise<void> {
  await yieldToUi();
  const base64 = encodeBase64(plain);
  await FileSystem.writeAsStringAsync(path, base64, { encoding: "base64" });
}

/** Persist decrypted media bytes encrypted at rest (Tier B display cache). */
export async function writeEncryptedMediaCache(
  mediaRef: EncryptedMediaRef,
  plainBytes: Uint8Array
): Promise<void> {
  await ensureDir(ENC_DIR);
  await encryptBytesToFile(encryptedCachePath(mediaRef), plainBytes);
}

/** True when encrypted at-rest cache exists for this object. */
export async function hasEncryptedMediaCache(mediaRef: EncryptedMediaRef): Promise<boolean> {
  await ensureDir(ENC_DIR);
  const info = await FileSystem.getInfoAsync(encryptedCachePath(mediaRef));
  return info.exists && (info.size ?? 0) > 0;
}

/**
 * Returns a `file://` URI for expo-av / Image (decrypted session copy).
 * Encrypted blob remains on disk; session plain is recreated when missing.
 */
export async function resolveSessionPlainMediaUri(
  mediaRef: EncryptedMediaRef,
  freshlyDecryptedPlain?: Uint8Array
): Promise<string> {
  await ensureDir(SESSION_PLAIN_DIR);
  const sessionPath = sessionPlainPath(mediaRef, freshlyDecryptedPlain);
  const sessionInfo = await FileSystem.getInfoAsync(sessionPath);
  if (sessionInfo.exists && (sessionInfo.size ?? 0) > 0) {
    return sessionPath;
  }

  let plain = freshlyDecryptedPlain;
  if (!plain) {
    const encPath = encryptedCachePath(mediaRef);
    const encInfo = await FileSystem.getInfoAsync(encPath);
    if (!encInfo.exists) {
      throw new Error("Encrypted media cache missing.");
    }
    plain = (await decryptFileToBytes(encPath)) ?? undefined;
  }
  if (!plain || plain.length === 0) {
    throw new Error("Could not decrypt cached media.");
  }

  if (freshlyDecryptedPlain) {
    await writeEncryptedMediaCache(mediaRef, freshlyDecryptedPlain);
  }

  await writePlainBytesToSession(sessionPath, plain);
  return sessionPath;
}

/** Remove decrypted session copies (e.g. sign-out); encrypted cache optional. */
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
  await wipe(SESSION_PLAIN_DIR);
  if (options?.includeEncryptedAtRest) {
    await wipe(ENC_DIR);
    /** Pre–at-rest-encryption builds stored plaintext under this folder. */
    const legacyPlainDir = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}mvpplus-tierb-media/`;
    await wipe(legacyPlainDir);
  }
}
