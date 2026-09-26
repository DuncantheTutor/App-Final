import "./firebaseAdmin";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createHash, randomBytes, randomInt } from "crypto";
import { canonicalizeEmail } from "./canonicalizeEmail";
import { getFirestore } from "./firebaseAdmin";
import {
  filterPostItemsByFriendship,
  isPresenceFresh,
  kickPairFromSharedGroups,
  listConversationMessages,
  manageConversationMembership,
  notifyConversationParticipantsPush,
  notifyPostRecipientsPush,
  registerPushToken,
  setEncryptedPostReaction,
  updateConversationReadPosition,
  updateEncryptedPost,
  updateMessageMetadata,
  updateEncryptedMessage,
  setConversationNotificationMute,
  backfillMessageParticipantAuthUid,
  mergeFriendAuthOntoRegistrantPresence,
  normalizePresenceHeartbeatMs,
  propagateFirebaseAuthUidToFriendsPresenceViewers,
  presenceDocOnlineFromData,
  refreshPresenceAfterFriendshipPair,
  refreshPresenceViewerAuthUids,
  writePresenceWithViewers,
} from "./socialExtensions";
import { emailAccountDocId, legacyAppUidForEmail, mintAppUid } from "./accountIds";
import {
  assertActiveDeviceSession,
  assertVerifiedCallableCaller,
  lookupBoundAppUid,
  requireVerifiedFirebaseIdentity,
  resolveAppUidFromRequest,
  SESSION_MAX_AGE_MS,
} from "./deviceSession";
import {
  profilePictureFieldsForStorage,
  profilePictureUrlForClient,
} from "./profilePictureAccess";
import {
  assertPostStoragePathsOwnedByAuthUid,
  collectStoragePathsFromPostDoc,
  deletePostStorageObjectPaths,
  normalizePostStorageObjectPaths,
  resolveFirebaseAuthUidForAppUid,
} from "./postStorageCleanup";
import { resolveParticipantAuthUids } from "./authUidMirror";
import { assertEmailOtpAvailable } from "./emailOtpAvailability";
import { verifyKeyBundleSignature } from "./keyBundleSignature";
import { assertPairingProximity, type PairingProximityEvidence } from "./pairingProximity";
import { getEncryptedMediaReadUrl } from "./encryptedMediaRead";

export {
  beginNfcHandshakeSession,
  consumeHandshake,
  createBleFriendSession,
  createHandshake,
  finalizeNfcHandshakeSession,
  getBleFriendSessionStatus,
  getNfcFriendVoucherStatus,
  getNfcHandshakeSessionStatus,
  joinBleFriendSession,
  mintNfcFriendVoucher,
  peekBleFriendSessionForJoin,
  redeemNfcFriendVoucher,
  respondNfcHandshakeSession,
} from "./legacyFriendshipCallables";

export { getEncryptedMediaReadUrl };

const db = getFirestore();

async function presentStoredProfilePicture(
  ownerAppUid: string,
  fields: { profilePictureUrl?: string | null; profilePicturePath?: string | null }
): Promise<string | null> {
  const ownerAuth = await resolveFirebaseAuthUidForAppUid(ownerAppUid);
  return profilePictureUrlForClient(ownerAuth, fields);
}

const OTP_TTL_MS = 1000 * 60 * 10;
const OTP_RESEND_COOLDOWN_MS = 1000 * 30;
const OTP_MAX_VERIFY_ATTEMPTS = 6;
const OTP_IP_WINDOW_MS = 1000 * 60 * 10;
const OTP_IP_MAX_REQUESTS_PER_WINDOW = 20;
const TELEMETRY_DETAILS_MAX_LEN = 4000;
const TELEMETRY_IP_WINDOW_MS = 1000 * 60 * 10;
const TELEMETRY_IP_MAX_EVENTS_PER_WINDOW = 200;
const PRESENCE_STALE_MS = 45_000;

type EnvelopeMap = Record<string, string>;

function requireAuthUid(uid: string | null | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
  return uid;
}

function nowMs(): number {
  return Date.now();
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function emailLocalPartLower(email: string): string {
  return (email.split("@")[0] ?? "").trim().toLowerCase();
}

function isEmailDerivedUsername(username: string, email: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const local = emailLocalPartLower(email);
  if (!local) return false;
  if (u === local) return true;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return norm(u) === norm(local);
}

function randomNonceHex(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

function assertReasonableCiphertext(ciphertext: string): void {
  if (ciphertext.length < 24) {
    throw new HttpsError("invalid-argument", "Encrypted payload is too short.");
  }
}

function friendshipId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function isAppBackendUid(id: string): boolean {
  return id.startsWith("u_");
}

/** Normalizes friendship `participants` entries to canonical app uids (`u_*`). */
async function normalizeParticipantToAppUid(raw: string): Promise<string | null> {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if (isAppBackendUid(id)) {
    const snap = await db.collection("users").doc(id).get();
    return snap.exists ? id : null;
  }
  const rev = await db.collection("firebaseAuthToAppUid").doc(id).get();
  let appUid = String(rev.data()?.appUid ?? "").trim();
  if (!appUid) {
    const mapQuery = await db
      .collection("userFirebaseAuthMap")
      .where("firebaseAuthUid", "==", id)
      .limit(1)
      .get();
    if (!mapQuery.empty) {
      appUid = mapQuery.docs[0].id.trim();
    }
  }
  if (!appUid || !isAppBackendUid(appUid)) return null;
  const userSnap = await db.collection("users").doc(appUid).get();
  return userSnap.exists ? appUid : null;
}

function privateThreadId(postId: string, ownerUid: string, friendUid: string): string {
  const pair = ownerUid < friendUid ? `${ownerUid}_${friendUid}` : `${friendUid}_${ownerUid}`;
  return `${postId}__${pair}`;
}

function timestampToMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    return ((value as { toMillis: () => number }).toMillis());
  }
  return 0;
}

function parseSinceMs(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function normalizePairingProximityEvidence(raw: unknown): PairingProximityEvidence {
  const input = (raw ?? {}) as Record<string, unknown>;
  const asNumberOrNull = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return v;
  };
  const lat = asNumberOrNull(input.lat);
  const lng = asNumberOrNull(input.lng);
  const horizontalAccuracyM = asNumberOrNull(input.horizontalAccuracyM);
  const locationTimestampMs = asNumberOrNull(input.locationTimestampMs);
  const isWifiConnected = Boolean(input.isWifiConnected);
  const localIpRaw = String(input.localIp ?? "").trim();
  const localIp = localIpRaw.length > 0 ? localIpRaw : null;
  return { lat, lng, horizontalAccuracyM, locationTimestampMs, isWifiConnected, localIp };
}

async function assertAcceptedFriendship(uid: string, otherUid: string): Promise<void> {
  if (uid === otherUid) return;
  const canonicalSnap = await db.collection("friendships").doc(friendshipId(uid, otherUid)).get();
  if (canonicalSnap.exists) {
    const data = canonicalSnap.data() as { status?: string } | undefined;
    if (data?.status === "accepted") return;
    throw new HttpsError("permission-denied", "Friendship not accepted.");
  }
  // Manual Console edges sometimes use a reversed doc id; accept any accepted edge
  // whose participants include both app uids (same query `listMyFriends` uses).
  const querySnap = await db
    .collection("friendships")
    .where("participants", "array-contains", uid)
    .where("status", "==", "accepted")
    .get();
  for (const doc of querySnap.docs) {
    const participants = (doc.data().participants ?? []) as string[];
    for (const raw of participants) {
      if (raw === uid) continue;
      const normalized = raw === otherUid ? otherUid : await normalizeParticipantToAppUid(raw);
      if (normalized === otherUid) return;
    }
  }
  throw new HttpsError("permission-denied", "You can only view profiles of friends.");
}

/**
 * Refreshes the Firebase Auth UID mirror for the signed-in account.
 * The uid is taken from the ID token. A value in the request body is ignored.
 */
export const registerFirebaseAuthUid = onCall(async (req) => {
  const { appUid: uid, deviceId } = await assertVerifiedCallableCaller(req);
  const { firebaseAuthUid } = requireVerifiedFirebaseIdentity(req);

  const updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("userFirebaseAuthMap").doc(uid).set(
    {
      uid,
      firebaseAuthUid,
      updatedAt,
    },
    { merge: true }
  );
  await db.collection("firebaseAuthToAppUid").doc(firebaseAuthUid).set(
    {
      appUid: uid,
      firebaseAuthUid,
      updatedAt,
    },
    { merge: true }
  );
  await propagateFirebaseAuthUidToFriendsPresenceViewers(uid);
  await mergeFriendAuthOntoRegistrantPresence(uid);
  await refreshPresenceViewerAuthUids(uid, deviceId);
  void backfillMessageParticipantAuthUid(uid, firebaseAuthUid).catch(() => undefined);
  return { ok: true };
});

/** Optional pairing offer id (legacy 4-digit or opaque 32-hex); does not throw. */
function tryNormalizePairingOfferIdOptional(raw: unknown): string | null {
  try {
    return normalizePairingOfferId(raw);
  } catch {
    return null;
  }
}

/** Allows reading the other participant's profile during active QR/NFC pairing after scanner confirmation. */
async function assertPairingSessionAllowsProfileRead(
  viewerUid: string,
  targetUid: string,
  offerId: string
): Promise<void> {
  const ref = db.collection("nfcPinPairSessions").doc(offerId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Pairing session not found.");
  }
  const d = snap.data() as {
    issuerUid?: string;
    redeemerUid?: string | null;
    expiresAt?: number;
    scannerConfirmed?: boolean;
  };
  if ((d.expiresAt ?? 0) < nowMs()) {
    throw new HttpsError("permission-denied", "Pairing session expired.");
  }
  const issuer = String(d.issuerUid ?? "").trim();
  const redeemer = String(d.redeemerUid ?? "").trim();
  if (!issuer || !redeemer || !d.scannerConfirmed) {
    throw new HttpsError("permission-denied", "Pairing is not ready to load profiles yet.");
  }
  const pairOk =
    (issuer === viewerUid && redeemer === targetUid) || (issuer === targetUid && redeemer === viewerUid);
  if (!pairOk) {
    throw new HttpsError("permission-denied", "Pairing session does not match this user.");
  }
}

