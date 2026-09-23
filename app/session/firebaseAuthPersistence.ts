/**
 * A null Firebase auth event is not enough to sign the UI out.
 * Token refresh (about an hour after sign-in, and when the app returns
 * from the background) often emits null while the persisted user is still valid.
 */
export function keepSignedInAfterNullAuthEvent(input: {
  currentUserEmail: string | null | undefined;
  persistedAuthBlob: boolean;
}): boolean {
  if (input.currentUserEmail?.trim()) return true;
  return input.persistedAuthBlob;
}

export const NULL_AUTH_GRACE_MS = 3000;
export const FIREBASE_ID_TOKEN_WARM_MS = 40 * 60 * 1000;
