"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfiles = exports.getFriendPresence = exports.setMyPresence = exports.removeFriendship = exports.listMyFriends = exports.listEncryptedMessages = exports.getHiddenConversationIds = exports.unhideConversationForUser = exports.hideConversationForUser = exports.listEncryptedPosts = exports.getEncryptedProfile = exports.getFriendKeyBundles = exports.sendEncryptedMessage = exports.deleteEncryptedPost = exports.createEncryptedPost = exports.putEncryptedProfile = exports.getUserSocialSnapshot = exports.putUserSocialSnapshot = exports.getUserKeyBackup = exports.putUserKeyBackup = exports.publishUserKeyBundle = exports.upsertConversation = exports.seedDemoFriendships = exports.consumeHandshake = exports.finalizeNfcHandshakeSession = exports.getNfcHandshakeSessionStatus = exports.respondNfcHandshakeSession = exports.beginNfcHandshakeSession = exports.finalizeNfcPinPairOffer = exports.confirmNfcPinPairOffer = exports.previewNfcPinPairOffer = exports.getNfcPinPairOfferStatus = exports.cancelNfcPinPairOffer = exports.registerNfcPinPairOffer = exports.peekBleFriendSessionForJoin = exports.getBleFriendSessionStatus = exports.joinBleFriendSession = exports.createBleFriendSession = exports.getNfcFriendVoucherStatus = exports.redeemNfcFriendVoucher = exports.mintNfcFriendVoucher = exports.createHandshake = exports.verifyEmailOtp = exports.cleanupExpiredTransientDocs = exports.logClientTelemetry = exports.requestEmailOtp = exports.upsertUserProfile = exports.releaseDeviceSession = exports.claimDeviceSession = exports.registerFirebaseAuthUid = void 0;
exports.updateEncryptedMessage = exports.updateMessageMetadata = exports.updateEncryptedPost = exports.setEncryptedPostReaction = exports.manageConversationMembership = exports.setConversationNotificationMute = exports.updateConversationReadPosition = exports.listConversationMessages = exports.registerPushToken = exports.listPrivatePostThreadMessages = exports.togglePrivatePostThreadMessageReaction = exports.createPrivatePostThreadMessage = void 0;
require("./firebaseAdmin");
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const crypto_1 = require("crypto");
const firebaseAdmin_1 = require("./firebaseAdmin");
const socialExtensions_1 = require("./socialExtensions");
Object.defineProperty(exports, "listConversationMessages", { enumerable: true, get: function () { return socialExtensions_1.listConversationMessages; } });
Object.defineProperty(exports, "manageConversationMembership", { enumerable: true, get: function () { return socialExtensions_1.manageConversationMembership; } });
Object.defineProperty(exports, "registerPushToken", { enumerable: true, get: function () { return socialExtensions_1.registerPushToken; } });
Object.defineProperty(exports, "setEncryptedPostReaction", { enumerable: true, get: function () { return socialExtensions_1.setEncryptedPostReaction; } });
Object.defineProperty(exports, "updateConversationReadPosition", { enumerable: true, get: function () { return socialExtensions_1.updateConversationReadPosition; } });
Object.defineProperty(exports, "updateEncryptedPost", { enumerable: true, get: function () { return socialExtensions_1.updateEncryptedPost; } });
Object.defineProperty(exports, "updateMessageMetadata", { enumerable: true, get: function () { return socialExtensions_1.updateMessageMetadata; } });
Object.defineProperty(exports, "updateEncryptedMessage", { enumerable: true, get: function () { return socialExtensions_1.updateEncryptedMessage; } });
Object.defineProperty(exports, "setConversationNotificationMute", { enumerable: true, get: function () { return socialExtensions_1.setConversationNotificationMute; } });
const deviceSession_1 = require("./deviceSession");
const db = (0, firebaseAdmin_1.getFirestore)();
const HANDSHAKE_TTL_MS = 1000 * 60 * 2;
const HANDSHAKE_SESSION_TTL_MS = 1000 * 60 * 2;
const OTP_TTL_MS = 1000 * 60 * 10;
const OTP_RESEND_COOLDOWN_MS = 1000 * 30;
const OTP_MAX_VERIFY_ATTEMPTS = 6;
const OTP_IP_WINDOW_MS = 1000 * 60 * 10;
const OTP_IP_MAX_REQUESTS_PER_WINDOW = 20;
const TELEMETRY_DETAILS_MAX_LEN = 4000;
const TELEMETRY_IP_WINDOW_MS = 1000 * 60 * 10;
const TELEMETRY_IP_MAX_EVENTS_PER_WINDOW = 200;
const PROXIMITY_MAX_DISTANCE_M = 100;
const PROXIMITY_MAX_ACCURACY_M = 50;
const PROXIMITY_MAX_LOCATION_AGE_MS = 60_000;
const PROXIMITY_GPS_UNCERTAINTY_MULTIPLIER = 1.75;
const PRESENCE_STALE_MS = 45_000;
function requireAuthUid(uid) {
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    return uid;
}
function nowMs() {
    return Date.now();
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)("sha256").update(input).digest("hex");
}
function randomOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
function displayNameFromEmail(email) {
    const left = email.split("@")[0] ?? "user";
    return left
        .replace(/[._-]+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
function emailLocalPartLower(email) {
    return (email.split("@")[0] ?? "").trim().toLowerCase();
}
function isEmailDerivedUsername(username, email) {
    const u = username.trim().toLowerCase();
    if (!u)
        return false;
    const local = emailLocalPartLower(email);
    if (!local)
        return false;
    if (u === local)
        return true;
    const norm = (s) => s
        .toLowerCase()
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return norm(u) === norm(local);
}
function normalizeHandshakeCode(raw) {
    const t = raw.trim();
    return t.startsWith("FN1.") ? t.slice(4) : t;
}
function randomNonceHex(bytes = 16) {
    return (0, crypto_1.randomBytes)(bytes).toString("hex");
}
function assertReasonableCiphertext(ciphertext) {
    if (ciphertext.length < 24) {
        throw new https_1.HttpsError("invalid-argument", "Encrypted payload is too short.");
    }
}
function friendshipId(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}
function isAppBackendUid(id) {
    return id.startsWith("u_");
}
/** Normalizes friendship `participants` entries to canonical app uids (`u_*`). */
async function normalizeParticipantToAppUid(raw) {
    const id = String(raw ?? "").trim();
    if (!id)
        return null;
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
    if (!appUid || !isAppBackendUid(appUid))
        return null;
    const userSnap = await db.collection("users").doc(appUid).get();
    return userSnap.exists ? appUid : null;
}
function privateThreadId(postId, ownerUid, friendUid) {
    const pair = ownerUid < friendUid ? `${ownerUid}_${friendUid}` : `${friendUid}_${ownerUid}`;
    return `${postId}__${pair}`;
}
function timestampToMs(value) {
    if (typeof value === "number")
        return value;
    if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
        return (value.toMillis());
    }
    return 0;
}
function parseSinceMs(raw) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return Math.floor(n);
}
function normalizePairingProximityEvidence(raw) {
    const input = (raw ?? {});
    const asNumberOrNull = (v) => {
        if (typeof v !== "number" || !Number.isFinite(v))
            return null;
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
function toRadians(deg) {
    return (deg * Math.PI) / 180;
}
function haversineMeters(lat1, lng1, lat2, lng2) {
    const earthRadiusM = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusM * c;
}
function isGpsEvidenceUsable(e) {
    if (typeof e.lat !== "number" ||
        typeof e.lng !== "number" ||
        typeof e.horizontalAccuracyM !== "number" ||
        typeof e.locationTimestampMs !== "number") {
        return false;
    }
    if (Math.abs(e.lat) > 90 || Math.abs(e.lng) > 180)
        return false;
    if (e.horizontalAccuracyM <= 0 || e.horizontalAccuracyM > PROXIMITY_MAX_ACCURACY_M)
        return false;
    if (Math.abs(nowMs() - e.locationTimestampMs) > PROXIMITY_MAX_LOCATION_AGE_MS)
        return false;
    return true;
}
function ipv4ToOctets(ip) {
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m)
        return null;
    const octets = m.slice(1).map((x) => Number(x));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
        return null;
    return octets;
}
function isPrivateIpv4(octets) {
    const [a, b] = octets;
    if (a === 10)
        return true;
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    if (a === 192 && b === 168)
        return true;
    return false;
}
function hasSameWifiSubnetFallback(a, b) {
    if (!a.isWifiConnected || !b.isWifiConnected || !a.localIp || !b.localIp)
        return false;
    const aOctets = ipv4ToOctets(a.localIp);
    const bOctets = ipv4ToOctets(b.localIp);
    if (!aOctets || !bOctets)
        return false;
    if (!isPrivateIpv4(aOctets) || !isPrivateIpv4(bOctets))
        return false;
    return aOctets[0] === bOctets[0] && aOctets[1] === bOctets[1] && aOctets[2] === bOctets[2];
}
async function assertAcceptedFriendship(uid, otherUid) {
    if (uid === otherUid)
        return;
    const snap = await db.collection("friendships").doc(friendshipId(uid, otherUid)).get();
    if (!snap.exists) {
        throw new https_1.HttpsError("permission-denied", "You can only view profiles of friends.");
    }
    const data = snap.data();
    if (data?.status !== "accepted") {
        throw new https_1.HttpsError("permission-denied", "Friendship not accepted.");
    }
}
/**
 * Resolves the canonical app uid (`u_…`) for each participant to the
 * recipient's **Firebase Auth UID** by reading from `userFirebaseAuthMap`.
 *
 * Direct client `onSnapshot` listeners can only authenticate against
 * `request.auth.uid` (Firebase Auth UID), but the app's identity model is
 * keyed on the app uid. We mirror the app-uid → authUid mapping into every
 * message and conversation document as `participantAuthUids` so the
 * Firestore client SDK can run `collectionGroup("messages").where(
 * "participantAuthUids", "array-contains", auth.uid)` for push-based
 * message delivery without needing custom auth tokens.
 *
 * Missing entries are simply omitted from the returned array — those
 * recipients won't see the message via push and will continue to receive
 * via the next `listEncryptedMessages` callable pull instead. This keeps the
 * old-data fallback intact.
 */
async function resolveParticipantAuthUids(uids) {
    const unique = [...new Set(uids.filter((x) => !!x))];
    if (unique.length === 0)
        return [];
    const refs = unique.map((uid) => db.collection("userFirebaseAuthMap").doc(uid));
    const snaps = await db.getAll(...refs);
    const out = [];
    for (const snap of snaps) {
        const data = snap.data();
        const uid = (data?.firebaseAuthUid ?? "").trim();
        if (uid)
            out.push(uid);
    }
    return [...new Set(out)].sort();
}
/**
 * Registers the caller's Firebase Auth UID against their app uid so future
 * encrypted-message writes can populate `participantAuthUids` for direct
 * client snapshot listening. Idempotent.
 *
 * Trust model: the device session lock (`assertActiveDeviceSession`) is the
 * authority on "is this client really uid X". Once that check passes, the
 * caller is asserting "and my Firebase Auth UID is Y" — which can also be
 * cross-checked when the caller is properly authenticated (`req.auth.uid`).
 * Direct read access from a forged Firebase Auth UID is still impossible
 * because Firestore rules only honour the **real** `request.auth.uid` value.
 */
exports.registerFirebaseAuthUid = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const claimedAuthUid = String(req.data?.firebaseAuthUid ?? req.auth?.uid ?? "").trim();
    if (!claimedAuthUid) {
        throw new https_1.HttpsError("invalid-argument", "firebaseAuthUid is required.");
    }
    if (claimedAuthUid.length > 200 || !/^[A-Za-z0-9_:.-]+$/.test(claimedAuthUid)) {
        throw new https_1.HttpsError("invalid-argument", "firebaseAuthUid is not a well-formed identifier.");
    }
    // When the caller is properly authenticated via Firebase Auth (httpsCallable
    // with token), `req.auth.uid` is the truth — refuse mismatched claims.
    if (req.auth?.uid && req.auth.uid !== claimedAuthUid) {
        throw new https_1.HttpsError("permission-denied", "firebaseAuthUid does not match authenticated session.");
    }
    const updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await db.collection("userFirebaseAuthMap").doc(uid).set({
        uid,
        firebaseAuthUid: claimedAuthUid,
        updatedAt,
    }, { merge: true });
    await db.collection("firebaseAuthToAppUid").doc(claimedAuthUid).set({
        appUid: uid,
        firebaseAuthUid: claimedAuthUid,
        updatedAt,
    }, { merge: true });
    await (0, socialExtensions_1.propagateFirebaseAuthUidToFriendsPresenceViewers)(uid);
    await (0, socialExtensions_1.mergeFriendAuthOntoRegistrantPresence)(uid);
    // Heartbeat + full viewer list — `refreshPresenceViewerAuthUids` alone left docs without
    // a fresh `heartbeatAtMs`, so friends always saw offline in `getFriendPresence`.
    await (0, socialExtensions_1.writePresenceWithViewers)(uid, deviceId, "active");
    void (0, socialExtensions_1.backfillMessageParticipantAuthUid)(uid, claimedAuthUid).catch(() => undefined);
    return { ok: true };
});
/** Optional PIN for pairing-only profile reads (does not throw if missing or malformed). */
function tryNormalizeNfcPinPairPinOptional(raw) {
    const pin = String(raw ?? "").trim().replace(/\s+/g, "");
    if (!/^\d{4}$/.test(pin))
        return null;
    return pin;
}
/** Allows reading the other participant's profile during active QR/NFC pairing after scanner confirmation. */
async function assertPairingSessionAllowsProfileRead(viewerUid, targetUid, pin) {
    const ref = db.collection("nfcPinPairSessions").doc(pin);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("permission-denied", "Pairing session not found.");
    }
    const d = snap.data();
    if ((d.expiresAt ?? 0) < nowMs()) {
        throw new https_1.HttpsError("permission-denied", "Pairing session expired.");
    }
    const issuer = String(d.issuerUid ?? "").trim();
    const redeemer = String(d.redeemerUid ?? "").trim();
    if (!issuer || !redeemer || !d.scannerConfirmed) {
        throw new https_1.HttpsError("permission-denied", "Pairing is not ready to load profiles yet.");
    }
    const pairOk = (issuer === viewerUid && redeemer === targetUid) || (issuer === targetUid && redeemer === viewerUid);
    if (!pairOk) {
        throw new https_1.HttpsError("permission-denied", "Pairing session does not match this user.");
    }
}
async function assertOtpIpThrottle(rawIp, purpose) {
    const ip = String(rawIp ?? "").trim();
    if (!ip)
        return;
    const now = nowMs();
    const bucketId = sha256Hex(`otp-ip|${purpose}|${ip}`);
    const ref = db.collection("otpIpThrottle").doc(bucketId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = (snap.data() ?? {});
        const windowStartMs = data.windowStartMs ?? now;
        const withinWindow = now - windowStartMs < OTP_IP_WINDOW_MS;
        const nextCount = withinWindow ? (data.count ?? 0) + 1 : 1;
        if (withinWindow && nextCount > OTP_IP_MAX_REQUESTS_PER_WINDOW) {
            throw new https_1.HttpsError("resource-exhausted", "Too many OTP requests from this network. Please wait.");
        }
        tx.set(ref, {
            windowStartMs: withinWindow ? windowStartMs : now,
            count: nextCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
async function assertTelemetryIpThrottle(rawIp) {
    const ip = String(rawIp ?? "").trim();
    if (!ip)
        return;
    const now = nowMs();
    const bucketId = sha256Hex(`telemetry-ip|${ip}`);
    const ref = db.collection("telemetryIpThrottle").doc(bucketId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = (snap.data() ?? {});
        const windowStartMs = data.windowStartMs ?? now;
        const withinWindow = now - windowStartMs < TELEMETRY_IP_WINDOW_MS;
        const nextCount = withinWindow ? (data.count ?? 0) + 1 : 1;
        if (withinWindow && nextCount > TELEMETRY_IP_MAX_EVENTS_PER_WINDOW) {
            throw new https_1.HttpsError("resource-exhausted", "Telemetry rate limit exceeded.");
        }
        tx.set(ref, {
            windowStartMs: withinWindow ? windowStartMs : now,
            count: nextCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
/**
 * Enforces one-device-only sign-in lock.
 */
exports.claimDeviceSession = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    if (!deviceId)
        throw new https_1.HttpsError("invalid-argument", "deviceId is required.");
    const email = String(req.auth?.token?.email ?? req.data?.email ?? "").trim().toLowerCase();
    const requestedUsername = String(req.data?.username ?? "").trim();
    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const existing = (snap.data() ?? {});
        const existingUsername = String(existing.username ?? "").trim();
        const patch = {
            uid,
            email: email || null,
            activeDeviceId: deviceId,
            sessionIssuedAt: nowMs(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Never overwrite a real chosen username with an email-derived default on re-login.
        if (requestedUsername) {
            if (!existingUsername || isEmailDerivedUsername(existingUsername, email)) {
                patch.username = requestedUsername;
            }
        }
        else if (!existingUsername && email) {
            patch.username = displayNameFromEmail(email);
        }
        // One-device policy: the latest successful claim owns the account. A previous
        // device loses the lock on its next `assertActiveDeviceSession` call.
        tx.set(userRef, patch, { merge: true });
    });
    return { ok: true };
});
/**
 * Releases one-device lock for current authenticated caller.
 */
exports.releaseDeviceSession = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    if (!deviceId)
        throw new https_1.HttpsError("invalid-argument", "deviceId is required.");
    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists)
            return;
        const existing = (snap.data() ?? {});
        if (existing.activeDeviceId && existing.activeDeviceId !== deviceId) {
            throw new https_1.HttpsError("permission-denied", "Only the active device can release this session.");
        }
        tx.set(userRef, {
            activeDeviceId: admin.firestore.FieldValue.delete(),
            sessionIssuedAt: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    return { ok: true };
});
/**
 * Upserts profile metadata for current user (non-sensitive public profile).
 */
exports.upsertUserProfile = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const username = String(req.data?.username ?? "").trim();
    const bio = String(req.data?.bio ?? "").trim();
    const profilePictureUrl = String(req.data?.profilePictureUrl ?? "").trim();
    const phoneNumber = String(req.data?.phoneNumber ?? "").trim();
    const patch = {
        uid,
        bio: bio || null,
        profilePictureUrl: profilePictureUrl || null,
        phoneNumber: phoneNumber || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Only touch `username` when the client sends a non-empty value — never write null on
    // boot upserts that omit the field (that was wiping Console edits and prior signups).
    if (username) {
        patch.username = username;
    }
    await db.collection("users").doc(uid).set(patch, { merge: true });
    return { ok: true };
});
/**
 * Prototype OTP request for email auth step-up.
 * In emulator/dev this returns `debugCode` so client can complete flow.
 */
exports.requestEmailOtp = (0, https_1.onCall)(async (req) => {
    const email = String(req.data?.email ?? "").trim().toLowerCase();
    const purpose = String(req.data?.purpose ?? "signup").trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
        throw new https_1.HttpsError("invalid-argument", "Valid email is required.");
    }
    if (!["signup", "login"].includes(purpose)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid OTP purpose.");
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
        const existingData = existing.data();
        const lastRequestedAt = existingData?.requestedAtMs ?? 0;
        if (lastRequestedAt > 0 && requestedAt - lastRequestedAt < OTP_RESEND_COOLDOWN_MS) {
            throw new https_1.HttpsError("resource-exhausted", "Please wait before requesting another OTP.");
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
    return { ok: true, expiresAt, debugCode: code };
});
/**
 * Lightweight telemetry ingestion for prototype diagnostics.
 */
exports.logClientTelemetry = (0, https_1.onCall)(async (req) => {
    await assertTelemetryIpThrottle(String(req.rawRequest?.ip ?? ""));
    const uid = String(req.auth?.uid ?? req.data?.uid ?? req.data?.demoUid ?? "").trim() || "anon";
    const type = String(req.data?.type ?? "event").trim().toLowerCase();
    const name = String(req.data?.name ?? "").trim().slice(0, 120);
    const message = String(req.data?.message ?? "").trim().slice(0, 500);
    const deviceId = String(req.data?.deviceId ?? "").trim().slice(0, 120);
    const detailsRaw = req.data?.details;
    const details = detailsRaw && typeof detailsRaw === "object"
        ? JSON.parse(JSON.stringify(detailsRaw))
        : {};
    const detailsJson = JSON.stringify(details);
    if (detailsJson.length > TELEMETRY_DETAILS_MAX_LEN) {
        throw new https_1.HttpsError("invalid-argument", "Telemetry details too large.");
    }
    const allowedTypes = new Set(["event", "error"]);
    if (!allowedTypes.has(type)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid telemetry type.");
    }
    if (!name && !message) {
        throw new https_1.HttpsError("invalid-argument", "Telemetry payload requires name or message.");
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
exports.cleanupExpiredTransientDocs = (0, scheduler_1.onSchedule)("every 15 minutes", async () => {
    const now = nowMs();
    const staleBefore = now - 1000 * 60 * 60 * 24;
    const telemetryStaleBefore = now - 1000 * 60 * 60 * 24 * 14;
    const commitDeletes = async (refs) => {
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
 * Verifies and consumes OTP for email auth step-up.
 */
exports.verifyEmailOtp = (0, https_1.onCall)(async (req) => {
    const email = String(req.data?.email ?? "").trim().toLowerCase();
    const purpose = String(req.data?.purpose ?? "signup").trim().toLowerCase();
    const code = String(req.data?.code ?? "").trim();
    if (!email || !code) {
        throw new https_1.HttpsError("invalid-argument", "email and code are required.");
    }
    const key = sha256Hex(`${purpose}|${email}`);
    const ref = db.collection("emailOtps").doc(key);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "OTP not found.");
    const otp = snap.data();
    if ((otp.attemptCount ?? 0) >= OTP_MAX_VERIFY_ATTEMPTS) {
        throw new https_1.HttpsError("resource-exhausted", "Too many OTP attempts. Request a new OTP.");
    }
    const submittedCodeHash = sha256Hex(code);
    if (otp.consumed) {
        // Idempotent verify: if caller retries same code after a transient client failure, return success.
        if (otp.consumedCodeHash && otp.consumedCodeHash === submittedCodeHash) {
            return { ok: true };
        }
        throw new https_1.HttpsError("failed-precondition", "OTP already used.");
    }
    if (otp.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "OTP expired.");
    const valid = submittedCodeHash === otp.codeHash;
    await ref.set({
        attemptCount: (otp.attemptCount ?? 0) + 1,
        consumed: valid ? true : false,
        consumedCodeHash: valid ? submittedCodeHash : null,
        consumedAt: valid ? admin.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (!valid)
        throw new https_1.HttpsError("permission-denied", "Incorrect OTP.");
    return { ok: true };
});
/**
 * Creates short-lived NFC handshake token to share as FN1.<code>.
 */
exports.createHandshake = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
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
exports.mintNfcFriendVoucher = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
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
exports.redeemNfcFriendVoucher = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const voucherCode = String(req.data?.voucherCode ?? "").trim();
    if (!/^AF1_[a-f0-9]{24}$/i.test(voucherCode)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid voucher code.");
    }
    const ref = db.collection("nfcFriendVouchers").doc(voucherCode);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Voucher not found.");
    const data = snap.data();
    if (data.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "Voucher expired.");
    if (data.consumed)
        throw new https_1.HttpsError("failed-precondition", "Voucher already used.");
    if (data.issuerUid === uid) {
        throw new https_1.HttpsError("failed-precondition", "Cannot redeem your own voucher.");
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
    await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists)
            throw new https_1.HttpsError("not-found", "Voucher not found.");
        const d = fresh.data();
        if (d.expiresAt < nowMs())
            throw new https_1.HttpsError("deadline-exceeded", "Voucher expired.");
        if (d.consumed)
            throw new https_1.HttpsError("failed-precondition", "Voucher already used.");
        if (d.issuerUid === redeemerUid) {
            throw new https_1.HttpsError("failed-precondition", "Cannot redeem your own voucher.");
        }
        const edgeRef = db.collection("friendships").doc(edgeId);
        tx.set(edgeRef, {
            participants: [issuerUid, redeemerUid].sort(),
            participantAuthUids,
            status: "accepted",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            establishedByNfcFriendVoucher: voucherCode,
        }, { merge: true });
        tx.set(ref, {
            consumed: true,
            redeemerUid,
            redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    return { ok: true, accepted: true, friendUid: issuerUid, voucherCode };
});
/**
 * Issuer polls after NFC write until Receive side redeems.
 */
exports.getNfcFriendVoucherStatus = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const voucherCode = String(req.data?.voucherCode ?? "").trim();
    if (!/^AF1_[a-f0-9]{24}$/i.test(voucherCode)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid voucher code.");
    }
    const snap = await db.collection("nfcFriendVouchers").doc(voucherCode).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Voucher not found.");
    const data = snap.data();
    if (data.issuerUid !== uid) {
        throw new https_1.HttpsError("permission-denied", "Not the voucher issuer.");
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
function bleFriendDisplayCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
function bleFriendCodeHash(sessionId, displayCode) {
    return sha256Hex(`bleFriendSession|${sessionId}|${displayCode}`);
}
/**
 * Host (issuer): creates BLE Add Friend session with random 6-digit code and `BF1_<12 hex>` session id.
 * Client shows the 6-digit code (human pairing number); Android advertises the session beacon over BLE.
 */
exports.createBleFriendSession = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const sessionId = `BF1_${(0, crypto_1.randomBytes)(6).toString("hex")}`;
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
exports.joinBleFriendSession = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const sessionId = String(req.data?.sessionId ?? "").trim();
    const displayCode = String(req.data?.displayCode ?? "").trim().replace(/\s+/g, "");
    if (!/^BF1_[a-f0-9]{12}$/i.test(sessionId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid session id.");
    }
    if (!/^\d{6}$/.test(displayCode)) {
        throw new https_1.HttpsError("invalid-argument", "Enter the 6-digit code.");
    }
    const ref = db.collection("bleFriendSessions").doc(sessionId);
    const submittedHash = bleFriendCodeHash(sessionId, displayCode);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Session not found.");
    const pre = snap.data();
    if (pre.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "Session expired.");
    if (pre.consumed)
        throw new https_1.HttpsError("failed-precondition", "Session already used.");
    if (pre.issuerUid === uid) {
        throw new https_1.HttpsError("failed-precondition", "Cannot join your own session.");
    }
    if ((pre.wrongAttempts ?? 0) >= BLE_JOIN_MAX_CODE_ATTEMPTS) {
        throw new https_1.HttpsError("resource-exhausted", "Too many incorrect codes.");
    }
    if (pre.codeHash !== submittedHash) {
        await ref.set({
            wrongAttempts: (pre.wrongAttempts ?? 0) + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        throw new https_1.HttpsError("permission-denied", "Incorrect code.");
    }
    const issuerUid = pre.issuerUid;
    const redeemerUid = uid;
    const edgeId = friendshipId(issuerUid, redeemerUid);
    const participantAuthUids = await resolveParticipantAuthUids([issuerUid, redeemerUid]);
    await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const d = fresh.data();
        if (d.expiresAt < nowMs())
            throw new https_1.HttpsError("deadline-exceeded", "Session expired.");
        if (d.consumed)
            throw new https_1.HttpsError("failed-precondition", "Session already used.");
        if (d.issuerUid === redeemerUid) {
            throw new https_1.HttpsError("failed-precondition", "Cannot join your own session.");
        }
        if (d.codeHash !== submittedHash) {
            throw new https_1.HttpsError("permission-denied", "Incorrect code.");
        }
        const edgeRef = db.collection("friendships").doc(edgeId);
        tx.set(edgeRef, {
            participants: [issuerUid, redeemerUid].sort(),
            participantAuthUids,
            status: "accepted",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            establishedByBleFriendSession: sessionId,
        }, { merge: true });
        tx.set(ref, {
            consumed: true,
            redeemerUid,
            redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    return { ok: true, accepted: true, friendUid: issuerUid, sessionId };
});
/** Issuer polls until joiner completes `joinBleFriendSession`. */
exports.getBleFriendSessionStatus = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const sessionId = String(req.data?.sessionId ?? "").trim();
    if (!/^BF1_[a-f0-9]{12}$/i.test(sessionId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid session id.");
    }
    const snap = await db.collection("bleFriendSessions").doc(sessionId).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Session not found.");
    const data = snap.data();
    if (data.issuerUid !== uid) {
        throw new https_1.HttpsError("permission-denied", "Not the session host.");
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
exports.peekBleFriendSessionForJoin = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const sessionId = String(req.data?.sessionId ?? "").trim();
    if (!/^BF1_[a-f0-9]{12}$/i.test(sessionId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid session id.");
    }
    const snap = await db.collection("bleFriendSessions").doc(sessionId).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Session not found.");
    const data = snap.data();
    if (data.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "Session expired.");
    if (data.consumed)
        throw new https_1.HttpsError("failed-precondition", "Session already used.");
    if (data.issuerUid === uid) {
        throw new https_1.HttpsError("failed-precondition", "Cannot join your own session.");
    }
    const displayCode = String(data.displayCode ?? "").trim();
    if (!/^\d{6}$/.test(displayCode)) {
        throw new https_1.HttpsError("failed-precondition", "This session has no pairing code on file. Ask your friend to start a new Share session.");
    }
    return { ok: true, sessionId, displayCode };
});
/** NFC phone-to-phone: 4-digit PIN reserved server-side (doc id = pin) for minimal tag payload. */
const NFC_PIN_PAIR_TTL_MS = 1000 * 60 * 5;
/** After scanner validates (proximity + phase 1), allow long in-app confirm; PIN doc TTL is extended (not the short mint TTL). */
const NFC_PIN_PAIR_AWAIT_DUAL_CONFIRM_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
function normalizeNfcPinPairPin(raw) {
    const pin = String(raw ?? "").trim().replace(/\s+/g, "");
    if (!/^\d{4}$/.test(pin)) {
        throw new https_1.HttpsError("invalid-argument", "PIN must be exactly 4 digits.");
    }
    return pin;
}
/**
 * Issuer: claim a 4-digit PIN for a pending NFC pair. Fails with `failed-precondition` / "PIN unavailable"
 * if another issuer holds an active reservation (client silently regenerates).
 */
exports.registerNfcPinPairOffer = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const pin = normalizeNfcPinPairPin(req.data?.pin);
    const proximityEvidence = normalizePairingProximityEvidence(req.data?.proximityEvidence);
    const ref = db.collection("nfcPinPairSessions").doc(pin);
    const expiresAt = nowMs() + NFC_PIN_PAIR_TTL_MS;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
            const d = snap.data();
            const active = !d.consumed && (d.expiresAt ?? 0) > nowMs();
            if (active && d.issuerUid && d.issuerUid !== uid) {
                throw new https_1.HttpsError("failed-precondition", "PIN unavailable");
            }
        }
        tx.set(ref, {
            pin,
            issuerUid: uid,
            issuerDeviceId: deviceId,
            issuerProximityEvidence: proximityEvidence,
            expiresAt,
            consumed: false,
            redeemerUid: null,
            scannerConfirmed: false,
            issuerConfirmed: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    return { ok: true, pin, expiresAt };
});
/**
 * Abort pairing: issuer may cancel before scanner confirms; either participant may cancel during
 * dual-confirm (after scanner phase 1). Deletes the session so the other device sees offer gone.
 */
exports.cancelNfcPinPairOffer = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const pin = normalizeNfcPinPairPin(req.data?.pin);
    const ref = db.collection("nfcPinPairSessions").doc(pin);
    const snap = await ref.get();
    if (!snap.exists)
        return { ok: true, released: false };
    const d = snap.data();
    if (d.consumed)
        return { ok: true, released: false };
    const issuer = String(d.issuerUid ?? "").trim();
    const redeemer = String(d.redeemerUid ?? "").trim();
    const isIssuer = issuer === uid;
    const isRedeemer = !!redeemer && redeemer === uid;
    const allowed = isIssuer ||
        (isRedeemer && Boolean(d.scannerConfirmed));
    if (!allowed) {
        throw new https_1.HttpsError("permission-denied", "Cannot cancel this pairing session.");
    }
    await ref.delete();
    return { ok: true, released: true };
});
/** Issuer: poll until joiner confirms. */
exports.getNfcPinPairOfferStatus = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const pin = normalizeNfcPinPairPin(req.data?.pin);
    const snap = await db.collection("nfcPinPairSessions").doc(pin).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Offer not found.");
    const data = snap.data();
    const redeemerUid = data.redeemerUid?.trim() || null;
    const isIssuer = data.issuerUid === uid;
    const isRedeemer = !!redeemerUid && redeemerUid === uid;
    if (!isIssuer && !isRedeemer) {
        throw new https_1.HttpsError("permission-denied", "Not a participant in this pairing offer.");
    }
    if (data.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "Offer expired.");
    let status = data.scannerConfirmed && redeemerUid
        ? "awaiting_issuer_confirm"
        : "pending";
    if (data.consumed && redeemerUid) {
        const edgeSnap = await db
            .collection("friendships")
            .doc(friendshipId(data.issuerUid, redeemerUid))
            .get();
        const edgeStatus = edgeSnap.data()?.status;
        status = edgeSnap.exists && edgeStatus === "accepted" ? "joined" : "awaiting_issuer_confirm";
    }
    return {
        ok: true,
        pin,
        status,
        issuerUid: data.issuerUid,
        redeemerUid,
        expiresAt: data.expiresAt,
    };
});
/** Scanner preview: returns issuer identity so scanner can confirm before redeem. */
exports.previewNfcPinPairOffer = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const pin = normalizeNfcPinPairPin(req.data?.pin);
    const snap = await db.collection("nfcPinPairSessions").doc(pin).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Offer not found.");
    const data = snap.data();
    if (data.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "Offer expired.");
    if (data.consumed)
        throw new https_1.HttpsError("failed-precondition", "Offer already used.");
    if (data.issuerUid === uid) {
        throw new https_1.HttpsError("failed-precondition", "Cannot join your own offer.");
    }
    const userSnap = await db.collection("users").doc(data.issuerUid).get();
    const profile = (userSnap.data() ?? {});
    return {
        ok: true,
        issuerUid: data.issuerUid,
        username: String(profile.username ?? "").trim() || `User ${data.issuerUid.slice(0, 6)}`,
        profilePictureUrl: String(profile.profilePictureUrl ?? "").trim() || null,
        expiresAt: data.expiresAt,
    };
});
/** Joiner confirm (phase 1/2): verifies proximity and waits for issuer final confirm. */
exports.confirmNfcPinPairOffer = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const pin = normalizeNfcPinPairPin(req.data?.pin);
    const scannerEvidence = normalizePairingProximityEvidence(req.data?.proximityEvidence);
    const ref = db.collection("nfcPinPairSessions").doc(pin);
    const issuerUid = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists)
            throw new https_1.HttpsError("not-found", "Offer not found.");
        const d = fresh.data();
        if (d.expiresAt < nowMs())
            throw new https_1.HttpsError("deadline-exceeded", "Offer expired.");
        if (d.consumed)
            throw new https_1.HttpsError("failed-precondition", "Offer already used.");
        if (d.issuerUid === uid) {
            throw new https_1.HttpsError("failed-precondition", "Cannot join your own offer.");
        }
        if (d.redeemerUid && d.redeemerUid !== uid) {
            throw new https_1.HttpsError("failed-precondition", "Offer already claimed by another user.");
        }
        if (d.scannerConfirmed && d.redeemerUid === uid) {
            return d.issuerUid;
        }
        const issuerEvidence = normalizePairingProximityEvidence(d.issuerProximityEvidence);
        const issuerGpsUsable = isGpsEvidenceUsable(issuerEvidence);
        const scannerGpsUsable = isGpsEvidenceUsable(scannerEvidence);
        if (issuerGpsUsable && scannerGpsUsable) {
            const separationM = haversineMeters(issuerEvidence.lat, issuerEvidence.lng, scannerEvidence.lat, scannerEvidence.lng);
            const combinedUncertaintyM = Math.sqrt(Math.pow(issuerEvidence.horizontalAccuracyM, 2) +
                Math.pow(scannerEvidence.horizontalAccuracyM, 2));
            const dynamicToleranceM = PROXIMITY_GPS_UNCERTAINTY_MULTIPLIER * combinedUncertaintyM;
            const allowedGpsRadiusM = Math.min(PROXIMITY_MAX_DISTANCE_M, Math.max(0, dynamicToleranceM));
            if (separationM > allowedGpsRadiusM) {
                throw new https_1.HttpsError("failed-precondition", "Could not verify in-person proximity (GPS distance exceeds 100m cap).");
            }
        }
        else if (!hasSameWifiSubnetFallback(issuerEvidence, scannerEvidence)) {
            throw new https_1.HttpsError("failed-precondition", "Could not verify proximity with GPS. Connect both phones to the same Wi-Fi network (personal hotspot also counts) and try again.");
        }
        const issuer = d.issuerUid;
        const redeemerUid = uid;
        const extendedExpiresAt = nowMs() + NFC_PIN_PAIR_AWAIT_DUAL_CONFIRM_MS;
        tx.set(ref, {
            scannerConfirmed: true,
            redeemerUid,
            scannerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: extendedExpiresAt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return issuer;
    });
    return { ok: true, accepted: true, pendingIssuerConfirm: true, friendUid: issuerUid, pin };
});
/** Issuer confirm (phase 2/2): finalizes friendship only after both explicit confirms. */
exports.finalizeNfcPinPairOffer = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const pin = normalizeNfcPinPairPin(req.data?.pin);
    const ref = db.collection("nfcPinPairSessions").doc(pin);
    // Non-transactional pre-read to discover the redeemer so we can resolve
    // `participantAuthUids` before entering the transaction. The redeemer field
    // is only ever set once (by `confirmNfcPinPairOffer` on the scanner side),
    // so this read is monotonic with respect to the tx that follows: if the
    // redeemer isn't set yet we re-throw the same precondition error from
    // inside the tx and the client retries.
    const preSnap = await ref.get();
    const preData = (preSnap.data() ?? {});
    const tentativeRedeemer = (preData.redeemerUid ?? "").trim();
    const preResolvedAuthUids = tentativeRedeemer && tentativeRedeemer !== uid
        ? await resolveParticipantAuthUids([uid, tentativeRedeemer])
        : [];
    const redeemerUid = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists)
            throw new https_1.HttpsError("not-found", "Offer not found.");
        const d = fresh.data();
        if (d.issuerUid !== uid) {
            throw new https_1.HttpsError("permission-denied", "Not your pairing offer.");
        }
        if (d.expiresAt < nowMs())
            throw new https_1.HttpsError("deadline-exceeded", "Offer expired.");
        const redeemer = d.redeemerUid?.trim() || "";
        if (!d.scannerConfirmed || !redeemer) {
            throw new https_1.HttpsError("failed-precondition", "Waiting for scanner confirmation.");
        }
        const edgeRef = db.collection("friendships").doc(friendshipId(uid, redeemer));
        const edgeSnap = await tx.get(edgeRef);
        const friendshipOk = edgeSnap.exists && edgeSnap.data()?.status === "accepted";
        if (d.consumed && friendshipOk) {
            return redeemer;
        }
        if (d.consumed && !friendshipOk) {
            // Pairing session was consumed earlier but friendship was deleted (e.g. manual
            // Firestore wipe). Repair by re-writing the edge instead of returning success.
        }
        else if (d.consumed) {
            throw new https_1.HttpsError("failed-precondition", "Offer already used.");
        }
        // If the redeemer changed between pre-read and tx (shouldn't happen
        // because the field is write-once on the offer, but defensive), the
        // mirror would be stale — fall back to a fresh resolve. `db.getAll`
        // inside a tx is a non-transactional read; that's intentional because
        // `userFirebaseAuthMap` is write-once-stable and doesn't need
        // serialisable reads.
        const participantAuthUids = redeemer === tentativeRedeemer
            ? preResolvedAuthUids
            : await resolveParticipantAuthUids([uid, redeemer]);
        tx.set(edgeRef, {
            participants: [uid, redeemer].sort(),
            participantAuthUids,
            status: "accepted",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            establishedByNfcPinPair: pin,
        }, { merge: true });
        tx.set(ref, {
            issuerConfirmed: true,
            consumed: true,
            redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return redeemer;
    });
    void (0, socialExtensions_1.refreshPresenceAfterFriendshipPair)(uid, redeemerUid).catch(() => undefined);
    return { ok: true, accepted: true, friendUid: redeemerUid, pin };
});
// -----------------------------------------------------------------------------
// LEGACY — HS2 multi-tap NFC (no longer used by the mobile app; kept for rollback).
// Callables: beginNfcHandshakeSession, respondNfcHandshakeSession,
// getNfcHandshakeSessionStatus, finalizeNfcHandshakeSession
// -----------------------------------------------------------------------------
/**
 * New protocol: begins NFC handshake session with initiator nonce.
 */
exports.beginNfcHandshakeSession = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
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
exports.respondNfcHandshakeSession = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const sessionId = String(req.data?.sessionId ?? "").trim();
    const initiatorNonce = String(req.data?.initiatorNonce ?? "").trim();
    if (!sessionId || !initiatorNonce) {
        throw new https_1.HttpsError("invalid-argument", "sessionId and initiatorNonce are required.");
    }
    const ref = db.collection("handshakeSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Handshake session not found.");
    const data = snap.data();
    if (data.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "Handshake session expired.");
    if (data.initiatorUid === uid)
        throw new https_1.HttpsError("failed-precondition", "Cannot respond to your own session.");
    if (data.initiatorNonce !== initiatorNonce)
        throw new https_1.HttpsError("permission-denied", "Handshake nonce mismatch.");
    if (data.responderUid && data.responderUid !== uid) {
        throw new https_1.HttpsError("failed-precondition", "Handshake already has a different responder.");
    }
    const responderNonce = data.responderNonce?.trim() || randomNonceHex(16);
    await ref.set({
        responderUid: uid,
        responderDeviceId: deviceId,
        responderNonce,
        status: "responded",
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, sessionId, responderNonce, initiatorUid: data.initiatorUid };
});
/**
 * New protocol helper: initiator/responder can poll session status for fallback finalize.
 */
exports.getNfcHandshakeSessionStatus = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const sessionId = String(req.data?.sessionId ?? "").trim();
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "sessionId is required.");
    }
    const snap = await db.collection("handshakeSessions").doc(sessionId).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Handshake session not found.");
    const data = snap.data();
    if (uid !== data.initiatorUid && uid !== data.responderUid) {
        throw new https_1.HttpsError("permission-denied", "Caller must be session participant.");
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
exports.finalizeNfcHandshakeSession = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const sessionId = String(req.data?.sessionId ?? "").trim();
    const peerNonce = String(req.data?.peerNonce ?? "").trim();
    if (!sessionId || !peerNonce) {
        throw new https_1.HttpsError("invalid-argument", "sessionId and peerNonce are required.");
    }
    const ref = db.collection("handshakeSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Handshake session not found.");
    const data = snap.data();
    if (data.expiresAt < nowMs())
        throw new https_1.HttpsError("deadline-exceeded", "Handshake session expired.");
    const responderUid = data.responderUid?.trim();
    if (!responderUid)
        throw new https_1.HttpsError("failed-precondition", "Responder not registered yet.");
    if (uid !== data.initiatorUid && uid !== responderUid) {
        throw new https_1.HttpsError("permission-denied", "Caller must be initiator or responder.");
    }
    const expectedPeerNonce = uid === data.initiatorUid ? data.responderNonce ?? "" : data.initiatorNonce;
    if (!expectedPeerNonce || expectedPeerNonce !== peerNonce) {
        throw new https_1.HttpsError("permission-denied", "Peer nonce mismatch.");
    }
    const edgeId = friendshipId(data.initiatorUid, responderUid);
    const participantAuthUids = await resolveParticipantAuthUids([data.initiatorUid, responderUid]);
    await db.runTransaction(async (tx) => {
        const edgeRef = db.collection("friendships").doc(edgeId);
        tx.set(edgeRef, {
            participants: [data.initiatorUid, responderUid].sort(),
            participantAuthUids,
            status: "accepted",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            establishedByHandshakeSession: sessionId,
        }, { merge: true });
        tx.set(ref, {
            status: "finalized",
            finalizedByUid: uid,
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    const friendUid = uid === data.initiatorUid ? responderUid : data.initiatorUid;
    return { ok: true, accepted: true, friendUid, sessionId };
});
/**
 * Consumes NFC handshake and creates accepted friendship edge.
 */
exports.consumeHandshake = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const receiverDeviceId = String(req.data?.receiverDeviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, receiverDeviceId);
    const rawCode = String(req.data?.handshakeCode ?? "");
    const handshakeCode = normalizeHandshakeCode(rawCode);
    if (!/^H_[A-Za-z0-9]{8,}$/.test(handshakeCode)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid handshake code.");
    }
    const hsRef = db.collection("handshakes").doc(handshakeCode);
    const hsSnap = await hsRef.get();
    if (!hsSnap.exists) {
        throw new https_1.HttpsError("not-found", "Handshake not found.");
    }
    const hs = hsSnap.data();
    if (hs.ownerUid === uid) {
        throw new https_1.HttpsError("failed-precondition", "Cannot consume your own handshake.");
    }
    if (hs.consumed) {
        throw new https_1.HttpsError("failed-precondition", "Handshake already consumed.");
    }
    if (hs.expiresAt < nowMs()) {
        throw new https_1.HttpsError("deadline-exceeded", "Handshake expired.");
    }
    const edgeId = friendshipId(uid, hs.ownerUid);
    const participantAuthUids = await resolveParticipantAuthUids([uid, hs.ownerUid]);
    await db.runTransaction(async (tx) => {
        const edgeRef = db.collection("friendships").doc(edgeId);
        tx.set(edgeRef, {
            participants: [uid, hs.ownerUid].sort(),
            participantAuthUids,
            status: "accepted",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            establishedByHandshake: handshakeCode,
        }, { merge: true });
        tx.set(hsRef, { consumed: true, consumedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    return { ok: true, accepted: true, friendUid: hs.ownerUid };
});
/**
 * Emulator helper: create accepted friendship edges between caller and known friend UIDs.
 * Keep this for local testing only; remove before production rollout.
 */
exports.seedDemoFriendships = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const friendUids = Array.isArray(req.data?.friendUids)
        ? req.data.friendUids.map((x) => String(x)).filter(Boolean)
        : [];
    const batch = db.batch();
    for (const friendUid of friendUids) {
        if (!friendUid || friendUid === uid)
            continue;
        const participantAuthUids = await resolveParticipantAuthUids([uid, friendUid]);
        const edgeRef = db.collection("friendships").doc(friendshipId(uid, friendUid));
        batch.set(edgeRef, {
            participants: [uid, friendUid].sort(),
            participantAuthUids,
            status: "accepted",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            seededForDemo: true,
        }, { merge: true });
    }
    await batch.commit();
    return { ok: true, count: friendUids.length };
});
/**
 * Ensures a conversation document exists with expected participants.
 */
exports.upsertConversation = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    const participantUids = Array.isArray(req.data?.participantUids)
        ? req.data.participantUids.map((x) => String(x)).filter(Boolean)
        : [];
    if (!conversationId)
        throw new https_1.HttpsError("invalid-argument", "conversationId is required.");
    if (!participantUids.includes(uid)) {
        throw new https_1.HttpsError("invalid-argument", "Caller must be in participantUids.");
    }
    for (const otherUid of participantUids) {
        await assertAcceptedFriendship(uid, otherUid);
    }
    const uniqueParticipants = [...new Set(participantUids)].sort();
    const participantAuthUids = await resolveParticipantAuthUids(uniqueParticipants);
    const existing = await db.collection("conversations").doc(conversationId).get();
    const existingData = existing.data();
    const createdBy = existingData?.createdBy ?? uid;
    const adminIds = existingData?.adminIds?.length ? existingData.adminIds : [createdBy];
    const memberJoinedAt = { ...(existingData?.memberJoinedAt ?? {}) };
    const now = nowMs();
    // Only stamp join time for the caller. Setting every participant's cutoff when
    // someone else sends would hide the first message on the recipient's device.
    if (memberJoinedAt[uid] == null) {
        memberJoinedAt[uid] = now;
    }
    await db.collection("conversations").doc(conversationId).set({
        conversationId,
        participantUids: uniqueParticipants,
        participantAuthUids,
        createdBy,
        adminIds,
        memberJoinedAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, createdBy, adminIds, memberJoinedAt };
});
/**
 * Publishes the user's asymmetric encryption public key bundle.
 */
exports.publishUserKeyBundle = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const keyVersion = Number(req.data?.keyVersion);
    const encryptionPublicKey = String(req.data?.encryptionPublicKey ?? "").trim();
    const identitySigningPublicKey = String(req.data?.identitySigningPublicKey ?? "").trim();
    if (!Number.isInteger(keyVersion) || keyVersion < 1) {
        throw new https_1.HttpsError("invalid-argument", "keyVersion must be an integer >= 1.");
    }
    if (!encryptionPublicKey || !identitySigningPublicKey) {
        throw new https_1.HttpsError("invalid-argument", "Public keys are required.");
    }
    await db.collection("users").doc(uid).set({
        keyBundle: {
            keyVersion,
            encryptionPublicKey,
            identitySigningPublicKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });
    return { ok: true };
});
/**
 * Stores caller's E2EE private key bundle ciphertext (client-encrypted).
 * Enables silent key restore after reinstall when Firebase Auth is unchanged.
 */
exports.putUserKeyBackup = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const ciphertext = String(req.data?.ciphertext ?? "").trim();
    const nonce = String(req.data?.nonce ?? "").trim();
    if (!ciphertext || !nonce) {
        throw new https_1.HttpsError("invalid-argument", "ciphertext and nonce are required.");
    }
    if (ciphertext.length > 16_000 || nonce.length > 128) {
        throw new https_1.HttpsError("invalid-argument", "backup payload too large.");
    }
    await db.collection("users").doc(uid).set({
        keyBackup: {
            v: 1,
            ciphertext,
            nonce,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });
    return { ok: true };
});
/**
 * Returns encrypted key backup for the authenticated user (if any).
 */
exports.getUserKeyBackup = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const snap = await db.collection("users").doc(uid).get();
    const backup = (snap.data()?.keyBackup ?? null);
    if (!backup?.ciphertext || !backup?.nonce) {
        return { ciphertext: null, nonce: null };
    }
    return { ciphertext: backup.ciphertext, nonce: backup.nonce };
});
/**
 * Encrypted snapshot of decrypted chats/messages/posts for fast reinstall UI.
 */
