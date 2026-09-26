import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { AppStateStatus } from "react-native";
import type { Chat, Message, Post } from "../domain/types";
import { uploadSocialSnapshotToCloud } from "../lib/socialSnapshotBackup";
import type { BackendSession } from "../messaging/types";
import { DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

/** Debounced cloud backup of chats, messages, and posts, plus a flush when the app leaves the foreground. */
export function useSocialSnapshotCloudBackup(params: {
  signedIn: boolean;
  backendSessionReady: boolean;
  initialServerSyncDone: boolean;
  appLifecycleState: AppStateStatus;
  chats: Chat[];
  messages: Message[];
  posts: Post[];
  getBackendSession: () => BackendSession | null;
  postsVisibleForCache: (list: Post[]) => Post[];
  chatsRef: MutableRefObject<Chat[]>;
  messagesRef: MutableRefObject<Message[]>;
  postsRef: MutableRefObject<Post[]>;
  messagesWatermarkMsRef: MutableRefObject<number>;
  postsWatermarkMsRef: MutableRefObject<number>;
}) {
  const {
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    appLifecycleState,
    chats,
    messages,
    posts,
    getBackendSession,
    postsVisibleForCache,
    chatsRef,
    messagesRef,
    postsRef,
    messagesWatermarkMsRef,
    postsWatermarkMsRef,
  } = params;
  const socialSnapshotUploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSocialSnapshotCloudBackup = useCallback(() => {
    if (DEMO_OFFLINE_MODE || !initialServerSyncDone) return;
    const session = getBackendSession();
    if (!session) return;
    if (socialSnapshotUploadTimerRef.current) {
      clearTimeout(socialSnapshotUploadTimerRef.current);
    }
    socialSnapshotUploadTimerRef.current = setTimeout(() => {
      socialSnapshotUploadTimerRef.current = null;
      void uploadSocialSnapshotToCloud(session.uid, session.deviceId, {
        chats: chatsRef.current,
        messages: messagesRef.current,
        posts: postsVisibleForCache(postsRef.current),
        messagesWatermarkMs: messagesWatermarkMsRef.current,
        postsWatermarkMs: postsWatermarkMsRef.current,
      }).catch(() => undefined);
    }, 8_000);
  }, [
    initialServerSyncDone,
    getBackendSession,
    postsVisibleForCache,
    chatsRef,
    messagesRef,
    postsRef,
    messagesWatermarkMsRef,
    postsWatermarkMsRef,
  ]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !backendSessionReady || !initialServerSyncDone) return;
    scheduleSocialSnapshotCloudBackup();
  }, [
    chats,
    messages,
    posts,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    scheduleSocialSnapshotCloudBackup,
  ]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !initialServerSyncDone) return;
    if (appLifecycleState !== "background" && appLifecycleState !== "inactive") return;
    const session = getBackendSession();
    if (!session) return;
    void uploadSocialSnapshotToCloud(session.uid, session.deviceId, {
      chats: chatsRef.current,
      messages: messagesRef.current,
      posts: postsVisibleForCache(postsRef.current),
      messagesWatermarkMs: messagesWatermarkMsRef.current,
      postsWatermarkMs: postsWatermarkMsRef.current,
    }).catch(() => undefined);
  }, [
    appLifecycleState,
    signedIn,
    initialServerSyncDone,
    getBackendSession,
    postsVisibleForCache,
    chatsRef,
    messagesRef,
    postsRef,
    messagesWatermarkMsRef,
    postsWatermarkMsRef,
  ]);
}
