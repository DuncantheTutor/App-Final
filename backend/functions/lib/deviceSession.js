"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintAppUid = exports.legacyAppUidForEmail = exports.SESSION_MAX_AGE_MS = void 0;
exports.requireAuthUid = requireAuthUid;
exports.assertActiveDeviceSession = assertActiveDeviceSession;
exports.requireVerifiedFirebaseIdentity = requireVerifiedFirebaseIdentity;
exports.lookupBoundAppUid = lookupBoundAppUid;
exports.resolveAppUidFromRequest = resolveAppUidFromRequest;
exports.assertVerifiedCallableCaller = assertVerifiedCallableCaller;
const https_1 = require("firebase-functions/v2/https");
const accountIds_1 = require("./accountIds");
Object.defineProperty(exports, "legacyAppUidForEmail", { enumerable: true, get: function () { return accountIds_1.legacyAppUidForEmail; } });
Object.defineProperty(exports, "mintAppUid", { enumerable: true, get: function () { return accountIds_1.mintAppUid; } });
const canonicalizeEmail_1 = require("./canonicalizeEmail");
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
 * Identity is the Firebase ID token on the callable, not `req.data.uid`.
 * The email comes from that token.
 */
function requireVerifiedFirebaseIdentity(req) {
    const firebaseAuthUid = req.auth?.uid?.trim() ?? "";
    const email = (0, canonicalizeEmail_1.canonicalizeEmail)(String(req.auth?.token?.email ?? ""));
    if (!firebaseAuthUid || !email.includes("@")) {
        throw new https_1.HttpsError("unauthenticated", "Sign in is required.");
    }
    return { firebaseAuthUid, email };
}
/**
 * App account already bound to this Firebase user or this verified email.
 * Does not create an account.
 */
async function lookupBoundAppUid(firebaseAuthUid, email) {
    const db = (0, firebaseAdmin_1.getFirestore)();
    const byAuth = await db.collection("firebaseAuthToAppUid").doc(firebaseAuthUid).get();
    const mapped = String(byAuth.data()?.appUid ?? "").trim();
    if (mapped.startsWith("u_"))
        return mapped;
    const byEmail = await db.collection("emailAccounts").doc((0, accountIds_1.emailAccountDocId)(email)).get();
    const fromEmail = String(byEmail.data()?.uid ?? "").trim();
    if (fromEmail.startsWith("u_"))
        return fromEmail;
    return null;
}
async function assertBindingMatches(appUid, firebaseAuthUid, email) {
    const db = (0, firebaseAdmin_1.getFirestore)();
    const [authMap, reverse, emailSnap] = await Promise.all([
        db.collection("userFirebaseAuthMap").doc(appUid).get(),
        db.collection("firebaseAuthToAppUid").doc(firebaseAuthUid).get(),
        db.collection("emailAccounts").doc((0, accountIds_1.emailAccountDocId)(email)).get(),
    ]);
    const mappedFirebase = String(authMap.data()?.firebaseAuthUid ?? "").trim();
    if (mappedFirebase && mappedFirebase !== firebaseAuthUid) {
        throw new https_1.HttpsError("permission-denied", "This sign-in cannot be used.");
    }
    const reverseApp = String(reverse.data()?.appUid ?? "").trim();
    if (reverseApp && reverseApp !== appUid) {
        throw new https_1.HttpsError("permission-denied", "This sign-in cannot be used.");
    }
    const emailOwner = String(emailSnap.data()?.uid ?? "").trim();
    if (emailOwner && emailOwner !== appUid) {
        throw new https_1.HttpsError("permission-denied", "This sign-in cannot be used.");
    }
}
/**
 * Resolves the app account for a signed-in Firebase user.
 * A `uid` in the body is checked against that account and never selects it.
 */
async function resolveAppUidFromRequest(req) {
    const { firebaseAuthUid, email } = requireVerifiedFirebaseIdentity(req);
    const appUid = await lookupBoundAppUid(firebaseAuthUid, email);
    if (!appUid) {
        throw new https_1.HttpsError("unauthenticated", "Sign in is required.");
    }
    await assertBindingMatches(appUid, firebaseAuthUid, email);
    const hinted = String(req.data?.uid ?? req.data?.demoUid ?? "").trim();
    if (hinted && hinted !== appUid) {
        throw new https_1.HttpsError("permission-denied", "Signed-in session does not match this account.");
    }
    return appUid;
}
/**
 * Resolves app uid from the Firebase token, validates the device session, and
 * checks the Firebase user is the one bound to that account.
 */
async function assertVerifiedCallableCaller(req) {
    const appUid = await resolveAppUidFromRequest(req);
    const deviceId = String(req.data?.deviceId ?? "").trim();
    await assertActiveDeviceSession(appUid, deviceId);
    return { appUid, deviceId };
}