exports.putUserSocialSnapshot = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const ciphertext = String(req.data?.ciphertext ?? "").trim();
    const nonce = String(req.data?.nonce ?? "").trim();
    if (!ciphertext || !nonce) {
        throw new https_1.HttpsError("invalid-argument", "ciphertext and nonce are required.");
    }
    if (ciphertext.length > 900_000 || nonce.length > 128) {
        throw new https_1.HttpsError("invalid-argument", "snapshot payload too large.");
    }
    await db.collection("users").doc(uid).set({
        socialSnapshot: {
            v: 1,
            ciphertext,
            nonce,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });
    return { ok: true };
});
exports.getUserSocialSnapshot = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const snap = await db.collection("users").doc(uid).get();
    const row = (snap.data()?.socialSnapshot ?? null);
    if (!row?.ciphertext || !row?.nonce) {
        return { ciphertext: null, nonce: null };
    }
    return { ciphertext: row.ciphertext, nonce: row.nonce };
});
/**
 * Stores fully encrypted profile blob. Only friend recipients should be present in envelopes.
 */
exports.putEncryptedProfile = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const ciphertext = String(req.data?.ciphertext ?? "");
    const nonce = String(req.data?.nonce ?? "");
    const envelopes = (req.data?.envelopes ?? {});
    assertReasonableCiphertext(ciphertext);
    if (!nonce)
        throw new https_1.HttpsError("invalid-argument", "nonce is required.");
    if (!envelopes || typeof envelopes !== "object") {
        throw new https_1.HttpsError("invalid-argument", "envelopes map is required.");
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
exports.createEncryptedPost = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const ciphertext = String(req.data?.ciphertext ?? "");
    const nonce = String(req.data?.nonce ?? "");
    const envelopes = (req.data?.envelopes ?? {});
    const mediaObjectPath = String(req.data?.mediaObjectPath ?? "");
    assertReasonableCiphertext(ciphertext);
    if (!nonce)
        throw new https_1.HttpsError("invalid-argument", "nonce is required.");
    if (!envelopes[uid])
        throw new https_1.HttpsError("invalid-argument", "Sender envelope is required.");
    const recipientUids = Object.keys(envelopes);
    await Promise.all(recipientUids.map((recipientUid) => assertAcceptedFriendship(uid, recipientUid)));
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
        envelopes,
        mediaObjectPath: mediaObjectPath || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, postId: postRef.id };
});
/**
 * Permanently removes an encrypted post doc so it disappears for all recipients.
 */
