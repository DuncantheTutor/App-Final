import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import { logAppEvent } from "../../telemetry";
import type { Chat, Message, Post } from "../domain/types";
import { uploadSocialSnapshotToCloud } from "../lib/socialSnapshotBackup";
import type { BackendSession } from "../messaging/types";
import type { EncryptedSyncState } from "../session/useSignedInSession";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

export type ConfirmDeleteOwnedPostDeps = {
  setFullScreenPost: Dispatch<SetStateAction<Post | null>>;
  setPostFullscreenThreadReplyKey: Dispatch<SetStateAction<string | null>>;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  setPostMediaGalleryIndexByPostId: Dispatch<SetStateAction<Record<string, number>>>;
  setSeenFeedReactionSigByPostId: Dispatch<SetStateAction<Record<string, string>>>;
  persistPostsNow: () => void;
  persistWatermarksNow: () => void;
  postsRef: MutableRefObject<Post[]>;
  getBackendSession: () => BackendSession | null;
  waitForBackendSession: (maxMs?: number) => Promise<BackendSession | null>;
  chatsRef: MutableRefObject<Chat[]>;
  messagesRef: MutableRefObject<Message[]>;
  messagesWatermarkMsRef: MutableRefObject<number>;
  postsWatermarkMsRef: MutableRefObject<number>;
  postsLastFullSyncAtRef: MutableRefObject<number>;
  encryptedSyncState: EncryptedSyncState;
  postsVisibleForCache: (list: Post[]) => Post[];
};

export function confirmDeleteOwnedPost(post: Post, deps: ConfirmDeleteOwnedPostDeps): void {
  const {
    setFullScreenPost,
    setPostFullscreenThreadReplyKey,
    deletedPostIdsRef,
    setPosts,
    setPostMediaGalleryIndexByPostId,
    setSeenFeedReactionSigByPostId,
    persistPostsNow,
    persistWatermarksNow,
    postsRef,
    getBackendSession,
    waitForBackendSession,
    chatsRef,
    messagesRef,
    messagesWatermarkMsRef,
    postsWatermarkMsRef,
    postsLastFullSyncAtRef,
    encryptedSyncState,
    postsVisibleForCache,
  } = deps;

  if (post.authorId !== CURRENT_USER_ID) return;
  if (!DEMO_OFFLINE_MODE && /^p-\d+$/.test(post.id)) {
    Alert.alert(
      "Post still uploading",
      "Wait until the post finishes publishing, then delete again."
    );
    return;
  }
  Alert.alert(
    "Delete post?",
    "This removes the post for you and for friends who could see it.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setFullScreenPost((cur) => {
            if (cur?.id === post.id) {
              setPostFullscreenThreadReplyKey(null);
              return null;
            }
            return cur;
          });
          const removedPost = post;
          deletedPostIdsRef.current.add(post.id);
          setPosts((list) => list.filter((p) => p.id !== post.id));
          setPostMediaGalleryIndexByPostId((current) => {
            if (!(post.id in current)) return current;
            const next = { ...current };
            delete next[post.id];
            return next;
          });
          setSeenFeedReactionSigByPostId((current) => {
            if (!(post.id in current)) return current;
            const next = { ...current };
            delete next[post.id];
            return next;
          });
          persistPostsNow();
          persistWatermarksNow();
          const postsAfterDelete = postsRef.current.filter((p) => p.id !== post.id);
          const sessionForSnapshot = getBackendSession();
          if (sessionForSnapshot && !DEMO_OFFLINE_MODE) {
            void uploadSocialSnapshotToCloud(sessionForSnapshot.uid, sessionForSnapshot.deviceId, {
              chats: chatsRef.current,
              messages: messagesRef.current,
              posts: postsAfterDelete,
              messagesWatermarkMs: messagesWatermarkMsRef.current,
              postsWatermarkMs: postsWatermarkMsRef.current,
            }).catch(() => undefined);
          }
          if (!DEMO_OFFLINE_MODE) {
            void (async () => {
              try {
                let session = getBackendSession();
                if (!session) session = await waitForBackendSession();
                if (!session) {
                  const syncFailed =
                    encryptedSyncState.profile === "error" ||
                    encryptedSyncState.posts === "error" ||
                    encryptedSyncState.messages === "error";
                  throw new Error(
                    syncFailed
                      ? "Could not reach the server. If you saw a connection alert, tap Retry there, then delete again."
                      : "Account session is still starting. Wait a few seconds on the home screen, then try again."
                  );
                }
                const deletePostId = post.id.trim();
                await callEmulatorFunction<{ ok?: boolean }>("deleteEncryptedPost", {
                  uid: session.uid,
                  deviceId: session.deviceId,
                  postId: deletePostId,
                });
                postsLastFullSyncAtRef.current = 0;
                persistWatermarksNow();
                logAppEvent("post.deleted", { postId: deletePostId });
                void uploadSocialSnapshotToCloud(session.uid, session.deviceId, {
                  chats: chatsRef.current,
                  messages: messagesRef.current,
                  posts: postsVisibleForCache(postsRef.current),
                  messagesWatermarkMs: messagesWatermarkMsRef.current,
                  postsWatermarkMs: postsWatermarkMsRef.current,
                }).catch(() => undefined);
              } catch (err) {
                deletedPostIdsRef.current.delete(removedPost.id);
                persistWatermarksNow();
                const message = err instanceof Error ? err.message : "Could not delete post.";
                setPosts((list) => {
                  const restored = { ...removedPost, deletedAt: undefined };
                  if (list.some((p) => p.id === removedPost.id)) {
                    return list.map((p) => (p.id === removedPost.id ? restored : p));
                  }
                  return [restored, ...list].sort((a, b) => b.createdAt - a.createdAt);
                });
                persistPostsNow();
                Alert.alert("Could not delete post", message);
              }
            })();
          }
        },
      },
    ]
  );
}
