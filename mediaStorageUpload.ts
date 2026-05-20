import * as Random from "expo-random";
import { getDownloadURL, ref, uploadBytes, type UploadMetadata } from "firebase/storage";

import { firebaseAuth, getFirebaseStorage } from "./firebaseAuthClient";

/** Local picker / camera URIs must be uploaded; HTTPS URLs (including Firebase download links) are left as-is. */
export function mediaUriNeedsFirebaseUpload(uri: string | undefined | null): boolean {
  if (!uri?.trim()) return false;
  const u = uri.trim().toLowerCase();
  if (u.startsWith("https://") || u.startsWith("http://")) return false;
  return true;
}

async function randomObjectId(): Promise<string> {
  const bytes = await Random.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function guessContentType(uri: string): string {
  const lower = uri.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".caf")) return "audio/mp4";
  return "image/jpeg";
}

function storageErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = String((err as { code: string }).code);
    if (code === "storage/unauthorized") {
      return "Storage rejected this upload. Sign out and sign in again, then retry.";
    }
    if (code === "storage/canceled") {
      return "Upload was cancelled before it finished.";
    }
    if (code === "storage/quota-exceeded") {
      return "Storage quota exceeded for this project.";
    }
    if (code === "storage/retry-limit-exceeded") {
      return "Upload timed out. Check your connection and try again.";
    }
    if (code === "storage/unknown") {
      return "Storage upload failed. Confirm Firebase Storage is enabled for this project and that the app storage bucket matches app.json.";
    }
    return `Storage upload failed (${code}).`;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "Storage upload failed.";
}

/**
 * Read a local `file://`/`content://` URI as a Blob.
 *
 * React Native's `Blob` constructor does NOT accept `ArrayBuffer` or
 * `ArrayBufferView` parts (only `string | Blob`). The Firebase Storage Web SDK
 * always wraps non-Blob `uploadBytes` inputs in a `new Blob([data])`, which
 * blows up on RN with "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView'
 * are not supported." The reliable path is `await response.blob()` — RN's
 * fetch implementation returns a native Blob backed by the original file, and
 * `uploadBytes` will pass it through unchanged.
 */
async function readLocalUriAsBlob(localUri: string): Promise<Blob> {
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error(`Could not read media file (${response.status}).`);
  }
  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error("Media file is empty.");
  }
  return blob;
}

/**
 * Upload local media so recipients can load it via HTTPS. Storage rules match `request.auth.uid`
 * to the first path segment — use **Firebase Auth `currentUser.uid`**, not the app uid (`u_…`).
 */
export async function uploadSharedMediaFromDevice(localUri: string, firebaseAuthUid: string): Promise<string> {
  const authUser = firebaseAuth.currentUser;
  if (!authUser?.uid) {
    throw new Error("Firebase Auth is not ready. Please wait a moment and try again.");
  }
  if (authUser.uid !== firebaseAuthUid) {
    throw new Error("Signed-in account does not match the active upload session.");
  }

  const storage = getFirebaseStorage();
  const id = await randomObjectId();
  const objectPath = `encrypted-media/${firebaseAuthUid}/${id}`;
  const storageRef = ref(storage, objectPath);
  const blob = await readLocalUriAsBlob(localUri);
  const metadata: UploadMetadata = { contentType: blob.type || guessContentType(localUri) };

  try {
    await authUser.getIdToken();
    await uploadBytes(storageRef, blob, metadata);
    return getDownloadURL(storageRef);
  } catch (err) {
    throw new Error(storageErrorMessage(err));
  }
}

export async function uploadSharedMediaIfNeeded(
  localUri: string | undefined | null,
  firebaseAuthUid: string
): Promise<string | undefined> {
  if (!localUri?.trim()) return undefined;
  const trimmed = localUri.trim();
  if (!mediaUriNeedsFirebaseUpload(trimmed)) return trimmed;
  return uploadSharedMediaFromDevice(trimmed, firebaseAuthUid);
}

export async function resolvePostMediaUrisForEncrypt(
  imageUris: string[] | undefined,
  videoUri: string | undefined | null,
  videoPosterUri: string | undefined | null,
  firebaseAuthUid: string
): Promise<{ imageUris?: string[]; videoUri?: string; videoPosterUri?: string }> {
  const uploadedImages = await Promise.all((imageUris ?? []).map((u) => uploadSharedMediaIfNeeded(u, firebaseAuthUid)));
  const imgs = uploadedImages.filter((x): x is string => !!x);
  const vid = await uploadSharedMediaIfNeeded(videoUri ?? undefined, firebaseAuthUid);
  const poster = await uploadSharedMediaIfNeeded(videoPosterUri ?? undefined, firebaseAuthUid);
  return {
    imageUris: imgs.length ? imgs : undefined,
    videoUri: vid,
    videoPosterUri: poster,
  };
}
