import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Keyboard, type TextInput } from "react-native";

type FullscreenMedia = {
  uri: string;
  kind: "photo" | "gif" | "video";
  mediaWidth?: number;
  mediaHeight?: number;
  galleryUris?: string[];
  galleryIndex?: number;
  postId?: string;
};

/** Open a photo or video over the current screen, and remember carousel position. */
export function useFullscreenMedia(params: {
  chatInputRef: RefObject<TextInput | null>;
  setFullScreenPost: (value: null) => void;
  setPostFullscreenThreadReplyKey: (value: null) => void;
  setPostMediaGalleryIndexByPostId: Dispatch<SetStateAction<Record<string, number>>>;
  setFullscreenMedia: Dispatch<SetStateAction<FullscreenMedia | null>>;
}) {
  const {
    chatInputRef,
    setFullScreenPost,
    setPostFullscreenThreadReplyKey,
    setPostMediaGalleryIndexByPostId,
    setFullscreenMedia,
  } = params;

  const setPostMediaGalleryIndex = useCallback(
    (postId: string, index: number) => {
      setPostMediaGalleryIndexByPostId((current) => ({ ...current, [postId]: index }));
    },
    [setPostMediaGalleryIndexByPostId]
  );

  const openFullscreenMedia = useCallback(
    (
      uri: string,
      kind: "photo" | "gif" | "video",
      options?: {
        galleryUris?: string[];
        galleryIndex?: number;
        postId?: string;
        mediaWidth?: number;
        mediaHeight?: number;
      }
    ) => {
      Keyboard.dismiss();
      chatInputRef.current?.blur();
      setFullScreenPost(null);
      setPostFullscreenThreadReplyKey(null);
      const postId = options?.postId;
      const uris = options?.galleryUris ?? [];
      const maxIndex = Math.max(0, uris.length - 1);
      const galleryIndex = Math.max(0, Math.min(options?.galleryIndex ?? 0, maxIndex));
      const activeUri = uris[galleryIndex] ?? uri;
      if (postId) {
        setPostMediaGalleryIndex(postId, galleryIndex);
      }
      setFullscreenMedia({
        uri: activeUri,
        kind,
        mediaWidth: options?.mediaWidth,
        mediaHeight: options?.mediaHeight,
        galleryUris: uris.length > 0 ? uris : undefined,
        galleryIndex,
        postId,
      });
    },
    [chatInputRef, setFullScreenPost, setPostFullscreenThreadReplyKey, setFullscreenMedia, setPostMediaGalleryIndex]
  );

  return { setPostMediaGalleryIndex, openFullscreenMedia };
}
