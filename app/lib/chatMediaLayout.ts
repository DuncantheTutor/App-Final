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