async function assertOtpIpThrottle(rawIp: string, purpose: string): Promise<void> {
  const ip = String(rawIp ?? "").trim();
  if (!ip) return;
  const now = nowMs();
  const bucketId = sha256Hex(`otp-ip|${purpose}|${ip}`);
  const ref = db.collection("otpIpThrottle").doc(bucketId);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as { windowStartMs?: number; count?: number };
    const windowStartMs = data.windowStartMs ?? now;
    const withinWindow = now - windowStartMs < OTP_IP_WINDOW_MS;
    const nextCount = withinWindow ? (data.count ?? 0) + 1 : 1;
    if (withinWindow && nextCount > OTP_IP_MAX_REQUESTS_PER_WINDOW) {
      throw new HttpsError("resource-exhausted", "Too many OTP requests from this network. Please wait.");
    }
    tx.set(
      ref,
      {
        windowStartMs: withinWindow ? windowStartMs : now,
        count: nextCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function assertTelemetryIpThrottle(rawIp: string): Promise<void> {
  const ip = String(rawIp ?? "").trim();
  if (!ip) return;
  const now = nowMs();
  const bucketId = sha256Hex(`telemetry-ip|${ip}`);
  const ref = db.collection("telemetryIpThrottle").doc(bucketId);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as { windowStartMs?: number; count?: number };
    const windowStartMs = data.windowStartMs ?? now;
    const withinWindow = now - windowStartMs < TELEMETRY_IP_WINDOW_MS;
    const nextCount = withinWindow ? (data.count ?? 0) + 1 : 1;
    if (withinWindow && nextCount > TELEMETRY_IP_MAX_EVENTS_PER_WINDOW) {
      throw new HttpsError("resource-exhausted", "Telemetry rate limit exceeded.");
    }
    tx.set(
      ref,
      {
        windowStartMs: withinWindow ? windowStartMs : now,
        count: nextCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Binds this device to the Firebase-authenticated account.
 * The app account id is looked up from the verified email, or minted if this
 * mailbox has never signed in. A `uid` in the body is ignored.
 * Returns the app account id the client must use from then on.
 */
export const claimDeviceSession = onCall(async (req) => {
  const { firebaseAuthUid, email } = requireVerifiedFirebaseIdentity(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  if (!deviceId) throw new HttpsError("invalid-argument", "deviceId is required.");
  const requestedUsername = String(req.data?.username ?? "").trim();

  let appUid = await lookupBoundAppUid(firebaseAuthUid, email);
  if (!appUid) {
    const legacyId = legacyAppUidForEmail(email);
    const legacySnap = await db.collection("users").doc(legacyId).get();
    if (legacySnap.exists) {
      const storedEmail = canonicalizeEmail(String(legacySnap.data()?.email ?? ""));
      const boundFirebase = String(legacySnap.data()?.firebaseAuthUid ?? "").trim();
      if ((!storedEmail || storedEmail === email) && (!boundFirebase || boundFirebase === firebaseAuthUid)) {
        appUid = legacyId;
      }
    }
  }
  if (!appUid) appUid = mintAppUid();

  const userRef = db.collection("users").doc(appUid);
  const emailRef = db.collection("emailAccounts").doc(emailAccountDocId(email));
  const authMapRef = db.collection("userFirebaseAuthMap").doc(appUid);
  const reverseRef = db.collection("firebaseAuthToAppUid").doc(firebaseAuthUid);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = await tx.get(userRef);
    const emailSnap = await tx.get(emailRef);
    const reverseSnap = await tx.get(reverseRef);
    const reverseOwner = String(reverseSnap.data()?.appUid ?? "").trim();
    if (reverseOwner && reverseOwner !== appUid) {
      throw new HttpsError("permission-denied", "This sign-in cannot be used.");
    }
    if (emailSnap.exists) {
      const ownerUid = String(emailSnap.data()?.uid ?? "").trim();
      if (ownerUid && ownerUid !== appUid) {
        throw new HttpsError("permission-denied", "This sign-in cannot be used.");
      }
    }
    const existing = (snap.data() ?? {}) as { username?: string };
    const existingUsername = String(existing.username ?? "").trim();
    const patch: Record<string, unknown> = {
      uid: appUid,
      email,
      activeDeviceId: deviceId,
      sessionIssuedAt: nowMs(),
      phoneNumber: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const chosenUsername =
      requestedUsername && !isEmailDerivedUsername(requestedUsername, email) ? requestedUsername : "";
    if (chosenUsername && (!existingUsername || isEmailDerivedUsername(existingUsername, email))) {
      patch.username = chosenUsername;
    }
    const updatedAt = admin.firestore.FieldValue.serverTimestamp();
    tx.set(userRef, patch, { merge: true });
    tx.set(emailRef, { uid: appUid, canonicalEmail: email, updatedAt }, { merge: true });
    tx.set(authMapRef, { uid: appUid, firebaseAuthUid, updatedAt }, { merge: true });
    tx.set(reverseRef, { appUid, firebaseAuthUid, updatedAt }, { merge: true });
  });
  return { ok: true, uid: appUid };
});

/**
 * Releases one-device lock for current authenticated caller.
 */
export const releaseDeviceSession = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  if (!deviceId) throw new HttpsError("invalid-argument", "deviceId is required.");
  const userRef = db.collection("users").doc(uid);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const existing = (snap.data() ?? {}) as { activeDeviceId?: string };
    if (existing.activeDeviceId && existing.activeDeviceId !== deviceId) {
      throw new HttpsError("permission-denied", "Only the active device can release this session.");
    }
    tx.set(
      userRef,
      {
        activeDeviceId: admin.firestore.FieldValue.delete(),
        sessionIssuedAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  return { ok: true };
});

/**
 * Upserts profile metadata for current user (non-sensitive public profile).
 */
export const upsertUserProfile = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const { email, firebaseAuthUid } = requireVerifiedFirebaseIdentity(req);
  const username = String(req.data?.username ?? "").trim();
  const bio = String(req.data?.bio ?? "").trim();
  const profilePictureUrl = String(req.data?.profilePictureUrl ?? "").trim();
  const profilePicturePath = String(req.data?.profilePicturePath ?? "").trim();
  const patch: Record<string, unknown> = {
    uid,
    bio: bio || null,
    phoneNumber: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // Only touch `username` when the client sends a real chosen name. Never store
  // a name copied from the email, and never write null on boot upserts that omit it.
  if (username && !isEmailDerivedUsername(username, email)) {
    patch.username = username;
  }
  if (profilePictureUrl || profilePicturePath) {
    const picture = profilePictureFieldsForStorage(profilePictureUrl, profilePicturePath, firebaseAuthUid);
    if (picture.profilePicturePath) {
      patch.profilePicturePath = picture.profilePicturePath;
      patch.profilePictureUrl =
        process.env.FUNCTIONS_EMULATOR === "true" && profilePictureUrl
          ? profilePictureUrl
          : admin.firestore.FieldValue.delete();
    } else if (picture.profilePictureUrl) {
      patch.profilePictureUrl = picture.profilePictureUrl;
      patch.profilePicturePath = admin.firestore.FieldValue.delete();
    }
  }
  await db.collection("users").doc(uid).set(patch, { merge: true });
  return { ok: true };
});

/**
 * Email OTP step-up for the emulator only. Production refuses the call until
 * a mail sender exists. The app keeps EMAIL_OTP_ENABLED off for the same reason.
 */
export const requestEmailOtp = onCall(async (req) => {
  assertEmailOtpAvailable();
  const email = String(req.data?.email ?? "").trim().toLowerCase();
  const purpose = String(req.data?.purpose ?? "signup").trim().toLowerCase();
  if (!email.includes("@") || !email.includes(".")) {
    throw new HttpsError("invalid-argument", "Valid email is required.");
  }
  if (!["signup", "login"].includes(purpose)) {
    throw new HttpsError("invalid-argument", "Invalid OTP purpose.");
  }
  const rawIp = req.rawRequest?.ip ?? "";
  await assertOtpIpThrottle(String(rawIp), purpose);
  const code = randomOtp();
  const expiresAt = nowMs() + OTP_TTL_MS;
  const requestedAt = nowMs();
  const key = sha256Hex(`${purpose}|${email}`);
  const ref = db.collection("emailOtps").doc(key);
  const existing = await ref.get();
  if (existing.exists) {
    const existingData = existing.data() as { requestedAtMs?: number } | undefined;
    const lastRequestedAt = existingData?.requestedAtMs ?? 0;
    if (lastRequestedAt > 0 && requestedAt - lastRequestedAt < OTP_RESEND_COOLDOWN_MS) {
      throw new HttpsError("resource-exhausted", "Please wait before requesting another OTP.");
    }
  }
  await ref.set({
    email,
    purpose,
    codeHash: sha256Hex(code),
    attemptCount: 0,
    consumed: false,
    requestedAtMs: requestedAt,
    expiresAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const emulator = process.env.FUNCTIONS_EMULATOR === "true";
  return emulator ? { ok: true, expiresAt, debugCode: code } : { ok: true, expiresAt };
});

/**
 * Lightweight telemetry ingestion for prototype diagnostics.
 */
export const logClientTelemetry = onCall(async (req) => {
  await assertTelemetryIpThrottle(String(req.rawRequest?.ip ?? ""));
  const uid = String(req.auth?.uid ?? req.data?.uid ?? req.data?.demoUid ?? "").trim() || "anon";
  const type = String(req.data?.type ?? "event").trim().toLowerCase();
  const name = String(req.data?.name ?? "").trim().slice(0, 120);
  const message = String(req.data?.message ?? "").trim().slice(0, 500);
  const deviceId = String(req.data?.deviceId ?? "").trim().slice(0, 120);
  const detailsRaw = req.data?.details;
  const details =
    detailsRaw && typeof detailsRaw === "object"
      ? JSON.parse(JSON.stringify(detailsRaw))
      : {};
  const detailsJson = JSON.stringify(details);
  if (detailsJson.length > TELEMETRY_DETAILS_MAX_LEN) {
    throw new HttpsError("invalid-argument", "Telemetry details too large.");
  }
  const allowedTypes = new Set(["event", "error"]);
  if (!allowedTypes.has(type)) {
    throw new HttpsError("invalid-argument", "Invalid telemetry type.");
  }
  if (!name && !message) {
    throw new HttpsError("invalid-argument", "Telemetry payload requires name or message.");
  }
  await db.collection("clientTelemetry").add({
    uid,
    type,
    name: name || null,
    message: message || null,
    deviceId: deviceId || null,
    details,
    receivedAtMs: nowMs(),
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/**
 * Scheduled cleanup to reduce stale handshake/session documents.
 */
export const cleanupExpiredTransientDocs = onSchedule("every 15 minutes", async () => {
  const now = nowMs();
  const staleBefore = now - 1000 * 60 * 60 * 24;
  const telemetryStaleBefore = now - 1000 * 60 * 60 * 24 * 14;
  const commitDeletes = async (refs: FirebaseFirestore.DocumentReference[]) => {
    for (let i = 0; i < refs.length; i += 450) {
      const slice = refs.slice(i, i + 450);
      const batch = db.batch();
      slice.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  };

  const [handshakes, sessions, vouchers, bleSessions, nfcPinPairs, oldTelemetry] = await Promise.all([
    db.collection("handshakes").where("expiresAt", "<", now).limit(500).get(),
    db.collection("handshakeSessions").where("expiresAt", "<", now).limit(500).get(),
    db.collection("nfcFriendVouchers").where("expiresAt", "<", now).limit(500).get(),
    db.collection("bleFriendSessions").where("expiresAt", "<", now).limit(500).get(),
    db.collection("nfcPinPairSessions").where("expiresAt", "<", now).limit(500).get(),
    db.collection("clientTelemetry").where("receivedAtMs", "<", telemetryStaleBefore).limit(500).get(),
  ]);
  await commitDeletes(handshakes.docs.map((d) => d.ref));
  await commitDeletes(sessions.docs.map((d) => d.ref));
  await commitDeletes(vouchers.docs.map((d) => d.ref));
  await commitDeletes(bleSessions.docs.map((d) => d.ref));
  await commitDeletes(nfcPinPairs.docs.map((d) => d.ref));
  await commitDeletes(oldTelemetry.docs.map((d) => d.ref));

  const oldOtpThrottle = await db.collection("otpIpThrottle").where("windowStartMs", "<", staleBefore).limit(500).get();
  await commitDeletes(oldOtpThrottle.docs.map((d) => d.ref));
  const oldTelemetryThrottle = await db
    .collection("telemetryIpThrottle")
    .where("windowStartMs", "<", staleBefore)
    .limit(500)
    .get();
  await commitDeletes(oldTelemetryThrottle.docs.map((d) => d.ref));
});

/**
 * Verifies and consumes OTP for email auth step-up. Refused in production
 * until a mail sender exists.
 */
export const verifyEmailOtp = onCall(async (req) => {
  assertEmailOtpAvailable();
  const email = String(req.data?.email ?? "").trim().toLowerCase();
  const purpose = String(req.data?.purpose ?? "signup").trim().toLowerCase();
  const code = String(req.data?.code ?? "").trim();
  if (!email || !code) {
    throw new HttpsError("invalid-argument", "email and code are required.");
  }
  const key = sha256Hex(`${purpose}|${email}`);
  const ref = db.collection("emailOtps").doc(key);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "OTP not found.");
  const otp = snap.data() as {
    codeHash: string;
    expiresAt: number;
    consumed?: boolean;
    attemptCount?: number;
    consumedCodeHash?: string;
  };
  if ((otp.attemptCount ?? 0) >= OTP_MAX_VERIFY_ATTEMPTS) {
    throw new HttpsError("resource-exhausted", "Too many OTP attempts. Request a new OTP.");
  }
  const submittedCodeHash = sha256Hex(code);
  if (otp.consumed) {
    // Idempotent verify: if caller retries same code after a transient client failure, return success.
    if (otp.consumedCodeHash && otp.consumedCodeHash === submittedCodeHash) {
      return { ok: true };
    }
    throw new HttpsError("failed-precondition", "OTP already used.");
  }
  if (otp.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "OTP expired.");
  const valid = submittedCodeHash === otp.codeHash;
  await ref.set(
    {
      attemptCount: (otp.attemptCount ?? 0) + 1,
      consumed: valid ? true : false,
      consumedCodeHash: valid ? submittedCodeHash : null,
      consumedAt: valid ? admin.firestore.FieldValue.serverTimestamp() : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  if (!valid) throw new HttpsError("permission-denied", "Incorrect OTP.");
  return { ok: true };
});


/** In-person pair offers: server-minted opaque token (doc id). */
const NFC_PIN_PAIR_TTL_MS = 1000 * 60 * 5;
/** After phase 1, both people must confirm before this window. Matches the client dual-confirm idle timeout. */
const NFC_PIN_PAIR_AWAIT_DUAL_CONFIRM_MS = 45_000;
const PAIRING_OFFER_TOKEN_HEX_LEN = 32;

function normalizePairingOfferId(raw: unknown): string {
  const id = String(raw ?? "").trim().replace(/\s+/g, "");
  if (new RegExp(`^[0-9a-f]{${PAIRING_OFFER_TOKEN_HEX_LEN}}$`, "i").test(id)) {
    return id.toLowerCase();
  }
  throw new HttpsError("invalid-argument", "Offer token must be 32 hex characters.");
}

function mintPairingOfferToken(): string {
  return randomNonceHex(16);
}

/**
 * Issuer: server-mints an opaque pairing token (128-bit hex). Client-chosen PINs are rejected.
 */
export const registerNfcPinPairOffer = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const proximityEvidence = normalizePairingProximityEvidence(req.data?.proximityEvidence);
  if (String(req.data?.pin ?? "").trim()) {
    throw new HttpsError("invalid-argument", "Pairing tokens are minted by the server.");
  }
  const expiresAt = nowMs() + NFC_PIN_PAIR_TTL_MS;

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const offerId = mintPairingOfferToken();
    const ref = db.collection("nfcPinPairSessions").doc(offerId);
    try {
      await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          const d = snap.data() as {
            consumed?: boolean;
            expiresAt?: number;
            issuerUid?: string;
          };
          const active = !d.consumed && (d.expiresAt ?? 0) > nowMs();
          if (active && d.issuerUid && d.issuerUid !== uid) {
            throw new HttpsError("failed-precondition", "Offer token unavailable");
          }
        }
        tx.set(ref, {
          pin: offerId,
          offerToken: offerId,
          issuerUid: uid,
          issuerDeviceId: deviceId,
          issuerProximityEvidence: proximityEvidence,
          expiresAt,
          consumed: false,
          redeemerUid: null,
          scannerConfirmed: false,
          redeemerConfirmed: false,
          issuerConfirmed: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return { ok: true, pin: offerId, pairingToken: offerId, expiresAt };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg.includes("Offer token unavailable") && attempt < maxAttempts - 1) continue;
      throw e;
    }
  }
  throw new HttpsError("resource-exhausted", "Could not mint a pairing offer. Try again.");
});

/**
 * Abort pairing: issuer may cancel before scanner confirms; either participant may cancel during
 * dual-confirm (after scanner phase 1). Deletes the session so the other device sees offer gone.
 */
export const cancelNfcPinPairOffer = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const pin = normalizePairingOfferId(req.data?.pin ?? req.data?.pairingToken);
  const ref = db.collection("nfcPinPairSessions").doc(pin);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, released: false };
  const d = snap.data() as {
    issuerUid?: string;
    consumed?: boolean;
    redeemerUid?: string | null;
    scannerConfirmed?: boolean;
  };
  if (d.consumed) return { ok: true, released: false };
  const issuer = String(d.issuerUid ?? "").trim();
  const redeemer = String(d.redeemerUid ?? "").trim();
  const isIssuer = issuer === uid;
  const isRedeemer = !!redeemer && redeemer === uid;
  const allowed =
    isIssuer ||
    (isRedeemer && Boolean(d.scannerConfirmed));
  if (!allowed) {
    throw new HttpsError("permission-denied", "Cannot cancel this pairing session.");
  }
  await ref.delete();
  return { ok: true, released: true };
});

/** Issuer: poll until joiner confirms. */
export const getNfcPinPairOfferStatus = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const pin = normalizePairingOfferId(req.data?.pin ?? req.data?.pairingToken);
  const snap = await db.collection("nfcPinPairSessions").doc(pin).get();
  if (!snap.exists) throw new HttpsError("not-found", "Offer not found.");
  const data = snap.data() as {
    issuerUid: string;
    consumed?: boolean;
    scannerConfirmed?: boolean;
    redeemerConfirmed?: boolean;
    redeemerUid?: string | null;
    expiresAt: number;
  };
  const redeemerUid = data.redeemerUid?.trim() || null;
  const isIssuer = data.issuerUid === uid;
  const isRedeemer = !!redeemerUid && redeemerUid === uid;
  if (!isIssuer && !isRedeemer) {
    throw new HttpsError("permission-denied", "Not a participant in this pairing offer.");
  }
  if (data.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Offer expired.");
  let status: "pending" | "awaiting_redeemer_confirm" | "awaiting_issuer_confirm" | "joined" =
    "pending";
  if (data.scannerConfirmed && redeemerUid) {
    status = data.redeemerConfirmed ? "awaiting_issuer_confirm" : "awaiting_redeemer_confirm";
  }
  if (data.consumed && redeemerUid) {
    const edgeSnap = await db
      .collection("friendships")
      .doc(friendshipId(data.issuerUid, redeemerUid))
      .get();
    const edgeStatus = (edgeSnap.data() as { status?: string } | undefined)?.status;
    status = edgeSnap.exists && edgeStatus === "accepted" ? "joined" : status;
  }
  const joined = status === "joined";
  let username: string | null = null;
  let profilePictureUrl: string | null = null;
  const otherUid = (isIssuer ? redeemerUid : data.issuerUid)?.trim() || "";
  if (otherUid) {
    const userSnap = await db.collection("users").doc(otherUid).get();
    const profile = (userSnap.data() ?? {}) as {
      username?: string;
      profilePictureUrl?: string | null;
      profilePicturePath?: string | null;
    };
    username = String(profile.username ?? "").trim() || "Friend";
    profilePictureUrl = await presentStoredProfilePicture(otherUid, profile);
  }
  return {
    ok: true,
    pin,
    status,
    username,
    profilePictureUrl,
    redeemerConfirmed: Boolean(data.redeemerConfirmed),
    expiresAt: data.expiresAt,
    ...(joined ? { issuerUid: data.issuerUid, redeemerUid } : {}),
  };
});

/** Scanner preview: returns issuer identity so scanner can confirm before redeem. */
export const previewNfcPinPairOffer = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const pin = normalizePairingOfferId(req.data?.pin ?? req.data?.pairingToken);
  const snap = await db.collection("nfcPinPairSessions").doc(pin).get();
  if (!snap.exists) throw new HttpsError("not-found", "Offer not found.");
  const data = snap.data() as {
    issuerUid: string;
    consumed?: boolean;
    expiresAt: number;
  };
  if (data.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Offer expired.");
  if (data.consumed) throw new HttpsError("failed-precondition", "Offer already used.");
  if (data.issuerUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot join your own offer.");
  }
  const userSnap = await db.collection("users").doc(data.issuerUid).get();
  const profile = (userSnap.data() ?? {}) as {
    username?: string;
    profilePictureUrl?: string | null;
    profilePicturePath?: string | null;
  };
  return {
    ok: true,
    username: String(profile.username ?? "").trim() || "Friend",
    profilePictureUrl: await presentStoredProfilePicture(data.issuerUid, profile),
    expiresAt: data.expiresAt,
  };
});

/** Scanner (Read QR / NFC join): phase 1 — proximity + claim offer; no friendship yet. */
export const confirmNfcPinPairOffer = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const pin = normalizePairingOfferId(req.data?.pin ?? req.data?.pairingToken);
  const scannerEvidence = normalizePairingProximityEvidence(req.data?.proximityEvidence);
  const ref = db.collection("nfcPinPairSessions").doc(pin);

  const issuerUid = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new HttpsError("not-found", "Offer not found.");
    const d = fresh.data() as {
      issuerUid: string;
      consumed?: boolean;
      scannerConfirmed?: boolean;
      redeemerUid?: string | null;
      expiresAt: number;
      issuerProximityEvidence?: unknown;
    };
    if (d.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Offer expired.");
    if (d.consumed) throw new HttpsError("failed-precondition", "Offer already used.");
    if (d.issuerUid === uid) {
      throw new HttpsError("failed-precondition", "Cannot join your own offer.");
    }
    if (d.redeemerUid && d.redeemerUid !== uid) {
      throw new HttpsError("failed-precondition", "Offer already claimed by another user.");
    }
    if (d.scannerConfirmed && d.redeemerUid === uid) {
      return d.issuerUid;
    }
    const issuerEvidence = normalizePairingProximityEvidence(d.issuerProximityEvidence);
    assertPairingProximity(issuerEvidence, scannerEvidence, nowMs());

    const issuer = d.issuerUid;
    const redeemerUid = uid;
    const extendedExpiresAt = nowMs() + NFC_PIN_PAIR_AWAIT_DUAL_CONFIRM_MS;
    tx.set(
      ref,
      {
        scannerConfirmed: true,
        redeemerUid,
        scannerProximityEvidence: scannerEvidence,
        scannerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: extendedExpiresAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return issuer;
  });
  return { ok: true, accepted: true, pendingDualConfirm: true, pin };
});

/** Scanner dual-confirm (phase 2a): explicit "add friend?" on Read QR device after phase 1. */
export const confirmRedeemerNfcPinPairOffer = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const pin = normalizePairingOfferId(req.data?.pin ?? req.data?.pairingToken);
  const scannerEvidence = normalizePairingProximityEvidence(req.data?.proximityEvidence);
  const ref = db.collection("nfcPinPairSessions").doc(pin);

  const issuerUid = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new HttpsError("not-found", "Offer not found.");
    const d = fresh.data() as {
      issuerUid: string;
      consumed?: boolean;
      scannerConfirmed?: boolean;
      redeemerConfirmed?: boolean;
      redeemerUid?: string | null;
      expiresAt: number;
      issuerProximityEvidence?: unknown;
    };
    if (d.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Offer expired.");
    if (d.issuerUid === uid) {
      throw new HttpsError("failed-precondition", "Only the scanner can confirm here.");
    }
    const redeemer = d.redeemerUid?.trim() || "";
    if (!d.scannerConfirmed || !redeemer) {
      throw new HttpsError("failed-precondition", "Complete QR scan verification first.");
    }
    if (redeemer !== uid) {
      throw new HttpsError("permission-denied", "Not the scanner for this pairing offer.");
    }
    if (d.redeemerConfirmed) {
      return d.issuerUid;
    }
    if (d.consumed) {
      throw new HttpsError("failed-precondition", "Offer already used.");
    }
    tx.set(
      ref,
      {
        redeemerConfirmed: true,
        scannerProximityEvidence: scannerEvidence,
        redeemerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return d.issuerUid;
  });
  return { ok: true, accepted: true, pin };
});

/** Issuer dual-confirm (phase 2b): creates friendship only after scanner confirmed + redeemer confirmed. */
export const finalizeNfcPinPairOffer = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const pin = normalizePairingOfferId(req.data?.pin ?? req.data?.pairingToken);
  const issuerEvidence = normalizePairingProximityEvidence(req.data?.proximityEvidence);
  const ref = db.collection("nfcPinPairSessions").doc(pin);

  // Non-transactional pre-read to discover the redeemer so we can resolve
  // `participantAuthUids` before entering the transaction. The redeemer field
  // is only ever set once (by `confirmNfcPinPairOffer` on the scanner side),
  // so this read is monotonic with respect to the tx that follows: if the
  // redeemer isn't set yet we re-throw the same precondition error from
  // inside the tx and the client retries.
  const preSnap = await ref.get();
  const preData = (preSnap.data() ?? {}) as { redeemerUid?: string | null };
  const tentativeRedeemer = (preData.redeemerUid ?? "").trim();
  const preResolvedAuthUids =
    tentativeRedeemer && tentativeRedeemer !== uid
      ? await resolveParticipantAuthUids([uid, tentativeRedeemer])
      : [];

  const redeemerUid = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new HttpsError("not-found", "Offer not found.");
    const d = fresh.data() as {
      issuerUid: string;
      consumed?: boolean;
      scannerConfirmed?: boolean;
      redeemerConfirmed?: boolean;
      redeemerUid?: string | null;
      expiresAt: number;
      scannerProximityEvidence?: unknown;
    };
    if (d.issuerUid !== uid) {
      throw new HttpsError("permission-denied", "Not your pairing offer.");
    }
    if (d.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Offer expired.");
    const redeemer = d.redeemerUid?.trim() || "";
    if (!d.scannerConfirmed || !redeemer) {
      throw new HttpsError("failed-precondition", "Waiting for scanner confirmation.");
    }
    if (!d.redeemerConfirmed) {
      throw new HttpsError("failed-precondition", "Waiting for your friend to confirm.");
    }
    const edgeRef = db.collection("friendships").doc(friendshipId(uid, redeemer));
    const edgeSnap = await tx.get(edgeRef);
    const friendshipOk =
      edgeSnap.exists && (edgeSnap.data() as { status?: string } | undefined)?.status === "accepted";
    if (d.consumed && friendshipOk) {
      return redeemer;
    }
    if (d.consumed && !friendshipOk) {
      // Pairing session was consumed earlier but friendship was deleted (e.g. manual
      // Firestore wipe). Repair by re-writing the edge instead of returning success.
    } else if (d.consumed) {
      throw new HttpsError("failed-precondition", "Offer already used.");
    }
    const scannerEvidence = normalizePairingProximityEvidence(d.scannerProximityEvidence);
    assertPairingProximity(issuerEvidence, scannerEvidence, nowMs());
    // If the redeemer changed between pre-read and tx (shouldn't happen
    // because the field is write-once on the offer, but defensive), the
    // mirror would be stale — fall back to a fresh resolve. `db.getAll`
    // inside a tx is a non-transactional read; that's intentional because
    // `userFirebaseAuthMap` is write-once-stable and doesn't need
    // serialisable reads.
    const participantAuthUids =
      redeemer === tentativeRedeemer
        ? preResolvedAuthUids
        : await resolveParticipantAuthUids([uid, redeemer]);
    tx.set(
      edgeRef,
      {
        participants: [uid, redeemer].sort(),
        participantAuthUids,
        status: "accepted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        establishedByNfcPinPair: pin,
      },
      { merge: true }
    );
    tx.set(
      ref,
      {
        issuerConfirmed: true,
        consumed: true,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return redeemer;
  });
  void refreshPresenceAfterFriendshipPair(uid, redeemerUid).catch(() => undefined);
  return { ok: true, accepted: true, friendUid: redeemerUid, pin };
});


/**
 * Emulator-only helper. Production rejects the call so friendships cannot be
 * created without the other person's pairing confirm.
 */
export const seedDemoFriendships = onCall(async (req) => {
  if (process.env.FUNCTIONS_EMULATOR !== "true") {
    throw new HttpsError("permission-denied", "Not available.");
  }
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const friendUids = Array.isArray(req.data?.friendUids)
    ? (req.data.friendUids as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const batch = db.batch();
  for (const friendUid of friendUids) {
    if (!friendUid || friendUid === uid) continue;
    const participantAuthUids = await resolveParticipantAuthUids([uid, friendUid]);
    const edgeRef = db.collection("friendships").doc(friendshipId(uid, friendUid));
    batch.set(
      edgeRef,
      {
        participants: [uid, friendUid].sort(),
        participantAuthUids,
        status: "accepted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        seededForDemo: true,
      },
      { merge: true }
    );
  }
  await batch.commit();
  return { ok: true, count: friendUids.length };
});

/**
 * Ensures a conversation document exists with expected participants.
 */
export const upsertConversation = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  const participantUids = Array.isArray(req.data?.participantUids)
    ? (req.data.participantUids as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  if (!conversationId) throw new HttpsError("invalid-argument", "conversationId is required.");
  if (!participantUids.includes(uid)) {
    throw new HttpsError("invalid-argument", "Caller must be in participantUids.");
  }
  for (const otherUid of participantUids) {
    await assertAcceptedFriendship(uid, otherUid);
  }
  const uniqueParticipants = [...new Set(participantUids)].sort();
  if (uniqueParticipants.length > 2) {
    for (let i = 0; i < uniqueParticipants.length; i += 1) {
      for (let j = i + 1; j < uniqueParticipants.length; j += 1) {
        await assertAcceptedFriendship(uniqueParticipants[i], uniqueParticipants[j]);
      }
    }
  }
  const participantAuthUids = await resolveParticipantAuthUids(uniqueParticipants);
  const existing = await db.collection("conversations").doc(conversationId).get();
  const existingData = existing.data() as
    | { createdBy?: string; adminIds?: string[]; memberJoinedAt?: Record<string, number> }
    | undefined;
  const createdBy = existingData?.createdBy ?? uid;
  const adminIds =
    existingData?.adminIds?.length ? existingData.adminIds : [createdBy];
  const memberJoinedAt = { ...(existingData?.memberJoinedAt ?? {}) };
  const now = nowMs();
  // Only stamp join time for the caller. Setting every participant's cutoff when
  // someone else sends would hide the first message on the recipient's device.
  if (memberJoinedAt[uid] == null) {
    memberJoinedAt[uid] = now;
  }
  await db.collection("conversations").doc(conversationId).set(
    {
      conversationId,
      participantUids: uniqueParticipants,
      participantAuthUids,
      createdBy,
      adminIds,
      memberJoinedAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, createdBy, adminIds, memberJoinedAt };
});

/**
 * Publishes the user's asymmetric encryption public key bundle.
 */
export const publishUserKeyBundle = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const keyVersion = Number(req.data?.keyVersion);
  const encryptionPublicKey = String(req.data?.encryptionPublicKey ?? "").trim();
  const identitySigningPublicKey = String(req.data?.identitySigningPublicKey ?? "").trim();
  const bundleSignature = String(req.data?.bundleSignature ?? "").trim();
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new HttpsError("invalid-argument", "keyVersion must be an integer >= 1.");
  }
  if (!encryptionPublicKey || !identitySigningPublicKey) {
    throw new HttpsError("invalid-argument", "Public keys are required.");
  }
  if (
    !bundleSignature ||
    !verifyKeyBundleSignature(
      { keyVersion, encryptionPublicKey, identitySigningPublicKey },
      bundleSignature
    )
  ) {
    throw new HttpsError("invalid-argument", "A valid key bundle signature is required.");
  }

  await db.collection("users").doc(uid).set(
    {
      keyBundle: {
        keyVersion,
        encryptionPublicKey,
        identitySigningPublicKey,
        bundleSignature,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
  return { ok: true };
});

/**
 * Deletes any server-held key backup. The previous wrapping key was derived from
 * public ids, so those blobs were readable by the backend. New clients do not upload one.
 */
export const putUserKeyBackup = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  await db.collection("users").doc(uid).set(
    { keyBackup: admin.firestore.FieldValue.delete() },
    { merge: true }
  );
  return { ok: true, purged: true };
});

/** Always empty. Also deletes a leftover backup so it cannot be decrypted later. */
export const getUserKeyBackup = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  await db.collection("users").doc(uid).set(
    { keyBackup: admin.firestore.FieldValue.delete() },
    { merge: true }
  );
  return { ciphertext: null, nonce: null };
});

