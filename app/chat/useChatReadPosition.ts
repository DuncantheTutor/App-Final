import { useCallback, useEffect, useRef } from "react";
import { InteractionManager } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import type { Chat, Message, ViewState } from "../domain/types";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

type ChatReadPositionDeps = {
  view: ViewState;
  activeChatMessages: Message[];
  activeChatForRead: Chat | null;
  getBackendSession: () => BackendSession | null;
  resolveConversationId: (chatId: string) => string;
};

/** Mark the open chat read while it is on screen, and again when leaving it. */
export function useChatReadPosition({
  view,
  activeChatMessages,
  activeChatForRead,
  getBackendSession,
  resolveConversationId,
}: ChatReadPositionDeps) {
  const activeChatLatestMessage = activeChatMessages[activeChatMessages.length - 1] ?? null;
  const activeChatReadTargetRef = useRef<{ chatId: string; message: Message } | null>(null);

  useEffect(() => {
    if (view.screen !== "chat" || !activeChatLatestMessage || !("chatId" in view)) return;
    activeChatReadTargetRef.current = {
      chatId: activeChatForRead?.id ?? view.chatId,
      message: activeChatLatestMessage,
    };
  }, [view, activeChatForRead?.id, activeChatLatestMessage?.id, activeChatLatestMessage?.createdAt]);

  const pushChatReadPositionToServer = useCallback(
    (chatRowId: string, readMessage: Message) => {
      if (DEMO_OFFLINE_MODE) return;
      const session = getBackendSession();
      if (!session) return;
      void callEmulatorFunction("updateConversationReadPosition", {
        uid: session.uid,
        deviceId: session.deviceId,
        conversationId: resolveConversationId(chatRowId),
        lastReadAtMs: readMessage.createdAt,
        lastReadMessageId: readMessage.id,
      }).catch((err) => {
        logAppError("chat.read_position.update", err, { chatId: chatRowId });
      });
    },
    [getBackendSession, resolveConversationId]
  );

  useEffect(() => {
    if (view.screen !== "chat" || !activeChatLatestMessage || DEMO_OFFLINE_MODE) return;
    if (!("chatId" in view)) return;
    if (
      activeChatLatestMessage.senderId === CURRENT_USER_ID &&
      activeChatLatestMessage.deliveryStatus === "sending"
    ) {
      return;
    }
    const chatRowId = activeChatForRead?.id ?? view.chatId;
    const message = activeChatLatestMessage;
    const task = InteractionManager.runAfterInteractions(() => {
      pushChatReadPositionToServer(chatRowId, message);
    });
    return () => task.cancel();
  }, [
    view,
    activeChatForRead?.id,
    activeChatLatestMessage?.id,
    activeChatLatestMessage?.createdAt,
    activeChatLatestMessage?.senderId,
    activeChatLatestMessage?.deliveryStatus,
    pushChatReadPositionToServer,
  ]);

  const prevViewRef = useRef(view);
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (prev.screen !== "chat" || !("chatId" in prev)) return;
    if (view.screen === "chat" && "chatId" in view && view.chatId === prev.chatId) return;
    const stored = activeChatReadTargetRef.current;
    if (stored) {
      pushChatReadPositionToServer(stored.chatId, stored.message);
    }
  }, [view, pushChatReadPositionToServer]);
}
