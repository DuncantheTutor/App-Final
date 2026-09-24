import type { Dispatch, SetStateAction } from "react";
import { Alert } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import type { Chat, Message } from "../domain/types";
import { canReplyToBroadcastMessage } from "../lib/broadcastMessaging";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

type MessageActionDeps = {
  messageActionTarget: Message | undefined;
  resolvedChat: Chat | null;
  isActiveBroadcastRecipient: boolean;
  chats: Chat[];
  patchMessage: (messageId: string, updater: (message: Message) => Message) => void;
  getBackendSession: () => BackendSession | null;
  resolveConversationId: (chat: Chat | string) => string;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setChatInputSynced: (text: string) => void;
  setReplyTargetMessageId: Dispatch<SetStateAction<string | null>>;
  setSelectedBroadcastThreadFriendId: Dispatch<SetStateAction<string | null>>;
};

/** Unsend, start edit, and start reply for the open message action. Recreated each render. */
export function createMessageActions(deps: MessageActionDeps) {
  const {
    messageActionTarget,
    resolvedChat,
    isActiveBroadcastRecipient,
    chats,
    patchMessage,
    getBackendSession,
    resolveConversationId,
    setEditingMessageId,
    setChatInputSynced,
    setReplyTargetMessageId,
    setSelectedBroadcastThreadFriendId,
  } = deps;

  const unsendTargetMessage = () => {
    if (!messageActionTarget) return;
    const unsentAt = Date.now();
    const target = messageActionTarget;
    patchMessage(target.id, (message) => ({
      ...message,
      text: "",
      kind: "text",
      mediaUri: undefined,
      durationSec: undefined,
      videoTextOverlays: undefined,
      unsentAt,
      editedAt: undefined,
    }));
    if (!DEMO_OFFLINE_MODE) {
      const session = getBackendSession();
      const chat = chats.find((c) => c.id === target.chatId);
      if (session && chat) {
        void callEmulatorFunction("updateMessageMetadata", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId: resolveConversationId(chat),
          messageId: target.id,
          unsentAt,
        }).catch((err) => logAppError("messages.unsend_metadata", err, { messageId: target.id }));
      }
    }
  };

  const startEditMessage = () => {
    if (!messageActionTarget || messageActionTarget.senderId !== CURRENT_USER_ID) return;
    setEditingMessageId(messageActionTarget.id);
    setChatInputSynced(messageActionTarget.text);
  };

  const startReplyToMessage = () => {
    if (!messageActionTarget || !resolvedChat) return;
    if (
      (resolvedChat.kind ?? "standard") === "broadcast" &&
      !canReplyToBroadcastMessage(messageActionTarget, resolvedChat, CURRENT_USER_ID)
    ) {
      Alert.alert(
        "Private reply only",
        isActiveBroadcastRecipient
          ? "Long-press a message from the broadcaster and choose Reply to respond privately."
          : "Choose a friend's message to reply in that private thread."
      );
      return;
    }
    setReplyTargetMessageId(messageActionTarget.id);
    if (messageActionTarget.broadcastThreadFriendId) {
      setSelectedBroadcastThreadFriendId(messageActionTarget.broadcastThreadFriendId);
    } else if (isActiveBroadcastRecipient) {
      setSelectedBroadcastThreadFriendId(CURRENT_USER_ID);
    } else {
      setSelectedBroadcastThreadFriendId(null);
    }
  };

  return { unsendTargetMessage, startEditMessage, startReplyToMessage };
}
