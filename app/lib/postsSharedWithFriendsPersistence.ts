import { storageGetItem, storageSetItem } from "./encryptedLocalStorage";

const POSTS_SHARED_WITH_FRIENDS_PREFIX = "mvpplus.postsSharedWithFriends.v1";

export function postsSharedWithFriendsStorageKeyForEmail(email: string): string {
  return `${POSTS_SHARED_WITH_FRIENDS_PREFIX}:${email.trim().toLowerCase()}`;
}

export function parsePostsSharedWithFriendsPayload(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  const out = new Set<string>();
  for (const uid of raw) {
    const id = String(uid ?? "").trim();
    if (id.startsWith("u_")) out.add(id);
  }
  return out;
}

export async function readPostsSharedWithFriends(email: string): Promise<Set<string>> {
  try {
    const raw = await storageGetItem(postsSharedWithFriendsStorageKeyForEmail(email));
    if (!raw) return new Set();
    return parsePostsSharedWithFriendsPayload(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export async function writePostsSharedWithFriends(
  email: string,
  sharedWith: ReadonlySet<string>
): Promise<void> {
  await storageSetItem(
    postsSharedWithFriendsStorageKeyForEmail(email),
    JSON.stringify([...sharedWith])
  );
}
