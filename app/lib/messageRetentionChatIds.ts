import {
  buildVisibleThreadMessagesByChatId,
  filterChatsVisibleInInbox,
} from "./chatListLastMessage";
import { localChatIdsForDirectThread } from "./directChatId";
import type { Chat, Friend, Message } from "../domain/types";

export function retainedMessageChatIds(params: {
  chats: Chat[];
  messages: Message[];
  sessionAppUid: string | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  currentUserId: string;
  currentUserLocalId: string;
  unfriendedIds: string[];
  openChatLocalId?: string | null;
}): Set<string> {
  const {
    chats,
    messages,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid,
    currentUserId,
    currentUserLocalId,
    unfriendedIds,
    openChatLocalId,
  } = params;

  const listParams = {
    chats,
    messages,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid,
    currentUserId,
    currentUserLocalId,
  };

  const threadByChatId = buildVisibleThreadMessagesByChatId(listParams);
  const lastMessageByChatId: Record<string, Message | undefined> = {};
  for (const chat of chats) {
    const thread = threadByChatId[chat.id];
    if (thread?.length) lastMessageByChatId[chat.id] = thread[thread.length - 1];
  }

  const retained = new Set<string>();
  for (const chat of filterChatsVisibleInInbox(chats, lastMessageByChatId, unfriendedIds, currentUserId)) {
    retained.add(chat.id);
  }

  const openId = openChatLocalId?.trim();
  if (openId && sessionAppUid) {
    for (const id of localChatIdsForDirectThread(
      openId,
      chats,
      sessionAppUid,
      friendMap,
      friendIdToBackendUid
    )) {
      retained.add(id);
    }
  } else if (openId) {
    retained.add(openId);
  }

  return retained;
}