exports.deleteEncryptedPost = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const postId = String(req.data?.postId ?? "").trim();
    if (!postId)
        throw new https_1.HttpsError("invalid-argument", "postId is required.");
    const postRef = db.collection("encryptedPosts").doc(postId);
    const snap = await postRef.get();
    if (!snap.exists) {
        return { ok: true };
    }
    const data = snap.data();
    if (data.ownerUid !== uid) {
        throw new https_1.HttpsError("permission-denied", "Only the post owner can delete this post.");
    }
    await postRef.delete();
    return { ok: true };
});
/**
 * Sends encrypted message in existing friend conversation.
 */
exports.sendEncryptedMessage = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const conversationId = String(req.data?.conversationId ?? "");
    const ciphertext = String(req.data?.ciphertext ?? "");
    const nonce = String(req.data?.nonce ?? "");
    const envelopes = (req.data?.envelopes ?? {});
    if (!conversationId)
        throw new https_1.HttpsError("invalid-argument", "conversationId is required.");
    assertReasonableCiphertext(ciphertext);
    if (!nonce)
        throw new https_1.HttpsError("invalid-argument", "nonce is required.");
    const convRef = db.collection("conversations").doc(conversationId);
    let convSnap = await convRef.get();
    const requestedParticipants = Array.isArray(req.data?.participantUids)
        ? [...new Set(req.data.participantUids.map((x) => String(x ?? "").trim()).filter(Boolean))].sort()
        : [];
    if (!convSnap.exists) {
        if (requestedParticipants.length < 2 || !requestedParticipants.includes(uid)) {
            throw new https_1.HttpsError("failed-precondition", "Conversation not found. Reopen the chat and try again.");
        }
        for (const otherUid of requestedParticipants) {
            if (otherUid !== uid)
                await assertAcceptedFriendship(uid, otherUid);
        }
        const participantAuthUidsBootstrap = await resolveParticipantAuthUids(requestedParticipants);
        const nowBootstrap = nowMs();
        const memberJoinedAtBootstrap = { [uid]: nowBootstrap };
        await convRef.set({
            conversationId,
            participantUids: requestedParticipants,
            participantAuthUids: participantAuthUidsBootstrap,
            createdBy: uid,
            adminIds: [uid],
            memberJoinedAt: memberJoinedAtBootstrap,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        convSnap = await convRef.get();
    }
    const conv = convSnap.data();
    let participants = conv.participantUids ?? [];
    if (requestedParticipants.length >= 2 && requestedParticipants.includes(uid)) {
        for (const otherUid of requestedParticipants) {
            if (otherUid !== uid)
                await assertAcceptedFriendship(uid, otherUid);
        }
        participants = requestedParticipants;
    }
    if (!participants.includes(uid)) {
        throw new https_1.HttpsError("permission-denied", "User is not in this conversation.");
    }
    for (const participantUid of participants) {
        if (!envelopes[participantUid]) {
            throw new https_1.HttpsError("invalid-argument", "Envelope missing for a participant.");
        }
        if (participantUid !== uid)
            await assertAcceptedFriendship(uid, participantUid);
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
    await convRef.set({ participantUids: participants, participantAuthUids, memberJoinedAt }, { merge: true });
    const requestedMessageId = String(req.data?.messageId ?? "").trim();
    if (requestedMessageId && !/^[a-zA-Z0-9_-]{1,128}$/.test(requestedMessageId)) {
        throw new https_1.HttpsError("invalid-argument", "messageId format is invalid.");
    }
    const msgRef = requestedMessageId
        ? convRef.collection("messages").doc(requestedMessageId)
        : convRef.collection("messages").doc();
    const msgSnap = requestedMessageId ? await msgRef.get() : null;
    if (msgSnap?.exists) {
        const existing = msgSnap.data();
        if (existing.senderUid !== uid) {
            throw new https_1.HttpsError("permission-denied", "messageId already in use.");
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
    void (0, socialExtensions_1.notifyConversationParticipantsPush)({
        senderUid: uid,
        conversationId,
        participantUids: participants,
        previewText: "New message",
    });
    return { ok: true, messageId: msgRef.id, joinCutoffMs: joinCutoff };
});
/**
 * Returns public key bundles for friends only.
 */
exports.getFriendKeyBundles = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const friendUids = Array.isArray(req.data?.friendUids)
        ? req.data.friendUids.map((x) => String(x))
        : [];
    const unique = [...new Set(friendUids.filter((id) => id.startsWith("u_")))];
    const entries = await Promise.all(unique.map(async (friendUid) => {
        try {
            await assertAcceptedFriendship(uid, friendUid);
            const snap = await db.collection("users").doc(friendUid).get();
            const keyBundle = snap.data()?.keyBundle ?? null;
            return [friendUid, keyBundle];
        }
        catch {
            return [friendUid, null];
        }
    }));
    return {
        keyBundles: Object.fromEntries(entries),
    };
});
/**
 * Reads encrypted profile blob for self or accepted friend.
 */
exports.getEncryptedProfile = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const targetUid = String(req.data?.targetUid ?? uid).trim() || uid;
    if (targetUid !== uid) {
        await assertAcceptedFriendship(uid, targetUid);
    }
    const snap = await db.collection("encryptedProfiles").doc(targetUid).get();
    if (!snap.exists)
        return { profile: null };
    const data = snap.data();
    const envelope = data.envelopes?.[uid];
    if (!envelope) {
        throw new https_1.HttpsError("permission-denied", "No envelope for caller.");
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
exports.listEncryptedPosts = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const limit = Math.max(1, Math.min(500, Number(req.data?.limit ?? 200)));
    const sinceMs = parseSinceMs(req.data?.sinceMs);
    const beforeMs = parseSinceMs(req.data?.beforeMs);
    let query = db
        .collection("encryptedPosts")
        .where("recipientUids", "array-contains", uid);
    if (sinceMs != null) {
        query = query
            .where("createdAt", ">", admin.firestore.Timestamp.fromMillis(sinceMs))
            .orderBy("createdAt", "asc");
    }
    else if (beforeMs != null) {
        query = query
            .where("createdAt", "<", admin.firestore.Timestamp.fromMillis(beforeMs))
            .orderBy("createdAt", "desc");
    }
    else {
        query = query.orderBy("createdAt", "desc");
    }
    const snap = await query.limit(limit + 1).get();
    // Opportunistic backfill: amortise the `recipientAuthUids` migration across
    // existing read traffic so older posts gain the mirror field needed by the
    // client `onSnapshot` listener. Skips docs that already carry the field.
    // Best-effort — failures are swallowed because clients still get the
    // payload via this callable response regardless.
    const staleDocs = snap.docs.filter((doc) => {
        const data = doc.data();
        if (!Array.isArray(data.recipientUids))
            return false;
        const existing = data.recipientAuthUids;
        return !Array.isArray(existing) || existing.length === 0;
    });
    if (staleDocs.length > 0) {
        const writer = db.batch();
        let pending = 0;
        for (const doc of staleDocs) {
            const data = doc.data();
            const authUids = await resolveParticipantAuthUids(data.recipientUids ?? []);
            if (authUids.length === 0)
                continue;
            writer.set(doc.ref, { recipientAuthUids: authUids }, { merge: true });
            pending++;
            if (pending >= 400)
                break;
        }
        if (pending > 0) {
            try {
                await writer.commit();
            }
            catch {
                /* backfill is best-effort */
            }
        }
    }
    let items = snap.docs
        .map((doc) => {
        const data = doc.data();
        const envelope = data.envelopes?.[uid];
        if (!envelope)
            return null;
        return {
            postId: data.postId || doc.id,
            ownerUid: data.ownerUid,
            ciphertext: data.ciphertext,
            nonce: data.nonce,
            envelope,
            createdAtMs: timestampToMs(data.createdAt),
        };
    })
        .filter((x) => !!x);
    items = await (0, socialExtensions_1.filterPostItemsByFriendship)(uid, items);
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const reactionSnaps = await Promise.all(page.slice(0, 100).map((item) => db.collection("encryptedPostReactions").doc(item.postId).get()));
    const reactionsByPostId = {};
    reactionSnaps.forEach((snap, idx) => {
        if (!snap.exists)
            return;
        const postId = page[idx]?.postId;
        if (!postId)
            return;
        reactionsByPostId[postId] = (snap.data()?.reactions ?? {});
    });
    return { items: page, reactionsByPostId, incremental: sinceMs != null, hasMore };
});
async function hiddenConversationIdsForUser(uid) {
    const snap = await db.collection("users").doc(uid).get();
    const raw = (snap.data()?.hiddenConversationIds ?? []);
    if (!Array.isArray(raw))
        return new Set();
    return new Set(raw.map((x) => String(x ?? "").trim()).filter(Boolean));
}
/**
 * Tombstones a conversation for this user so sync skips it after delete/reinstall.
 */
