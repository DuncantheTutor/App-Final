/** Firebase download URLs carry a long-lived token. Return the storage object path instead. */
export function storageObjectPathFromDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const firebaseHost =
      host === "firebasestorage.googleapis.com" ||
      host.endsWith(".firebasestorage.app") ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (!firebaseHost) return null;
    const marker = "/o/";
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) return null;
    const decoded = decodeURIComponent(url.pathname.slice(idx + marker.length));
    if (!decoded.startsWith("encrypted-media/") || decoded.includes("..")) return null;
    return decoded;
  } catch {
    return null;
  }
}

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
