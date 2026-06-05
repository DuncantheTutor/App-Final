import * as admin from "firebase-admin";

import { getFirestore } from "./firebaseAdmin";

const ENCRYPTED_MEDIA_PREFIX = "encrypted-media/";

/** Normalize client/server storage paths for post media under `encrypted-media/{authUid}/…`. */
export function normalizePostStorageObjectPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const entry of raw) {
    const path = String(entry ?? "").trim().replace(/^\/+/, "");
    if (!path || path.includes("..")) continue;
    if (!path.startsWith(ENCRYPTED_MEDIA_PREFIX)) continue;
    const rest = path.slice(ENCRYPTED_MEDIA_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash < 1 || slash === rest.length - 1) continue;
    const authSegment = rest.slice(0, slash);
    const objectId = rest.slice(slash + 1);
    if (!/^[A-Za-z0-9_-]+$/.test(authSegment)) continue;
    if (!/^[A-Za-z0-9_.-]+$/.test(objectId)) continue;
    out.add(`${ENCRYPTED_MEDIA_PREFIX}${authSegment}/${objectId}`);
  }
  return [...out];
}

export async function resolveFirebaseAuthUidForAppUid(appUid: string): Promise<string | null> {
  const trimmed = appUid.trim();
  if (!trimmed) return null;
  const snap = await getFirestore().collection("userFirebaseAuthMap").doc(trimmed).get();
  const authUid = (snap.data() as { firebaseAuthUid?: string } | undefined)?.firebaseAuthUid?.trim();
  return authUid || null;
}

export function assertPostStoragePathsOwnedByAuthUid(
  paths: string[],
  ownerAuthUid: string
): void {
  const prefix = `${ENCRYPTED_MEDIA_PREFIX}${ownerAuthUid}/`;
  for (const path of paths) {
    if (!path.startsWith(prefix)) {
      throw new Error(`storage path not owned by post author: ${path}`);
    }
  }
}

/**
 * Best-effort delete of Storage objects referenced by a post. Failures are logged
 * but do not fail the Firestore delete (orphan cleanup can be retried manually).
 */
export async function deletePostStorageObjectPaths(paths: string[]): Promise<void> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;
  const bucket = admin.storage().bucket();
  await Promise.all(
    unique.map(async (objectPath) => {
      try {
        await bucket.file(objectPath).delete({ ignoreNotFound: true });
      } catch {
        /* ignore — post already removed from feed */
      }
    })
  );
}

/** Legacy single-path field + `storageObjectPaths` array on the post doc. */
export function collectStoragePathsFromPostDoc(data: {
  mediaObjectPath?: string | null;
  storageObjectPaths?: unknown;
}): string[] {
  const paths = normalizePostStorageObjectPaths(data.storageObjectPaths);
  const legacy = String(data.mediaObjectPath ?? "").trim().replace(/^\/+/, "");
  if (legacy && legacy.startsWith(ENCRYPTED_MEDIA_PREFIX) && !legacy.includes("..")) {
    paths.push(...normalizePostStorageObjectPaths([legacy]));
  }
  return [...new Set(paths)];
}
