import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { callEmulatorFunction } from "../../backendBridge";
import { pullEncryptedPostsIncremental as pullEncryptedPostsFromServer } from "../boot/pullEncryptedPosts";
import type { Post } from "../domain/types";
import { maxCreatedAtMs, mergeSyncedPosts } from "../lib/mergeEncryptedSync";
import type { BackendSession, EncryptedSyncStateBundle } from "../messaging/types";
import {
  CURRENT_USER_ID,
  ENCRYPTED_POSTS_FULL_SYNC_MS,
  ENCRYPTED_POSTS_HOME_FEED_LIMIT,
  ENCRYPTED_POSTS_PAGE_SIZE,
  ENCRYPTED_POSTS_PROFILE_SYNC_LIMIT,
} from "../theme/preludeConstants";
import { decodeEncryptedPostPullItems, type EncryptedPostPullItem } from "./decodePostBatch";
import { attachEncryptedPostsListener } from "./sync";

export type UseFeedSyncOptions = {
  demoOfflineMode: boolean;
  signedIn: boolean;
  initialServerSyncDone: boolean;
  viewScreen: string;
  homeTab: string;
  appLifecycleState: string;
  feedRefreshing: boolean;
  feedLoadingMore: boolean;
  feedHasMore: boolean;
  feedPullNonce: number;
  getBackendSession: () => BackendSession | null;
  backendUidToFriendId: Record<string, string>;
  postsWatermarkMsRef: MutableRefObject<number>;
  postsLastFullSyncAtRef: MutableRefObject<number>;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
  initialServerSyncCompletedAtRef: MutableRefObject<number>;
  persistWatermarksNow: () => void;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncStateBundle>>;
  setFeedRefreshing: Dispatch<SetStateAction<boolean>>;
  setFeedLoadingMore: Dispatch<SetStateAction<boolean>>;
  setFeedHasMore: Dispatch<SetStateAction<boolean>>;
};

/**
 * Encrypted-post pull, poll-on-open, older-page load, and home-feed snapshot.
 * Post rows / mute / paging flags stay in useFeedController; screens still
 * compose through MainApp.
 */
