import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Message } from "../domain/types";
import { chatCaptionedMediaLayout } from "../lib/chatMediaLayout";

/** Measured chat media size, caption layout, and cancelling a video that is still preparing. */
export function useChatMediaFrame(params: {
  windowWidth: number;
  measuredChatMediaByMessageId: Record<string, { width: number; height: number }>;
  setMeasuredChatMediaByMessageId: Dispatch<SetStateAction<Record<string, { width: number; height: number }>>>;
  setVideoPlayAfterPrepareId: Dispatch<SetStateAction<string | null>>;
  setPlayingVideoMessageId: Dispatch<SetStateAction<string | null>>;
  setVideoPrepareRequestedIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const {
    windowWidth,
    measuredChatMediaByMessageId,
    setMeasuredChatMediaByMessageId,
    setVideoPlayAfterPrepareId,
    setPlayingVideoMessageId,
    setVideoPrepareRequestedIds,
  } = params;

  const getCaptionedMediaLayout = useCallback(
    (message: Message) => {
      const measured = measuredChatMediaByMessageId[message.id];
      const fallbackAspect = message.kind === "video" ? 9 / 16 : 4 / 3;
      return chatCaptionedMediaLayout(
        windowWidth,
        message.mediaWidth ?? measured?.width,
        message.mediaHeight ?? measured?.height,
        fallbackAspect
      );
    },
    [windowWidth, measuredChatMediaByMessageId]
  );

  const rememberChatVideoDimensions = useCallback(
    (messageId: string, width: number, height: number) => {
      setMeasuredChatMediaByMessageId((prev) => {
        const cur = prev[messageId];
        if (cur?.width === width && cur?.height === height) return prev;
        return { ...prev, [messageId]: { width, height } };
      });
    },
    [setMeasuredChatMediaByMessageId]
  );

  const cancelVideoPrepare = useCallback(
    (messageId: string) => {
      setVideoPlayAfterPrepareId((cur) => (cur === messageId ? null : cur));
      setPlayingVideoMessageId((cur) => (cur === messageId ? null : cur));
      setVideoPrepareRequestedIds((prev) => {
        if (!prev.has(messageId)) return prev;
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    },
    [setVideoPlayAfterPrepareId, setPlayingVideoMessageId, setVideoPrepareRequestedIds]
  );

  return { getCaptionedMediaLayout, rememberChatVideoDimensions, cancelVideoPrepare };
}
