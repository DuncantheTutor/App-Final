import type { Dispatch, SetStateAction } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";

import type { Friend, Post } from "../domain/types";
import { remapPostMediaGalleryIndex } from "../lib/feedPostLayout";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE } from "../theme/preludeConstants";
import { uploadEncryptedPost } from "./uploadEncryptedPost";

export type PostPublishActionsDeps = {
  getBackendSession: () => BackendSession | null;
  visibleFriendIds: string[];
  allFriends: Friend[];
  serverAcceptedFriendBackendUids: ReadonlySet<string>;
  resolveRecipientEncryptionKeys: (recipientUids: string[]) => Promise<Record<string, string>>;
  getSenderDisplayName: () => string;
  setPostMediaGalleryIndexByPostId: Dispatch<SetStateAction<Record<string, number>>>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  postDraftVideoUri: string | null;
  postDraftText: string;
  postDraftImageUris: string[];
  postDraftImageCaptions: string[];
  closePublishPostScreen: () => void;
  resetPublishDraft: () => void;
  openVideoThumbnailModal: () => Promise<void>;
};

export function createPostPublishActions(deps: PostPublishActionsDeps) {
  const {
    getBackendSession,
    visibleFriendIds,
    allFriends,
    serverAcceptedFriendBackendUids,
    resolveRecipientEncryptionKeys,
    getSenderDisplayName,
    setPostMediaGalleryIndexByPostId,
    setPosts,
    postDraftVideoUri,
    postDraftText,
    postDraftImageUris,
    postDraftImageCaptions,
    closePublishPostScreen,
    resetPublishDraft,
    openVideoThumbnailModal,
  } = deps;

  const commitEncryptedPost = async (newPost: Post) => {
    const session = getBackendSession();
    if (!session) throw new Error("Account session is not ready. Please wait a moment and try again.");
    const serverPostId = await uploadEncryptedPost({
      session,
      post: newPost,
      visibleFriendIds,
      allFriends,
      acceptedFriendBackendUids: serverAcceptedFriendBackendUids,
      resolveRecipientEncryptionKeys,
      notificationAuthorName: getSenderDisplayName(),
    });
    if (!serverPostId) return;
    setPostMediaGalleryIndexByPostId((current) =>
      remapPostMediaGalleryIndex(current, newPost.id, serverPostId)
    );
    setPosts((current) =>
      current.map((post) => (post.id === newPost.id ? { ...post, id: serverPostId } : post))
    );
  };

  const finalizeVideoPosterAndPublish = async (mode: "skip" | "pick") => {
    const videoUri = postDraftVideoUri;
    const text = postDraftText.trim();
    if (!videoUri) return;
    let posterUri: string | undefined;
    try {
      if (mode === "skip") {
        const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.85 });
        posterUri = thumb.uri;
      } else {
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9,
        });
        if (!r.canceled && r.assets[0]) {
          posterUri = r.assets[0].uri;
        } else {
          const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.85 });
          posterUri = thumb.uri;
        }
      }
    } catch {
      try {
        const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0 });
        posterUri = thumb.uri;
      } catch {
        posterUri = undefined;
      }
    }
    const newPost: Post = {
      id: `p-${Date.now()}`,
      authorId: CURRENT_USER_ID,
      createdAt: Date.now(),
      text: text || undefined,
      videoUri: videoUri,
      videoPosterUri: posterUri,
    };
    setPosts((p) => [newPost, ...p]);
    closePublishPostScreen();
    resetPublishDraft();
    if (!DEMO_OFFLINE_MODE) {
      try {
        await commitEncryptedPost(newPost);
      } catch (err) {
        setPosts((current) => current.filter((post) => post.id !== newPost.id));
        const message = err instanceof Error ? err.message : "Could not publish post.";
        Alert.alert("Post not published", message);
      }
    }
  };

  const publishPost = () => {
    const text = postDraftText.trim();
    const hasVideo = !!postDraftVideoUri;
    const hasImages = postDraftImageUris.length > 0;
    if (!text && !hasVideo && !hasImages) {
      Alert.alert("Empty post", "Add text, a photo, or a video.");
      return;
    }
    if (hasVideo) {
      void openVideoThumbnailModal();
      return;
    }
    const newPost: Post = {
      id: `p-${Date.now()}`,
      authorId: CURRENT_USER_ID,
      createdAt: Date.now(),
      text: text || undefined,
      imageUris: hasImages ? [...postDraftImageUris] : undefined,
      imageCaptions: hasImages
        ? postDraftImageCaptions
            .slice(0, postDraftImageUris.length)
            .concat(Array(Math.max(0, postDraftImageUris.length - postDraftImageCaptions.length)).fill(""))
        : undefined,
    };
    setPosts((p) => [newPost, ...p]);
    closePublishPostScreen();
    resetPublishDraft();
    if (!DEMO_OFFLINE_MODE) {
      void (async () => {
        try {
          await commitEncryptedPost(newPost);
        } catch (err) {
          setPosts((current) => current.filter((post) => post.id !== newPost.id));
          const message = err instanceof Error ? err.message : "Could not publish post.";
          Alert.alert("Post not published", message);
        }
      })();
    }
  };

  return { commitEncryptedPost, finalizeVideoPosterAndPublish, publishPost };
}
