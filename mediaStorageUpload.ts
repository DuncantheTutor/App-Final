import * as Random from "expo-random";
import { getDownloadURL, ref, uploadBytes, type UploadMetadata } from "firebase/storage";

import { readLocalMediaBlob } from "./app/lib/readLocalMediaForUpload";
import { guessMediaContentType } from "./app/lib/mediaKind";
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
  return guessMediaContentType(uri);
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
 * Upload local media so recipients can load it via HTTPS. Storage rules match `request.auth.uid`
 * to the first path segment — use **Firebase Auth `currentUser.uid`**, not the app uid (`u_…`).
 */
export type UploadedSharedMedia = {
  downloadUrl: string;
  objectPath: string;
};

export async function uploadSharedMediaFromDevice(
  localUri: string,
  firebaseAuthUid: string
): Promise<UploadedSharedMedia> {
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
  const blob = await readLocalMediaBlob(localUri);
  const metadata: UploadMetadata = { contentType: blob.type || guessContentType(localUri) };

  try {
    await authUser.getIdToken();
    await uploadBytes(storageRef, blob, metadata);
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, objectPath };
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
  const uploaded = await uploadSharedMediaFromDevice(trimmed, firebaseAuthUid);
  return uploaded.downloadUrl;
}

export async function resolvePostMediaUrisForEncrypt(
  imageUris: string[] | undefined,
  videoUri: string | undefined | null,
  videoPosterUri: string | undefined | null,
  firebaseAuthUid: string
): Promise<{
  imageUris?: string[];
  videoUri?: string;
  videoPosterUri?: string;
  storageObjectPaths: string[];
}> {
  const storageObjectPaths: string[] = [];
  const uploadForPost = async (uri: string | undefined | null): Promise<string | undefined> => {
    if (!uri?.trim()) return undefined;
    const trimmed = uri.trim();
    if (!mediaUriNeedsFirebaseUpload(trimmed)) return trimmed;
    const uploaded = await uploadSharedMediaFromDevice(trimmed, firebaseAuthUid);
    storageObjectPaths.push(uploaded.objectPath);
    return uploaded.downloadUrl;
  };
  const uploadedImages = await Promise.all((imageUris ?? []).map((u) => uploadForPost(u)));
  const imgs = uploadedImages.filter((x): x is string => !!x);
  const vid = await uploadForPost(videoUri);
  const poster = await uploadForPost(videoPosterUri);
  return {
    imageUris: imgs.length ? imgs : undefined,
    videoUri: vid,
    videoPosterUri: poster,
    storageObjectPaths,
  };
}
