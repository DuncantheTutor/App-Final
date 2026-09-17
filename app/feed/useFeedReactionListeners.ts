import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { Post } from "../domain/types";
import type { BackendSession } from "../messaging/types";
import { attachEncryptedPostReactionsListeners } from "./sync";

/**
 * Live `encryptedPostReactions/{postId}` pills for the home feed (and the
 * open fullscreen post). Ciphertext post snapshots do not include these docs.
 */
export function useFeedReactionListeners(params: {
  demoOfflineMode: boolean;
  signedIn: boolean;
  initialServerSyncDone: boolean;
  viewScreen: string;
  homeTab: string;
  getBackendSession: () => BackendSession | null;
  backendUidToFriendId: Record<string, string>;
  listenPostIds: string[];
  setPosts: Dispatch<SetStateAction<Post[]>>;
}): void {
  const {
    demoOfflineMode,
    signedIn,
    initialServerSyncDone,
    viewScreen,
    homeTab,
    getBackendSession,
    backendUidToFriendId,
    listenPostIds,
    setPosts,
  } = params;

  useEffect(() => {
    if (demoOfflineMode) return;
    if (!signedIn) return;
    if (!initialServerSyncDone) return;
    if (viewScreen !== "home" || homeTab !== "feed") return;
    const session = getBackendSession();
    if (!session) return;
    if (listenPostIds.length === 0) return;
    return attachEncryptedPostReactionsListeners({
      sessionUid: session.uid,
      postIds: listenPostIds,
      backendUidToFriendId,
      setPosts,
    });
  }, [
    demoOfflineMode,
    signedIn,
    initialServerSyncDone,
    viewScreen,
    homeTab,
    getBackendSession,
    backendUidToFriendId,
    listenPostIds,
    setPosts,
  ]);
}