/**
 * Deletes any server-held social snapshot. Those blobs used the same public-id
 * wrapping key as key backup, so they held recoverable plaintext history.
 */
export const putUserSocialSnapshot = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  await db.collection("users").doc(uid).set(
    { socialSnapshot: admin.firestore.FieldValue.delete() },
    { merge: true }
  );
  return { ok: true, purged: true };
});

export const getUserSocialSnapshot = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  await db.collection("users").doc(uid).set(
    { socialSnapshot: admin.firestore.FieldValue.delete() },
    { merge: true }
  );
  return { ciphertext: null, nonce: null };
});

/**
 * Stores fully encrypted profile blob. Only friend recipients should be present in envelopes.
 */
export const putEncryptedProfile = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const ciphertext = String(req.data?.ciphertext ?? "");
  const nonce = String(req.data?.nonce ?? "");
  const envelopes = (req.data?.envelopes ?? {}) as EnvelopeMap;
  assertReasonableCiphertext(ciphertext);
  if (!nonce) throw new HttpsError("invalid-argument", "nonce is required.");
  if (!envelopes || typeof envelopes !== "object") {
    throw new HttpsError("invalid-argument", "envelopes map is required.");
  }

  /**
   * Mirror app uids → Firebase Auth UIDs onto the profile doc so signed-in
   * clients can subscribe directly with
   * `where("recipientAuthUids", "array-contains", auth.uid)` and receive
   * profile updates (including their own writes from another device) in real
   * time. The legacy `envelopes` keyed by app uid stays unchanged.
   */
  const recipientAuthUids = await resolveParticipantAuthUids(Object.keys(envelopes));

  await db.collection("encryptedProfiles").doc(uid).set({
    ownerUid: uid,
    ciphertext,
    nonce,
    envelopes,
    recipientAuthUids,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

/**
 * Stores encrypted post visible only to friend recipients in envelope map.
 */
export const createEncryptedPost = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const ciphertext = String(req.data?.ciphertext ?? "");
  const nonce = String(req.data?.nonce ?? "");
  const envelopes = (req.data?.envelopes ?? {}) as EnvelopeMap;
  const mediaObjectPath = String(req.data?.mediaObjectPath ?? "").trim();
  const storageObjectPaths = normalizePostStorageObjectPaths(req.data?.storageObjectPaths);
  if (mediaObjectPath) {
    storageObjectPaths.push(...normalizePostStorageObjectPaths([mediaObjectPath]));
  }
  const uniqueStoragePaths = [...new Set(storageObjectPaths)];
  assertReasonableCiphertext(ciphertext);
  if (!nonce) throw new HttpsError("invalid-argument", "nonce is required.");
  if (!envelopes[uid]) throw new HttpsError("invalid-argument", "Sender envelope is required.");

  const recipientUids: string[] = [];
  for (const recipientUid of Object.keys(envelopes)) {
    if (recipientUid === uid) {
      recipientUids.push(recipientUid);
      continue;
    }
    if (!recipientUid.startsWith("u_")) continue;
    try {
      await assertAcceptedFriendship(uid, recipientUid);
      recipientUids.push(recipientUid);
    } catch {
      /* Stale local-roster uids must not block publishing to self and real friends. */
    }
  }
  if (!recipientUids.includes(uid)) {
    throw new HttpsError("invalid-argument", "Sender envelope is required.");
  }
  const filteredEnvelopes: EnvelopeMap = {};
  for (const recipientUid of recipientUids) {
    const envelope = envelopes[recipientUid];
    if (envelope) filteredEnvelopes[recipientUid] = envelope;
  }

  if (uniqueStoragePaths.length > 0) {
    const ownerAuthUid = await resolveFirebaseAuthUidForAppUid(uid);
    if (!ownerAuthUid) {
      throw new HttpsError(
        "failed-precondition",
        "Register Firebase Auth before publishing post media."
      );
    }
    try {
      assertPostStoragePathsOwnedByAuthUid(uniqueStoragePaths, ownerAuthUid);
    } catch {
      throw new HttpsError("invalid-argument", "storageObjectPaths must belong to the post author.");
    }
  }

  /**
   * Mirror app uids → Firebase Auth UIDs onto the post doc so signed-in
   * clients can subscribe directly with
   * `where("recipientAuthUids", "array-contains", auth.uid)` and receive
   * post fan-outs without a callable round-trip. The legacy `recipientUids`
   * (app-uid) array remains for the `listEncryptedPosts` callable path and
   * the server-side `assertAcceptedFriendship` helper.
   */
  const recipientAuthUids = await resolveParticipantAuthUids(recipientUids);

  const postRef = db.collection("encryptedPosts").doc();
  await postRef.set({
    postId: postRef.id,
    ownerUid: uid,
    recipientUids,
    recipientAuthUids,
    ciphertext,
    nonce,
    envelopes: filteredEnvelopes,
    mediaObjectPath: uniqueStoragePaths[0] ?? (mediaObjectPath || null),
    storageObjectPaths: uniqueStoragePaths,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const authorSnap = await db.collection("users").doc(uid).get();
  const authorName = String(authorSnap.data()?.username ?? "").trim() || "Someone";
  try {
    await notifyPostRecipientsPush({
      authorUid: uid,
      authorName,
      recipientUids: recipientUids.filter((id) => id !== uid),
      postId: postRef.id,
    });
  } catch (err) {
    console.error("notifyPostRecipientsPush failed", err);
  }
  return { ok: true, postId: postRef.id };
});

/**
 * Permanently removes an encrypted post doc so it disappears for all recipients.
 */
export const deleteEncryptedPost = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const postId = String(req.data?.postId ?? "").trim();
  if (!postId) throw new HttpsError("invalid-argument", "postId is required.");

  const postRef = db.collection("encryptedPosts").doc(postId);
  const snap = await postRef.get();
  if (!snap.exists) {
    return { ok: true };
  }
  const data = snap.data() as {
    ownerUid?: string;
    mediaObjectPath?: string | null;
    storageObjectPaths?: unknown;
  };
  if (data.ownerUid !== uid) {
    throw new HttpsError("permission-denied", "Only the post owner can delete this post.");
  }
  const storagePaths = collectStoragePathsFromPostDoc(data);
  await Promise.all([
    postRef.delete(),
    db
      .collection("encryptedPostReactions")
      .doc(postRef.id)
      .delete()
      .catch(() => {
        /* reactions doc may not exist */
      }),
  ]);
  await deletePostStorageObjectPaths(storagePaths);
  return { ok: true };
});

