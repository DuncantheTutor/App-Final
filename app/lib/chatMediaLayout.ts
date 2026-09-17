/** Width/height for inline chat photo or video bubbles (natural aspect, no square frame). */
export function chatPhotoMessageSize(
  windowWidth: number,
  mediaWidth?: number,
  mediaHeight?: number,
  aspectFallback = 4 / 3
): { width: number; height: number } {
  const maxWidth = Math.min(Math.round(windowWidth * 0.82), 340);
  const maxHeight = Math.round(windowWidth * 0.72);
  const safeFallback = Number.isFinite(aspectFallback) && aspectFallback > 0 ? aspectFallback : 4 / 3;

  const srcW = mediaWidth && mediaWidth > 0 ? mediaWidth : 0;
  const srcH = mediaHeight && mediaHeight > 0 ? mediaHeight : 0;

  if (srcW <= 0 || srcH <= 0) {
    const width = Math.min(260, maxWidth);
    return { width, height: Math.max(48, Math.round(width / aspectFallback)) };
  }

  let width = maxWidth;
  let height = Math.max(48, Math.round((width * srcH) / srcW));
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.max(120, Math.round((height * srcW) / srcH));
  }
  return { width, height };
}

/** Thin inset around media inside a captioned bubble (matches bubble colour, not grey). */
export const CHAT_CAPTIONED_MEDIA_IMAGE_INSET = 2;

/** Matches `messageCard.borderRadius` in makeAppStyles — keep in sync. */
export const CHAT_MESSAGE_BUBBLE_RADIUS = 12;

/** Inner media corner radius so the 2px surround tracks the bubble curve. */
export const CHAT_CAPTIONED_MEDIA_INNER_CORNER_RADIUS =
  CHAT_MESSAGE_BUBBLE_RADIUS - CHAT_CAPTIONED_MEDIA_IMAGE_INSET;

/** Minimum captioned bubble width — kept for callers that still need a floor. */
export const CHAT_CAPTIONED_MEDIA_MIN_BUBBLE_WIDTH = 120;

/** Photo/video bubble: image keeps crop aspect; 2px surround on every side that has no caption. */
export function chatCaptionedMediaLayout(
  windowWidth: number,
  mediaWidth?: number,
  mediaHeight?: number,
  aspectFallback = 4 / 3
): { bubbleWidth: number; imageWidth: number; imageHeight: number } {
  const image = chatPhotoMessageSize(windowWidth, mediaWidth, mediaHeight, aspectFallback);
  const bubbleWidth = image.width + CHAT_CAPTIONED_MEDIA_IMAGE_INSET * 2;
  return {
    bubbleWidth,
    imageWidth: image.width,
    imageHeight: image.height,
  };
}

/** Inset so the bubble colour hugs the media corners at even thickness. */
export function chatMediaBubbleInsetStyle(hasCaptionBelow: boolean): {
  paddingTop: number;
  paddingHorizontal: number;
  paddingBottom: number;
} {
  return {
    paddingTop: CHAT_CAPTIONED_MEDIA_IMAGE_INSET,
    paddingHorizontal: CHAT_CAPTIONED_MEDIA_IMAGE_INSET,
    paddingBottom: hasCaptionBelow ? 0 : CHAT_CAPTIONED_MEDIA_IMAGE_INSET,
  };
}

/** Inner clip: all four corners when the media is the bottom of the bubble. */
export function chatMediaInnerClipStyle(hasCaptionBelow: boolean): {
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
} {
  const r = CHAT_CAPTIONED_MEDIA_INNER_CORNER_RADIUS;
  return {
    borderTopLeftRadius: r,
    borderTopRightRadius: r,
    borderBottomLeftRadius: hasCaptionBelow ? 0 : r,
    borderBottomRightRadius: hasCaptionBelow ? 0 : r,
  };
}
