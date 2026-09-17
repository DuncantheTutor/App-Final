import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Keyboard } from "react-native";

import type { PostPhotoAsset } from "../posts/pickPostMedia";

export type PhotoEditorTarget = "chat" | "post" | "profile";
export type PhotoEditorMediaType = "photo" | "video";
export type PhotoEditorAsset = { uri: string; width: number; height: number };

export type PhotoEditorPending = {
  target: PhotoEditorTarget;
  mediaType: PhotoEditorMediaType;
  queue: PhotoEditorAsset[];
};

/**
 * Photo-editor + crop-overlay session used by chat, publish, profile, and group picture.
 * Complete handlers (upload/send) still compose through the parent.
 */
export function usePhotoEditorSession(params: {
  extraBlur?: () => void;
  isPublishPost: () => boolean;
  setQueuedPostPhotoAssets: Dispatch<SetStateAction<PostPhotoAsset[]>>;
  setCreateGroupPictureUri: Dispatch<SetStateAction<string | null>>;
}) {
  const { extraBlur, isPublishPost, setQueuedPostPhotoAssets, setCreateGroupPictureUri } = params;

  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [photoEditorInCrop, setPhotoEditorInCrop] = useState(false);
  const [photoEditorCropExitTick, setPhotoEditorCropExitTick] = useState(0);
  const [photoEditorMediaType, setPhotoEditorMediaType] = useState<PhotoEditorMediaType>("photo");
  const [photoEditorTarget, setPhotoEditorTarget] = useState<PhotoEditorTarget>("chat");
  const [photoEditorAsset, setPhotoEditorAsset] = useState<PhotoEditorAsset | null>(null);
  const [imageCropVisible, setImageCropVisible] = useState(false);
  const [imageCropUri, setImageCropUri] = useState<string | null>(null);
  const [imageCropAspect, setImageCropAspect] = useState<number | undefined>(undefined);
  const pendingPhotoEditorRef = useRef<PhotoEditorPending | null>(null);
  const imageCropPurposeRef = useRef<"photoEditor" | "groupPicture">("photoEditor");

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    extraBlur?.();
  }, [extraBlur]);

  const defaultTarget = useCallback(
    (): PhotoEditorTarget => (isPublishPost() ? "post" : "chat"),
    [isPublishPost]
  );

  const resetPhotoEditor = useCallback(
    (nextTarget?: PhotoEditorTarget) => {
      setPhotoEditorOpen(false);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("photo");
      setPhotoEditorTarget(nextTarget ?? defaultTarget());
    },
    [defaultTarget]
  );

  const cancelImageCropFlow = useCallback(() => {
    setImageCropVisible(false);
    setImageCropUri(null);
    setImageCropAspect(undefined);
    imageCropPurposeRef.current = "photoEditor";
    pendingPhotoEditorRef.current = null;
    setQueuedPostPhotoAssets([]);
    resetPhotoEditor("chat");
  }, [resetPhotoEditor, setQueuedPostPhotoAssets]);

  const openPhotoEditorAfterCrop = useCallback((cropped: PhotoEditorAsset) => {
    const pending = pendingPhotoEditorRef.current;
    if (!pending) return;
    dismissKeyboard();
    setImageCropVisible(false);
    setImageCropUri(null);
    setImageCropAspect(undefined);
    setPhotoEditorTarget(pending.target);
    setPhotoEditorMediaType(pending.mediaType);
    setQueuedPostPhotoAssets(pending.queue);
    setPhotoEditorAsset(cropped);
    setPhotoEditorOpen(true);
  }, [dismissKeyboard, setQueuedPostPhotoAssets]);

  const openPhotoEditorDirect = useCallback(
    (asset: PhotoEditorAsset, pending: PhotoEditorPending) => {
      dismissKeyboard();
      setPhotoEditorTarget(pending.target);
      setPhotoEditorMediaType(pending.mediaType);
      setQueuedPostPhotoAssets(pending.queue);
      setPhotoEditorAsset(asset);
      setPhotoEditorOpen(true);
    },
    [dismissKeyboard, setQueuedPostPhotoAssets]
  );

  const openImageCropThenEditor = useCallback(
    (asset: PhotoEditorAsset, pending: PhotoEditorPending & { fixedAspectRatio?: number }) => {
      imageCropPurposeRef.current = "photoEditor";
      pendingPhotoEditorRef.current = {
        target: pending.target,
        mediaType: pending.mediaType,
        queue: pending.queue,
      };
      dismissKeyboard();
      setImageCropAspect(pending.fixedAspectRatio);
      setImageCropUri(asset.uri);
      setImageCropVisible(true);
    },
    [dismissKeyboard]
  );

  const handleImageCropComplete = useCallback(
    (cropped: PhotoEditorAsset) => {
      if (imageCropPurposeRef.current === "groupPicture") {
        setImageCropVisible(false);
        setImageCropUri(null);
        setImageCropAspect(undefined);
        setCreateGroupPictureUri(cropped.uri);
        imageCropPurposeRef.current = "photoEditor";
        return;
      }
      openPhotoEditorAfterCrop(cropped);
    },
    [openPhotoEditorAfterCrop, setCreateGroupPictureUri]
  );

  const beginGroupPictureCrop = useCallback((uri: string) => {
    imageCropPurposeRef.current = "groupPicture";
    setImageCropAspect(1);
    setImageCropUri(uri);
    setImageCropVisible(true);
  }, []);

  const cancelPhotoEditor = useCallback(() => {
    dismissKeyboard();
    resetPhotoEditor(photoEditorTarget === "profile" ? "chat" : defaultTarget());
    setQueuedPostPhotoAssets([]);
  }, [defaultTarget, dismissKeyboard, photoEditorTarget, resetPhotoEditor, setQueuedPostPhotoAssets]);

  return {
    photoEditorOpen,
    photoEditorInCrop,
    setPhotoEditorInCrop,
    photoEditorCropExitTick,
    setPhotoEditorCropExitTick,
    photoEditorMediaType,
    setPhotoEditorMediaType,
    photoEditorTarget,
    setPhotoEditorTarget,
    photoEditorAsset,
    setPhotoEditorAsset,
    imageCropVisible,
    imageCropUri,
    imageCropAspect,
    cancelImageCropFlow,
    openPhotoEditorDirect,
    openImageCropThenEditor,
    handleImageCropComplete,
    beginGroupPictureCrop,
    cancelPhotoEditor,
    resetPhotoEditor,
    setPhotoEditorOpen,
  };
}

export type PhotoEditorSessionOpen = ReturnType<typeof usePhotoEditorSession>;
