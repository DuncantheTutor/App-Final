/** Legacy server default when `users.username` was missing — not a real display name. */
export const LEGACY_PLACEHOLDER_FRIEND_NAME = "Friend";

export function friendDisplayNameFromProfile(
  username: string | undefined | null,
  _backendUid: string
): string {
  const raw = String(username ?? "").trim();
  if (!raw || raw === LEGACY_PLACEHOLDER_FRIEND_NAME) return LEGACY_PLACEHOLDER_FRIEND_NAME;
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
