import { Alert } from "react-native";

import type { Chat, Friend } from "../domain/types";
import { CURRENT_USER_LOCAL_ID } from "../lib/chatMemberJoinedAt";
import { allocateLiveDirectChatLocalId, canonicalDirectChatLocalId } from "../lib/directChatId";
import {
  findActiveDirectChatForFriend,
  resolveChatMemberToBackendUid,
} from "../lib/resolveChatMemberBackendUid";
import type { BackendSession } from "./types";

export type OpenDirectChatParams = {
  friendId: string;
  session: BackendSession | null;
  chats: Chat[];
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  unfriendedIds: string[];
  identityLockedChatIds?: ReadonlySet<string>;
  resolveDisplayName: (friendId: string) => string;
  normalizeMemberSet: (ids: string[]) => string;
  goToChat: (chatId: string) => void;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
};

function buildNewDirectChatRow(params: {
  chatId: string;
  canonicalFriendRowId: string;
  friendId: string;
  friendMap: Record<string, Friend>;
  resolveDisplayName: (friendId: string) => string;
}): Chat {
  const { chatId, canonicalFriendRowId, friendId, friendMap, resolveDisplayName } = params;
  const profile = friendMap[canonicalFriendRowId] ?? friendMap[friendId];
  return {
    id: chatId,
    memberIds: [CURRENT_USER_LOCAL_ID, canonicalFriendRowId],
    name: resolveDisplayName(canonicalFriendRowId),
    profilePicture: profile?.profilePictureUrl || undefined,
    kind: "standard",
    createdBy: CURRENT_USER_LOCAL_ID,
    isCustomName: false,
    isDraft: true,
    visibleToRecipients: false,
    updatedAt: Date.now(),
  };
}

/**
 * Opens an existing 1:1 thread or creates one.
 * - First friendship: canonical `dm_{u_a}__{u_b}`.
 * - After unfriend → refriend: new `dm_*__live_{ts}` while the locked artifact stays read-only.
 */
export function openDirectChatWithFriend(params: OpenDirectChatParams): void {
  const {
    friendId,
    session,
    chats,
    friendMap,
    friendIdToBackendUid,
    unfriendedIds,
    identityLockedChatIds,
    resolveDisplayName,
    normalizeMemberSet,
    goToChat,
    setChats,
  } = params;

  const canonicalFriendRowId = friendMap[friendId]?.id ?? friendId;
  if (unfriendedIds.includes(canonicalFriendRowId)) return;

  const friendBackendUid = session
    ? resolveChatMemberToBackendUid(
        canonicalFriendRowId,
        session.uid,
        friendMap,
        friendIdToBackendUid
      )
    : null;

  const canonicalChatId =
    session && friendBackendUid?.startsWith("u_")
      ? canonicalDirectChatLocalId(session.uid, friendBackendUid)
      : null;

  const existingActive = session
    ? findActiveDirectChatForFriend(
        chats,
        friendId,
        session.uid,
        friendMap,
        friendIdToBackendUid,
        identityLockedChatIds
      )
    : chats.find(
        (chat) =>
          normalizeMemberSet(chat.memberIds) ===
          normalizeMemberSet([CURRENT_USER_LOCAL_ID, canonicalFriendRowId])
      );

  if (existingActive) {
    goToChat(existingActive.id);
    return;
  }

  if (!canonicalChatId || !friendBackendUid?.startsWith("u_")) {
    Alert.alert(
      "Cannot start chat",
      "This friend is not linked to a server account yet. Try refreshing your friends list or re-adding them."
    );
    return;
  }

  const canonicalLocked = identityLockedChatIds?.has(canonicalChatId) ?? false;
  const newChatId = canonicalLocked
    ? allocateLiveDirectChatLocalId(session!.uid, friendBackendUid, identityLockedChatIds)
    : canonicalChatId;

  const newChat = buildNewDirectChatRow({
    chatId: newChatId,
    canonicalFriendRowId,
    friendId,
    friendMap,
    resolveDisplayName,
  });
  setChats((current) => [newChat, ...current]);
  goToChat(newChatId);
}