exports.hideConversationForUser = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const conversationId = String(req.data?.conversationId ?? "").trim();
    if (!conversationId) {
        throw new https_1.HttpsError("invalid-argument", "conversationId is required.");
    }
    await db.collection("users").doc(uid).set({
        hiddenConversationIds: admin.firestore.FieldValue.arrayUnion(conversationId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
});
/**
 * Removes conversation tombstones so sync and the chat list work again after
 * the user re-opens or continues a 1:1 thread with the same friend.
 */
exports.unhideConversationForUser = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const single = String(req.data?.conversationId ?? "").trim();
    const fromArray = Array.isArray(req.data?.conversationIds)
        ? req.data.conversationIds.map((x) => String(x ?? "").trim()).filter(Boolean)
        : [];
    const unique = [...new Set([...(single ? [single] : []), ...fromArray])].slice(0, 50);
    if (unique.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "conversationId or conversationIds is required.");
    }
    await db.collection("users").doc(uid).set({
        hiddenConversationIds: admin.firestore.FieldValue.arrayRemove(...unique),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, conversationIds: unique };
});
/**
 * Returns conversation ids the caller has tombstoned (server-side hide list).
 */
exports.getHiddenConversationIds = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const hidden = await hiddenConversationIdsForUser(uid);
    return { conversationIds: [...hidden] };
});
/**
 * Reads encrypted messages for conversations where caller is a participant.
 */
