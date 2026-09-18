import { useCallback, useState } from "react";

export type CommentReactionTarget = {
  postId: string;
  commentId: string;
  threadEntryId?: string;
};

/**
 * Owns the emoji picker target. Network writes stay in the parent.
 */
export function useReactionPicker() {
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactionTargetMessageId, setReactionTargetMessageId] = useState<string | null>(null);
  const [postReactionTargetId, setPostReactionTargetId] = useState<string | null>(null);
  const [commentReactionTarget, setCommentReactionTarget] = useState<CommentReactionTarget | null>(
    null
  );

  const closeReactionPicker = useCallback(() => {
    setReactionPickerOpen(false);
    setReactionTargetMessageId(null);
    setPostReactionTargetId(null);
    setCommentReactionTarget(null);
  }, []);

  const openReactionPickerForMessage = useCallback((messageId: string) => {
    setPostReactionTargetId(null);
    setCommentReactionTarget(null);
    setReactionTargetMessageId(messageId);
    setReactionPickerOpen(true);
  }, []);

  const openReactionPickerForPost = useCallback((postId: string) => {
    setReactionTargetMessageId(null);
    setCommentReactionTarget(null);
    setPostReactionTargetId(postId);
    setReactionPickerOpen(true);
  }, []);

  const openReactionPickerForComment = useCallback(
    (postId: string, commentId: string, threadEntryId?: string) => {
      setReactionTargetMessageId(null);
      setPostReactionTargetId(null);
      setCommentReactionTarget({ postId, commentId, threadEntryId });
      setReactionPickerOpen(true);
    },
    []
  );

  return {
    reactionPickerOpen,
    setReactionPickerOpen,
    reactionTargetMessageId,
    setReactionTargetMessageId,
    postReactionTargetId,
    setPostReactionTargetId,
    commentReactionTarget,
    setCommentReactionTarget,
    closeReactionPicker,
    openReactionPickerForMessage,
    openReactionPickerForPost,
    openReactionPickerForComment,
  };
}
