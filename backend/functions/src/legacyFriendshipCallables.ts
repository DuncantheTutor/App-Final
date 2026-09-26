import * as admin from "firebase-admin";
import { createHash, randomBytes } from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { resolveParticipantAuthUids } from "./authUidMirror";
import { linkAcceptedFriends } from "./friendIndex";
import { assertActiveDeviceSession, resolveAppUidFromRequest } from "./deviceSession";
import { getFirestore } from "./firebaseAdmin";
import { assertLegacyFriendshipCallableAllowed } from "./legacyPairingGate";

const db = getFirestore();
const HANDSHAKE_TTL_MS = 1000 * 60 * 2;
const HANDSHAKE_SESSION_TTL_MS = 1000 * 60 * 2;

function nowMs(): number {
  return Date.now();
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomNonceHex(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

function friendshipId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function normalizeHandshakeCode(raw: string): string {
  const t = raw.trim();
  return t.startsWith("FN1.") ? t.slice(4) : t;
}

/**
 * Retired friendship transports. Every callable here is refused in production.
 * Live friendships are created by the QR offer (register / confirm / finalize).
 */

/**
 * Creates short-lived NFC handshake token to share as FN1.<code>.
 */
export const createHandshake = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);

  const handshakeCode = `H_${Math.random().toString(16).slice(2, 14)}${Math.random().toString(16).slice(2, 14)}`;
  const expiresAt = nowMs() + HANDSHAKE_TTL_MS;
  await db.collection("handshakes").doc(handshakeCode).set({
    ownerUid: uid,
    ownerDeviceId: deviceId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    consumed: false,
  });
  return { handshakeCode, expiresAt };
});

const NFC_FRIEND_VOUCHER_TTL_MS = HANDSHAKE_SESSION_TTL_MS;

/**
 * Mint a single-use NFC friend voucher (Transmit side writes `FN1.AF1|<voucherCode>` once).
 */
export const mintNfcFriendVoucher = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const voucherCode = `AF1_${randomNonceHex(12)}`;
  const expiresAt = nowMs() + NFC_FRIEND_VOUCHER_TTL_MS;
  await db.collection("nfcFriendVouchers").doc(voucherCode).set({
    voucherCode,
    issuerUid: uid,
    issuerDeviceId: deviceId,
    expiresAt,
    consumed: false,
    redeemerUid: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, voucherCode, expiresAt };
});

/**
 * Redeem voucher after reading it from peer NFC (Receive side).
 */
