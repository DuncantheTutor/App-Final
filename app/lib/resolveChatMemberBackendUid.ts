import { backendUidForFriendId } from "../../backendBridge";

import {
  canonicalDirectChatLocalId,
  isCanonicalDmHiddenForViewer,
} from "./directChatId";
import type { Chat, Friend } from "../domain/types";

export const CURRENT_USER_LOCAL_ID = "me";

export function isAppBackendUid(uid: string | null | undefined): uid is string {
  return typeof uid === "string" && uid.trim().startsWith("u_");
}
/**
 * Maps a chat `memberIds` entry to the server app uid (`u_*`).
 * Never returns `f_*` hash placeholders — those are not real accounts.
 */
export function resolveChatMemberToBackendUid(
  memberId: string,
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): string | null {
  const trimmed = memberId.trim();
  if (!trimmed || trimmed === CURRENT_USER_LOCAL_ID) {
    return sessionAppUid;
  }
  if (trimmed.startsWith("u_")) {
    return trimmed;
  }
  const friend = friendMap[trimmed];
  const fromFriend = friend?.backendUid?.trim();
  if (fromFriend?.startsWith("u_")) {
    return fromFriend;
  }
  const mapped = friendIdToBackendUid[trimmed]?.trim();
  if (mapped?.startsWith("u_")) {
    return mapped;
  }
  return null;
}

export function resolveChatParticipantBackendUids(
  memberIds: string[],
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): string[] {
  const out = new Set<string>([sessionAppUid]);
  for (const memberId of memberIds) {
    if (memberId === CURRENT_USER_LOCAL_ID) continue;
    const uid = resolveChatMemberToBackendUid(memberId, sessionAppUid, friendMap, friendIdToBackendUid);
    if (uid) out.add(uid);
  }
  return [...out];
}

/** Normalize persisted chat rows so member ids use canonical friend ids when possible. */
export function normalizeChatMemberIds(
  memberIds: string[],
  friendMap: Record<string, Friend>,
  backendUidToFriendId: Record<string, string>
): string[] {
  return memberIds.map((id) => {
    if (id === CURRENT_USER_LOCAL_ID) return id;
    if (friendMap[id]) return id;
    const trimmed = id.trim();
    if (trimmed.startsWith("u_")) {
      return backendUidToFriendId[trimmed] ?? id;
    }
    return id;
  });
}

/** Map server `senderUid` to a client friend row id for display and chat membership. */
export function resolveIncomingSenderFriendId(
  senderUid: string,
  sessionAppUid: string,
  backendUidToFriendId: Record<string, string>
): string {
  const trimmed = senderUid.trim();
  if (!trimmed || trimmed === sessionAppUid) {
    return CURRENT_USER_LOCAL_ID;
  }
  if (backendUidToFriendId[trimmed]) {
    return backendUidToFriendId[trimmed];
  }
  if (isAppBackendUid(trimmed)) {
    return trimmed;
  }
  return backendUidForFriendId(trimmed);
}

function isDirectChatWithFriend(
  chat: Chat,
  friendId: string,
  canonicalId: string,
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): boolean {
  if ((chat.kind ?? "standard") !== "standard") return false;
  const others = chat.memberIds.filter((id) => id !== CURRENT_USER_LOCAL_ID);
  if (others.length !== 1) return false;
  const otherId = others[0];
  if (otherId === friendId || otherId === canonicalId) return true;
  const targetBackendUid = resolveChatMemberToBackendUid(
    friendId,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid
  );
  if (!targetBackendUid) return false;
  const otherBackendUid = resolveChatMemberToBackendUid(
    otherId,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid
  );
  return otherBackendUid === targetBackendUid;
}

/** Find an existing 1:1 chat even when member ids mixed legacy `u_*` and canonical `f_*` ids. */
export function findExistingDirectChat(
  chats: Chat[],
  friendId: string,
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): Chat | undefined {
  const canonicalId = friendMap[friendId]?.id ?? friendId;
  return chats.find((chat) =>
    isDirectChatWithFriend(chat, friendId, canonicalId, sessionAppUid, friendMap, friendIdToBackendUid)
  );
}

/**
 * Best 1:1 thread to open for messaging: skips identity-locked artifacts; prefers newest `__live` thread.
 */
export function findActiveDirectChatForFriend(
  chats: Chat[],
  friendId: string,
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>,
  identityLockedChatIds?: ReadonlySet<string>,
  hiddenServerConversationIds?: ReadonlySet<string>,
  hiddenLocalChatIds?: ReadonlySet<string>
): Chat | undefined {
  const canonicalId = friendMap[friendId]?.id ?? friendId;
  const friendBackendUid = resolveChatMemberToBackendUid(
    friendId,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid
  );
  const canonicalDmLocalId =
    friendBackendUid?.startsWith("u_")
      ? canonicalDirectChatLocalId(sessionAppUid, friendBackendUid)
      : null;
  const canonicalHidden =
    canonicalDmLocalId != null &&
    friendBackendUid?.startsWith("u_") &&
    isCanonicalDmHiddenForViewer(
      sessionAppUid,
      friendBackendUid,
      hiddenLocalChatIds ?? new Set<string>(),
      hiddenServerConversationIds ?? new Set<string>()
    );

  const candidates = chats.filter((chat) =>
    isDirectChatWithFriend(chat, friendId, canonicalId, sessionAppUid, friendMap, friendIdToBackendUid)
  );
  const unlocked = candidates.filter((chat) => {
    if (identityLockedChatIds?.has(chat.id)) return false;
    if (canonicalHidden && chat.id === canonicalDmLocalId) return false;
    return true;
  });
  if (unlocked.length === 0) return undefined;
  const live = unlocked.filter((c) => c.id.includes("__live"));
  const pool = live.length > 0 ? live : unlocked;
  return [...pool].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
}
