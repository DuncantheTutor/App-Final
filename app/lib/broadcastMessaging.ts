import type { Chat, Message } from "../domain/types";

/** True when the current user created this broadcast chat. */
export function isBroadcastCreator(
  chat: Pick<Chat, "kind" | "createdBy">,
  currentUserId: string
): boolean {
  return (chat.kind ?? "standard") === "broadcast" && (chat.createdBy ?? currentUserId) === currentUserId;
}

export function broadcastCreatorFriendId(
  chat: Pick<Chat, "createdBy">,
  currentUserId: string
): string {
  return chat.createdBy ?? currentUserId;
}

function isBroadcastGlobalFromCreator(
  message: Pick<Message, "broadcastThreadFriendId" | "senderId">,
  creatorId: string
): boolean {
  const threadId = message.broadcastThreadFriendId?.trim();
  return !threadId && message.senderId === creatorId;
}

/** Broadcaster reply in this recipient's private thread. */
function isBroadcastPrivateReplyToRecipient(
  message: Pick<Message, "broadcastThreadFriendId" | "senderId">,
  creatorId: string,
  currentUserId: string
): boolean {
  const threadId = message.broadcastThreadFriendId?.trim();
  return threadId === currentUserId && message.senderId === creatorId;
}

/** Recipient's own outbound message in their private thread (shown for context, not reply targets). */
function isRecipientOwnThreadMessage(
  message: Pick<Message, "broadcastThreadFriendId" | "senderId">,
  currentUserId: string
): boolean {
  const threadId = message.broadcastThreadFriendId?.trim();
  return threadId === currentUserId && message.senderId === currentUserId;
}

/**
 * Broadcast timeline visibility for recipients:
 * - General broadcasts from the creator (everyone sees these).
 * - Creator replies in this recipient's private thread only.
 * - Own outbound messages in that thread (conversation context).
 * Other recipients' private threads are never shown.
 */
export function isBroadcastMessageVisibleToViewer(
  message: Pick<Message, "broadcastThreadFriendId" | "senderId">,
  chat: Pick<Chat, "kind" | "createdBy">,
  currentUserId: string
): boolean {
  if ((chat.kind ?? "standard") !== "broadcast") return true;

  if (isBroadcastCreator(chat, currentUserId)) return true;

  const creatorId = broadcastCreatorFriendId(chat, currentUserId);
  return (
    isBroadcastGlobalFromCreator(message, creatorId) ||
    isBroadcastPrivateReplyToRecipient(message, creatorId, currentUserId) ||
    isRecipientOwnThreadMessage(message, currentUserId)
  );
}

/**
 * Recipients may reply to every visible **broadcaster** message (global or private reply to them).
 * Creators may reply to any message in the broadcast.
 */
export function canReplyToBroadcastMessage(
  message: Pick<Message, "broadcastThreadFriendId" | "senderId" | "unsentAt">,
  chat: Pick<Chat, "kind" | "createdBy">,
  currentUserId: string
): boolean {
  if ((chat.kind ?? "standard") !== "broadcast") return true;
  if (message.unsentAt) return false;

  if (isBroadcastCreator(chat, currentUserId)) return true;

  if (!isBroadcastMessageVisibleToViewer(message, chat, currentUserId)) return false;

  const creatorId = broadcastCreatorFriendId(chat, currentUserId);
  return message.senderId === creatorId;
}