exports.listEncryptedMessages = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const limit = Math.max(1, Math.min(1000, Number(req.data?.limit ?? 400)));
    const sinceMs = parseSinceMs(req.data?.sinceMs);
    const hiddenConversations = await hiddenConversationIdsForUser(uid);
    const convCutoffs = new Map();
    const mapMessageDoc = async (doc) => {
        const data = doc.data();
        const envelope = data.envelopes?.[uid];
        if (!envelope)
            return null;
        const conversationId = doc.ref.parent.parent?.id ?? "";
        if (!conversationId)
            return null;
        if (hiddenConversations.has(conversationId))
            return null;
        let cutoff = convCutoffs.get(conversationId);
        if (cutoff === undefined) {
            const convSnap = await db.collection("conversations").doc(conversationId).get();
            const convData = convSnap.data();
            const participants = convData?.participantUids ?? [];
            if (participants.length > 0 && !participants.includes(uid)) {
                convCutoffs.set(conversationId, Number.MAX_SAFE_INTEGER);
                return null;
            }
            const joined = convData?.memberJoinedAt ?? {};
            cutoff = typeof joined[uid] === "number" ? joined[uid] : 0;
            convCutoffs.set(conversationId, cutoff);
        }
        const createdAtMs = timestampToMs(data.createdAt);
        if (createdAtMs < cutoff && data.senderUid === uid)
            return null;
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
    let docs = [];
    if (sinceMs != null) {
        const sinceTs = admin.firestore.Timestamp.fromMillis(sinceMs);
        const [createdSnap, editedSnap] = await Promise.all([
            db
                .collectionGroup("messages")
                .where("participantUids", "array-contains", uid)
                .where("createdAt", ">", sinceTs)
                .orderBy("createdAt", "asc")
                .limit(limit)
                .get(),
            db
                .collectionGroup("messages")
                .where("participantUids", "array-contains", uid)
                .where("editedAt", ">", sinceMs)
                .orderBy("editedAt", "asc")
                .limit(limit)
                .get()
                .catch(() => ({ docs: [] })),
        ]);
        const byId = new Map();
        for (const doc of [...createdSnap.docs, ...editedSnap.docs]) {
            byId.set(doc.id, doc);
        }
        docs = [...byId.values()];
    }
    else {
        const snap = await db
            .collectionGroup("messages")
            .where("participantUids", "array-contains", uid)
            .orderBy("createdAt", "desc")
            .limit(limit)
            .get();
        docs = snap.docs;
    }
    const items = (await Promise.all(docs.map((doc) => mapMessageDoc(doc)))).filter((x) => !!x);
    return { items, incremental: sinceMs != null };
});
/**
 * Lists accepted friendships for caller.
 */
