export function isGifUri(uri: string): boolean {
  const lower = uri.split("?")[0]?.toLowerCase() ?? "";
  return lower.endsWith(".gif") || lower.includes(".gif");
}

export function inferOutgoingMediaKind(
  uri: string,
  pickerType?: string | null
): "photo" | "gif" | "video" {
  if (pickerType === "video" || pickerType === "videos") return "video";
  if (isGifUri(uri)) return "gif";
  return "photo";
}
