import * as Random from "expo-random";
import nacl from "tweetnacl";
import { decodeBase64, encodeBase64 } from "tweetnacl-util";

export type TierBMediaKeyMaterial = {
  keyB64: string;
  nonceB64: string;
};

export async function createTierBMediaKeyMaterial(): Promise<TierBMediaKeyMaterial> {
  const key = await Random.getRandomBytesAsync(32);
  const nonce = await Random.getRandomBytesAsync(24);
  return {
    keyB64: encodeBase64(key),
    nonceB64: encodeBase64(nonce),
  };
}

export function encryptBytesWithTierBKey(
  plainBytes: Uint8Array,
  material: TierBMediaKeyMaterial
): Uint8Array {
  const key = decodeBase64(material.keyB64);
  const nonce = decodeBase64(material.nonceB64);
  const cipher = nacl.secretbox(plainBytes, nonce, key);
  if (!cipher) {
    throw new Error("Could not encrypt media file.");
  }
  return cipher;
}

export function decryptBytesWithTierBKey(
  cipherBytes: Uint8Array,
  material: Pick<TierBMediaKeyMaterial, "keyB64" | "nonceB64">
): Uint8Array {
  const key = decodeBase64(material.keyB64);
  const nonce = decodeBase64(material.nonceB64);
  const plain = nacl.secretbox.open(cipherBytes, nonce, key);
  if (!plain) {
    throw new Error("Could not decrypt media file.");
  }
  return plain;
}

function readBlobViaFileReader(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
        return;
      }
      reject(new Error("Could not read media blob."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read media blob."));
    reader.readAsArrayBuffer(blob);
  });
}

/** RN Blobs from `fetch(file://…).blob()` often lack `.arrayBuffer()`. */
const LARGE_BLOB_BYTES = 2 * 1024 * 1024;

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  if (blob.size >= LARGE_BLOB_BYTES) {
    return readBlobViaFileReader(blob);
  }
  const arrayBufferFn = (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer;
  if (typeof arrayBufferFn === "function") {
    return new Uint8Array(await arrayBufferFn.call(blob));
  }
  return readBlobViaFileReader(blob);
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  return decodeBase64(base64);
}
