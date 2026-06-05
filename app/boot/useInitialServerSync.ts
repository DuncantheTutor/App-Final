import { useEffect } from "react";

import { logAppError } from "../../telemetry";
import { retainedMessageChatIds } from "../lib/messageRetentionChatIds";
import { trimInMemoryMessages } from "../lib/trimInMemoryMessages";
import { yieldToUi } from "../lib/yieldToUi";
import {
  BOOT_VISIBLE_CHATS_MESSAGE_PULL_MAX,
  CHAT_INITIAL_MESSAGE_LIMIT,
  ENCRYPTED_MESSAGES_BOOT_SYNC_LIMIT,
  ENCRYPTED_POSTS_HOME_FEED_LIMIT,
  INITIAL_SERVER_SYNC_TIMEOUT_MS,
} from "../theme/preludeConstants";
import { fetchFriendsOnBoot } from "./fetchFriendsOnBoot";
import { reconcileSocialStateWithServerFriends } from "./reconcileSocialWithServer";
import type { Chat, Friend, Message, Post } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export function useInitialServerSync(params: {
  demoOfflineMode: boolean;
  signedIn: boolean;
  backendSessionReady: boolean;
  initialServerSyncDone: boolean;
  setInitialServerSyncDone: (done: boolean) => void;
  getBackendSession: () => BackendSession | null;
  refreshHiddenConversationIdsFromServer: () => Promise<void>;
  pullEncryptedMessagesIncremental: (options?: {
    forceFull?: boolean;
    limit?: number;
  }) => Promise<void>;
  pullEncryptedMessagesForConversation: (conversationId: string) => Promise<void>;
  resolveConversationId: (chatOrLocalId: Chat | string) => string;
  pullEncryptedPostsIncremental: (options?: {
    forceFull?: boolean;
    limit?: number;
  }) => Promise<void>;
  setAddedFriendsFromRitual: (friends: Friend[]) => void;
  setFriendLinksState: (
    updater: (current: Record<string, string[]>) => Record<string, string[]>
  ) => void;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setMessages: (updater: (current: Message[]) => Message[]) => void;
  chatsRef: { current: Chat[] };
  messagesRef: { current: Message[] };
  postsRef: { current: Post[] };
  addedFriendsFromRitualRef: { current: Friend[] };
  acceptedFriendBackendUidsRef: { current: Set<string> };
  onServerFriendBackendUidsChanged?: (uids: Set<string>) => void;
  addUndirectedEdge: (
    links: Record<string, string[]>,
    a: string,
    b: string
  ) => Record<string, string[]>;
  currentUserLocalId: string;
  currentUserId: string;
  unfriendedIdsRef: { current: string[] };
}): void {
  const {
    demoOfflineMode,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    setInitialServerSyncDone,
    getBackendSession,
    refreshHiddenConversationIdsFromServer,
    pullEncryptedMessagesIncremental,
    pullEncryptedMessagesForConversation,
    resolveConversationId,
    pullEncryptedPostsIncremental,
    setAddedFriendsFromRitual,
    setFriendLinksState,
    setChats,
    setMessages,
    chatsRef,
    messagesRef,
    postsRef,
    addedFriendsFromRitualRef,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged,
    addUndirectedEdge,
    currentUserLocalId,
    currentUserId,
    unfriendedIdsRef,
  } = params;

  useEffect(() => {
    if (demoOfflineMode) return;
    if (!signedIn || !backendSessionReady) return;
    if (initialServerSyncDone) return;
    const session = getBackendSession();
    if (!session) return;

    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      setInitialServerSyncDone(true);
    };
    const safetyTimer = setTimeout(finish, INITIAL_SERVER_SYNC_TIMEOUT_MS);

    const trimMessagesInState = (
      friendMap: Record<string, Friend>,
      friendIdToBackendUid: Record<string, string>
    ) => {
      setMessages((current) =>
        trimInMemoryMessages(
          current,
          retainedMessageChatIds({
            chats: chatsRef.current,
            messages: current,
            sessionAppUid: session.uid,
            friendMap,
            friendIdToBackendUid,
            currentUserId,
            currentUserLocalId: currentUserLocalId,
            unfriendedIds: unfriendedIdsRef.current,
          }),
          CHAT_INITIAL_MESSAGE_LIMIT
        )
      );
    };

    void (async () => {
      try {
        await refreshHiddenConversationIdsFromServer();

        let friendsFetchSucceeded = false;
        let friendMap: Record<string, Friend> = {};
        let friendIdToBackendUid: Record<string, string> = {};
        try {
          const mapped = await fetchFriendsOnBoot(session, addedFriendsFromRitualRef.current);
          friendsFetchSucceeded = true;
          if (cancelled) return;
          const bootUids = mapped
            .map((f) => f.backendUid?.trim())
            .filter((uid): uid is string => !!uid?.startsWith("u_"));
          const localUids = addedFriendsFromRitualRef.current
            .map((f) => f.backendUid?.trim())
            .filter((uid): uid is string => !!uid?.startsWith("u_"));
          const allowedUids = new Set([
            ...acceptedFriendBackendUidsRef.current,
            ...bootUids,
            ...localUids,
          ]);
          acceptedFriendBackendUidsRef.current = allowedUids;
          setAddedFriendsFromRitual(mapped);
          setFriendLinksState((prev) => {
            let next = prev;
            for (const f of mapped) {
              next = addUndirectedEdge(next, currentUserLocalId, f.id);
            }
            return next;
          });
          onServerFriendBackendUidsChanged?.(allowedUids);
          friendMap = {};
          for (const f of mapped) {
            friendMap[f.id] = f;
            const bu = f.backendUid?.trim();
            if (bu?.startsWith("u_")) friendMap[bu] = f;
          }
          friendIdToBackendUid = {};
          for (const f of mapped) {
            const bu = f.backendUid?.trim();
            if (bu?.startsWith("u_")) friendIdToBackendUid[f.id] = bu;
          }
          const reconciled = reconcileSocialStateWithServerFriends({
            serverFriends: mapped,
            chats: chatsRef.current,
            messages: messagesRef.current,
            sessionAppUid: session.uid,
            friendMap,
            friendIdToBackendUid,
            serverFriendsFetchSucceeded: friendsFetchSucceeded,
          });
          setChats(() => reconciled.chats);
          setMessages(() => reconciled.messages);
          trimMessagesInState(friendMap, friendIdToBackendUid);
        } catch (err) {
          logAppError("boot.friends", err, { uid: session.uid });
        }

        if (cancelled) return;
        const emptyTimeline =
          (messagesRef.current?.length ?? 0) === 0 &&
          (chatsRef.current?.length ?? 0) === 0 &&
          (postsRef.current?.length ?? 0) === 0;
        try {
          const retained = retainedMessageChatIds({
            chats: chatsRef.current,
            messages: messagesRef.current,
            sessionAppUid: session.uid,
            friendMap,
            friendIdToBackendUid,
            currentUserId,
            currentUserLocalId: currentUserLocalId,
            unfriendedIds: unfriendedIdsRef.current,
          });
          const visiblePullIds = [...retained].slice(0, BOOT_VISIBLE_CHATS_MESSAGE_PULL_MAX);

          if (emptyTimeline && visiblePullIds.length > 0) {
            for (const localChatId of visiblePullIds) {
              if (cancelled) return;
              const conversationId = resolveConversationId(localChatId);
              await pullEncryptedMessagesForConversation(conversationId);
              await yieldToUi();
            }
          } else {
            await pullEncryptedMessagesIncremental({
              limit: ENCRYPTED_MESSAGES_BOOT_SYNC_LIMIT,
            });
          }

          if (cancelled) return;
          trimMessagesInState(friendMap, friendIdToBackendUid);
          await yieldToUi();
          await pullEncryptedPostsIncremental({
            forceFull: true,
            limit: ENCRYPTED_POSTS_HOME_FEED_LIMIT,
          });
        } catch (err) {
          logAppError("boot.timeline", err, { uid: session.uid });
        }
      } finally {
        clearTimeout(safetyTimer);
        finish();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [
    demoOfflineMode,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    getBackendSession,
    refreshHiddenConversationIdsFromServer,
    pullEncryptedMessagesIncremental,
    pullEncryptedMessagesForConversation,
    resolveConversationId,
    pullEncryptedPostsIncremental,
    setAddedFriendsFromRitual,
    setFriendLinksState,
    addUndirectedEdge,
    setChats,
    setMessages,
    chatsRef,
    messagesRef,
    postsRef,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged,
    currentUserLocalId,
    currentUserId,
    unfriendedIdsRef,
  ]);
}