exports.listMyFriends = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const mine = await db
        .collection("friendships")
        .where("participants", "array-contains", uid)
        .where("status", "==", "accepted")
        .get();
    const candidateUids = [];
    for (const doc of mine.docs) {
        const participants = (doc.data().participants ?? []);
        const otherRaw = participants.find((p) => p !== uid);
        if (!otherRaw)
            continue;
        const normalized = await normalizeParticipantToAppUid(otherRaw);
        if (normalized && normalized !== uid)
            candidateUids.push(normalized);
    }
    const unique = [...new Set(candidateUids)];
    const friendUids = [];
    const batchSize = 500;
    for (let i = 0; i < unique.length; i += batchSize) {
        const slice = unique.slice(i, i + batchSize);
        const refs = slice.map((id) => db.collection("users").doc(id));
        const snaps = await db.getAll(...refs);
        snaps.forEach((snap, idx) => {
            if (snap.exists)
                friendUids.push(slice[idx]);
        });
    }
    // Opportunistic backfill: any edge that pre-dates the `participantAuthUids`
    // mirror still needs the field before the client snapshot listener can read
    // it. We backfill on read because (a) it amortises the work across the
    // existing user-login traffic, (b) it auto-converges as people sign in, and
    // (c) it costs at most one extra batched write per stale edge per session.
    // Edges already carrying the field are skipped.
    const staleEdges = mine.docs.filter((doc) => {
        const existing = (doc.data().participantAuthUids ?? []);
        return !Array.isArray(existing) || existing.length === 0;
    });
    if (staleEdges.length > 0) {
        const writer = db.batch();
        let pending = 0;
        for (const doc of staleEdges) {
            const participants = (doc.data().participants ?? []);
            const authUids = await resolveParticipantAuthUids(participants);
            if (authUids.length === 0)
                continue;
            writer.set(doc.ref, { participantAuthUids: authUids }, { merge: true });
            pending++;
            // Firestore batch hard-cap is 500; flush early to stay well under.
            if (pending >= 400)
                break;
        }
        if (pending > 0) {
            try {
                await writer.commit();
            }
            catch {
                /* backfill is best-effort; clients fall back to the callable path */
            }
        }
    }
    return { friendUids };
});
/**
 * Deletes the accepted friendship edge between caller and `otherUid` (unfriend).
 */
