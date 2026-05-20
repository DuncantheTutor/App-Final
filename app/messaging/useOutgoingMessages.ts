import { useCallback } from "react";

import { logAppError } from "../../telemetry";
import { promotePendingChatToRow } from "./promotePendingChat";
import {
  alertOutgoingDeliveryFailure,
  deliverOutgoingMessages,
  migrateDirectChatToCanonical,
} from "./send";
import type { Dispatch, SetStateAction } from "react";
import type { Chat, Friend, Message, ViewState } from "../domain/types";
import type { BackendSession } from "./types";

export type UseOutgoingMessagesOptions = {
  demoOfflineMode: boolean;
  getBackendSession: () => BackendSession | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  friendMapRef: { current: Record<string, Friend> };
  friendIdToBackendUidRef: { current: Record<string, string> };
  recipientKeyCacheRef: { current: Record<string, string> };
  persistFriendKeyCacheNow: () => void;
  resolveConversationId: (chat: Chat) => string;
  pullEncryptedMessagesIncremental: () => Promise<void>;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setMessages: (updater: (current: Message[]) => Message[]) => void;
  setHiddenChatIds: (updater: (current: string[]) => string[]) => void;
  setView: Dispatch<SetStateAction<ViewState>>;
  addAutoReplies: (chat: Chat, messages: Message[]) => void;
};

export function useOutgoingMessages(options: UseOutgoingMessagesOptions) {
  const {
    demoOfflineMode,
    getBackendSession,
    friendMap,
    friendIdToBackendUid,
    friendMapRef,
    friendIdToBackendUidRef,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
    resolveConversationId,
    pullEncryptedMessagesIncremental,
    setChats,
    setMessages,
    setHiddenChatIds,
    setView,
    addAutoReplies,
  } = options;

  const commitOutgoingMessages = useCallback(
    (chat: Chat, outgoingMessages: Message[]) => {
      if (outgoingMessages.length === 0) return;

      const session = getBackendSession();
      let chatForSend = chat;
      let migratedFromId: string | undefined;

      if (session) {
        const migrated = migrateDirectChatToCanonical({
          chat,
          session,
          friendMap,
          friendIdToBackendUid,
        });
        chatForSend = migrated.chatForSend;
        migratedFromId = migrated.migratedFromId;

        if (migratedFromId) {
          setChats((current) => {
            const legacy = current.find((c) => c.id === migratedFromId);
            const existing = current.find((c) => c.id === chatForSend.id);
            const merged: Chat = {
              ...(existing ?? legacy ?? chat),
              id: chatForSend.id,
              memberIds: chat.memberIds,
              isDraft: (existing ?? legacy ?? chat).isDraft,
              visibleToRecipients: (existing ?? legacy ?? chat).visibleToRecipients,
              memberJoinedAt: (existing ?? legacy ?? chat).memberJoinedAt ?? chat.memberJoinedAt,
            };
            return [
              merged,
              ...current.filter((c) => c.id !== migratedFromId && c.id !== chatForSend.id),
            ];
          });
          setMessages((current) =>
            current.map((m) => (m.chatId === migratedFromId ? { ...m, chatId: chatForSend.id } : m))
          );
          setHiddenChatIds((current) =>
            current.map((id) => (id === migratedFromId ? chatForSend.id : id))
          );
          setView((current) => {
            if (current.screen === "chat" && "chatId" in current && current.chatId === migratedFromId) {
              return { screen: "chat", chatId: chatForSend.id };
            }
            return current;
          });
        }
      }

      const outgoingForState = outgoingMessages.map((m) => ({
        ...m,
        chatId: chatForSend.id,
      }));
      const now = Date.now();

      setChats((current) => {
        const exists = current.some((c) => c.id === chatForSend.id);
        const promoted = {
          ...chatForSend,
          isDraft: false,
          visibleToRecipients: true,
          updatedAt: now,
          draftComposerText: undefined,
        };
        if (!exists) {
          return [
            promoted,
            ...current.filter(
              (c) => c.id !== chat.id && c.id !== chatForSend.id && c.id !== migratedFromId
            ),
          ];
        }
        return current.map((c) => (c.id === chatForSend.id ? { ...c, ...promoted } : c));
      });

      setMessages((current) => [
        ...current.map((m) =>
          m.chatId === chat.id && chatForSend.id !== chat.id
            ? { ...m, chatId: chatForSend.id }
            : m
        ),
        ...outgoingForState.map((m) => ({
          ...m,
          deliveryStatus: demoOfflineMode ? ("sent" as const) : ("sending" as const),
        })),
      ]);

      addAutoReplies(chatForSend, outgoingForState);
      if (demoOfflineMode) return;

      void (async () => {
        try {
          const activeSession = getBackendSession();
          if (!activeSession) {
            throw new Error("Account session is not ready. Please wait a moment and try again.");
          }
          await deliverOutgoingMessages({
            session: activeSession,
            chatForSend,
            outgoingForState,
            friendIdToBackendUid,
            friendMapRef,
            friendIdToBackendUidRef,
            recipientKeyCacheRef,
            persistFriendKeyCacheNow,
            resolveConversationId,
            setChats,
            setMessages,
            onDelivered: () => {
              void pullEncryptedMessagesIncremental().catch((pullErr) => {
                logAppError("send.post_pull", pullErr, { chatId: chatForSend.id });
              });
            },
            onFailed: (failedIds) => {
              setMessages((current) =>
                current.map((message) =>
                  failedIds.has(message.id)
                    ? {
                        ...message,
                        deliveryStatus: undefined,
                      }
                    : message
                )
              );
            },
          });
        } catch (err) {
          const failedIds = new Set(outgoingForState.map((m) => m.id));
          alertOutgoingDeliveryFailure(err, (ids) => {
            setMessages((current) =>
              current.map((message) =>
                ids.has(message.id)
                  ? {
                      ...message,
                      unsentAt: message.unsentAt ?? Date.now(),
                      deliveryStatus: undefined,
                    }
                  : message
              )
            );
          }, failedIds);
        }
      })();
    },
    [
      addAutoReplies,
      demoOfflineMode,
      friendIdToBackendUid,
      friendIdToBackendUidRef,
      friendMap,
      friendMapRef,
      getBackendSession,
      persistFriendKeyCacheNow,
      pullEncryptedMessagesIncremental,
      recipientKeyCacheRef,
      resolveConversationId,
      setChats,
      setHiddenChatIds,
      setMessages,
      setView,
    ]
  );

  return { commitOutgoingMessages };
}