/**
 * Sends encrypted message in existing friend conversation.
 */
export const sendEncryptedMessage = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const conversationId = String(req.data?.conversationId ?? "");
  const ciphertext = String(req.data?.ciphertext ?? "");
  const nonce = String(req.data?.nonce ?? "");
  const envelopes = (req.data?.envelopes ?? {}) as EnvelopeMap;
  if (!conversationId) throw new HttpsError("invalid-argument", "conversationId is required.");
  assertReasonableCiphertext(ciphertext);
  if (!nonce) throw new HttpsError("invalid-argument", "nonce is required.");

  const convRef = db.collection("conversations").doc(conversationId);
  let convSnap = await convRef.get();
  const requestedParticipants = Array.isArray(req.data?.participantUids)
    ? [...new Set((req.data.participantUids as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean))].sort()
    : [];
  if (!convSnap.exists) {
    if (requestedParticipants.length < 2 || !requestedParticipants.includes(uid)) {
      throw new HttpsError(
        "failed-precondition",
        "Conversation not found. Reopen the chat and try again."
      );
    }
    for (const otherUid of requestedParticipants) {
      if (otherUid !== uid) await assertAcceptedFriendship(uid, otherUid);
    }
    const participantAuthUidsBootstrap = await resolveParticipantAuthUids(requestedParticipants);
    const nowBootstrap = nowMs();
    const memberJoinedAtBootstrap: Record<string, number> = { [uid]: nowBootstrap };
    await convRef.set(
      {
        conversationId,
        participantUids: requestedParticipants,
        participantAuthUids: participantAuthUidsBootstrap,
        createdBy: uid,
        adminIds: [uid],
        memberJoinedAt: memberJoinedAtBootstrap,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    convSnap = await convRef.get();
  }
  const conv = convSnap.data() as { participantUids?: string[]; memberJoinedAt?: Record<string, number> };
  let participants = conv.participantUids ?? [];
  if (requestedParticipants.length >= 2 && requestedParticipants.includes(uid)) {
    for (const otherUid of requestedParticipants) {
      if (otherUid !== uid) await assertAcceptedFriendship(uid, otherUid);
    }
    participants = requestedParticipants;
  }
  if (!participants.includes(uid)) {
    throw new HttpsError("permission-denied", "User is not in this conversation.");
  }
  for (const participantUid of participants) {
    if (!envelopes[participantUid]) {
      throw new HttpsError("invalid-argument", "Envelope missing for a participant.");
    }
    if (participantUid !== uid) await assertAcceptedFriendship(uid, participantUid);
  }

  const memberJoinedAt = { ...(conv.memberJoinedAt ?? {}) };
  const nowSend = nowMs();
  if (memberJoinedAt[uid] == null) {
    memberJoinedAt[uid] = nowSend;
  }
  const joinCutoff = Number(memberJoinedAt[uid] ?? 0);
  let participantAuthUids = await resolveParticipantAuthUids(participants);
  if (participantAuthUids.length < participants.length) {
    participantAuthUids = await resolveParticipantAuthUids(participants);
  }
  await convRef.set(
    { participantUids: participants, participantAuthUids, memberJoinedAt },
    { merge: true }
  );
  const requestedMessageId = String(req.data?.messageId ?? "").trim();
  if (requestedMessageId && !/^[a-zA-Z0-9_-]{1,128}$/.test(requestedMessageId)) {
    throw new HttpsError("invalid-argument", "messageId format is invalid.");
  }
  const msgRef = requestedMessageId
    ? convRef.collection("messages").doc(requestedMessageId)
    : convRef.collection("messages").doc();
  const msgSnap = requestedMessageId ? await msgRef.get() : null;
  if (msgSnap?.exists) {
    const existing = msgSnap.data() as { senderUid?: string };
    if (existing.senderUid !== uid) {
      throw new HttpsError("permission-denied", "messageId already in use.");
    }
  }
  await msgRef.set({
    messageId: msgRef.id,
    senderUid: uid,
    participantUids: participants,
    // Mirror of app uid -> Firebase Auth UID for direct client snapshot reads.
    // Rules consult this field; the app-uid array stays for backwards
    // compatibility with the existing `listEncryptedMessages` callable path.
    participantAuthUids,
    ciphertext,
    nonce,
    envelopes,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const authUidsAfterWrite = await resolveParticipantAuthUids(participants);
  if (authUidsAfterWrite.length > 0) {
    await msgRef.set({ participantAuthUids: authUidsAfterWrite }, { merge: true });
    await convRef.set({ participantAuthUids: authUidsAfterWrite }, { merge: true });
  }
  void notifyConversationParticipantsPush({
    senderUid: uid,
    conversationId,
    participantUids: participants,
    title: String(req.data?.notificationTitle ?? "").trim() || undefined,
    body: "New message",
  });
  return { ok: true, messageId: msgRef.id, joinCutoffMs: joinCutoff };
});

/**
 * Returns public key bundles for friends only.
 */
export const getFriendKeyBundles = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const friendUids = Array.isArray(req.data?.friendUids)
    ? (req.data.friendUids as unknown[]).map((x) => String(x))
    : [];
  const unique = [...new Set(friendUids.filter((id) => id.startsWith("u_")))];

  const entries = await Promise.all(
    unique.map(async (friendUid) => {
      try {
        await assertAcceptedFriendship(uid, friendUid);
        const snap = await db.collection("users").doc(friendUid).get();
        const keyBundle = snap.data()?.keyBundle ?? null;
        return [friendUid, keyBundle] as const;
      } catch {
        return [friendUid, null] as const;
      }
    })
  );
  return {
    keyBundles: Object.fromEntries(entries),
  };
});