exports.removeFriendship = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const otherUid = String(req.data?.otherUid ?? "").trim();
    if (!otherUid) {
        throw new https_1.HttpsError("invalid-argument", "otherUid is required.");
    }
    if (otherUid === uid) {
        throw new https_1.HttpsError("invalid-argument", "Cannot unfriend yourself.");
    }
    const edgeRef = db.collection("friendships").doc(friendshipId(uid, otherUid));
    const snap = await edgeRef.get();
    if (!snap.exists) {
        return { ok: true };
    }
    const data = snap.data();
    if (data?.status !== "accepted") {
        return { ok: true };
    }
    await edgeRef.delete();
    await (0, socialExtensions_1.kickPairFromSharedGroups)(uid, otherUid);
    return { ok: true };
});
/**
 * Updates caller presence heartbeat. Caller is online only while actively using the app.
 */
exports.setMyPresence = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const state = String(req.data?.state ?? "background").trim().toLowerCase();
    if (state !== "active" && state !== "background") {
        throw new https_1.HttpsError("invalid-argument", "Presence state must be active or background.");
    }
    const normalized = state === "active" ? "active" : "background";
    const heartbeatAtMs = Number(req.data?.heartbeatAtMs ?? 0);
    await (0, socialExtensions_1.writePresenceWithViewers)(uid, deviceId, normalized, Number.isFinite(heartbeatAtMs) && heartbeatAtMs > 0 ? heartbeatAtMs : undefined);
    return { ok: true };
});
/**
 * Returns presence for accepted friends only.
 */
