import { useEffect, useRef } from "react";

/** Starts inline playback once Tier B decrypt finishes after the user tapped play. */
export function ChatVideoAutoPlayWhenReady(props: {
  messageId: string;
  resolvedUri: string | undefined;
  pendingPlayMessageId: string | null;
  onPlay: (messageId: string) => void;
  onClearPending: () => void;
}): null {
  const { messageId, resolvedUri, pendingPlayMessageId, onPlay, onClearPending } = props;
  const onPlayRef = useRef(onPlay);
  const onClearPendingRef = useRef(onClearPending);
  onPlayRef.current = onPlay;
  onClearPendingRef.current = onClearPending;

  useEffect(() => {
    if (pendingPlayMessageId !== messageId || !resolvedUri?.trim()) return;
    onPlayRef.current(messageId);
    onClearPendingRef.current();
  }, [messageId, resolvedUri, pendingPlayMessageId]);

  return null;
}
