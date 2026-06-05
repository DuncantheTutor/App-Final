export function isGifUri(uri: string): boolean {
  const lower = uri.split("?")[0]?.toLowerCase() ?? "";
  return lower.endsWith(".gif") || lower.includes(".gif");
}

export type OutgoingMediaKindHint = "photo" | "gif" | "video" | "voice";

/** Content-Type for Storage upload and Tier B cache extension (chat voice/video/photo). */
export function guessMediaContentType(
  uri: string,
  mediaKind?: OutgoingMediaKindHint | null
): string {
  const lower = uri.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".3gp") || lower.endsWith(".amr")) return "audio/3gpp";
  if (lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".caf")) return "audio/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (mediaKind === "voice") return "audio/mp4";
  if (mediaKind === "video") return "video/mp4";
  if (mediaKind === "gif") return "image/gif";
  return "image/jpeg";
}

/** File extension when writing Tier B decrypted bytes to cache. */
export function cacheExtensionForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("3gp") || ct.includes("amr")) return "3gp";
  if (ct.includes("wav")) return "wav";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("video")) return "mp4";
  if (ct.includes("audio")) return "m4a";
  return "jpg";
}

export function inferOutgoingMediaKind(
  uri: string,
  pickerType?: string | null
): "photo" | "gif" | "video" {
  if (pickerType === "video" || pickerType === "videos") return "video";
  if (isGifUri(uri)) return "gif";
  return "photo";
}
