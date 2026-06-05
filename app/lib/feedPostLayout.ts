import { Image } from "react-native";

import type { Post } from "../domain/types";

/** Default width/height before the real aspect is known (square — stable placeholder). */
export const DEFAULT_FEED_IMAGE_ASPECT = 1;

const feedImageAspectByUri = new Map<string, number>();

export function getCachedFeedImageAspect(uri: string): number | undefined {
  const key = uri.trim();
  if (!key) return undefined;
  return feedImageAspectByUri.get(key);
}

/** Stores aspect once; later calls with a different value are ignored (prevents layout jump). */
export function rememberFeedImageAspect(uri: string, aspectRatio: number): number | undefined {
  const key = uri.trim();
  if (!key) return undefined;
  const safe = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DEFAULT_FEED_IMAGE_ASPECT;
  const existing = feedImageAspectByUri.get(key);
  if (existing != null) return existing;
  feedImageAspectByUri.set(key, safe);
  return safe;
}

/** Preload dimensions so the feed slot height is correct before the Image paints. */
export function preloadFeedImageAspects(
  uris: string[],
  onAspect: (uri: string, aspect: number) => void
): void {
  for (const uri of uris) {
    const key = uri.trim();
    if (!key) continue;
    const cached = feedImageAspectByUri.get(key);
    if (cached != null) {
      onAspect(key, cached);
      continue;
    }
    Image.getSize(
      key,
      (width, height) => {
        if (!width || !height) return;
        const stored = rememberFeedImageAspect(key, width / height);
        if (stored != null) onAspect(key, stored);
      },
      () => undefined
    );
  }
}

/** Full-bleed media width on the home feed (`postFeedMediaWrap` negates card padding). */
export function feedPostMediaWidth(windowWidth: number): number {
  return windowWidth;
}

/**
 * Height for a feed image at full width preserving aspect ratio (width / height).
 * Tall portraits may be capped so one post does not dominate the feed.
 */
export function feedPostImageHeightForAspect(mediaWidth: number, aspectRatio: number): number {
  const safe =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DEFAULT_FEED_IMAGE_ASPECT;
  const raw = Math.round(mediaWidth / safe);
  const maxH = Math.round(mediaWidth * 2.5);
  return Math.max(64, Math.min(maxH, raw));
}

/** Shared carousel slot height: tallest width-fit image in a multi-photo post. */
export function feedPostGalleryTallestHeight(
  mediaWidth: number,
  uris: readonly string[],
  aspectByUri: Record<string, number>
): number {
  if (uris.length === 0) return 0;
  return uris.reduce((maxHeight, uri) => {
    const aspect =
      aspectByUri[uri] ?? getCachedFeedImageAspect(uri) ?? DEFAULT_FEED_IMAGE_ASPECT;
    return Math.max(maxHeight, feedPostImageHeightForAspect(mediaWidth, aspect));
  }, 0);
}

/** Image count for carousel chrome (legacy HTTPS + Tier B encrypted refs). */
export function postCarouselImageCount(
  post: Pick<Post, "imageUris" | "imageEncryptedMedia">
): number {
  return Math.max(post.imageUris?.length ?? 0, post.imageEncryptedMedia?.length ?? 0);
}

/** Preserve carousel slide when an optimistic post id is replaced by the server id. */
export function remapPostMediaGalleryIndex(
  current: Record<string, number>,
  fromPostId: string,
  toPostId: string
): Record<string, number> {
  if (fromPostId === toPostId) return current;
  const idx = current[fromPostId];
  if (idx == null) return current;
  const next = { ...current, [toPostId]: idx };
  delete next[fromPostId];
  return next;
}

/** @deprecated Prefer {@link feedPostImageHeightForAspect} for width-fit feed images. */
export function feedPostMediaHeight(windowWidth: number): number {
  return Math.round(windowWidth * 0.8);
}
