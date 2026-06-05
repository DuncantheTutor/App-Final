import { useMemo } from "react";

import { joinCutoffMsForViewer } from "../lib/chatMemberJoinedAt";
import { isBroadcastMessageVisibleToViewer } from "../lib/broadcastMessaging";
import { localChatIdsForDirectThread } from "../lib/directChatId";
import { messageDisplayText } from "../lib/messageDisplayText";
import type { Chat, Friend, Message } from "../domain/types";
import type { ViewState } from "../domain/types";

export function useActiveChatMessages(params: {
  view: ViewState;
  chats: Chat[];
  messages: Message[];
  chatSearch: string;
  demoOfflineMode: boolean;
  sessionUid: string | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  currentUserId: string;
}): Message[] {
  const {
    view,
    chats,
    messages,
    chatSearch,
    demoOfflineMode,
    sessionUid,
    friendMap,
    friendIdToBackendUid,
    currentUserId,
  } = params;

  return useMemo(() => {
    const onChatThread =
      view.screen === "chat" || view.screen === "chatSharedMedia";
    if (!onChatThread || !("chatId" in view)) return [];
    const chatId = view.chatId;
    const chatIdsForThread =
      sessionUid && !demoOfflineMode
        ? localChatIdsForDirectThread(
            chatId,
            chats,
            sessionUid,
            friendMap,
            friendIdToBackendUid
          )
        : new Set<string>([chatId]);
    const chat =
      chats.find((c) => c.id === chatId) ??
      chats.find((c) => chatIdsForThread.has(c.id));
    const cutoff = joinCutoffMsForViewer(chat ?? null, sessionUid);
    const all = messages
      .filter((message) => chatIdsForThread.has(message.chatId))
      .filter((message) => !message.hiddenFromOwner)
      .filter((message) => {
        if (chat && (chat.kind ?? "standard") === "broadcast") {
          return isBroadcastMessageVisibleToViewer(message, chat, currentUserId);
        }
        return true;
      })
      .filter((message) => {
        if (message.senderId !== currentUserId) return true;
        return (
          message.createdAt >= cutoff ||
          message.deliveryStatus === "sending" ||
          Boolean(message.unsentAt)
        );
      })
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
        return a.id.localeCompare(b.id);
      });
    if (view.screen === "chatSharedMedia") return all;
    const query = chatSearch.trim().toLowerCase();
    if (!query) return all;
    return all.filter((message) => messageDisplayText(message).toLowerCase().includes(query));
  }, [
    chatSearch,
    chats,
    currentUserId,
    demoOfflineMode,
    friendIdToBackendUid,
    friendMap,
    messages,
    sessionUid,
    view,
  ]);
}
