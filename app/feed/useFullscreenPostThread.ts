import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, type TextInput } from "react-native";

import type { Post } from "../domain/types";
import { writeComposerText } from "../lib/syncedComposerText";

/**
 * Full-screen post viewer composer state. Comment network writes stay in the parent.
 */
export function useFullscreenPostThread(params: { posts: Post[] }) {
  const { posts } = params;

  const [fullScreenPost, setFullScreenPost] = useState<Post | null>(null);
  const [postFullscreenThreadReplyKey, setPostFullscreenThreadReplyKey] = useState<string | null>(
    null
  );
  const [shouldFocusPostCommentInput, setShouldFocusPostCommentInput] = useState(false);
  const postCommentInputRef = useRef<TextInput | null>(null);
  const postCommentTextRef = useRef("");
  const [postCommentInput, setPostCommentInput] = useState("");
  const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<string, string>>({});
  const [threadDraftByChainKey, setThreadDraftByChainKey] = useState<Record<string, string>>({});

  const fullScreenPostLive = useMemo(() => {
    if (!fullScreenPost) return null;
    return posts.find((p) => p.id === fullScreenPost.id) ?? fullScreenPost;
  }, [fullScreenPost, posts]);

  useEffect(() => {
    if (!fullScreenPost || !shouldFocusPostCommentInput) return;
    const t = setTimeout(() => {
      postCommentInputRef.current?.focus();
      setShouldFocusPostCommentInput(false);
    }, 120);
    return () => clearTimeout(t);
  }, [fullScreenPost, shouldFocusPostCommentInput]);

  useEffect(() => {
    if (!fullScreenPost) {
      postCommentTextRef.current = "";
      setPostCommentInput("");
      return;
    }
    const text = postFullscreenThreadReplyKey
      ? (threadDraftByChainKey[postFullscreenThreadReplyKey] ?? "")
      : (commentDraftByPostId[fullScreenPost.id] ?? "");
    writeComposerText(postCommentTextRef, setPostCommentInput, text);
  }, [fullScreenPost?.id, postFullscreenThreadReplyKey]);

  const closeFullscreenPost = useCallback(() => {
    setFullScreenPost(null);
    setPostFullscreenThreadReplyKey(null);
    setShouldFocusPostCommentInput(false);
    postCommentTextRef.current = "";
    setPostCommentInput("");
    Keyboard.dismiss();
  }, []);

  const openPostViewerFromFeed = useCallback((post: Post) => {
    setFullScreenPost(post);
    setPostFullscreenThreadReplyKey(null);
    setShouldFocusPostCommentInput(false);
  }, []);

  const handlePostCommentInputChange = useCallback(
    (text: string) => {
      writeComposerText(postCommentTextRef, setPostCommentInput, text);
      if (postFullscreenThreadReplyKey) {
        setThreadDraftByChainKey((current) => ({
          ...current,
          [postFullscreenThreadReplyKey]: text,
        }));
      } else if (fullScreenPost) {
        setCommentDraftByPostId((current) => ({ ...current, [fullScreenPost.id]: text }));
      }
    },
    [postFullscreenThreadReplyKey, fullScreenPost?.id]
  );

  return {
    fullScreenPost,
    setFullScreenPost,
    fullScreenPostLive,
    postFullscreenThreadReplyKey,
    setPostFullscreenThreadReplyKey,
    shouldFocusPostCommentInput,
    setShouldFocusPostCommentInput,
    postCommentInputRef,
    postCommentTextRef,
    postCommentInput,
    setPostCommentInput,
    commentDraftByPostId,
    setCommentDraftByPostId,
    threadDraftByChainKey,
    setThreadDraftByChainKey,
    closeFullscreenPost,
    openPostViewerFromFeed,
    handlePostCommentInputChange,
  };
}
