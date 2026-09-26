import { HttpsError } from "firebase-functions/v2/https";

import { emailAccountDocId, legacyAppUidForEmail, mintAppUid } from "./accountIds";
import { canonicalizeEmail } from "./canonicalizeEmail";
import { getFirestore } from "./firebaseAdmin";

export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export function requireAuthUid(uid: string | null | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
  return uid;
}

function nowMs(): number {
  return Date.now();
}

/** Device lock on `users/{appUid}.activeDeviceId` (set by `claimDeviceSession`). */
export async function assertActiveDeviceSession(uid: string, deviceId: string): Promise<void> {
  if (!deviceId?.trim()) {
    throw new HttpsError("invalid-argument", "deviceId is required.");
  }
  const userRef = getFirestore().collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "User profile not found.");
  }
  const data = snap.data() as { activeDeviceId?: string; sessionIssuedAt?: number } | undefined;
  if (!data?.activeDeviceId || data.activeDeviceId !== deviceId) {
    throw new HttpsError("permission-denied", "Active session belongs to a different device.");
  }
  if (typeof data.sessionIssuedAt === "number" && nowMs() - data.sessionIssuedAt > SESSION_MAX_AGE_MS) {
    throw new HttpsError("permission-denied", "Device session expired.");
  }
}

export type CallableIdentityRequest = {
  auth?: { uid?: string; token?: { email?: string } } | null;
  data?: Record<string, unknown>;
};

export type VerifiedCallableIdentity = {
  firebaseAuthUid: string;
  email: string;
};

/**
 * Identity is the Firebase ID token on the callable, not `req.data.uid`.
 * The email comes from that token.
 */
export function requireVerifiedFirebaseIdentity(req: CallableIdentityRequest): VerifiedCallableIdentity {
  const firebaseAuthUid = req.auth?.uid?.trim() ?? "";
  const email = canonicalizeEmail(String(req.auth?.token?.email ?? ""));
  if (!firebaseAuthUid || !email.includes("@")) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }
  return { firebaseAuthUid, email };
}

/**
 * App account already bound to this Firebase user or this verified email.
 * Does not create an account.
 */
export async function lookupBoundAppUid(firebaseAuthUid: string, email: string): Promise<string | null> {
  const db = getFirestore();
  const byAuth = await db.collection("firebaseAuthToAppUid").doc(firebaseAuthUid).get();
  const mapped = String(byAuth.data()?.appUid ?? "").trim();
  if (mapped.startsWith("u_")) return mapped;

  const byEmail = await db.collection("emailAccounts").doc(emailAccountDocId(email)).get();
  const fromEmail = String(byEmail.data()?.uid ?? "").trim();
  if (fromEmail.startsWith("u_")) return fromEmail;
  return null;
}

async function assertBindingMatches(
  appUid: string,
  firebaseAuthUid: string,
  email: string
): Promise<void> {
  const db = getFirestore();
  const [authMap, reverse, emailSnap] = await Promise.all([
    db.collection("userFirebaseAuthMap").doc(appUid).get(),
    db.collection("firebaseAuthToAppUid").doc(firebaseAuthUid).get(),
    db.collection("emailAccounts").doc(emailAccountDocId(email)).get(),
  ]);
  const mappedFirebase = String(authMap.data()?.firebaseAuthUid ?? "").trim();
  if (mappedFirebase && mappedFirebase !== firebaseAuthUid) {
    throw new HttpsError("permission-denied", "This sign-in cannot be used.");
  }
  const reverseApp = String(reverse.data()?.appUid ?? "").trim();
  if (reverseApp && reverseApp !== appUid) {
    throw new HttpsError("permission-denied", "This sign-in cannot be used.");
  }
  const emailOwner = String(emailSnap.data()?.uid ?? "").trim();
  if (emailOwner && emailOwner !== appUid) {
    throw new HttpsError("permission-denied", "This sign-in cannot be used.");
  }
}

/**
 * Resolves the app account for a signed-in Firebase user.
 * A `uid` in the body is checked against that account and never selects it.
 */
export async function resolveAppUidFromRequest(req: CallableIdentityRequest): Promise<string> {
  const { firebaseAuthUid, email } = requireVerifiedFirebaseIdentity(req);
  const appUid = await lookupBoundAppUid(firebaseAuthUid, email);
  if (!appUid) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }
  await assertBindingMatches(appUid, firebaseAuthUid, email);
  const hinted = String(req.data?.uid ?? req.data?.demoUid ?? "").trim();
  if (hinted && hinted !== appUid) {
    throw new HttpsError("permission-denied", "Signed-in session does not match this account.");
  }
  return appUid;
}

/**
 * Resolves app uid from the Firebase token, validates the device session, and
 * checks the Firebase user is the one bound to that account.
 */
export async function assertVerifiedCallableCaller(
  req: CallableIdentityRequest
): Promise<{ appUid: string; deviceId: string }> {
  const appUid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(appUid, deviceId);
  return { appUid, deviceId };
}

export { legacyAppUidForEmail, mintAppUid };
