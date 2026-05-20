import { useMemo } from "react";

import { joinCutoffMsForViewer } from "../lib/chatMemberJoinedAt";
import { localChatIdsForDirectThread } from "../lib/directChatId";
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
    if (view.screen !== "chat" || !("chatId" in view)) return [];
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
    const query = chatSearch.trim().toLowerCase();
    if (!query) return all;
    return all.filter((message) => message.text.toLowerCase().includes(query));
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
