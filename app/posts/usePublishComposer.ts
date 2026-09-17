import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import * as VideoThumbnails from "expo-video-thumbnails";

import type { PostPhotoAsset } from "./pickPostMedia";

export type PublishComposer = {
  postDraftText: string;
  setPostDraftText: Dispatch<SetStateAction<string>>;
  postDraftImageUris: string[];
  setPostDraftImageUris: Dispatch<SetStateAction<string[]>>;
  postDraftVideoUri: string | null;
  setPostDraftVideoUri: Dispatch<SetStateAction<string | null>>;
  queuedPostPhotoAssets: PostPhotoAsset[];
  setQueuedPostPhotoAssets: Dispatch<SetStateAction<PostPhotoAsset[]>>;
  videoThumbnailModalOpen: boolean;
  videoThumbnailDefaultPosterUri: string | null;
  videoThumbnailPreviewLoading: boolean;
  resetPublishDraft: () => void;
  openPostComposer: () => void;
  appendEditedPostPhoto: (uri: string) => void;
  openVideoThumbnailModal: () => Promise<void>;
  closeVideoThumbnailModal: () => void;
};

/**
 * Sole owner of new-post draft fields and the video-thumbnail pre-prompt.
 * Photo-editor UI and encrypt/upload still compose through MainApp.
 */
export function usePublishComposer(params: { goToPublishPost: () => void }): PublishComposer {
  const { goToPublishPost } = params;

  const [postDraftText, setPostDraftText] = useState("");
  const [postDraftImageUris, setPostDraftImageUris] = useState<string[]>([]);
  const [postDraftVideoUri, setPostDraftVideoUri] = useState<string | null>(null);
  const [queuedPostPhotoAssets, setQueuedPostPhotoAssets] = useState<PostPhotoAsset[]>([]);
  const [videoThumbnailModalOpen, setVideoThumbnailModalOpen] = useState(false);
  const [videoThumbnailDefaultPosterUri, setVideoThumbnailDefaultPosterUri] = useState<string | null>(
    null
  );
  const [videoThumbnailPreviewLoading, setVideoThumbnailPreviewLoading] = useState(false);

  const resetPublishDraft = useCallback(() => {
    setPostDraftText("");
    setPostDraftImageUris([]);
    setPostDraftVideoUri(null);
    setQueuedPostPhotoAssets([]);
  }, []);

  const openPostComposer = useCallback(() => {
    resetPublishDraft();
    goToPublishPost();
  }, [goToPublishPost, resetPublishDraft]);

  const appendEditedPostPhoto = useCallback((uri: string) => {
    setPostDraftVideoUri(null);
    setPostDraftImageUris((prev) => [...prev, uri]);
  }, []);

  const closeVideoThumbnailModal = useCallback(() => {
    setVideoThumbnailModalOpen(false);
    setVideoThumbnailDefaultPosterUri(null);
    setVideoThumbnailPreviewLoading(false);
  }, []);

  const openVideoThumbnailModal = useCallback(async () => {
    const videoUri = postDraftVideoUri?.trim();
    if (!videoUri) return;
    setVideoThumbnailModalOpen(true);
    setVideoThumbnailPreviewLoading(true);
    setVideoThumbnailDefaultPosterUri(null);
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.85 });
      setVideoThumbnailDefaultPosterUri(thumb.uri?.trim() || null);
    } catch {
      setVideoThumbnailDefaultPosterUri(null);
    } finally {
      setVideoThumbnailPreviewLoading(false);
    }
  }, [postDraftVideoUri]);

  return {
    postDraftText,
    setPostDraftText,
    postDraftImageUris,
    setPostDraftImageUris,
    postDraftVideoUri,
    setPostDraftVideoUri,
    queuedPostPhotoAssets,
    setQueuedPostPhotoAssets,
    videoThumbnailModalOpen,
    videoThumbnailDefaultPosterUri,
    videoThumbnailPreviewLoading,
    resetPublishDraft,
    openPostComposer,
    appendEditedPostPhoto,
    openVideoThumbnailModal,
    closeVideoThumbnailModal,
  };
}
