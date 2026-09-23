import type { MutableRefObject } from "react";
import { Alert } from "react-native";

import type { Chat, Message, ViewState } from "../domain/types";
import { readComposerTextTrimmed } from "../lib/syncedComposerText";
import type { PendingChatPhoto, PendingVoiceNote } from "./useInThreadComposer";

type ChatExitDeps = {
  view: ViewState;
  chats: Chat[];
  messages: Message[];
  removeChatForCurrentUser: (chatId: string) => void;
  leaveChatToHome: () => void;
  toggleChatMute: (chatId: string) => void;
  resolvedStoredChatListTitle: (chat: Chat) => string;
  setChatInputSynced: (text: string) => void;
  chatInputTextRef: MutableRefObject<string>;
  voiceRecordStartedAt: number | null;
  pendingVoiceNote: PendingVoiceNote | null;
  pendingChatMediaAttachment: PendingChatPhoto | null;
  removeChatsAndMessages: (ids: Iterable<string>) => void;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
};

/** Home-row delete/mute menu and backing out of an open chat. Recreated each render. */
export function createChatExitActions(deps: ChatExitDeps) {
  const {
    view,
    chats,
    messages,
    removeChatForCurrentUser,
    leaveChatToHome,
    toggleChatMute,
    resolvedStoredChatListTitle,
    setChatInputSynced,
    chatInputTextRef,
    voiceRecordStartedAt,
    pendingVoiceNote,
    pendingChatMediaAttachment,
    removeChatsAndMessages,
    patchChat,
  } = deps;

  const confirmDeleteChatFromHome = (chatId: string) => {
    Alert.alert(
      "Delete chat?",
      "This removes the chat from your list. In group chats, the conversation can continue for others.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removeChatForCurrentUser(chatId);
            if (view.screen === "chat" && "chatId" in view && view.chatId === chatId) {
              leaveChatToHome();
            }
          },
        },
      ]
    );
  };

  const openChatRowActions = (chat: Chat) => {
    const muted = !!chat.mutedForNotifications;
    const listTitle = resolvedStoredChatListTitle(chat);
    Alert.alert(listTitle, undefined, [
      {
        text: muted ? "Unmute notifications" : "Mute notifications",
        onPress: () => toggleChatMute(chat.id),
      },
      {
        text: "Delete chat",
        style: "destructive",
        onPress: () => confirmDeleteChatFromHome(chat.id),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const onBackFromChat = () => {
    if (view.screen !== "chat") return;

    if ("pendingDraft" in view) {
      setChatInputSynced("");
      leaveChatToHome();
      return;
    }

    const chatId = view.chatId;
    const chat = chats.find((c) => c.id === chatId);
    const hasUnsent =
      readComposerTextTrimmed(chatInputTextRef).length > 0 ||
      !!voiceRecordStartedAt ||
      !!pendingVoiceNote ||
      !!pendingChatMediaAttachment;

    if (chat?.isDraft && hasUnsent) {
      Alert.alert("Save draft?", "You have unsent text in this draft.", [
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            removeChatsAndMessages([chatId]);
            leaveChatToHome();
          },
        },
        {
          text: "Save draft",
          onPress: () => {
            patchChat(chatId, (c) => ({
              ...c,
              draftComposerText: readComposerTextTrimmed(chatInputTextRef),
              updatedAt: Date.now(),
            }));
            leaveChatToHome();
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    if (chat?.isDraft && !hasUnsent) {
      const noMessages = messages.every((m) => m.chatId !== chatId);
      if (noMessages) {
        removeChatsAndMessages([chatId]);
      }
    }

    leaveChatToHome();
  };

  return { confirmDeleteChatFromHome, openChatRowActions, onBackFromChat };
}
