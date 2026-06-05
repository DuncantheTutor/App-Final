import type { Chat, Message } from "../domain/types";

/** True when an incoming last message is still unread for the signed-in viewer. */
export function isIncomingChatUnread(params: {
  chat: Chat;
  lastMessage: Message | undefined;
  myUid: string | null;
  currentUserId: string;
  currentUserLocalId: string;
}): boolean {
  const { chat, lastMessage, myUid, currentUserId, currentUserLocalId } = params;
  if (!lastMessage || !myUid) return false;

  const fromMe =
    lastMessage.senderId === currentUserId ||
    lastMessage.senderId === currentUserLocalId ||
    lastMessage.senderId === "me";
  if (fromMe) return false;

  const cursor = chat.readBy?.[myUid];
  if (cursor?.lastReadMessageId && cursor.lastReadMessageId === lastMessage.id) {
    return false;
  }

  const readAt = cursor?.lastReadAtMs ?? 0;
  return lastMessage.createdAt > readAt;
}
