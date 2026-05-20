import { useCallback, useEffect } from "react";

import { logAppError } from "../../telemetry";
import { localChatIdsForDirectThread, serverConversationIdFromLocalChatId } from "../lib/directChatId";
import {
  applyServerHiddenConversationIds,
  refreshHiddenConversationIdsFromServer as refreshHiddenFromServer,
  rememberHiddenConversationIds as rememberHiddenIds,
} from "./hiddenSync";
import { resolveRecipientEncryptionKeys } from "./recipientKeys";
import { attachEncryptedMessageListener, pullEncryptedMessagesIncremental as pullMessages } from "./sync";
import type { Dispatch, SetStateAction } from "react";
import type { Chat, Friend, Message } from "../domain/types";
import type { BackendSession, EncryptedSyncStateBundle, MessagingSyncRefs } from "./types";
import type { RefObject } from "react";

export type UseMessagingSyncOptions = {
  demoOfflineMode: boolean;
  signedIn: boolean;
  appLifecycleState: string;
  initialServerSyncDone: boolean;
  viewScreen: string;
  getBackendSession: () => BackendSession | null;
  backendSessionReady: boolean;
  allFriends: Friend[];
  backendUidToFriendId: Record<string, string>;
  refs: MessagingSyncRefs;
  chatsRef: RefObject<Chat[]>;
  friendMapRef: RefObject<Record<string, Friend>>;
  friendIdToBackendUidRef: RefObject<Record<string, string>>;
  hiddenServerConversationIdsRef: RefObject<Set<string>>;
  recipientKeyCacheRef: RefObject<Record<string, string>>;
  persistWatermarksNow: () => void;
  persistFriendKeyCacheNow: () => void;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setMessages: (updater: (current: Message[]) => Message[]) => void;
  setHiddenChatIds: (updater: (current: string[]) => string[]) => void;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncStateBundle>>;
};

