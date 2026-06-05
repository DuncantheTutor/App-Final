import { storageGetItem, storageSetItem } from "./encryptedLocalStorage";

import type { Post } from "../domain/types";

const FEED_REACTION_SEEN_STORAGE_PREFIX = "mvpplus.feedReactionSeen.v1";

export function feedReactionSeenStorageKeyForEmail(email: string): string {
  return `${FEED_REACTION_SEEN_STORAGE_PREFIX}:${email.trim().toLowerCase()}`;
}

/** Stable fingerprint of friend reactions on a post (excludes the owner's own reaction). */
export function otherReactionsSignature(
  reactions: Record<string, string> | undefined,
  ownerLocalId: string,
  ownerBackendUid?: string | null
): string {
  if (!reactions) return "";
  return Object.entries(reactions)
    .filter(([userId, emoji]) => {
      if (!String(emoji ?? "").trim()) return false;
      if (userId === ownerLocalId) return false;
      if (ownerBackendUid && userId === ownerBackendUid) return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, emoji]) => `${userId}:${emoji}`)
    .join("|");
}

export function countUnreadFeedReactionPosts(
  posts: Post[],
  ownerLocalId: string,
  ownerBackendUid: string | null,
  seenByPostId: Record<string, string>
): number {
  let count = 0;
  for (const post of posts) {
    if (post.authorId !== ownerLocalId) continue;
    const sig = otherReactionsSignature(post.feedReactions, ownerLocalId, ownerBackendUid);
    if (!sig) continue;
    if (sig !== (seenByPostId[post.id] ?? "")) count += 1;
  }
  return count;
}

export function markOwnedPostReactionsSeen(
  posts: Post[],
  ownerLocalId: string,
  ownerBackendUid: string | null,
  seenByPostId: Record<string, string>
): Record<string, string> {
  const next = { ...seenByPostId };
  for (const post of posts) {
    if (post.authorId !== ownerLocalId) continue;
    next[post.id] = otherReactionsSignature(post.feedReactions, ownerLocalId, ownerBackendUid);
  }
  return next;
}

export function parseFeedReactionSeenPayload(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, string> = {};
  for (const [postId, sig] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(postId ?? "").trim();
    if (!id) continue;
    next[id] = String(sig ?? "");
  }
  return next;
}

export async function readFeedReactionSeenForEmail(email: string): Promise<Record<string, string>> {
  if (!email.trim()) return {};
  const raw = await storageGetItem(feedReactionSeenStorageKeyForEmail(email));
  if (!raw) return {};
  try {
    return parseFeedReactionSeenPayload(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function writeFeedReactionSeenForEmail(
  email: string,
  seenByPostId: Record<string, string>
): Promise<void> {
  const key = feedReactionSeenStorageKeyForEmail(email);
  if (!email.trim()) return;
  await storageSetItem(key, JSON.stringify(seenByPostId));
}
