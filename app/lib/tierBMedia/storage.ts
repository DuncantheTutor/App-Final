import * as Random from "expo-random";

import { getBytes, ref, uploadBytes, type UploadMetadata } from "firebase/storage";

import { firebaseAuth, getFirebaseStorage } from "../../../firebaseAuthClient";
import { mediaUriNeedsFirebaseUpload } from "../../../mediaStorageUpload";
import {
  hasEncryptedMediaCache,
  resolveSessionPlainMediaUri,
  writeEncryptedMediaCache,
} from "../encryptedMediaCache";
import { bytesToUploadBlob, readLocalMediaBytes } from "../readLocalMediaForUpload";
import { guessMediaContentType, cacheExtensionForContentType } from "../mediaKind";
import { yieldToUi } from "../yieldToUi";
import { rememberDisplayMediaUri, peekDisplayMediaUri, tierBDisplayCacheKey } from "../displayMediaCache";
import type { EncryptedMediaRef } from "./types";
import {
  createTierBMediaKeyMaterial,
  decryptBytesWithTierBKey,
  encryptBytesWithTierBKey,
} from "./crypto";

/** Dedupe concurrent decrypt/download for the same Storage object. */
const resolveInFlight = new Map<string, Promise<string>>();

export type TierBResolvePriority = "normal" | "high";

type ResolveQueueEntry<T> = {
  work: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  priority: TierBResolvePriority;
};

/** One Tier B resolve at a time so a large video decrypt cannot starve the whole app. */
const resolveQueue: ResolveQueueEntry<unknown>[] = [];
let resolveQueueRunning = false;

async function drainResolveQueue(): Promise<void> {
  if (resolveQueueRunning) return;
  resolveQueueRunning = true;
  while (resolveQueue.length > 0) {
    const highIdx = resolveQueue.findIndex((entry) => entry.priority === "high");
    const entry =
      highIdx >= 0
        ? resolveQueue.splice(highIdx, 1)[0]
        : resolveQueue.shift();
    if (!entry) break;
    try {
      const result = await entry.work();
      entry.resolve(result);
    } catch (err) {
      entry.reject(err);
    }
    await yieldToUi();
  }
  resolveQueueRunning = false;
}

function enqueueTierBResolve<T>(
  work: () => Promise<T>,
  priority: TierBResolvePriority = "normal"
): Promise<T> {
  return new Promise((resolve, reject) => {
    resolveQueue.push({
      work,
      resolve: resolve as (value: unknown) => void,
      reject,
      priority,
    });
    void drainResolveQueue();
  });
}

async function randomObjectId(): Promise<string> {
  const bytes = await Random.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function guessContentType(uri: string, mediaKind?: Parameters<typeof guessMediaContentType>[1]): string {
  return guessMediaContentType(uri, mediaKind);
}

function extensionForContentType(contentType: string): string {
  return cacheExtensionForContentType(contentType);
}

function storageErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    return `Storage upload failed (${String((err as { code: string }).code)}).`;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "Storage upload failed.";
}

/**
 * Encrypt local media bytes and upload ciphertext to Storage (Tier B).
 * Profile pictures should keep using plaintext `uploadSharedMediaFromDevice`.
 */
export async function uploadTierBEncryptedMediaFromDevice(
  localUri: string,
  firebaseAuthUid: string,
  mediaKind?: Parameters<typeof guessMediaContentType>[1]
): Promise<EncryptedMediaRef> {
  const authUser = firebaseAuth.currentUser;
  if (!authUser?.uid) {
    throw new Error("Firebase Auth is not ready. Please wait a moment and try again.");
  }
  if (authUser.uid !== firebaseAuthUid) {
    throw new Error("Signed-in account does not match the active upload session.");
  }

  const contentType = guessContentType(localUri, mediaKind);
  const material = await createTierBMediaKeyMaterial();

  await yieldToUi();
  const plainBytes = await readLocalMediaBytes(localUri);
  await yieldToUi();
  const cipherBytes = encryptBytesWithTierBKey(plainBytes, material);
  await yieldToUi();

  const storage = getFirebaseStorage();
  const id = `${await randomObjectId()}.enc`;
  const objectPath = `encrypted-media/${firebaseAuthUid}/${id}`;
  const storageRef = ref(storage, objectPath);
  const metadata: UploadMetadata = { contentType: "application/octet-stream" };

  try {
    await authUser.getIdToken();
    await uploadBytes(storageRef, await bytesToUploadBlob(cipherBytes), metadata);
    return {
      objectPath,
      keyB64: material.keyB64,
      nonceB64: material.nonceB64,
      contentType,
    };
  } catch (err) {
    if (err instanceof Error && err.message.trim()) {
      throw err;
    }
    throw new Error(storageErrorMessage(err));
  }
}

export async function uploadTierBEncryptedMediaIfNeeded(
  localUri: string | undefined | null,
  firebaseAuthUid: string,
  mediaKind?: Parameters<typeof guessMediaContentType>[1]
): Promise<EncryptedMediaRef | undefined> {
  if (!localUri?.trim()) return undefined;
  const trimmed = localUri.trim();
  if (!mediaUriNeedsFirebaseUpload(trimmed)) return undefined;
  return uploadTierBEncryptedMediaFromDevice(trimmed, firebaseAuthUid, mediaKind);
}

async function resolveTierBMediaToFileUriInner(mediaRef: EncryptedMediaRef): Promise<string> {
  if (await hasEncryptedMediaCache(mediaRef)) {
    const sessionUri = await resolveSessionPlainMediaUri(mediaRef);
    rememberDisplayMediaUri(tierBDisplayCacheKey(mediaRef), sessionUri);
    return sessionUri;
  }

  const storage = getFirebaseStorage();
  const storageRef = ref(storage, mediaRef.objectPath);
  const bytes = await getBytes(storageRef);
  await yieldToUi();
  const plain = decryptBytesWithTierBKey(new Uint8Array(bytes), mediaRef);
  await yieldToUi();
  await writeEncryptedMediaCache(mediaRef, plain);
  const sessionUri = await resolveSessionPlainMediaUri(mediaRef, plain);
  rememberDisplayMediaUri(tierBDisplayCacheKey(mediaRef), sessionUri);
  return sessionUri;
}

/** Returns a cached Tier B file URI when decrypt/download already finished (no network). */
export async function peekTierBMediaFileUri(mediaRef: EncryptedMediaRef): Promise<string | undefined> {
  const mem = peekDisplayMediaUri(tierBDisplayCacheKey(mediaRef));
  if (mem) return mem;
  if (!(await hasEncryptedMediaCache(mediaRef))) return undefined;
  try {
    const sessionUri = await resolveSessionPlainMediaUri(mediaRef);
    rememberDisplayMediaUri(tierBDisplayCacheKey(mediaRef), sessionUri);
    return sessionUri;
  } catch {
    return undefined;
  }
}

/**
 * Download ciphertext from Storage, decrypt, write to app cache, return `file://` URI.
 */
export async function resolveTierBMediaToFileUri(
  mediaRef: EncryptedMediaRef,
  options?: { priority?: TierBResolvePriority }
): Promise<string> {
  const inFlightKey = mediaRef.objectPath;
  const pending = resolveInFlight.get(inFlightKey);
  if (pending) return pending;

  const work = enqueueTierBResolve(
    () => resolveTierBMediaToFileUriInner(mediaRef),
    options?.priority ?? "normal"
  );
  resolveInFlight.set(inFlightKey, work);
  try {
    return await work;
  } finally {
    if (resolveInFlight.get(inFlightKey) === work) {
      resolveInFlight.delete(inFlightKey);
    }
  }
}