export const redeemNfcFriendVoucher = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const voucherCode = String(req.data?.voucherCode ?? "").trim();
  if (!/^AF1_[a-f0-9]{24}$/i.test(voucherCode)) {
    throw new HttpsError("invalid-argument", "Invalid voucher code.");
  }
  const ref = db.collection("nfcFriendVouchers").doc(voucherCode);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Voucher not found.");
  const data = snap.data() as {
    issuerUid: string;
    expiresAt: number;
    consumed?: boolean;
    redeemerUid?: string | null;
  };
  if (data.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Voucher expired.");
  if (data.consumed) throw new HttpsError("failed-precondition", "Voucher already used.");
  if (data.issuerUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot redeem your own voucher.");
  }
  const issuerUid = data.issuerUid;
  const redeemerUid = uid;
  const edgeId = friendshipId(issuerUid, redeemerUid);
  // Resolved outside the tx because `userFirebaseAuthMap` is write-once-stable
  // per user (only updated when a device re-registers its Firebase Auth UID),
  // so there's no consistency window to worry about. Mirroring the app uids
  // into `participantAuthUids` lets signed-in clients run a direct
  // `where("participantAuthUids", "array-contains", auth.uid)` snapshot
  // listener on the `friendships` collection — no callable round-trip required.
  const participantAuthUids = await resolveParticipantAuthUids([issuerUid, redeemerUid]);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new HttpsError("not-found", "Voucher not found.");
    const d = fresh.data() as { consumed?: boolean; issuerUid: string; expiresAt: number };
    if (d.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Voucher expired.");
    if (d.consumed) throw new HttpsError("failed-precondition", "Voucher already used.");
    if (d.issuerUid === redeemerUid) {
      throw new HttpsError("failed-precondition", "Cannot redeem your own voucher.");
    }
    const edgeRef = db.collection("friendships").doc(edgeId);
    tx.set(
      edgeRef,
      {
        participants: [issuerUid, redeemerUid].sort(),
        participantAuthUids,
        status: "accepted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        establishedByNfcFriendVoucher: voucherCode,
      },
      { merge: true }
    );
    tx.set(
      ref,
      {
        consumed: true,
        redeemerUid,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  await linkAcceptedFriends(issuerUid, redeemerUid).catch((err) => {
    console.error("friendIndex.link_failed", err);
  });
  return { ok: true, accepted: true, friendUid: issuerUid, voucherCode };
});

/**
 * Issuer polls after NFC write until Receive side redeems.
 */
export const getNfcFriendVoucherStatus = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const voucherCode = String(req.data?.voucherCode ?? "").trim();
  if (!/^AF1_[a-f0-9]{24}$/i.test(voucherCode)) {
    throw new HttpsError("invalid-argument", "Invalid voucher code.");
  }
  const snap = await db.collection("nfcFriendVouchers").doc(voucherCode).get();
  if (!snap.exists) throw new HttpsError("not-found", "Voucher not found.");
  const data = snap.data() as {
    issuerUid: string;
    consumed?: boolean;
    redeemerUid?: string | null;
    expiresAt: number;
  };
  if (data.issuerUid !== uid) {
    throw new HttpsError("permission-denied", "Not the voucher issuer.");
  }
  return {
    ok: true,
    voucherCode,
    status: data.consumed ? "redeemed" : "pending",
    redeemerUid: data.redeemerUid?.trim() || null,
    expiresAt: data.expiresAt,
  };
});

const BLE_FRIEND_SESSION_TTL_MS = HANDSHAKE_SESSION_TTL_MS;
const BLE_JOIN_MAX_CODE_ATTEMPTS = 10;

function bleFriendDisplayCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function bleFriendCodeHash(sessionId: string, displayCode: string): string {
  return sha256Hex(`bleFriendSession|${sessionId}|${displayCode}`);
}

/**
 * Host (issuer): creates BLE Add Friend session with random 6-digit code and `BF1_<12 hex>` session id.
 * Client shows the 6-digit code (human pairing number); Android advertises the session beacon over BLE.
 */
export const createBleFriendSession = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = `BF1_${randomBytes(6).toString("hex")}`;
  const displayCode = bleFriendDisplayCode();
  const codeHash = bleFriendCodeHash(sessionId, displayCode);
  const expiresAt = nowMs() + BLE_FRIEND_SESSION_TTL_MS;
  await db.collection("bleFriendSessions").doc(sessionId).set({
    sessionId,
    displayCode,
    issuerUid: uid,
    issuerDeviceId: deviceId,
    codeHash,
    wrongAttempts: 0,
    expiresAt,
    consumed: false,
    redeemerUid: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, sessionId, displayCode, expiresAt };
});

/**
 * Joiner: verifies 6-digit code and creates friendship with issuer (same edge rules as NFC voucher redeem).
 */
