import { Image } from "react-native";

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
 * Height for a feed image given its aspect ratio (width / height), clamped so
 * tall portraits and panoramas stay readable in the list.
 */
export function feedPostImageHeightForAspect(mediaWidth: number, aspectRatio: number): number {
  const safe =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DEFAULT_FEED_IMAGE_ASPECT;
  const raw = Math.round(mediaWidth / safe);
  const maxH = Math.round(mediaWidth * 1.35);
  const minH = Math.round(mediaWidth * 0.45);
  return Math.max(minH, Math.min(maxH, raw));
}

/** @deprecated Prefer {@link feedPostImageHeightForAspect} for width-fit feed images. */
export function feedPostMediaHeight(windowWidth: number): number {
  return Math.round(windowWidth * 0.8);
}
