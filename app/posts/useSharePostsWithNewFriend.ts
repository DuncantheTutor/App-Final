import { useCallback, type MutableRefObject } from "react";

/** Queue a one-time post share when a newly accepted friend appears. */
export function useSharePostsWithNewFriend(params: {
  readBackendSessionFromRefs: () => { uid: string } | null;
  postsSharedWithFriendsRef: MutableRefObject<Set<string>>;
  sharePostsBackfillStartedRef: MutableRefObject<Set<string>>;
  pendingPostsShareFriendUidsRef: MutableRefObject<Set<string>>;
  sharePostsWithNewFriendHandlerRef: MutableRefObject<(newFriendUid: string) => void>;
  setServerAcceptedFriendUids: (uids: Set<string>) => void;
  demoOfflineMode: boolean;
}) {
  const {
    readBackendSessionFromRefs,
    postsSharedWithFriendsRef,
    sharePostsBackfillStartedRef,
    pendingPostsShareFriendUidsRef,
    sharePostsWithNewFriendHandlerRef,
    setServerAcceptedFriendUids,
    demoOfflineMode,
  } = params;

  const queueSharePostsWithNewFriend = useCallback(
    (newFriendUid: string) => {
      if (demoOfflineMode) return;
      if (!newFriendUid.startsWith("u_")) return;
      if (postsSharedWithFriendsRef.current.has(newFriendUid)) return;
      if (sharePostsBackfillStartedRef.current.has(newFriendUid)) return;
      const session = readBackendSessionFromRefs();
      if (!session) {
        pendingPostsShareFriendUidsRef.current.add(newFriendUid);
        return;
      }
      sharePostsBackfillStartedRef.current.add(newFriendUid);
      sharePostsWithNewFriendHandlerRef.current(newFriendUid);
    },
    [
      demoOfflineMode,
      postsSharedWithFriendsRef,
      sharePostsBackfillStartedRef,
      pendingPostsShareFriendUidsRef,
      sharePostsWithNewFriendHandlerRef,
      readBackendSessionFromRefs,
    ]
  );

  const syncServerAcceptedFriendBackendUids = useCallback(
    (uids: Set<string>) => {
      setServerAcceptedFriendUids(uids);
      for (const uid of uids) {
        queueSharePostsWithNewFriend(uid);
      }
    },
    [queueSharePostsWithNewFriend, setServerAcceptedFriendUids]
  );

  return { queueSharePostsWithNewFriend, syncServerAcceptedFriendBackendUids };
}
