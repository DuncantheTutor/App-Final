import { storageGetItem, storageSetItem } from "./encryptedLocalStorage";

export type FeedMutedUntilByFriendId = Record<string, number | null>;

const FEED_MUTES_STORAGE_PREFIX = "mvpplus.feedMutes.v1";

export function feedMutesStorageKeyForEmail(email: string): string {
  return `${FEED_MUTES_STORAGE_PREFIX}:${email.trim().toLowerCase()}`;
}

/** Drop timed mutes past expiry; keep `null` (mute until unmuted). */
export function pruneExpiredFeedMutes(
  mutes: FeedMutedUntilByFriendId,
  now = Date.now()
): FeedMutedUntilByFriendId {
  const next: FeedMutedUntilByFriendId = {};
  for (const [friendId, until] of Object.entries(mutes)) {
    if (!friendId.trim()) continue;
    if (until === null || until > now) {
      next[friendId] = until;
    }
  }
  return next;
}

export function parseFeedMutesPayload(raw: unknown): FeedMutedUntilByFriendId {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: FeedMutedUntilByFriendId = {};
  for (const [friendId, until] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(friendId ?? "").trim();
    if (!id) continue;
    if (until === null) {
      next[id] = null;
      continue;
    }
    const ms = typeof until === "number" ? until : Number(until);
    if (Number.isFinite(ms)) {
      next[id] = ms;
    }
  }
  return pruneExpiredFeedMutes(next);
}

export async function readFeedMutesForEmail(email: string): Promise<FeedMutedUntilByFriendId> {
  if (!email.trim()) return {};
  const raw = await storageGetItem(feedMutesStorageKeyForEmail(email));
  if (!raw) return {};
  try {
    return parseFeedMutesPayload(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function writeFeedMutesForEmail(
  email: string,
  mutes: FeedMutedUntilByFriendId
): Promise<void> {
  const key = feedMutesStorageKeyForEmail(email);
  if (!email.trim()) return;
  const pruned = pruneExpiredFeedMutes(mutes);
  await storageSetItem(key, JSON.stringify(pruned));
}