/**
 * Reads encrypted profile blob for self or accepted friend.
 */
export const getEncryptedProfile = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const targetUid = String(req.data?.targetUid ?? uid).trim() || uid;
  if (targetUid !== uid) {
    await assertAcceptedFriendship(uid, targetUid);
  }

  const snap = await db.collection("encryptedProfiles").doc(targetUid).get();
  if (!snap.exists) return { profile: null };
  const data = snap.data() as {
    ownerUid: string;
    ciphertext: string;
    nonce: string;
    envelopes: EnvelopeMap;
    updatedAt?: unknown;
  };
  const envelope = data.envelopes?.[uid];
  if (!envelope) {
    throw new HttpsError("permission-denied", "No envelope for caller.");
  }
  return {
    profile: {
      ownerUid: data.ownerUid,
      ciphertext: data.ciphertext,
      nonce: data.nonce,
      envelope,
      updatedAtMs: timestampToMs(data.updatedAt),
    },
  };
});

/**
 * Reads encrypted posts addressed to caller.
 */
export const listEncryptedPosts = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const limit = Math.max(1, Math.min(500, Number(req.data?.limit ?? 200)));
  const sinceMs = parseSinceMs(req.data?.sinceMs);
  const beforeMs = parseSinceMs(req.data?.beforeMs);
  let query: FirebaseFirestore.Query = db
    .collection("encryptedPosts")
    .where("recipientUids", "array-contains", uid);
  if (sinceMs != null) {
    query = query
      .where("createdAt", ">", admin.firestore.Timestamp.fromMillis(sinceMs))
      .orderBy("createdAt", "asc");
  } else if (beforeMs != null) {
    query = query
      .where("createdAt", "<", admin.firestore.Timestamp.fromMillis(beforeMs))
      .orderBy("createdAt", "desc");
  } else {
    query = query.orderBy("createdAt", "desc");
  }
  const snap = await query.limit(limit + 1).get();

  const reactionMirrorByPostId = new Map<string, string[]>();
  let items = snap.docs
    .map((doc) => {
      const data = doc.data() as {
        postId: string;
        ownerUid: string;
        ciphertext: string;
        nonce: string;
        envelopes: EnvelopeMap;
        createdAt?: unknown;
        recipientAuthUids?: unknown;
      };
      const postIdForMirror = String(data.postId || doc.id);
      const mirror = Array.isArray(data.recipientAuthUids)
        ? data.recipientAuthUids.map((x) => String(x ?? "").trim()).filter(Boolean)
        : [];
      if (mirror.length > 0) reactionMirrorByPostId.set(postIdForMirror, mirror);
      const envelope = data.envelopes?.[uid];
      if (!envelope) return null;
      return {
        postId: data.postId || doc.id,
        ownerUid: data.ownerUid,
        ciphertext: data.ciphertext,
        nonce: data.nonce,
        envelope,
        createdAtMs: timestampToMs(data.createdAt),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  items = await filterPostItemsByFriendship(uid, items);
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);

  const reactionSnaps = await Promise.all(
    page.slice(0, 100).map((item) => db.collection("encryptedPostReactions").doc(item.postId).get())
  );
  const reactionsByPostId: Record<string, Record<string, string>> = {};
  const reactionMirrorWrites: Promise<unknown>[] = [];
  reactionSnaps.forEach((reactionSnap, idx) => {
    if (!reactionSnap.exists) return;
    const postId = page[idx]?.postId;
    if (!postId) return;
    const data = reactionSnap.data() ?? {};
    reactionsByPostId[postId] = (data.reactions ?? {}) as Record<string, string>;
    const existingMirror = data.recipientAuthUids;
    const mirror = reactionMirrorByPostId.get(postId) ?? [];
    if (mirror.length > 0 && (!Array.isArray(existingMirror) || existingMirror.length === 0)) {
      reactionMirrorWrites.push(
        reactionSnap.ref.set({ recipientAuthUids: mirror }, { merge: true })
      );
    }
  });
  if (reactionMirrorWrites.length > 0) {
    await Promise.all(reactionMirrorWrites);
  }

  return { items: page, reactionsByPostId, incremental: sinceMs != null, hasMore };
});

