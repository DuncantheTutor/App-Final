import { HttpsError } from "firebase-functions/v2/https";
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
  auth?: { uid?: string } | null;
  data?: Record<string, unknown>;
};

/**
 * App identity is always `req.data.uid` (e.g. `u_<hash>`). Never use `req.auth.uid` — that is
 * Firebase Auth and does not match `participantUids` / friendship doc ids.
 */
export function resolveAppUidFromRequest(req: CallableIdentityRequest): string {
  const fromBody = String(req.data?.uid ?? req.data?.demoUid ?? "").trim();
  if (!fromBody) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }
  return requireAuthUid(fromBody);
}

/**
 * Resolves app uid from request body, validates device session, and when Firebase Auth
 * token is present verifies it matches `userFirebaseAuthMap` for that app uid.
 */
export async function assertVerifiedCallableCaller(
  req: CallableIdentityRequest
): Promise<{ appUid: string; deviceId: string }> {
  const appUid = resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(appUid, deviceId);
  const firebaseAuthUid = req.auth?.uid?.trim();
  if (firebaseAuthUid) {
    const mapSnap = await getFirestore().collection("userFirebaseAuthMap").doc(appUid).get();
    const mapped = String(mapSnap.data()?.firebaseAuthUid ?? "").trim();
    if (mapped && mapped !== firebaseAuthUid) {
      throw new HttpsError("permission-denied", "Firebase Auth does not match this app account.");
    }
  }
  return { appUid, deviceId };
}
