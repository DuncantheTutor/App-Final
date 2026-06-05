/**

 * React Native–safe reads of picker/camera URIs for Firebase Storage uploads.

 *

 * Avoids:

 * - `blob.arrayBuffer()` on large files (can block the JS thread)

 * - `new Blob([Uint8Array])` (RN rejects ArrayBuffer / ArrayBufferView parts)

 * - `FileSystem.EncodingType.Base64` when the legacy enum is undefined

 * - Loading entire videos as base64 strings in JS heap

 */

import * as FileSystem from "expo-file-system/legacy";



import { yieldToUi } from "./yieldToUi";

import {

  base64ToUint8Array,

  blobToUint8Array,

  uint8ArrayToBase64,

} from "./tierBMedia/crypto";



export const FILE_SYSTEM_BASE64_ENCODING =

  (FileSystem as typeof FileSystem & { EncodingType?: { Base64: string } }).EncodingType?.Base64 ??

  "base64";



/** Prefer fetch/FileReader over base64 string reads above this size. */

const LARGE_MEDIA_BYTES = 2 * 1024 * 1024;

/** Base64-encode in aligned chunks so the UI can breathe between segments. */

const BASE64_ENCODE_CHUNK_BYTES = 3 * 256 * 1024;



export function isDeviceMediaUri(uri: string): boolean {

  const trimmed = uri.trim();

  return (

    trimmed.startsWith("file://") ||

    trimmed.startsWith("content://") ||

    trimmed.startsWith("ph://") ||

    trimmed.startsWith("assets-library://") ||

    trimmed.startsWith("/")

  );

}



function looksLikeVideoUri(uri: string): boolean {

  const lower = uri.split("?")[0]?.toLowerCase() ?? "";

  return /\.(mp4|mov|m4v|webm|mkv|3gp|avi)$/.test(lower);

}



function looksLikeAudioUri(uri: string): boolean {

  const lower = uri.split("?")[0]?.toLowerCase() ?? "";

  return /\.(m4a|aac|caf|mp3|wav|ogg)$/.test(lower);

}



async function getLocalMediaSize(uri: string): Promise<number | null> {

  if (!isDeviceMediaUri(uri)) return null;

  try {

    const info = await FileSystem.getInfoAsync(uri);

    if (info.exists && typeof info.size === "number" && info.size > 0) {

      return info.size;

    }

  } catch {

    /* fall through */

  }

  return null;

}



async function shouldPreferFetchBlob(uri: string): Promise<boolean> {

  if (looksLikeVideoUri(uri) || looksLikeAudioUri(uri)) return true;

  const size = await getLocalMediaSize(uri);

  return size !== null && size >= LARGE_MEDIA_BYTES;

}



function writableTempDir(): string | null {

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? null;

  return dir ? `${dir}mvpplus-media-upload/` : null;

}



async function ensureTempDir(): Promise<string | null> {

  const dir = writableTempDir();

  if (!dir) return null;

  const info = await FileSystem.getInfoAsync(dir);

  if (!info.exists) {

    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  }

  return dir;

}



async function randomTempName(): Promise<string> {

  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

}



/** Base64-encode large byte arrays in chunks so the UI thread can breathe. */
export async function uint8ArrayToBase64WithYields(bytes: Uint8Array): Promise<string> {

  if (bytes.length <= BASE64_ENCODE_CHUNK_BYTES) {

    return uint8ArrayToBase64(bytes);

  }

  const parts: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BASE64_ENCODE_CHUNK_BYTES) {

    if (offset > 0) {

      await yieldToUi();

    }

    const end = Math.min(offset + BASE64_ENCODE_CHUNK_BYTES, bytes.length);

    parts.push(uint8ArrayToBase64(bytes.subarray(offset, end)));

  }

  return parts.join("");

}



async function readViaFetchBlob(trimmed: string): Promise<Uint8Array> {

  await yieldToUi();

  const response = await fetch(trimmed);

  if (!response.ok) {

    throw new Error(`Could not read media file (${response.status}).`);

  }

  const blob = await response.blob();

  if (!blob || blob.size === 0) {

    throw new Error("Media file is empty.");

  }

  const bytes = await blobToUint8Array(blob);

  await yieldToUi();

  return bytes;

}



/** Read local media bytes — fetch/FileReader for large video/audio; FileSystem for small images. */

export async function readLocalMediaBytes(localUri: string): Promise<Uint8Array> {

  const trimmed = localUri.trim();

  if (!trimmed) {

    throw new Error("Media file path is empty.");

  }



  const preferFetch = await shouldPreferFetchBlob(trimmed);

  if (!preferFetch && isDeviceMediaUri(trimmed)) {

    try {

      const base64 = await FileSystem.readAsStringAsync(trimmed, {

        encoding: FILE_SYSTEM_BASE64_ENCODING as "base64",

      });

      if (base64) return base64ToUint8Array(base64);

    } catch {

      /* fall through to fetch/blob */

    }

  }



  return readViaFetchBlob(trimmed);

}



/** Materialize bytes as an RN-native Blob suitable for `uploadBytes`. */

export async function bytesToUploadBlob(bytes: Uint8Array): Promise<Blob> {

  const dir = await ensureTempDir();

  if (!dir) {

    throw new Error("No writable cache directory for media upload.");

  }

  const tempPath = `${dir}${await randomTempName()}.bin`;

  await yieldToUi();

  const base64 = await uint8ArrayToBase64WithYields(bytes);

  await FileSystem.writeAsStringAsync(tempPath, base64, {

    encoding: FILE_SYSTEM_BASE64_ENCODING as "base64",

  });

  try {

    await yieldToUi();

    const response = await fetch(tempPath);

    if (!response.ok) {

      throw new Error(`Could not read media temp file (${response.status}).`);

    }

    const blob = await response.blob();

    if (!blob || blob.size === 0) {

      throw new Error("Media upload blob is empty.");

    }

    return blob;

  } finally {

    void FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => undefined);

  }

}



/** Read local URI and return a Blob for Firebase `uploadBytes`. */

export async function readLocalMediaBlob(localUri: string): Promise<Blob> {

  return bytesToUploadBlob(await readLocalMediaBytes(localUri));

}

/** Write decrypted media bytes to a cache `file://` path without blocking the UI. */

export async function writeUint8ArrayToCacheFile(

  targetPath: string,

  bytes: Uint8Array

): Promise<void> {

  await yieldToUi();

  const base64 = await uint8ArrayToBase64WithYields(bytes);

  await FileSystem.writeAsStringAsync(targetPath, base64, {

    encoding: FILE_SYSTEM_BASE64_ENCODING as "base64",

  });

}