exports.getFriendPresence = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const friendUids = Array.isArray(req.data?.friendUids)
        ? req.data.friendUids.map((x) => String(x)).filter(Boolean)
        : [];
    const unique = [...new Set(friendUids.filter((id) => id.startsWith("u_")))].slice(0, 200);
    const entries = await Promise.all(unique.map(async (friendUid) => {
        try {
            await assertAcceptedFriendship(uid, friendUid);
            const snap = await db.collection("presence").doc(friendUid).get();
            if (!snap.exists)
                return [friendUid, { state: "offline", heartbeatAtMs: 0, online: false }];
            const data = snap.data();
            const state = data?.state === "active" ? "active" : "background";
            const heartbeatAtMs = (0, socialExtensions_1.normalizePresenceHeartbeatMs)(data?.heartbeatAtMs);
            const fresh = (0, socialExtensions_1.isPresenceFresh)(heartbeatAtMs);
            const online = (0, socialExtensions_1.presenceDocOnlineFromData)({
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
            ];
        }
        catch {
            return [friendUid, { state: "offline", heartbeatAtMs: 0 }];
        }
    }));
    return { byUid: Object.fromEntries(entries) };
});
/**
 * Returns profile cards for accepted friends (or self). During Add Friend pairing, pass `pairingPin`
 * (same 4-digit session as QR/NFC) so each side can load the other's profile before friendship exists.
 */
exports.getUserProfiles = (0, https_1.onCall)(async (req) => {
    const { appUid: uid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const pairingPin = tryNormalizeNfcPinPairPinOptional(req.data?.pairingPin);
    const targetUids = Array.isArray(req.data?.targetUids)
        ? req.data.targetUids.map((x) => String(x)).filter(Boolean)
        : [];
    const unique = [...new Set(targetUids.filter((id) => id.startsWith("u_")))].slice(0, 200);
    const entries = await Promise.all(unique.map(async (targetUid) => {
        try {
            if (targetUid !== uid) {
                if (pairingPin) {
                    await assertPairingSessionAllowsProfileRead(uid, targetUid, pairingPin);
                }
                else {
                    await assertAcceptedFriendship(uid, targetUid);
                }
            }
            const snap = await db.collection("users").doc(targetUid).get();
            if (!snap.exists)
                return [targetUid, null];
            const data = snap.data();
            const pairingPreviewOnly = pairingPin && targetUid !== uid;
            const storedUsername = String(data.username ?? "").trim();
            return [
                targetUid,
                {
                    uid: targetUid,
                    username: storedUsername || `User ${targetUid.slice(0, 6)}`,
                    bio: pairingPreviewOnly ? "" : data.bio ?? "",
                    profilePictureUrl: data.profilePictureUrl ?? null,
                },
            ];
        }
        catch {
            return [targetUid, null];
        }
    }));
    return { profiles: Object.fromEntries(entries) };
});
/**
 * Writes a private comment/thread message for a post between owner and one friend.
 */
exports.createPrivatePostThreadMessage = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const postId = String(req.data?.postId ?? "").trim();
    const postOwnerUid = String(req.data?.postOwnerUid ?? "").trim();
    const friendUid = String(req.data?.friendUid ?? "").trim();
    const text = String(req.data?.text ?? "").trim();
    if (!postId || !postOwnerUid || !friendUid || !text) {
        throw new https_1.HttpsError("invalid-argument", "postId, postOwnerUid, friendUid, text are required.");
    }
    if (uid !== postOwnerUid && uid !== friendUid) {
        throw new https_1.HttpsError("permission-denied", "Caller must be post owner or thread friend.");
    }
    if (postOwnerUid === friendUid) {
        throw new https_1.HttpsError("invalid-argument", "owner and friend must differ.");
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
    await threadRef.set({
        postId,
        postOwnerUid,
        friendUid,
        participants: [postOwnerUid, friendUid].sort(),
        participantAuthUids,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, messageId: msgRef.id };
});
/**
 * Toggles caller reaction on one private thread message.
 */
exports.togglePrivatePostThreadMessageReaction = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const postId = String(req.data?.postId ?? "").trim();
    const postOwnerUid = String(req.data?.postOwnerUid ?? "").trim();
    const friendUid = String(req.data?.friendUid ?? "").trim();
    const messageId = String(req.data?.messageId ?? "").trim();
    const emoji = String(req.data?.emoji ?? "👍").trim() || "👍";
    if (!postId || !postOwnerUid || !friendUid || !messageId) {
        throw new https_1.HttpsError("invalid-argument", "postId, postOwnerUid, friendUid, messageId are required.");
    }
    if (uid !== postOwnerUid && uid !== friendUid) {
        throw new https_1.HttpsError("permission-denied", "Caller must be post owner or thread friend.");
    }
    await assertAcceptedFriendship(postOwnerUid, friendUid);
    const threadRef = db.collection("privatePostThreads").doc(privateThreadId(postId, postOwnerUid, friendUid));
    const msgRef = threadRef.collection("messages").doc(messageId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(msgRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", "Message not found.");
        }
        const data = snap.data();
        const reactions = { ...(data?.reactions ?? {}) };
        if (reactions[uid] === emoji) {
            delete reactions[uid];
        }
        else {
            reactions[uid] = emoji;
        }
        tx.set(msgRef, {
            reactions,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(threadRef, {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    return { ok: true };
});
/**
 * Lists private thread messages for one post pair.
 */
exports.listPrivatePostThreadMessages = (0, https_1.onCall)(async (req) => {
    const uid = (0, deviceSession_1.resolveAppUidFromRequest)(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await (0, deviceSession_1.assertActiveDeviceSession)(uid, deviceId);
    const postId = String(req.data?.postId ?? "").trim();
    const postOwnerUid = String(req.data?.postOwnerUid ?? "").trim();
    const friendUid = String(req.data?.friendUid ?? "").trim();
    if (!postId || !postOwnerUid || !friendUid) {
        throw new https_1.HttpsError("invalid-argument", "postId, postOwnerUid, friendUid are required.");
    }
    if (postOwnerUid === friendUid) {
        throw new https_1.HttpsError("invalid-argument", "owner and friend must differ.");
    }
    if (uid !== postOwnerUid && uid !== friendUid) {
        throw new https_1.HttpsError("permission-denied", "Caller must be post owner or thread friend.");
    }
    await assertAcceptedFriendship(postOwnerUid, friendUid);
    const threadRef = db.collection("privatePostThreads").doc(privateThreadId(postId, postOwnerUid, friendUid));
    const snap = await threadRef.collection("messages").orderBy("createdAt", "asc").limit(500).get();
    // Opportunistic backfill for the snapshot-listener migration: add
    // `participantAuthUids` to any pre-migration thread doc and messages that
    // are missing it. Cheap because `participantAuthUids` is small and the
    // batch is bounded by the 500-message query limit.
    const participantAuthUids = await resolveParticipantAuthUids([postOwnerUid, friendUid]);
    if (participantAuthUids.length > 0) {
        const threadSnap = await threadRef.get();
        const threadData = threadSnap.data();
        const threadStale = threadSnap.exists &&
            (!Array.isArray(threadData?.participantAuthUids) ||
                (threadData?.participantAuthUids).length === 0);
        const staleMessages = snap.docs.filter((doc) => {
            const existing = doc.data().participantAuthUids;
            return !Array.isArray(existing) || existing.length === 0;
        });
        if (threadStale || staleMessages.length > 0) {
            const writer = db.batch();
            if (threadStale)
                writer.set(threadRef, { participantAuthUids }, { merge: true });
            for (const doc of staleMessages.slice(0, 400)) {
                writer.set(doc.ref, { participantAuthUids }, { merge: true });
            }
            try {
                await writer.commit();
            }
            catch {
                /* backfill is best-effort */
            }
        }
    }
    const items = snap.docs.map((doc) => {
        const data = doc.data();
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