export function useMessagingSync(options: UseMessagingSyncOptions) {
  const {
    demoOfflineMode,
    signedIn,
    appLifecycleState,
    initialServerSyncDone,
    viewScreen,
    getBackendSession,
    allFriends,
    backendUidToFriendId,
    refs,
    chatsRef,
    friendMapRef,
    friendIdToBackendUidRef,
    hiddenServerConversationIdsRef,
    recipientKeyCacheRef,
    persistWatermarksNow,
    persistFriendKeyCacheNow,
    setChats,
    setMessages,
    setHiddenChatIds,
    setEncryptedSyncState,
  } = options;

  const applyServerHiddenConversationIdsCb = useCallback(
    (conversationIds: string[]) => {
      applyServerHiddenConversationIds({
        conversationIds,
        hiddenServerConversationIdsRef,
        setHiddenChatIds,
      });
    },
    [hiddenServerConversationIdsRef, setHiddenChatIds]
  );

  const refreshHiddenConversationIdsFromServer = useCallback(async () => {
    const session = getBackendSession();
    if (!session) return;
    await refreshHiddenFromServer({
      session,
      demoOfflineMode,
      hiddenServerConversationIdsRef,
      setHiddenChatIds,
    });
  }, [demoOfflineMode, getBackendSession, hiddenServerConversationIdsRef, setHiddenChatIds]);

  const rememberHiddenConversationIds = useCallback(
    (conversationIds: string[]) => {
      rememberHiddenIds({
        conversationIds,
        hiddenServerConversationIdsRef,
        setHiddenChatIds,
      });
    },
    [hiddenServerConversationIdsRef, setHiddenChatIds]
  );

  const resolveConversationId = useCallback(
    (chatOrLocalId: Chat | string): string => {
      const session = getBackendSession();
      const localId = typeof chatOrLocalId === "string" ? chatOrLocalId.trim() : chatOrLocalId.id;
      if (!session) return `enc_${localId}`;
      const chats = chatsRef.current ?? [];
      const friendMap = friendMapRef.current ?? {};
      const friendIdToBackendUid = friendIdToBackendUidRef.current ?? {};
      let chat: Chat | undefined =
        typeof chatOrLocalId === "string"
          ? chats.find((c) => c.id === localId)
          : chatOrLocalId;
      if (!chat && typeof chatOrLocalId === "string") {
        const threadIds = localChatIdsForDirectThread(
          localId,
          chats,
          session.uid,
          friendMap,
          friendIdToBackendUid
        );
        chat = chats.find((c) => threadIds.has(c.id));
      }
      if (chat) {
        return serverConversationIdFromLocalChatId(
          chat,
          session.uid,
          chats,
          friendMap,
          friendIdToBackendUid
        );
      }
      return `enc_${localId}`;
    },
    [getBackendSession, chatsRef, friendMapRef, friendIdToBackendUidRef]
  );

  const resolveRecipientEncryptionKeysCb = useCallback(
    async (recipientUids: string[]) => {
      const session = getBackendSession();
      if (!session) throw new Error("Backend session not ready.");
      return resolveRecipientEncryptionKeys({
        session,
        recipientUids,
        recipientKeyCacheRef,
        persistFriendKeyCacheNow,
      });
    },
    [getBackendSession, recipientKeyCacheRef, persistFriendKeyCacheNow]
  );

  const pullEncryptedMessagesIncremental = useCallback(
    async (options?: { forceFull?: boolean }) => {
      if (demoOfflineMode) return;
      const session = getBackendSession();
      if (!session) return;
      if (options?.forceFull) {
        refs.messagesWatermarkMsRef.current = 0;
      }
      await pullMessages({
        session,
        refs,
        persistWatermarksNow,
        setChats,
        setMessages,
      });
    },
    [demoOfflineMode, getBackendSession, refs, persistWatermarksNow, setChats, setMessages]
  );

  useEffect(() => {
    if (!signedIn || demoOfflineMode || appLifecycleState !== "active" || !initialServerSyncDone) {
      return;
    }
    const session = getBackendSession();
    if (!session) return;
    const timer = setTimeout(() => {
      void pullEncryptedMessagesIncremental().catch((err) => {
        logAppError("messages.foreground_pull", err, {});
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [
    signedIn,
    demoOfflineMode,
    appLifecycleState,
    getBackendSession,
    pullEncryptedMessagesIncremental,
    initialServerSyncDone,
  ]);

  useEffect(() => {
    if (
      viewScreen !== "chat" ||
      !signedIn ||
      demoOfflineMode ||
      !initialServerSyncDone
    ) {
      return;
    }
    void pullEncryptedMessagesIncremental().catch((err) => {
      logAppError("messages.chat_poll", err, {});
    });
    const id = setInterval(() => {
      void pullEncryptedMessagesIncremental().catch((err) => {
        logAppError("messages.chat_poll", err, {});
      });
    }, 4000);
    return () => clearInterval(id);
  }, [
    viewScreen,
    signedIn,
    demoOfflineMode,
    initialServerSyncDone,
    pullEncryptedMessagesIncremental,
  ]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn || demoOfflineMode || !initialServerSyncDone) return;
    return attachEncryptedMessageListener({
      session,
      refs,
      persistWatermarksNow,
      setChats,
      setMessages,
      setEncryptedSyncState,
      refreshHiddenConversationIdsFromServer,
    });
  }, [
    signedIn,
    demoOfflineMode,
    initialServerSyncDone,
    getBackendSession,
    persistWatermarksNow,
    refreshHiddenConversationIdsFromServer,
    refs,
    setChats,
    setMessages,
    setEncryptedSyncState,
  ]);

  return {
    pullEncryptedMessagesIncremental,
    resolveConversationId,
    resolveRecipientEncryptionKeys: resolveRecipientEncryptionKeysCb,
    refreshHiddenConversationIdsFromServer,
    rememberHiddenConversationIds,
    applyServerHiddenConversationIds: applyServerHiddenConversationIdsCb,
  };
}
