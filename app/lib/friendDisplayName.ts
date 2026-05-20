/** Legacy server default when `users.username` was missing — not a real display name. */
export const LEGACY_PLACEHOLDER_FRIEND_NAME = "Friend";

export function friendDisplayNameFromProfile(
  username: string | undefined | null,
  backendUid: string
): string {
  const raw = String(username ?? "").trim();
  if (!raw || raw === LEGACY_PLACEHOLDER_FRIEND_NAME) {
    const uid = backendUid.trim();
    return uid.startsWith("u_") ? `User ${uid.slice(0, 6)}` : "User";
  }
  return raw;
}

/** Prefer the first real username among candidates; otherwise a stable uid-based label. */
export function pickFriendDisplayName(
  candidates: Array<string | undefined | null>,
  backendUid: string
): string {
  for (const c of candidates) {
    const raw = String(c ?? "").trim();
    if (raw && raw !== LEGACY_PLACEHOLDER_FRIEND_NAME) {
      return raw;
    }
  }
  return friendDisplayNameFromProfile(null, backendUid);
}