export const joinBleFriendSession = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = String(req.data?.sessionId ?? "").trim();
  const displayCode = String(req.data?.displayCode ?? "").trim().replace(/\s+/g, "");
  if (!/^BF1_[a-f0-9]{12}$/i.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Invalid session id.");
  }
  if (!/^\d{6}$/.test(displayCode)) {
    throw new HttpsError("invalid-argument", "Enter the 6-digit code.");
  }
  const ref = db.collection("bleFriendSessions").doc(sessionId);
  const submittedHash = bleFriendCodeHash(sessionId, displayCode);

  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found.");
  const pre = snap.data() as {
    issuerUid: string;
    codeHash: string;
    expiresAt: number;
    consumed?: boolean;
    wrongAttempts?: number;
  };
  if (pre.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Session expired.");
  if (pre.consumed) throw new HttpsError("failed-precondition", "Session already used.");
  if (pre.issuerUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot join your own session.");
  }
  if ((pre.wrongAttempts ?? 0) >= BLE_JOIN_MAX_CODE_ATTEMPTS) {
    throw new HttpsError("resource-exhausted", "Too many incorrect codes.");
  }
  if (pre.codeHash !== submittedHash) {
    await ref.set(
      {
        wrongAttempts: (pre.wrongAttempts ?? 0) + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new HttpsError("permission-denied", "Incorrect code.");
  }

  const issuerUid = pre.issuerUid;
  const redeemerUid = uid;
  const edgeId = friendshipId(issuerUid, redeemerUid);
  const participantAuthUids = await resolveParticipantAuthUids([issuerUid, redeemerUid]);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new HttpsError("not-found", "Session not found.");
    const d = fresh.data() as {
      consumed?: boolean;
      issuerUid: string;
      expiresAt: number;
      codeHash: string;
    };
    if (d.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Session expired.");
    if (d.consumed) throw new HttpsError("failed-precondition", "Session already used.");
    if (d.issuerUid === redeemerUid) {
      throw new HttpsError("failed-precondition", "Cannot join your own session.");
    }
    if (d.codeHash !== submittedHash) {
      throw new HttpsError("permission-denied", "Incorrect code.");
    }
    const edgeRef = db.collection("friendships").doc(edgeId);
    tx.set(
      edgeRef,
      {
        participants: [issuerUid, redeemerUid].sort(),
        participantAuthUids,
        status: "accepted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        establishedByBleFriendSession: sessionId,
      },
      { merge: true }
    );
    tx.set(
      ref,
      {
        consumed: true,
        redeemerUid,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  await linkAcceptedFriends(issuerUid, redeemerUid).catch((err) => {
    console.error("friendIndex.link_failed", err);
  });
  return { ok: true, accepted: true, friendUid: issuerUid, sessionId };
});

/** Issuer polls until joiner completes `joinBleFriendSession`. */
export const getBleFriendSessionStatus = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = String(req.data?.sessionId ?? "").trim();
  if (!/^BF1_[a-f0-9]{12}$/i.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Invalid session id.");
  }
  const snap = await db.collection("bleFriendSessions").doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found.");
  const data = snap.data() as {
    issuerUid: string;
    consumed?: boolean;
    redeemerUid?: string | null;
    expiresAt: number;
  };
  if (data.issuerUid !== uid) {
    throw new HttpsError("permission-denied", "Not the session host.");
  }
  return {
    ok: true,
    sessionId,
    status: data.consumed ? "joined" : "pending",
    redeemerUid: data.redeemerUid?.trim() || null,
    expiresAt: data.expiresAt,
  };
});

/**
 * Joiner: read the host's 6-digit code for a pending BLE session (for multi-host picker UX).
 * Requires auth; caller must not be the issuer. Session docs created before `displayCode` was
 * stored will fail with failed-precondition.
 */
export const peekBleFriendSessionForJoin = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = String(req.data?.sessionId ?? "").trim();
  if (!/^BF1_[a-f0-9]{12}$/i.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Invalid session id.");
  }
  const snap = await db.collection("bleFriendSessions").doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found.");
  const data = snap.data() as {
    issuerUid: string;
    consumed?: boolean;
    expiresAt: number;
    displayCode?: string;
  };
  if (data.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Session expired.");
  if (data.consumed) throw new HttpsError("failed-precondition", "Session already used.");
  if (data.issuerUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot join your own session.");
  }
  const displayCode = String(data.displayCode ?? "").trim();
  if (!/^\d{6}$/.test(displayCode)) {
    throw new HttpsError(
      "failed-precondition",
      "This session has no pairing code on file. Ask your friend to start a new Share session."
    );
  }
  return { ok: true, sessionId, displayCode };
});

// -----------------------------------------------------------------------------
// LEGACY — HS2 multi-tap NFC (no longer used by the mobile app; kept for rollback).
// Callables: beginNfcHandshakeSession, respondNfcHandshakeSession,
// getNfcHandshakeSessionStatus, finalizeNfcHandshakeSession
// -----------------------------------------------------------------------------

/**
 * New protocol: begins NFC handshake session with initiator nonce.
 */
export const beginNfcHandshakeSession = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = `HS2_${randomNonceHex(10)}`;
  const initiatorNonce = randomNonceHex(16);
  const expiresAt = nowMs() + HANDSHAKE_SESSION_TTL_MS;
  await db.collection("handshakeSessions").doc(sessionId).set({
    sessionId,
    initiatorUid: uid,
    initiatorDeviceId: deviceId,
    initiatorNonce,
    responderUid: null,
    responderDeviceId: null,
    responderNonce: null,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return { ok: true, sessionId, initiatorNonce, expiresAt };
});

/**
 * New protocol: responder confirms initiator nonce and gets responder nonce.
 */
export const respondNfcHandshakeSession = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = String(req.data?.sessionId ?? "").trim();
  const initiatorNonce = String(req.data?.initiatorNonce ?? "").trim();
  if (!sessionId || !initiatorNonce) {
    throw new HttpsError("invalid-argument", "sessionId and initiatorNonce are required.");
  }
  const ref = db.collection("handshakeSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Handshake session not found.");
  const data = snap.data() as {
    initiatorUid: string;
    initiatorNonce: string;
    responderUid?: string | null;
    responderNonce?: string | null;
    expiresAt: number;
    status?: string;
  };
  if (data.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Handshake session expired.");
  if (data.initiatorUid === uid) throw new HttpsError("failed-precondition", "Cannot respond to your own session.");
  if (data.initiatorNonce !== initiatorNonce) throw new HttpsError("permission-denied", "Handshake nonce mismatch.");
  if (data.responderUid && data.responderUid !== uid) {
    throw new HttpsError("failed-precondition", "Handshake already has a different responder.");
  }
  const responderNonce = data.responderNonce?.trim() || randomNonceHex(16);
  await ref.set(
    {
      responderUid: uid,
      responderDeviceId: deviceId,
      responderNonce,
      status: "responded",
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, sessionId, responderNonce, initiatorUid: data.initiatorUid };
});

/**
 * New protocol helper: initiator/responder can poll session status for fallback finalize.
 */
export const getNfcHandshakeSessionStatus = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = String(req.data?.sessionId ?? "").trim();
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }
  const snap = await db.collection("handshakeSessions").doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Handshake session not found.");
  const data = snap.data() as {
    initiatorUid: string;
    responderUid?: string | null;
    responderNonce?: string | null;
    status?: string;
    expiresAt: number;
  };
  if (uid !== data.initiatorUid && uid !== data.responderUid) {
    throw new HttpsError("permission-denied", "Caller must be session participant.");
  }
  return {
    ok: true,
    sessionId,
    status: data.status ?? "pending",
    responderUid: data.responderUid ?? null,
    responderNonce: data.responderNonce ?? null,
    expiresAt: data.expiresAt,
  };
});

