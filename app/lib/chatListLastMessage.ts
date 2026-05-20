import { joinCutoffMsForViewer } from "./chatMemberJoinedAt";
import { localChatIdsForDirectThread } from "./directChatId";
import type { Chat, Friend, Message } from "../domain/types";

/** Latest visible message per chat row (aggregates `__live` + canonical thread ids). */
export function buildLastMessageByChatId(params: {
  chats: Chat[];
  messages: Message[];
  sessionAppUid: string | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  currentUserId: string;
  currentUserLocalId: string;
}): Record<string, Message | undefined> {
  const {
    chats,
    messages,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid,
    currentUserId,
    currentUserLocalId,
  } = params;
  const result: Record<string, Message | undefined> = {};

  for (const chat of chats) {
    const threadIds =
      sessionAppUid && (chat.kind ?? "standard") === "standard"
        ? localChatIdsForDirectThread(
            chat.id,
            chats,
            sessionAppUid,
            friendMap,
            friendIdToBackendUid
          )
        : new Set<string>([chat.id]);
    const cutoff = joinCutoffMsForViewer(chat, sessionAppUid);

    for (const message of messages) {
      if (!threadIds.has(message.chatId)) continue;
      if (message.hiddenFromOwner) continue;
      const isMine =
        message.senderId === currentUserId || message.senderId === currentUserLocalId;
      if (
        isMine &&
        message.createdAt < cutoff &&
        message.deliveryStatus !== "sending" &&
        !message.unsentAt
      ) {
        continue;
      }
      const prev = result[chat.id];
      if (!prev || prev.createdAt < message.createdAt) {
        result[chat.id] = message;
      }
    }
  }

  return result;
}
