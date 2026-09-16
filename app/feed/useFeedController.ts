import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { Post } from "../domain/types";
import { pruneExpiredFeedMutes, writeFeedMutesForEmail } from "../lib/feedMutePersistence";
import { writeFeedReactionSeenForEmail } from "../lib/feedReactionUnread";
import { FEED_UI_INITIAL_COUNT } from "../theme/preludeConstants";
import { logAppError } from "../../telemetry";

export type FeedController = {
  posts: Post[];
  setPosts: Dispatch<SetStateAction<Post[]>>;
  applyPosts: Dispatch<SetStateAction<Post[]>>;
  postsRef: MutableRefObject<Post[]>;
  resetPosts: () => void;
  feedMutedUntilByFriendId: Record<string, number | null>;
  setFeedMutedUntilByFriendId: Dispatch<SetStateAction<Record<string, number | null>>>;
  seenFeedReactionSigByPostId: Record<string, string>;
  setSeenFeedReactionSigByPostId: Dispatch<SetStateAction<Record<string, string>>>;
  feedRefreshing: boolean;
  setFeedRefreshing: Dispatch<SetStateAction<boolean>>;
  feedLoadingMore: boolean;
  setFeedLoadingMore: Dispatch<SetStateAction<boolean>>;
  feedHasMore: boolean;
  setFeedHasMore: Dispatch<SetStateAction<boolean>>;
  feedDisplayLimit: number;
  setFeedDisplayLimit: Dispatch<SetStateAction<number>>;
  resetFeedPrefs: () => void;
};

/**
 * Sole owner of in-memory feed post rows, mute/seen prefs, and list paging flags.
 * Pull/merge still live in MainApp; screens should write through this controller.
 */
export function useFeedController(params: {
  signedIn: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
}): FeedController {
  const { signedIn, sessionEmailRef } = params;

  const [posts, setPosts] = useState<Post[]>([]);
  const postsRef = useRef<Post[]>([]);
  postsRef.current = posts;

  const [feedMutedUntilByFriendId, setFeedMutedUntilByFriendId] = useState<
    Record<string, number | null>
  >({});
  const [seenFeedReactionSigByPostId, setSeenFeedReactionSigByPostId] = useState<
    Record<string, string>
  >({});
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedDisplayLimit, setFeedDisplayLimit] = useState(FEED_UI_INITIAL_COUNT);

  useEffect(() => {
    const timer = setInterval(() => {
      setFeedMutedUntilByFriendId((current) => {
        const next = pruneExpiredFeedMutes(current);
        const keys = Object.keys(current);
        const prunedKeys = Object.keys(next);
        const unchanged =
          keys.length === prunedKeys.length && keys.every((id) => next[id] === current[id]);
        return unchanged ? current : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void writeFeedMutesForEmail(email, feedMutedUntilByFriendId).catch(() => {
      logAppError("feedMutes.persist", new Error("write failed"), { email });
    });
  }, [feedMutedUntilByFriendId, signedIn, sessionEmailRef]);

  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void writeFeedReactionSeenForEmail(email, seenFeedReactionSigByPostId).catch(() => {
      logAppError("feedReactionSeen.persist", new Error("write failed"), { email });
    });
  }, [seenFeedReactionSigByPostId, signedIn, sessionEmailRef]);

  const resetPosts = useCallback(() => {
    setPosts([]);
    setFeedHasMore(true);
    setFeedDisplayLimit(FEED_UI_INITIAL_COUNT);
    setFeedRefreshing(false);
    setFeedLoadingMore(false);
  }, []);

  const resetFeedPrefs = useCallback(() => {
    setFeedMutedUntilByFriendId({});
    setSeenFeedReactionSigByPostId({});
  }, []);

  return {
    posts,
    setPosts,
    applyPosts: setPosts,
    postsRef,
    resetPosts,
    feedMutedUntilByFriendId,
    setFeedMutedUntilByFriendId,
    seenFeedReactionSigByPostId,
    setSeenFeedReactionSigByPostId,
    feedRefreshing,
    setFeedRefreshing,
    feedLoadingMore,
    setFeedLoadingMore,
    feedHasMore,
    setFeedHasMore,
    feedDisplayLimit,
    setFeedDisplayLimit,
    resetFeedPrefs,
  };
}
