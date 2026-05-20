"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_MAX_AGE_MS = void 0;
exports.requireAuthUid = requireAuthUid;
exports.assertActiveDeviceSession = assertActiveDeviceSession;
exports.resolveAppUidFromRequest = resolveAppUidFromRequest;
exports.assertVerifiedCallableCaller = assertVerifiedCallableCaller;
const https_1 = require("firebase-functions/v2/https");
const firebaseAdmin_1 = require("./firebaseAdmin");
exports.SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
function requireAuthUid(uid) {
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    return uid;
}
function nowMs() {
    return Date.now();
}
/** Device lock on `users/{appUid}.activeDeviceId` (set by `claimDeviceSession`). */
async function assertActiveDeviceSession(uid, deviceId) {
    if (!deviceId?.trim()) {
        throw new https_1.HttpsError("invalid-argument", "deviceId is required.");
    }
    const userRef = (0, firebaseAdmin_1.getFirestore)().collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("failed-precondition", "User profile not found.");
    }
    const data = snap.data();
    if (!data?.activeDeviceId || data.activeDeviceId !== deviceId) {
        throw new https_1.HttpsError("permission-denied", "Active session belongs to a different device.");
    }
    if (typeof data.sessionIssuedAt === "number" && nowMs() - data.sessionIssuedAt > exports.SESSION_MAX_AGE_MS) {
        throw new https_1.HttpsError("permission-denied", "Device session expired.");
    }
}
/**
 * App identity is always `req.data.uid` (e.g. `u_<hash>`). Never use `req.auth.uid` — that is
 * Firebase Auth and does not match `participantUids` / friendship doc ids.
 */
function resolveAppUidFromRequest(req) {
    const fromBody = String(req.data?.uid ?? req.data?.demoUid ?? "").trim();
    if (!fromBody) {
        throw new https_1.HttpsError("invalid-argument", "uid is required.");
    }
    return requireAuthUid(fromBody);
}
/**
 * Resolves app uid from request body, validates device session, and when Firebase Auth
 * token is present verifies it matches `userFirebaseAuthMap` for that app uid.
 */
async function assertVerifiedCallableCaller(req) {
    const appUid = resolveAppUidFromRequest(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await assertActiveDeviceSession(appUid, deviceId);
    const firebaseAuthUid = req.auth?.uid?.trim();
    if (firebaseAuthUid) {
        const mapSnap = await (0, firebaseAdmin_1.getFirestore)().collection("userFirebaseAuthMap").doc(appUid).get();
        const mapped = String(mapSnap.data()?.firebaseAuthUid ?? "").trim();
        if (mapped && mapped !== firebaseAuthUid) {
            throw new https_1.HttpsError("permission-denied", "Firebase Auth does not match this app account.");
        }
    }
    return { appUid, deviceId };
}
