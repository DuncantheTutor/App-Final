/** Profile avatars must be remote HTTPS URLs (not local `file://` cache paths). */
export function normalizeHttpsProfilePictureUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

export function mergeProfilePictureUrl(
  incoming: unknown,
  existing: string | undefined | null
): string {
  const next = normalizeHttpsProfilePictureUrl(incoming);
  if (next) return next;
  return normalizeHttpsProfilePictureUrl(existing) || "";
}
