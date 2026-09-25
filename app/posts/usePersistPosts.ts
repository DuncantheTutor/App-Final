import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Post } from "../domain/types";
import { storageSetItem } from "../lib/encryptedLocalStorage";
import { logAppError } from "../../telemetry";
import { isPostAlive, postsStorageKeyForEmail } from "../theme/preludeConstants";

/** Debounced local save of alive posts, plus an immediate flush. */
export function usePersistPosts(params: {
  signedIn: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
  posts: Post[];
  postsRef: MutableRefObject<Post[]>;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
}) {
  const { signedIn, sessionEmailRef, posts, postsRef, deletedPostIdsRef } = params;
  const persistPostsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const postsVisibleForCache = useCallback(
    (list: Post[]) => list.filter((p) => isPostAlive(p) && !deletedPostIdsRef.current.has(p.id)),
    [deletedPostIdsRef]
  );

  const persistPostsNow = useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    const alive = postsVisibleForCache(postsRef.current);
    void storageSetItem(postsStorageKeyForEmail(email), JSON.stringify(alive)).catch(() => {
      logAppError("posts.persistNow", new Error("write failed"), { email });
    });
  }, [postsVisibleForCache, postsRef, sessionEmailRef]);

  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    if (persistPostsTimerRef.current) clearTimeout(persistPostsTimerRef.current);
    persistPostsTimerRef.current = setTimeout(() => {
      persistPostsTimerRef.current = null;
      void storageSetItem(
        postsStorageKeyForEmail(email),
        JSON.stringify(postsVisibleForCache(posts))
      ).catch(() => {
        logAppError("posts.persist", new Error("write failed"), { email });
      });
    }, 1800);
    return () => {
      if (persistPostsTimerRef.current) clearTimeout(persistPostsTimerRef.current);
    };
  }, [posts, signedIn, postsVisibleForCache, sessionEmailRef]);

  return { postsVisibleForCache, persistPostsNow };
}
