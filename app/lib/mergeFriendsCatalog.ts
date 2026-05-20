import { backendUidForFriendId } from "../../backendBridge";
import { friendDisplayNameFromProfile, pickFriendDisplayName } from "./friendDisplayName";
import { mergeProfilePictureUrl } from "./profilePictureUrl";
import type { Friend } from "../domain/types";

function isAppBackendUid(uid: string): boolean {
  return uid.startsWith("u_");
}

/**
 * One row per real account (`u_*` backend uid). Collapses legacy rows whose
 * `id` was the raw uid or an older hash format.
 */
export function dedupeFriendsByBackendUid(
  friends: Friend[],
  canonicalIdForBackendUid: (backendUid: string) => string = backendUidForFriendId
): Friend[] {
  const byBackendUid = new Map<string, Friend>();
  const seedOnlyById = new Map<string, Friend>();

  for (const friend of friends) {
    const backendUid = friend.backendUid?.trim() ?? "";
    if (backendUid && isAppBackendUid(backendUid)) {
      const canonicalId = canonicalIdForBackendUid(backendUid);
      const existing = byBackendUid.get(backendUid);
      const merged: Friend = existing
        ? {
            ...existing,
            ...friend,
            id: canonicalId,
            backendUid,
            displayName: pickFriendDisplayName(
              [friend.displayName, existing.displayName],
              backendUid
            ),
            profilePictureUrl: mergeProfilePictureUrl(
              friend.profilePictureUrl,
              existing.profilePictureUrl
            ),
            bio: friend.bio || existing.bio,
            online: friend.online ?? existing.online,
            messageCount: Math.max(existing.messageCount, friend.messageCount),
          }
        : {
            ...friend,
            id: canonicalId,
            backendUid,
            displayName: friendDisplayNameFromProfile(friend.displayName, backendUid),
          };
      byBackendUid.set(backendUid, merged);
      continue;
    }
    if (!seedOnlyById.has(friend.id)) {
      seedOnlyById.set(friend.id, friend);
    }
  }

  const canonicalIds = new Set([...byBackendUid.values()].map((f) => f.id));
  const out: Friend[] = [...byBackendUid.values()];
  for (const friend of seedOnlyById.values()) {
    if (canonicalIds.has(friend.id)) continue;
    out.push(friend);
  }
  return out;
}

/**
 * Merges seed/demo friends with server-synced friends without duplicate rows.
 * Real friends (with `backendUid`) win over seed placeholders that share the same uid.
 */
export function mergeFriendsCatalog(seedFriends: Friend[], addedFriends: Friend[]): Friend[] {
  const addedDeduped = dedupeFriendsByBackendUid(addedFriends);
  const byId = new Map<string, Friend>();
  const backendUidToCanonicalId = new Map<string, string>();

  for (const friend of addedDeduped) {
    byId.set(friend.id, friend);
    const bu = friend.backendUid?.trim();
    if (bu) backendUidToCanonicalId.set(bu, friend.id);
  }

  for (const friend of seedFriends) {
    const bu = friend.backendUid?.trim();
    if (bu) {
      const canonicalId = backendUidToCanonicalId.get(bu);
      if (canonicalId && canonicalId !== friend.id) continue;
    }
    if (!byId.has(friend.id)) {
      byId.set(friend.id, friend);
    }
  }

  return dedupeFriendsByBackendUid([...byId.values()]);
}

/** Friends list rows: hide unfriended ids and at most one row per `u_*` account. */
export function friendsForFriendsList(allFriends: Friend[], unfriendedIds: string[]): Friend[] {
  const unfriendedSet = new Set(unfriendedIds);
  const tombstonedBackendUids = new Set<string>();
  for (const id of unfriendedIds) {
    for (const f of allFriends) {
      if (f.id !== id) continue;
      const bu = f.backendUid?.trim();
      if (bu && isAppBackendUid(bu)) tombstonedBackendUids.add(bu);
    }
  }
  const seenBackend = new Set<string>();
  const candidates: Friend[] = [];
  for (const f of allFriends) {
    if (unfriendedSet.has(f.id)) continue;
    const bu = f.backendUid?.trim();
    if (bu && isAppBackendUid(bu)) {
      if (tombstonedBackendUids.has(bu)) continue;
      if (seenBackend.has(bu)) continue;
      seenBackend.add(bu);
    }
    candidates.push(f);
  }
  return dedupeFriendsByBackendUid(candidates);
}

/** Upsert into ritual-added friends without duplicate rows for the same backend uid. */
export function upsertRitualFriend(prev: Friend[], friend: Friend): Friend[] {
  const backendUid = friend.backendUid?.trim();
  let nextFriend = friend;
  if (backendUid && isAppBackendUid(backendUid)) {
    nextFriend = {
      ...friend,
      id: backendUidForFriendId(backendUid),
      backendUid,
      displayName: friendDisplayNameFromProfile(friend.displayName, backendUid),
    };
  }
  if (backendUid) {
    const index = prev.findIndex((f) => f.backendUid?.trim() === backendUid);
    if (index >= 0) {
      const existing = prev[index];
      const merged: Friend = {
        ...existing,
        ...nextFriend,
        id: backendUidForFriendId(backendUid),
        backendUid,
        displayName: pickFriendDisplayName(
          [nextFriend.displayName, existing.displayName],
          backendUid
        ),
      };
      const unchanged =
        existing.displayName === merged.displayName &&
        existing.profilePictureUrl === merged.profilePictureUrl &&
        existing.bio === merged.bio &&
        existing.id === merged.id;
      if (unchanged) return prev;
      const next = [...prev];
      next[index] = merged;
      return dedupeFriendsByBackendUid(next);
    }
  }
  if (prev.some((f) => f.id === nextFriend.id)) {
    const index = prev.findIndex((f) => f.id === nextFriend.id);
    const existing = prev[index];
    const merged = { ...existing, ...nextFriend };
    if (
      existing.displayName === merged.displayName &&
      existing.profilePictureUrl === merged.profilePictureUrl &&
      existing.bio === merged.bio
    ) {
      return prev;
    }
    const next = [...prev];
    next[index] = merged;
    return dedupeFriendsByBackendUid(next);
  }
  return dedupeFriendsByBackendUid([...prev, nextFriend]);
}

export function applyPresenceToFriends(
  friends: Friend[],
  onlineByBackendUid: Record<string, boolean>,
  friendIdToBackendUid?: Record<string, string>
): Friend[] {
  return friends.map((friend) => {
    const bu =
      friend.backendUid?.trim() ||
      friendIdToBackendUid?.[friend.id]?.trim() ||
      (friend.id.trim().startsWith("u_") ? friend.id.trim() : "");
    if (!bu.startsWith("u_")) return friend;
    const online = onlineByBackendUid[bu];
    if (online === undefined) return friend;
    return friend.online === online ? friend : { ...friend, online };
  });
}
