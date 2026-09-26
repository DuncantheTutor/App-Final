import * as admin from "firebase-admin";

const ENCRYPTED_MEDIA_PREFIX = "encrypted-media/";
const SIGNED_URL_TTL_MS = 6 * 60 * 60 * 1000;

/** Firebase download URLs embed a long-lived token. Pull the object path out. */
export function storageObjectPathFromDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const firebaseHost =
      host === "firebasestorage.googleapis.com" ||
      host.endsWith(".firebasestorage.app") ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (!firebaseHost) return null;
    const marker = "/o/";
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) return null;
    const decoded = decodeURIComponent(url.pathname.slice(idx + marker.length));
    return normalizeOwnedMediaPath(decoded);
  } catch {
    return null;
  }
}

export function normalizeOwnedMediaPath(raw: unknown): string | null {
  const path = String(raw ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || !path.startsWith(ENCRYPTED_MEDIA_PREFIX)) return null;
  const rest = path.slice(ENCRYPTED_MEDIA_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash < 1 || slash === rest.length - 1) return null;
  const authSegment = rest.slice(0, slash);
  const objectId = rest.slice(slash + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(authSegment)) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(objectId)) return null;
  return `${ENCRYPTED_MEDIA_PREFIX}${authSegment}/${objectId}`;
}

export function mediaPathOwnedByAuthUid(path: string, firebaseAuthUid: string): boolean {
  const normalized = normalizeOwnedMediaPath(path);
  const owner = firebaseAuthUid.trim();
  if (!normalized || !owner) return false;
  return normalized.startsWith(`${ENCRYPTED_MEDIA_PREFIX}${owner}/`);
}

type PictureFields = {
  profilePictureUrl?: string | null;
  profilePicturePath?: string | null;
};

/**
 * Value stored on `users/{id}`. Firebase token URLs are reduced to an object path
 * so the token is not kept on the document. Other https URLs are kept.
 */
export function profilePictureFieldsForStorage(
  profilePictureUrl: string,
  explicitPath: string,
  ownerFirebaseAuthUid: string
): { profilePicturePath?: string; profilePictureUrl?: string | null } {
  const path =
    (explicitPath && mediaPathOwnedByAuthUid(explicitPath, ownerFirebaseAuthUid)
      ? normalizeOwnedMediaPath(explicitPath)
      : null) || storageObjectPathFromDownloadUrl(profilePictureUrl);
  if (path && mediaPathOwnedByAuthUid(path, ownerFirebaseAuthUid)) {
    return { profilePicturePath: path, profilePictureUrl: null };
  }
  if (/^https:\/\//i.test(profilePictureUrl) && !storageObjectPathFromDownloadUrl(profilePictureUrl)) {
    return { profilePictureUrl };
  }
  return {};
}

/** Short-lived read URL for a profile photo. Firebase token URLs are not returned. */
export async function profilePictureUrlForClient(
  ownerFirebaseAuthUid: string | null,
  fields: PictureFields
): Promise<string | null> {
  const storedPath = normalizeOwnedMediaPath(fields.profilePicturePath);
  const parsedPath = storageObjectPathFromDownloadUrl(fields.profilePictureUrl);
  const path = storedPath || parsedPath;
  if (path && ownerFirebaseAuthUid && mediaPathOwnedByAuthUid(path, ownerFirebaseAuthUid)) {
    try {
      const [url] = await admin.storage().bucket().file(path).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + SIGNED_URL_TTL_MS,
      });
      return url;
    } catch (err) {
      if (process.env.FUNCTIONS_EMULATOR === "true") {
        const legacy = String(fields.profilePictureUrl ?? "").trim();
        return /^https?:\/\//i.test(legacy) ? legacy : null;
      }
      console.error("profilePicture.sign_failed", err);
      return null;
    }
  }
  const raw = String(fields.profilePictureUrl ?? "").trim();
  if (!raw || storageObjectPathFromDownloadUrl(raw)) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  return null;
}
