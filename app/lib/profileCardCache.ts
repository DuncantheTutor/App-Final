/**
 * Persisted cache of friend "profile cards" (display name, bio, avatar) for
 * every profile the user has opened. Lets a returning/offline user still see
 * who someone is — name, bio and picture — even when posts and media cannot be
 * fetched. Keyed by signed-in email so accounts never bleed into each other,
 * encrypted at rest on device, and cleared alongside the rest of the local social cache.
 */
import { storageGetItem, storageRemoveItem, storageSetItem } from "./encryptedLocalStorage";

export type CachedProfileCard = {
  friendId: string;
  backendUid?: string;
  displayName: string;
  bio: string;
  profilePictureUrl: string;
  updatedAt: number;
};

export function profileCardCacheStorageKey(email: string): string {
  return `mvpplus.profileCardCache.v1:${email.trim().toLowerCase()}`;
}

export async function readProfileCardCache(
  email: string
): Promise<Record<string, CachedProfileCard>> {
  try {
    const raw = await storageGetItem(profileCardCacheStorageKey(email));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, CachedProfileCard> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const card = value as Partial<CachedProfileCard> | null;
      if (!card || typeof card !== "object") continue;
      const friendId = String(card.friendId ?? key).trim();
      if (!friendId) continue;
      out[friendId] = {
        friendId,
        backendUid: card.backendUid ? String(card.backendUid).trim() : undefined,
        displayName: String(card.displayName ?? "").trim(),
        bio: String(card.bio ?? ""),
        profilePictureUrl: String(card.profilePictureUrl ?? ""),
        updatedAt: typeof card.updatedAt === "number" ? card.updatedAt : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeProfileCardCache(
  email: string,
  cards: Record<string, CachedProfileCard>
): Promise<void> {
  try {
    await storageSetItem(profileCardCacheStorageKey(email), JSON.stringify(cards));
  } catch {
    /* best-effort */
  }
}

export async function clearProfileCardCacheForEmail(email: string): Promise<void> {
  try {
    await storageRemoveItem(profileCardCacheStorageKey(email));
  } catch {
    /* best-effort */
  }
}