/**
 * Lists encrypted posts owned by the caller (for sharing historical posts with a new friend).
 */
export const listMyOwnedEncryptedPosts = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const limit = Math.max(1, Math.min(500, Number(req.data?.limit ?? 80)));
  const beforeMs = parseSinceMs(req.data?.beforeMs);
  const excludeRecipientUid = String(req.data?.excludeRecipientUid ?? "").trim();

  let query: FirebaseFirestore.Query = db
    .collection("encryptedPosts")
    .where("ownerUid", "==", uid);
  if (beforeMs != null) {
    query = query
      .where("createdAt", "<", admin.firestore.Timestamp.fromMillis(beforeMs))
      .orderBy("createdAt", "desc");
  } else {
    query = query.orderBy("createdAt", "desc");
  }
  const snap = await query.limit(limit + 1).get();

  let items = snap.docs
    .map((doc) => {
      const data = doc.data() as {
        postId?: string;
        ownerUid?: string;
        ciphertext?: string;
        nonce?: string;
        envelopes?: EnvelopeMap;
        recipientUids?: string[];
        createdAt?: unknown;
      };
      const envelope = data.envelopes?.[uid];
      if (!envelope || !data.ciphertext || !data.nonce) return null;
      const recipientUids = Array.isArray(data.recipientUids)
        ? data.recipientUids.map((x) => String(x ?? "").trim()).filter(Boolean)
        : [];
      if (excludeRecipientUid && recipientUids.includes(excludeRecipientUid)) {
        return null;
      }
      return {
        postId: data.postId || doc.id,
        ownerUid: data.ownerUid ?? uid,
        ciphertext: data.ciphertext,
        nonce: data.nonce,
        envelope,
        recipientUids,
        createdAtMs: timestampToMs(data.createdAt),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const hasMore = items.length > limit;
  items = items.slice(0, limit);
  return { items, hasMore };
});

async function hiddenConversationIdsForUser(uid: string): Promise<Set<string>> {
  const snap = await db.collection("users").doc(uid).get();
  const raw = (snap.data()?.hiddenConversationIds ?? []) as unknown;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.map((x) => String(x ?? "").trim()).filter(Boolean));
}