export function useFeedSync(options: UseFeedSyncOptions) {
  const {
    demoOfflineMode,
    signedIn,
    initialServerSyncDone,
    viewScreen,
    homeTab,
    appLifecycleState,
    feedRefreshing,
    feedLoadingMore,
    feedHasMore,
    feedPullNonce,
    getBackendSession,
    backendUidToFriendId,
    postsWatermarkMsRef,
    postsLastFullSyncAtRef,
    deletedPostIdsRef,
    initialServerSyncCompletedAtRef,
    persistWatermarksNow,
    setPosts,
    setEncryptedSyncState,
    setFeedRefreshing,
    setFeedLoadingMore,
    setFeedHasMore,
  } = options;

  const pullEncryptedPostsIncremental = useCallback(
    async (pullOptions?: { forceFull?: boolean; limit?: number }) => {
      const session = getBackendSession();
      if (!session || demoOfflineMode) return;
      setEncryptedSyncState((current) => ({ ...current, posts: "syncing" }));
      try {
        await pullEncryptedPostsFromServer(
          {
            session,
            backendUidToFriendId,
            currentUserLocalId: CURRENT_USER_ID,
            postsWatermarkMsRef,
            postsLastFullSyncAtRef,
            suppressedPostIdsRef: deletedPostIdsRef,
            forceFull:
              pullOptions?.forceFull ||
              deletedPostIdsRef.current.size > 0 ||
              postsLastFullSyncAtRef.current <= 0,
            limit: pullOptions?.limit,
          },
          setPosts
        );
        persistWatermarksNow();
        setEncryptedSyncState((current) => ({ ...current, posts: "ok", lastSuccessAt: Date.now() }));
      } catch {
        setEncryptedSyncState((current) => ({ ...current, posts: "error" }));
      }
    },
    [
      demoOfflineMode,
      backendUidToFriendId,
      deletedPostIdsRef,
      getBackendSession,
      persistWatermarksNow,
      postsLastFullSyncAtRef,
      postsWatermarkMsRef,
      setEncryptedSyncState,
      setPosts,
    ]
  );

  const loadMoreOlderPosts = useCallback(
    (oldestCreatedAt: number) => {
      if (feedLoadingMore || !feedHasMore || demoOfflineMode) return;
      const session = getBackendSession();
      if (!session) return;
      const sessionUid = session.uid;
      setFeedLoadingMore(true);
      void (async () => {
        try {
          const res = await callEmulatorFunction<{
            items: EncryptedPostPullItem[];
            reactionsByPostId?: Record<string, Record<string, string>>;
            hasMore?: boolean;
          }>("listEncryptedPosts", {
            uid: session.uid,
            deviceId: session.deviceId,
            limit: ENCRYPTED_POSTS_PAGE_SIZE,
            beforeMs: oldestCreatedAt - 1,
          });
          if (getBackendSession()?.uid !== sessionUid) return;
          const { decoded } = await decodeEncryptedPostPullItems({
            sessionUid,
            items: res.items ?? [],
            backendUidToFriendId,
            currentUserLocalId: CURRENT_USER_ID,
            reactionsByPostId: res.reactionsByPostId,
          });
          if (getBackendSession()?.uid !== sessionUid) return;
          setPosts((current) => {
            const byId = Object.fromEntries(current.map((p) => [p.id, p] as const));
            for (const p of decoded) {
              const prev = byId[p.id];
              byId[p.id] = {
                ...prev,
                ...p,
                feedReactions: p.feedReactions ?? prev?.feedReactions,
                comments: prev?.comments ?? p.comments,
              };
            }
            return Object.values(byId).sort((a, b) => b.createdAt - a.createdAt);
          });
          setFeedHasMore(res.hasMore ?? (res.items?.length ?? 0) >= ENCRYPTED_POSTS_PAGE_SIZE);
        } finally {
          setFeedLoadingMore(false);
        }
      })();
    },
    [
      backendUidToFriendId,
      demoOfflineMode,
      feedHasMore,
      feedLoadingMore,
      getBackendSession,
      setFeedHasMore,
      setFeedLoadingMore,
      setPosts,
    ]
  );

  useEffect(() => {
    if (demoOfflineMode) return;
    const session = getBackendSession();
    if (!session || !signedIn) return;
    if (!initialServerSyncDone) return;
    if (appLifecycleState !== "active") return;
    const isHomeFeed = viewScreen === "home" && homeTab === "feed";
    const isProfileSurface = viewScreen === "myProfile" || viewScreen === "friendProfile";
    if (!isHomeFeed && !isProfileSurface) return;
    if (
      isHomeFeed &&
      !feedRefreshing &&
      postsWatermarkMsRef.current > 0 &&
      Date.now() - initialServerSyncCompletedAtRef.current < 12_000
    ) {
      return;
    }
    const pageLimit = isHomeFeed
      ? ENCRYPTED_POSTS_HOME_FEED_LIMIT
      : ENCRYPTED_POSTS_PROFILE_SYNC_LIMIT;
    let cancelled = false;
    const tick = async () => {
      const now = Date.now();
      const fullSync = isHomeFeed
        ? feedRefreshing || postsWatermarkMsRef.current <= 0
        : feedRefreshing ||
          postsWatermarkMsRef.current <= 0 ||
          now - postsLastFullSyncAtRef.current > ENCRYPTED_POSTS_FULL_SYNC_MS;
      setEncryptedSyncState((current) => ({ ...current, posts: "syncing" }));
      try {
        const request: {
          uid: string;
          deviceId: string;
          limit: number;
          sinceMs?: number;
        } = {
          uid: session.uid,
          deviceId: session.deviceId,
          limit: pageLimit,
        };
        if (!fullSync && postsWatermarkMsRef.current > 0) {
          request.sinceMs = Math.max(0, postsWatermarkMsRef.current - 5_000);
        }
        const res = await callEmulatorFunction<{
          items: EncryptedPostPullItem[];
          reactionsByPostId?: Record<string, Record<string, string>>;
          incremental?: boolean;
          hasMore?: boolean;
        }>("listEncryptedPosts", request);
        if (!Array.isArray(res.items)) return;
        const { decoded, earliestFailureMs } = await decodeEncryptedPostPullItems({
          sessionUid: session.uid,
          items: res.items,
          backendUidToFriendId,
          currentUserLocalId: CURRENT_USER_ID,
          reactionsByPostId: res.reactionsByPostId,
          yieldEach: true,
        });
        if (cancelled) return;
        const incremental = Boolean(res.incremental);
        setPosts((current) =>
          mergeSyncedPosts(current, decoded, {
            incremental,
            optimisticWindowMs: 90_000,
            suppressedPostIds: deletedPostIdsRef.current,
          })
        );
        if (decoded.length > 0) {
          let candidate = maxCreatedAtMs(decoded);
          if (earliestFailureMs != null) {
            candidate = Math.min(candidate, earliestFailureMs - 1);
          }
          postsWatermarkMsRef.current = Math.max(postsWatermarkMsRef.current, candidate);
        }
        if (fullSync) {
          postsLastFullSyncAtRef.current = now;
        }
        if (isHomeFeed) {
          setFeedHasMore(res.hasMore ?? decoded.length >= pageLimit);
        }
        persistWatermarksNow();
        setEncryptedSyncState((current) => ({ ...current, posts: "ok", lastSuccessAt: Date.now() }));
      } catch {
        if (cancelled) return;
        setEncryptedSyncState((current) => ({ ...current, posts: "error" }));
      } finally {
        if (!cancelled) {
          setFeedRefreshing(false);
          setFeedLoadingMore(false);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [
    demoOfflineMode,
    signedIn,
    getBackendSession,
    backendUidToFriendId,
    appLifecycleState,
    viewScreen,
    homeTab,
    persistWatermarksNow,
    feedPullNonce,
    initialServerSyncDone,
  ]);

  useEffect(() => {
    if (demoOfflineMode) return;
    if (!signedIn) return;
    if (!initialServerSyncDone) return;
    if (viewScreen !== "home" || homeTab !== "feed") return;
    const session = getBackendSession();
    if (!session) return;
    return attachEncryptedPostsListener({
      session,
      backendUidToFriendId,
      postsWatermarkMsRef,
      deletedPostIdsRef,
      persistWatermarksNow,
      setPosts,
      setEncryptedSyncState,
    });
  }, [
    signedIn,
    getBackendSession,
    backendUidToFriendId,
    persistWatermarksNow,
    initialServerSyncDone,
    viewScreen,
    homeTab,
    demoOfflineMode,
    deletedPostIdsRef,
    postsWatermarkMsRef,
    setEncryptedSyncState,
    setPosts,
  ]);

  return { pullEncryptedPostsIncremental, loadMoreOlderPosts };
}
