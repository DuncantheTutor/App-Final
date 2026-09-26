import { useCallback, useEffect, useMemo, useState } from "react";
import type { Post, ViewState } from "../domain/types";
import { warmPostGridMediaCache } from "../lib/warmPostMediaCache";
import type { BackendSession } from "../messaging/types";
import {
  CURRENT_USER_ID,
  DEMO_OFFLINE_MODE,
  ENCRYPTED_POSTS_HOME_FEED_LIMIT,
  FEED_UI_DISPLAY_PAGE_SIZE,
  FEED_UI_INITIAL_COUNT,
  isPostAlive,
  PROFILE_FEED_POSTS_INITIAL,
  PROFILE_FEED_POSTS_PAGE_SIZE,
} from "../theme/preludeConstants";
import { countUnreadFeedReactionPosts, markOwnedPostReactionsSeen } from "../lib/feedReactionUnread";

function postHasMedia(post: Post) {
  return (
    (post.imageUris?.length ?? 0) > 0 ||
    (post.imageEncryptedMedia?.length ?? 0) > 0 ||
    !!post.videoUri ||
    !!post.videoEncryptedMedia
  );
}

/** Home feed, profile grids, and the unread reaction badge. */
export function useFeedLists(params: {
  posts: Post[];
  visibleFriendIds: string[];
  feedMutedUntilByFriendId: Record<string, number | null>;
  feedDisplayLimit: number;
  setFeedDisplayLimit: (updater: (cur: number) => number) => void;
  fullScreenPost: Post | null;
  view: ViewState;
  signedIn: boolean;
  initialServerSyncDone: boolean;
  windowWidth: number;
  onHomeFeedTab: boolean;
  seenFeedReactionSigByPostId: Record<string, string>;
  setSeenFeedReactionSigByPostId: (
    updater: (current: Record<string, string>) => Record<string, string>
  ) => void;
  getBackendSession: () => BackendSession | null;
  loadMoreOlderPosts: (beforeCreatedAt: number) => void;
  setFeedMediaResolveIds: (updater: (prev: Set<string>) => Set<string>) => void;
}) {
  const {
    posts,
    visibleFriendIds,
    feedMutedUntilByFriendId,
    feedDisplayLimit,
    setFeedDisplayLimit,
    fullScreenPost,
    view,
    signedIn,
    initialServerSyncDone,
    windowWidth,
    onHomeFeedTab,
    seenFeedReactionSigByPostId,
    setSeenFeedReactionSigByPostId,
    getBackendSession,
    loadMoreOlderPosts,
    setFeedMediaResolveIds,
  } = params;

  const [profileFeedPostLimit, setProfileFeedPostLimit] = useState(PROFILE_FEED_POSTS_INITIAL);

  const isFriendFeedMuted = useCallback(
    (friendId: string) => {
      const until = feedMutedUntilByFriendId[friendId];
      if (until === undefined) return false;
      if (until === null) return true;
      return until > Date.now();
    },
    [feedMutedUntilByFriendId]
  );

  const sortedVisiblePosts = useMemo(
    () => [...posts].filter(isPostAlive).sort((a, b) => b.createdAt - a.createdAt),
    [posts]
  );

  const feedPosts = useMemo(
    () =>
      sortedVisiblePosts.filter(
        (post) =>
          post.authorId === CURRENT_USER_ID ||
          (visibleFriendIds.includes(post.authorId) && !isFriendFeedMuted(post.authorId))
      ),
    [sortedVisiblePosts, visibleFriendIds, isFriendFeedMuted]
  );

  const displayedFeedPosts = useMemo(
    () => feedPosts.slice(0, feedDisplayLimit),
    [feedPosts, feedDisplayLimit]
  );

  const feedReactionListenPostIds = useMemo(() => {
    const ids = new Set(displayedFeedPosts.map((p) => p.id));
    if (fullScreenPost?.id) ids.add(fullScreenPost.id);
    return [...ids].slice(0, ENCRYPTED_POSTS_HOME_FEED_LIMIT);
  }, [displayedFeedPosts, fullScreenPost?.id]);

  const markFeedPostsForMediaResolve = useCallback(
    (postIds: string[]) => {
      if (postIds.length === 0) return;
      setFeedMediaResolveIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of postIds) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [setFeedMediaResolveIds]
  );

  useEffect(() => {
    markFeedPostsForMediaResolve(feedPosts.slice(0, FEED_UI_INITIAL_COUNT).map((post) => post.id));
  }, [feedPosts, markFeedPostsForMediaResolve]);

  const loadMoreFeedPosts = useCallback(() => {
    const oldest = feedPosts[feedPosts.length - 1];
    if (!oldest) return;
    loadMoreOlderPosts(oldest.createdAt);
  }, [feedPosts, loadMoreOlderPosts]);

  const onFeedEndReached = useCallback(() => {
    if (feedDisplayLimit < feedPosts.length) {
      setFeedDisplayLimit((cur) => Math.min(cur + FEED_UI_DISPLAY_PAGE_SIZE, feedPosts.length));
      return;
    }
    loadMoreFeedPosts();
  }, [feedDisplayLimit, feedPosts.length, loadMoreFeedPosts, setFeedDisplayLimit]);

  const myProfilePosts = useMemo(
    () => sortedVisiblePosts.filter((post) => post.authorId === CURRENT_USER_ID),
    [sortedVisiblePosts]
  );

  const myProfileMediaPosts = useMemo(
    () => myProfilePosts.filter(postHasMedia),
    [myProfilePosts]
  );

  const friendProfilePosts = useMemo(() => {
    if (view.screen !== "friendProfile") return [];
    return sortedVisiblePosts.filter((post) => post.authorId === view.friendId);
  }, [sortedVisiblePosts, view]);

  const friendProfileMediaPosts = useMemo(
    () => friendProfilePosts.filter(postHasMedia),
    [friendProfilePosts]
  );

  const visibleMyProfileFeedPosts = useMemo(
    () => myProfilePosts.slice(0, profileFeedPostLimit),
    [myProfilePosts, profileFeedPostLimit]
  );

  const visibleFriendProfileFeedPosts = useMemo(
    () => friendProfilePosts.slice(0, profileFeedPostLimit),
    [friendProfilePosts, profileFeedPostLimit]
  );

  const myProfileFeedHasMore = myProfilePosts.length > visibleMyProfileFeedPosts.length;
  const friendProfileFeedHasMore = friendProfilePosts.length > visibleFriendProfileFeedPosts.length;

  const postGridLayout = useMemo(() => {
    const cols = 3;
    const gap = 2;
    const inner = windowWidth - 28;
    const cell = Math.floor((inner - gap * (cols - 1)) / cols);
    return { cols, gap, cell };
  }, [windowWidth]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !initialServerSyncDone) return;
    if (myProfileMediaPosts.length === 0) return;
    void warmPostGridMediaCache(myProfileMediaPosts, { maxPosts: 36, priority: "normal" });
  }, [signedIn, initialServerSyncDone, myProfileMediaPosts]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    if (view.screen !== "myProfile") return;
    if (myProfileMediaPosts.length === 0) return;
    void warmPostGridMediaCache(myProfileMediaPosts, { maxPosts: 36, priority: "high" });
  }, [signedIn, view.screen, myProfileMediaPosts]);

  useEffect(() => {
    if (view.screen !== "myProfile" && view.screen !== "friendProfile") return;
    setProfileFeedPostLimit(PROFILE_FEED_POSTS_INITIAL);
  }, [view]);

  const loadMoreProfileFeedPosts = useCallback(() => {
    setProfileFeedPostLimit((current) => current + PROFILE_FEED_POSTS_PAGE_SIZE);
  }, []);

  const unreadFeedReactionCount = useMemo(() => {
    if (onHomeFeedTab) return 0;
    const session = getBackendSession();
    return countUnreadFeedReactionPosts(
      posts,
      CURRENT_USER_ID,
      session?.uid ?? null,
      seenFeedReactionSigByPostId
    );
  }, [onHomeFeedTab, posts, seenFeedReactionSigByPostId, getBackendSession]);

  useEffect(() => {
    if (!onHomeFeedTab) return;
    const session = getBackendSession();
    setSeenFeedReactionSigByPostId((current) =>
      markOwnedPostReactionsSeen(posts, CURRENT_USER_ID, session?.uid ?? null, current)
    );
  }, [onHomeFeedTab, posts, getBackendSession, setSeenFeedReactionSigByPostId]);

  return {
    isFriendFeedMuted,
    sortedVisiblePosts,
    feedPosts,
    displayedFeedPosts,
    feedReactionListenPostIds,
    loadMoreFeedPosts,
    onFeedEndReached,
    myProfilePosts,
    myProfileMediaPosts,
    friendProfilePosts,
    friendProfileMediaPosts,
    visibleMyProfileFeedPosts,
    visibleFriendProfileFeedPosts,
    myProfileFeedHasMore,
    friendProfileFeedHasMore,
    postGridLayout,
    loadMoreProfileFeedPosts,
    unreadFeedReactionCount,
    markFeedPostsForMediaResolve,
  };
}
