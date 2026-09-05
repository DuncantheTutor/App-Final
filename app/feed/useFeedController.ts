import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { Post } from "../domain/types";

export type FeedController = {
  posts: Post[];
  setPosts: Dispatch<SetStateAction<Post[]>>;
  applyPosts: Dispatch<SetStateAction<Post[]>>;
  postsRef: MutableRefObject<Post[]>;
  resetPosts: () => void;
};

/**
 * Sole owner of in-memory feed post rows.
 * Pull/merge still live in MainApp; screens should write through this controller.
 */
export function useFeedController(): FeedController {
  const [posts, setPosts] = useState<Post[]>([]);
  const postsRef = useRef<Post[]>([]);
  postsRef.current = posts;

  const resetPosts = useCallback(() => {
    setPosts([]);
  }, []);

  return {
    posts,
    setPosts,
    applyPosts: setPosts,
    postsRef,
    resetPosts,
  };
}
