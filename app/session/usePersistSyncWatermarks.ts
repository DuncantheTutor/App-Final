import { useCallback, type MutableRefObject } from "react";
import { writeSyncWatermarks } from "../lib/clientSyncCache";

/** Immediate local save of message and post sync cursors. */
export function usePersistSyncWatermarks(params: {
  sessionEmailRef: MutableRefObject<string | null>;
  messagesWatermarkMsRef: MutableRefObject<number>;
  messagesLastFullSyncAtRef: MutableRefObject<number>;
  postsWatermarkMsRef: MutableRefObject<number>;
  postsLastFullSyncAtRef: MutableRefObject<number>;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
}) {
  const {
    sessionEmailRef,
    messagesWatermarkMsRef,
    messagesLastFullSyncAtRef,
    postsWatermarkMsRef,
    postsLastFullSyncAtRef,
    deletedPostIdsRef,
  } = params;

  return useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void writeSyncWatermarks(email, {
      messagesWatermarkMs: messagesWatermarkMsRef.current,
      messagesLastFullSyncAt: messagesLastFullSyncAtRef.current,
      postsWatermarkMs: postsWatermarkMsRef.current,
      postsLastFullSyncAt: postsLastFullSyncAtRef.current,
      deletedPostIds: [...deletedPostIdsRef.current],
    });
  }, [
    sessionEmailRef,
    messagesWatermarkMsRef,
    messagesLastFullSyncAtRef,
    postsWatermarkMsRef,
    postsLastFullSyncAtRef,
    deletedPostIdsRef,
  ]);
}
