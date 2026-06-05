import * as VideoThumbnails from "expo-video-thumbnails";

/** Display-oriented width/height for inline layout (respects filmed orientation). */
export async function probeVideoDisplayDimensions(
  videoUri: string
): Promise<{ width: number; height: number } | undefined> {
  const trimmed = videoUri.trim();
  if (!trimmed) return undefined;
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(trimmed, { time: 0, quality: 0.55 });
    const width = Number(thumb.width ?? 0);
    const height = Number(thumb.height ?? 0);
    if (width > 0 && height > 0) return { width, height };
  } catch {
    /* ignore */
  }
  return undefined;
}