/**
 * Tombstones a conversation for this user so sync skips it after delete/reinstall.
 */
export const hideConversationForUser = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const conversationId = String(req.data?.conversationId ?? "").trim();
  if (!conversationId) {
    throw new HttpsError("invalid-argument", "conversationId is required.");
  }
  await db.collection("users").doc(uid).set(
    {
      hiddenConversationIds: admin.firestore.FieldValue.arrayUnion(conversationId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
});

/**
 * Removes conversation tombstones so sync and the chat list work again after
 * the user re-opens or continues a 1:1 thread with the same friend.
 */
export const unhideConversationForUser = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const single = String(req.data?.conversationId ?? "").trim();
  const fromArray = Array.isArray(req.data?.conversationIds)
    ? (req.data.conversationIds as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  const unique = [...new Set([...(single ? [single] : []), ...fromArray])].slice(0, 50);
  if (unique.length === 0) {
    throw new HttpsError("invalid-argument", "conversationId or conversationIds is required.");
  }
  await db.collection("users").doc(uid).set(
    {
      hiddenConversationIds: admin.firestore.FieldValue.arrayRemove(...unique),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, conversationIds: unique };
});

/**
 * Returns conversation ids the caller has tombstoned (server-side hide list).
 */
export const getHiddenConversationIds = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const hidden = await hiddenConversationIdsForUser(uid);
  return { conversationIds: [...hidden] };
});

/**
 * Reads encrypted messages for conversations where caller is a participant.
 */
export const listEncryptedMessages = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const limit = Math.max(1, Math.min(1000, Number(req.data?.limit ?? 400)));
  const sinceMs = parseSinceMs(req.data?.sinceMs);
  const hiddenConversations = await hiddenConversationIdsForUser(uid);
  const convCutoffs = new Map<string, number>();

  const prefetchConversationCutoffs = async (
    messageDocs: FirebaseFirestore.QueryDocumentSnapshot[]
  ): Promise<void> => {
    const convIds = new Set<string>();
    for (const doc of messageDocs) {
      const conversationId = doc.ref.parent.parent?.id ?? "";
      if (conversationId && !hiddenConversations.has(conversationId)) {
        convIds.add(conversationId);
      }
    }
    const missing = [...convIds].filter((id) => !convCutoffs.has(id));
    if (missing.length === 0) return;
    const refs = missing.map((id) => db.collection("conversations").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, idx) => {
      const conversationId = missing[idx];
      if (!conversationId) return;
      if (!snap.exists) {
        convCutoffs.set(conversationId, 0);
        return;
      }
      const convData = snap.data() as
        | { memberJoinedAt?: Record<string, number>; participantUids?: string[] }
        | undefined;
      const participants = convData?.participantUids ?? [];
      if (participants.length > 0 && !participants.includes(uid)) {
        convCutoffs.set(conversationId, Number.MAX_SAFE_INTEGER);
        return;
      }
      const joined = convData?.memberJoinedAt ?? {};
      convCutoffs.set(
        conversationId,
        typeof joined[uid] === "number" ? joined[uid] : 0
      );
    });
  };

  const mapMessageDoc = (
    doc: FirebaseFirestore.QueryDocumentSnapshot
  ): {
    messageId: string;
    conversationId: string;
    senderUid: string;
    ciphertext: string;
    nonce: string;
    envelope: string;
    createdAtMs: number;
    reactions: Record<string, string>;
    editedAt: number | null;
    unsentAt: number | null;
  } | null => {
    const data = doc.data() as {
      messageId: string;
      senderUid: string;
      participantUids: string[];
      ciphertext: string;
      nonce: string;
      envelopes: EnvelopeMap;
      createdAt?: unknown;
      reactions?: Record<string, string>;
      editedAt?: number;
      unsentAt?: number;
    };
    const envelope = data.envelopes?.[uid];
    if (!envelope) return null;
    const conversationId = doc.ref.parent.parent?.id ?? "";
    if (!conversationId) return null;
    if (hiddenConversations.has(conversationId)) return null;
    const cutoff = convCutoffs.get(conversationId) ?? 0;
    if (cutoff === Number.MAX_SAFE_INTEGER) return null;
    const createdAtMs = timestampToMs(data.createdAt);
    if (createdAtMs < cutoff && data.senderUid === uid) return null;
    return {
      messageId: data.messageId || doc.id,
      conversationId,
      senderUid: data.senderUid,
      ciphertext: data.ciphertext,
      nonce: data.nonce,
      envelope,
      createdAtMs,
      reactions: data.reactions ?? {},
      editedAt: data.editedAt ?? null,
      unsentAt: data.unsentAt ?? null,
    };
  };

  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (sinceMs != null) {
    const sinceTs = admin.firestore.Timestamp.fromMillis(sinceMs);
    const createdSnap = await db
      .collectionGroup("messages")
      .where("participantUids", "array-contains", uid)
      .where("createdAt", ">", sinceTs)
      .orderBy("createdAt", "asc")
      .limit(limit)
      .get();
    docs = createdSnap.docs;
  } else {
    const snap = await db
      .collectionGroup("messages")
      .where("participantUids", "array-contains", uid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    docs = snap.docs;
  }

  await prefetchConversationCutoffs(docs);
  const items = docs.map((doc) => mapMessageDoc(doc)).filter((x): x is NonNullable<typeof x> => !!x);

  return { items, incremental: sinceMs != null };
});

/**
 * Lists accepted friendships for caller.
 */
export const listMyFriends = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const mine = await db
    .collection("friendships")
    .where("participants", "array-contains", uid)
    .where("status", "==", "accepted")
    .get();
  const candidateUids: string[] = [];
  for (const doc of mine.docs) {
    const participants = (doc.data().participants ?? []) as string[];
    const otherRaw = participants.find((p) => p !== uid);
    if (!otherRaw) continue;
    const normalized = await normalizeParticipantToAppUid(otherRaw);
    if (normalized && normalized !== uid) candidateUids.push(normalized);
  }
  const unique = [...new Set(candidateUids)];
  // Return every accepted friendship uid. Requiring a `users/{uid}` doc here hid
  // brand-new friends until profile upsert finished, which broke boot roster sync,
  // profile open, and push participant mirrors right after pairing.
  return { friendUids: unique };
});

/**
 * Removes `removeAuthUid` (and its app uid) from the `recipientAuthUids` /
 * `recipientUids` mirrors of every post owned by `ownerUid`. Firestore rules
 * authorise direct post reads purely on `recipientAuthUids`, so this is what
 * actually revokes an ex-friend's access to historical posts.
 */
async function revokeOwnedPostRecipients(
  ownerUid: string,
  removeUid: string,
  removeAuthUid: string | null
): Promise<void> {
  const snap = await db.collection("encryptedPosts").where("ownerUid", "==", ownerUid).get();
  if (snap.empty) return;
  const writer = db.bulkWriter();
  for (const doc of snap.docs) {
    const patch: Record<string, unknown> = {
      recipientUids: admin.firestore.FieldValue.arrayRemove(removeUid),
    };
    if (removeAuthUid) {
      patch.recipientAuthUids = admin.firestore.FieldValue.arrayRemove(removeAuthUid);
    }
    writer.set(doc.ref, patch, { merge: true });
  }
  await writer.close();
}

/**
 * Revokes the Firestore read-mirror access two former friends had to each
 * other's owned data after an unfriend. Deleting only the friendship edge is
 * not enough: `encryptedProfiles`, `encryptedPosts`, and `presence` reads are
 * authorised by the `recipientAuthUids` / `viewerAuthUids` arrays on the docs,
 * which otherwise keep an ex-friend authorised until the owner happens to
 * rewrite them. We strip each party from the *other's* owned docs (never from
 * their own). The shared 1:1 conversation is intentionally left intact — it is
 * mutual history both sides already hold locally, and new sends are blocked by
 * `assertAcceptedFriendship`.
 */
async function revokeFriendDataMirrors(uid: string, otherUid: string): Promise<void> {
  const [authUid, otherAuthUid] = await Promise.all([
    resolveFirebaseAuthUidForAppUid(uid),
    resolveFirebaseAuthUidForAppUid(otherUid),
  ]);
  const arrayRemove = admin.firestore.FieldValue.arrayRemove;
  const ops: Promise<unknown>[] = [];

  // Strip each viewer from the other's profile + presence mirrors. `update`
  // (not `set`) so a missing doc is a no-op rather than being created empty.
  if (otherAuthUid) {
    ops.push(
      db.collection("encryptedProfiles").doc(uid)
        .update({ recipientAuthUids: arrayRemove(otherAuthUid) }).catch(() => {})
    );
    ops.push(
      db.collection("presence").doc(uid)
        .update({ viewerAuthUids: arrayRemove(otherAuthUid) }).catch(() => {})
    );
  }
  if (authUid) {
    ops.push(
      db.collection("encryptedProfiles").doc(otherUid)
        .update({ recipientAuthUids: arrayRemove(authUid) }).catch(() => {})
    );
    ops.push(
      db.collection("presence").doc(otherUid)
        .update({ viewerAuthUids: arrayRemove(authUid) }).catch(() => {})
    );
  }
  ops.push(revokeOwnedPostRecipients(uid, otherUid, otherAuthUid).catch(() => {}));
  ops.push(revokeOwnedPostRecipients(otherUid, uid, authUid).catch(() => {}));

  await Promise.all(ops);
}

