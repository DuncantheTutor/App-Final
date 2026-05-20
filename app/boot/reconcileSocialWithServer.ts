import type { Chat, Friend, Message } from "../domain/types";
import { CURRENT_USER_LOCAL_ID } from "../lib/chatMemberJoinedAt";
import {
  isCanonicalDirectChatId,
  isLiveDirectChatLocalId,
  resolveCanonicalDirectChatLocalId,
} from "../lib/directChatId";
import { resolveChatMemberToBackendUid } from "../lib/resolveChatMemberBackendUid";

function isMultiPartyLocalChatId(chatId: string): boolean {
  const id = chatId.trim();
  return id.startsWith("grp_") || id.startsWith("bc_");
}

/**
 * Drop local chats/messages that reference friends no longer on the server.
 * When the server friend list is empty, clears all local threads (fresh account).
 */
export function reconcileSocialStateWithServerFriends(params: {
  serverFriends: Friend[];
  chats: Chat[];
  messages: Message[];
  sessionAppUid: string;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  /** When false, an empty friend list does not wipe local threads (boot error / listener race). */
  serverFriendsFetchSucceeded?: boolean;
}): { chats: Chat[]; messages: Message[] } {
  const {
    serverFriends,
    chats,
    messages,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid,
    serverFriendsFetchSucceeded = true,
  } = params;

  if (serverFriends.length === 0) {
    if (!serverFriendsFetchSucceeded) {
      return { chats, messages };
    }
    return { chats: [], messages: [] };
  }

  const allowedBackendUids = new Set(
    serverFriends.map((f) => f.backendUid?.trim()).filter((uid): uid is string => !!uid?.startsWith("u_"))
  );

  const keptChatIds = new Set<string>();
  const nextChats: Chat[] = [];

  for (const chat of chats) {
    if (isMultiPartyLocalChatId(chat.id) || (chat.memberIds?.length ?? 0) > 2) {
      keptChatIds.add(chat.id);
      nextChats.push(chat);
      continue;
    }
    const canonical = resolveCanonicalDirectChatLocalId(
      chat,
      sessionAppUid,
      friendMap,
      friendIdToBackendUid
    );
    if (canonical) {
      const others = chat.memberIds.filter((id) => id !== CURRENT_USER_LOCAL_ID);
      const friendBackendUid = others[0]
        ? resolveChatMemberToBackendUid(
            others[0],
            sessionAppUid,
            friendMap,
            friendIdToBackendUid
          )
        : null;
      if (friendBackendUid && allowedBackendUids.has(friendBackendUid)) {
        keptChatIds.add(chat.id);
        if (isLiveDirectChatLocalId(chat.id)) {
          nextChats.push(chat);
        } else if (isCanonicalDirectChatId(chat.id) || chat.id === canonical) {
          nextChats.push(chat);
        } else {
          nextChats.push({ ...chat, id: canonical });
          keptChatIds.add(canonical);
        }
        continue;
      }
    }
    if (isCanonicalDirectChatId(chat.id)) {
      const parts = chat.id.replace(/^dm_/, "").split("__");
      const otherUid = parts.find((p) => p !== sessionAppUid);
      if (otherUid && allowedBackendUids.has(otherUid)) {
        keptChatIds.add(chat.id);
        nextChats.push(chat);
      }
    }
  }

  const nextMessages = messages.filter((m) => keptChatIds.has(m.chatId));
  return { chats: nextChats, messages: nextMessages };
}