/**
 * New protocol: finalizes handshake when peer nonce is confirmed.
 * Initiator passes responderNonce; responder passes initiatorNonce.
 */
export const finalizeNfcHandshakeSession = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const sessionId = String(req.data?.sessionId ?? "").trim();
  const peerNonce = String(req.data?.peerNonce ?? "").trim();
  if (!sessionId || !peerNonce) {
    throw new HttpsError("invalid-argument", "sessionId and peerNonce are required.");
  }
  const ref = db.collection("handshakeSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Handshake session not found.");
  const data = snap.data() as {
    initiatorUid: string;
    responderUid?: string | null;
    initiatorNonce: string;
    responderNonce?: string | null;
    expiresAt: number;
    status?: string;
  };
  if (data.expiresAt < nowMs()) throw new HttpsError("deadline-exceeded", "Handshake session expired.");
  const responderUid = data.responderUid?.trim();
  if (!responderUid) throw new HttpsError("failed-precondition", "Responder not registered yet.");
  if (uid !== data.initiatorUid && uid !== responderUid) {
    throw new HttpsError("permission-denied", "Caller must be initiator or responder.");
  }
  const expectedPeerNonce = uid === data.initiatorUid ? data.responderNonce ?? "" : data.initiatorNonce;
  if (!expectedPeerNonce || expectedPeerNonce !== peerNonce) {
    throw new HttpsError("permission-denied", "Peer nonce mismatch.");
  }
  const edgeId = friendshipId(data.initiatorUid, responderUid);
  const participantAuthUids = await resolveParticipantAuthUids([data.initiatorUid, responderUid]);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const edgeRef = db.collection("friendships").doc(edgeId);
    tx.set(
      edgeRef,
      {
        participants: [data.initiatorUid, responderUid].sort(),
        participantAuthUids,
        status: "accepted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        establishedByHandshakeSession: sessionId,
      },
      { merge: true }
    );
    tx.set(
      ref,
      {
        status: "finalized",
        finalizedByUid: uid,
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  const friendUid = uid === data.initiatorUid ? responderUid : data.initiatorUid;
  await linkAcceptedFriends(data.initiatorUid, responderUid).catch((err) => {
    console.error("friendIndex.link_failed", err);
  });
  return { ok: true, accepted: true, friendUid, sessionId };
});

