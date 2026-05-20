import { useEffect } from "react";

import { logAppError } from "../../telemetry";
import { INITIAL_SERVER_SYNC_TIMEOUT_MS } from "../theme/preludeConstants";
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
  pullEncryptedMessagesIncremental: (options?: { forceFull?: boolean }) => Promise<void>;
  pullEncryptedPostsIncremental: (options?: { forceFull?: boolean }) => Promise<void>;
  setAddedFriendsFromRitual: (friends: Friend[]) => void;
  setFriendLinksState: (
    updater: (current: Record<string, string[]>) => Record<string, string[]>
  ) => void;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setMessages: (updater: (current: Message[]) => Message[]) => void;
  chatsRef: { current: Chat[] };
  messagesRef: { current: Message[] };
  postsRef: { current: Post[] };
  acceptedFriendBackendUidsRef: { current: Set<string> };
  onServerFriendBackendUidsChanged?: (uids: Set<string>) => void;
  addUndirectedEdge: (
    links: Record<string, string[]>,
    a: string,
    b: string
  ) => Record<string, string[]>;
  currentUserLocalId: string;
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
    pullEncryptedPostsIncremental,
    setAddedFriendsFromRitual,
    setFriendLinksState,
    setChats,
    setMessages,
    chatsRef,
    messagesRef,
    postsRef,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged,
    addUndirectedEdge,
    currentUserLocalId,
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

    void (async () => {
      try {
        await refreshHiddenConversationIdsFromServer();

        let friendsFetchSucceeded = false;
        try {
          const mapped = await fetchFriendsOnBoot(session);
          friendsFetchSucceeded = true;
          if (cancelled) return;
          const allowedUids = new Set(
            mapped.map((f) => f.backendUid?.trim()).filter((uid): uid is string => !!uid?.startsWith("u_"))
          );
          acceptedFriendBackendUidsRef.current = allowedUids;
          onServerFriendBackendUidsChanged?.(allowedUids);
          setAddedFriendsFromRitual(mapped);
          setFriendLinksState((prev) => {
            let next = prev;
            for (const f of mapped) {
              next = addUndirectedEdge(next, currentUserLocalId, f.id);
            }
            return next;
          });
          const friendMap: Record<string, Friend> = {};
          for (const f of mapped) {
            friendMap[f.id] = f;
            const bu = f.backendUid?.trim();
            if (bu?.startsWith("u_")) friendMap[bu] = f;
          }
          const friendIdToBackendUid: Record<string, string> = {};
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
        } catch (err) {
          logAppError("boot.friends", err, { uid: session.uid });
        }

        if (cancelled) return;
        const forceFullTimeline =
          (messagesRef.current?.length ?? 0) === 0 &&
          (chatsRef.current?.length ?? 0) === 0 &&
          (postsRef.current?.length ?? 0) === 0;
        try {
          await Promise.all([
            pullEncryptedMessagesIncremental(
              forceFullTimeline ? { forceFull: true } : undefined
            ),
            pullEncryptedPostsIncremental(forceFullTimeline ? { forceFull: true } : undefined),
          ]);
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
  ]);
}
