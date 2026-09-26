/**
 * A null Firebase auth event never signs the device out.
 * The session stays until the user presses Logout, or until the app is uninstalled.
 */
export function keepSignedInAfterNullAuthEvent(_input?: {
  currentUserEmail?: string | null;
  persistedAuthBlob?: boolean;
}): boolean {
  return true;
}

/** Email written on sign-in and removed only by Logout. Survives process death. */
export const DEVICE_SIGNED_IN_EMAIL_KEY = "erdos.deviceSignedInEmail.v1";

let intentionalSignOut = false;

export function beginIntentionalSignOut(): void {
  intentionalSignOut = true;
}

export function endIntentionalSignOut(): void {
  intentionalSignOut = false;
}

export function isIntentionalSignOut(): boolean {
  return intentionalSignOut;
}

export const NULL_AUTH_GRACE_MS = 3000;
export const FIREBASE_ID_TOKEN_WARM_MS = 40 * 60 * 1000;