/**
 * Deletes the accepted friendship edge between caller and `otherUid` (unfriend)
 * and revokes the Firestore read mirrors that backed each side's access to the
 * other's profile, posts, and presence.
 */
export const removeFriendship = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const otherUid = String(req.data?.otherUid ?? "").trim();
  if (!otherUid) {
    throw new HttpsError("invalid-argument", "otherUid is required.");
  }
  if (otherUid === uid) {
    throw new HttpsError("invalid-argument", "Cannot unfriend yourself.");
  }
  const edgeRef = db.collection("friendships").doc(friendshipId(uid, otherUid));
  const snap = await edgeRef.get();
  if (!snap.exists) {
    return { ok: true };
  }
  const data = snap.data() as { status?: string } | undefined;
  if (data?.status !== "accepted") {
    return { ok: true };
  }
  await edgeRef.delete();
  await kickPairFromSharedGroups(uid, otherUid);
  // Best-effort: revoke read-mirror access. Never fail the unfriend on this.
  try {
    await revokeFriendDataMirrors(uid, otherUid);
  } catch (err) {
    console.error("removeFriendship.revokeMirrors_failed", err);
  }
  return { ok: true };
});

/**
 * Updates caller presence heartbeat. Caller is online only while actively using the app.
 */
export const setMyPresence = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const state = String(req.data?.state ?? "background").trim().toLowerCase();
  if (state !== "active" && state !== "background") {
    throw new HttpsError("invalid-argument", "Presence state must be active or background.");
  }
  const normalized = state === "active" ? "active" : "background";
  const heartbeatAtMs = Number(req.data?.heartbeatAtMs ?? 0);
  await writePresenceWithViewers(
    uid,
    deviceId,
    normalized,
    Number.isFinite(heartbeatAtMs) && heartbeatAtMs > 0 ? heartbeatAtMs : undefined
  );
  return { ok: true };
});

/**
 * Returns presence for accepted friends only.
 */
export const getFriendPresence = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const friendUids = Array.isArray(req.data?.friendUids)
    ? (req.data.friendUids as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const unique = [...new Set(friendUids.filter((id) => id.startsWith("u_")))].slice(0, 200);
  const entries = await Promise.all(
    unique.map(async (friendUid) => {
      try {
        await assertAcceptedFriendship(uid, friendUid);
        const snap = await db.collection("presence").doc(friendUid).get();
        if (!snap.exists) return [friendUid, { state: "offline", heartbeatAtMs: 0, online: false }] as const;
        const data = snap.data() as {
          state?: string;
          heartbeatAtMs?: unknown;
          online?: boolean;
        };
        const state = data?.state === "active" ? "active" : "background";
        const heartbeatAtMs = normalizePresenceHeartbeatMs(data?.heartbeatAtMs);
        const fresh = isPresenceFresh(heartbeatAtMs);
        const online = presenceDocOnlineFromData({
          state: data?.state,
          heartbeatAtMs: data?.heartbeatAtMs,
          online: data?.online,
        });
        const effectiveState = fresh ? state : "offline";
        return [
          friendUid,
          {
            state: effectiveState,
            heartbeatAtMs: fresh ? heartbeatAtMs : 0,
            online,
          },
        ] as const;
      } catch {
        return [friendUid, { state: "offline", heartbeatAtMs: 0 }] as const;
      }
    })
  );
  return { byUid: Object.fromEntries(entries) };
});

/**
 * Returns profile cards for accepted friends (or self). During Add Friend pairing, pass `pairingPin`
 * or `pairingToken` (same offer id as QR/NFC — legacy 4-digit or opaque 32-hex) so each side can
 * load the other's profile before friendship exists.
 */
export const getUserProfiles = onCall(async (req) => {
  const { appUid: uid } = await assertVerifiedCallableCaller(req);
  const pairingPin =
    tryNormalizePairingOfferIdOptional(req.data?.pairingPin) ??
    tryNormalizePairingOfferIdOptional(req.data?.pairingToken);
  const targetUids = Array.isArray(req.data?.targetUids)
    ? (req.data.targetUids as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const unique = [...new Set(targetUids.filter((id) => id.startsWith("u_")))].slice(0, 200);
  const entries = await Promise.all(
    unique.map(async (targetUid) => {
      try {
        if (targetUid !== uid) {
          if (pairingPin) {
            await assertPairingSessionAllowsProfileRead(uid, targetUid, pairingPin);
          } else {
            await assertAcceptedFriendship(uid, targetUid);
          }
        }
        const snap = await db.collection("users").doc(targetUid).get();
        if (!snap.exists) return [targetUid, null] as const;
        const data = snap.data() as {
          username?: string;
          bio?: string;
          profilePictureUrl?: string | null;
          profilePicturePath?: string | null;
        };
        const pairingPreviewOnly = pairingPin && targetUid !== uid;
        const storedUsername = String(data.username ?? "").trim();
        return [
          targetUid,
          {
            uid: pairingPreviewOnly ? undefined : targetUid,
            username: storedUsername || "Friend",
            bio: pairingPreviewOnly ? "" : data.bio ?? "",
            profilePictureUrl: await presentStoredProfilePicture(targetUid, data),
          },
        ] as const;
      } catch {
        return [targetUid, null] as const;
      }
    })
  );
  return { profiles: Object.fromEntries(entries) };
});

/**
 * Writes a private comment/thread message for a post between owner and one friend.
 */
export const createPrivatePostThreadMessage = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const postId = String(req.data?.postId ?? "").trim();
  const postOwnerUid = String(req.data?.postOwnerUid ?? "").trim();
  const friendUid = String(req.data?.friendUid ?? "").trim();
  const text = String(req.data?.text ?? "").trim();
  if (!postId || !postOwnerUid || !friendUid || !text) {
    throw new HttpsError("invalid-argument", "postId, postOwnerUid, friendUid, text are required.");
  }
  if (uid !== postOwnerUid && uid !== friendUid) {
    throw new HttpsError("permission-denied", "Caller must be post owner or thread friend.");
  }
  if (postOwnerUid === friendUid) {
    throw new HttpsError("invalid-argument", "owner and friend must differ.");
  }
  await assertAcceptedFriendship(postOwnerUid, friendUid);
  /**
   * Mirror app uids → Firebase Auth UIDs onto both the thread doc and each
   * message doc so signed-in clients can subscribe directly to a thread's
   * `messages` subcollection via `onSnapshot` (rule gates on
   * `participantAuthUids`). The legacy `participants` (app-uid) array stays
   * for the `listPrivatePostThreadMessages` callable path.
   */
  const participantAuthUids = await resolveParticipantAuthUids([postOwnerUid, friendUid]);
  const threadRef = db.collection("privatePostThreads").doc(privateThreadId(postId, postOwnerUid, friendUid));
  const msgRef = threadRef.collection("messages").doc();
  await msgRef.set({
    messageId: msgRef.id,
    postId,
    postOwnerUid,
    friendUid,
    authorUid: uid,
    participantAuthUids,
    text,
    reactions: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await threadRef.set(
    {
      postId,
      postOwnerUid,
      friendUid,
      participants: [postOwnerUid, friendUid].sort(),
      participantAuthUids,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, messageId: msgRef.id };
});

/**
 * Toggles caller reaction on one private thread message.
 */
export const togglePrivatePostThreadMessageReaction = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const postId = String(req.data?.postId ?? "").trim();
  const postOwnerUid = String(req.data?.postOwnerUid ?? "").trim();
  const friendUid = String(req.data?.friendUid ?? "").trim();
  const messageId = String(req.data?.messageId ?? "").trim();
  const emoji = String(req.data?.emoji ?? "👍").trim() || "👍";
  if (!postId || !postOwnerUid || !friendUid || !messageId) {
    throw new HttpsError("invalid-argument", "postId, postOwnerUid, friendUid, messageId are required.");
  }
  if (uid !== postOwnerUid && uid !== friendUid) {
    throw new HttpsError("permission-denied", "Caller must be post owner or thread friend.");
  }
  await assertAcceptedFriendship(postOwnerUid, friendUid);
  const threadRef = db.collection("privatePostThreads").doc(privateThreadId(postId, postOwnerUid, friendUid));
  const msgRef = threadRef.collection("messages").doc(messageId);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = await tx.get(msgRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Message not found.");
    }
    const data = snap.data() as { reactions?: Record<string, string> } | undefined;
    const reactions = { ...(data?.reactions ?? {}) };
    if (reactions[uid] === emoji) {
      delete reactions[uid];
    } else {
      reactions[uid] = emoji;
    }
    tx.set(
      msgRef,
      {
        reactions,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      threadRef,
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  return { ok: true };
});

/**
 * Lists private thread messages for one post pair.
 */
export const listPrivatePostThreadMessages = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const postId = String(req.data?.postId ?? "").trim();
  const postOwnerUid = String(req.data?.postOwnerUid ?? "").trim();
  const friendUid = String(req.data?.friendUid ?? "").trim();
  if (!postId || !postOwnerUid || !friendUid) {
    throw new HttpsError("invalid-argument", "postId, postOwnerUid, friendUid are required.");
  }
  if (postOwnerUid === friendUid) {
    throw new HttpsError("invalid-argument", "owner and friend must differ.");
  }
  if (uid !== postOwnerUid && uid !== friendUid) {
    throw new HttpsError("permission-denied", "Caller must be post owner or thread friend.");
  }
  await assertAcceptedFriendship(postOwnerUid, friendUid);
  const threadRef = db.collection("privatePostThreads").doc(privateThreadId(postId, postOwnerUid, friendUid));
  const snap = await threadRef.collection("messages").orderBy("createdAt", "asc").limit(500).get();

  const items = snap.docs.map((doc) => {
    const data = doc.data() as {
      messageId?: string;
      authorUid: string;
      text: string;
      reactions?: Record<string, string>;
      createdAt?: unknown;
    };
    return {
      messageId: data.messageId ?? doc.id,
      authorUid: data.authorUid,
      text: data.text,
      reactions: data.reactions ?? {},
      createdAtMs: timestampToMs(data.createdAt),
    };
  });
  return { items };
});

export {
  registerPushToken,
  listConversationMessages,
  updateConversationReadPosition,
  setConversationNotificationMute,
  manageConversationMembership,
  setEncryptedPostReaction,
  updateEncryptedPost,
  updateMessageMetadata,
  updateEncryptedMessage,
};
