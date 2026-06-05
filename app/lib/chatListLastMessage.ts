import { isBroadcastMessageVisibleToViewer } from "./broadcastMessaging";
import { joinCutoffMsForViewer } from "./chatMemberJoinedAt";
import { localChatIdsForDirectThread } from "./directChatId";
import type { Chat, Friend, Message } from "../domain/types";

/** Prefer confirmed traffic over in-flight `sending` when timestamps tie. */
export function isMessageNewerForChatRow(prev: Message, next: Message): boolean {
  if (next.createdAt > prev.createdAt) return true;
  if (next.createdAt < prev.createdAt) return false;
  const prevSending = prev.deliveryStatus === "sending";
  const nextSending = next.deliveryStatus === "sending";
  if (prevSending && !nextSending) return true;
  if (!prevSending && nextSending) return false;
  return next.id.localeCompare(prev.id) > 0;
}

/**
 * Thread sort key: keep in-flight sends at the bottom when newer lines already
 * delivered (e.g. slow video upload + quick follow-up text).
 */
export function messageThreadSortKey(message: Message, threadMessages: readonly Message[]): number {
  if (message.deliveryStatus !== "sending") return message.createdAt;
  let confirmedMax = 0;
  for (const peer of threadMessages) {
    if (peer.id === message.id) continue;
    if (peer.deliveryStatus === "sending") continue;
    if (peer.createdAt > confirmedMax) confirmedMax = peer.createdAt;
  }
  return confirmedMax > 0 ? Math.max(message.createdAt, confirmedMax + 1) : message.createdAt;
}

/** Home chat list ordering timestamp (preview may still show the in-flight line). */
export function chatListSortTimestampMs(
  chat: Chat,
  lastMessage: Message | undefined,
  threadMessages: readonly Message[]
): number {
  if (!lastMessage) return chat.updatedAt;
  if (lastMessage.deliveryStatus !== "sending") return lastMessage.createdAt;
  let confirmedMax = 0;
  for (const message of threadMessages) {
    if (message.id === lastMessage.id) continue;
    if (message.deliveryStatus === "sending") continue;
    if (message.createdAt > confirmedMax) confirmedMax = message.createdAt;
  }
  if (confirmedMax > lastMessage.createdAt) return confirmedMax;
  return lastMessage.createdAt;
}

type ChatListMessageParams = {
  chats: Chat[];
  messages: Message[];
  sessionAppUid: string | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  currentUserId: string;
  currentUserLocalId: string;
};

function isVisibleChatListMessage(
  message: Message,
  chat: Chat,
  threadIds: Set<string>,
  cutoff: number,
  currentUserId: string,
  currentUserLocalId: string
): boolean {
  if (!threadIds.has(message.chatId)) return false;
  if (message.hiddenFromOwner) return false;
  if ((chat.kind ?? "standard") === "broadcast") {
    if (!isBroadcastMessageVisibleToViewer(message, chat, currentUserId)) return false;
  }
  const isMine = message.senderId === currentUserId || message.senderId === currentUserLocalId;
  if (
    isMine &&
    message.createdAt < cutoff &&
    message.deliveryStatus !== "sending" &&
    !message.unsentAt
  ) {
    return false;
  }
  return true;
}

function threadMessagesForChat(params: ChatListMessageParams, chat: Chat): Message[] {
  const {
    messages,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid,
    currentUserId,
    currentUserLocalId,
    chats,
  } = params;
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
  return messages.filter((message) =>
    isVisibleChatListMessage(
      message,
      chat,
      threadIds,
      cutoff,
      currentUserId,
      currentUserLocalId
    )
  );
}

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
      if ((chat.kind ?? "standard") === "broadcast") {
        if (!isBroadcastMessageVisibleToViewer(message, chat, currentUserId)) continue;
      }
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
      if (!prev || isMessageNewerForChatRow(prev, message)) {
        result[chat.id] = message;
      }
    }
  }

  return result;
}

/** Chats that appear on the home Chats tab (draft / unfriend / empty-thread rules). */
export function filterChatsVisibleInInbox(
  chats: Chat[],
  lastMessageByChatId: Record<string, Message | undefined>,
  unfriendedIds: string[],
  currentUserId: string
): Chat[] {
  const unfriended = new Set(unfriendedIds);
  return chats.filter((c) => {
    const ownedByMe = (c.createdBy ?? currentUserId) === currentUserId;
    if (c.isDraft && c.visibleToRecipients !== true && !ownedByMe) return false;

    const hasVisibleMessages = lastMessageByChatId[c.id] !== undefined;
    if (!hasVisibleMessages) {
      const hasSavedDraftText = (c.draftComposerText ?? "").trim().length > 0;
      if (!c.isDraft || !ownedByMe || !hasSavedDraftText) return false;
      const others = c.memberIds.filter((id) => id !== currentUserId);
      if (others.some((id) => unfriended.has(id))) return false;
    }

    return true;
  });
}

/** Visible thread messages keyed by chat row id (same filters as last-message preview). */
export function buildVisibleThreadMessagesByChatId(
  params: ChatListMessageParams
): Record<string, Message[]> {
  const byChat: Record<string, Message[]> = {};
  for (const chat of params.chats) {
    byChat[chat.id] = threadMessagesForChat(params, chat);
  }
  return byChat;
}
