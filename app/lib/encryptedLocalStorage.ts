import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Random from "expo-random";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from "tweetnacl-util";

/** Legacy prefix from the short-lived encrypted cache experiment (Jun 2026). */
export const ENCRYPTED_STORAGE_PREFIX = "enc1:";

const MASTER_KEY_SECURE_STORE = "mvpplus.deviceLocalCacheKey.v1";

let masterKeyPromise: Promise<Uint8Array> | null = null;

async function legacyMasterKey(): Promise<Uint8Array> {
  if (!masterKeyPromise) {
    masterKeyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(MASTER_KEY_SECURE_STORE);
      if (existing?.trim()) {
        const decoded = decodeBase64(existing.trim());
        if (decoded.length === nacl.secretbox.keyLength) return decoded;
      }
      const fresh = await Random.getRandomBytesAsync(nacl.secretbox.keyLength);
      await SecureStore.setItemAsync(MASTER_KEY_SECURE_STORE, encodeBase64(fresh));
      return fresh;
    })();
  }
  return masterKeyPromise;
}

function isLegacyEncryptedPayload(raw: string): boolean {
  return raw.startsWith(ENCRYPTED_STORAGE_PREFIX);
}

function decryptLegacyUtf8(payload: string, key: Uint8Array): string | null {
  if (!isLegacyEncryptedPayload(payload)) return null;
  const body = payload.slice(ENCRYPTED_STORAGE_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0) return null;
  try {
    const nonce = decodeBase64(body.slice(0, dot));
    const boxed = decodeBase64(body.slice(dot + 1));
    const opened = nacl.secretbox.open(boxed, nonce, key);
    if (!opened) return null;
    return encodeUTF8(opened);
  } catch {
    return null;
  }
}

/** Read a string from on-device cache (plaintext; one-time decrypt of legacy `enc1:` blobs). */
export async function storageGetItem(key: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return null;
  if (!isLegacyEncryptedPayload(raw)) return raw;
  const keyBytes = await legacyMasterKey();
  const plain = decryptLegacyUtf8(raw, keyBytes);
  if (plain == null) {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
  try {
    await AsyncStorage.setItem(key, plain);
  } catch {
    /* best-effort migration to plaintext */
  }
  return plain;
}

/** Persist a string in plaintext AsyncStorage. */
export async function storageSetItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function storageRemoveItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function storageGetJson<T>(key: string): Promise<T | null> {
  const raw = await storageGetItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function storageSetJson(key: string, value: unknown): Promise<void> {
  await storageSetItem(key, JSON.stringify(value));
}

/** Firebase Auth React Native persistence — same surface as AsyncStorage. */
export const encryptedAsyncStorageAdapter = {
  getItem: storageGetItem,
  setItem: storageSetItem,
  removeItem: storageRemoveItem,
};