/**
 * Consumes NFC handshake and creates accepted friendship edge.
 */
export const consumeHandshake = onCall(async (req) => {
  assertLegacyFriendshipCallableAllowed();
  const uid = await resolveAppUidFromRequest(req);
  const receiverDeviceId = String(req.data?.receiverDeviceId ?? "").trim();
  await assertActiveDeviceSession(uid, receiverDeviceId);

  const rawCode = String(req.data?.handshakeCode ?? "");
  const handshakeCode = normalizeHandshakeCode(rawCode);
  if (!/^H_[A-Za-z0-9]{8,}$/.test(handshakeCode)) {
    throw new HttpsError("invalid-argument", "Invalid handshake code.");
  }

  const hsRef = db.collection("handshakes").doc(handshakeCode);
  const hsSnap = await hsRef.get();
  if (!hsSnap.exists) {
    throw new HttpsError("not-found", "Handshake not found.");
  }
  const hs = hsSnap.data() as {
    ownerUid: string;
    ownerDeviceId: string;
    expiresAt: number;
    consumed?: boolean;
  };
  if (hs.ownerUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot consume your own handshake.");
  }
  if (hs.consumed) {
    throw new HttpsError("failed-precondition", "Handshake already consumed.");
  }
  if (hs.expiresAt < nowMs()) {
    throw new HttpsError("deadline-exceeded", "Handshake expired.");
  }

  const edgeId = friendshipId(uid, hs.ownerUid);
  const participantAuthUids = await resolveParticipantAuthUids([uid, hs.ownerUid]);
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const edgeRef = db.collection("friendships").doc(edgeId);
    tx.set(
      edgeRef,
      {
        participants: [uid, hs.ownerUid].sort(),
        participantAuthUids,
        status: "accepted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        establishedByHandshake: handshakeCode,
      },
      { merge: true }
    );
    tx.set(hsRef, { consumed: true, consumedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
  await linkAcceptedFriends(uid, hs.ownerUid).catch((err) => {
    console.error("friendIndex.link_failed", err);
  });
  return { ok: true, accepted: true, friendUid: hs.ownerUid };
});
