"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEncryptedMediaReadUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const deviceSession_1 = require("./deviceSession");
const firebaseAdmin_1 = require("./firebaseAdmin");
const postStorageCleanup_1 = require("./postStorageCleanup");
const READ_URL_TTL_MS = 10 * 60 * 1000;
function friendshipId(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}
/**
 * Short-lived signed URL for one encrypted-media object.
 * The owner can read their own files. Anyone else must be an accepted friend of the owner.
 */
exports.getEncryptedMediaReadUrl = (0, https_1.onCall)(async (req) => {
    const { appUid } = await (0, deviceSession_1.assertVerifiedCallableCaller)(req);
    const objectPath = (0, postStorageCleanup_1.normalizePostStorageObjectPaths)([req.data?.objectPath])[0];
    if (!objectPath) {
        throw new https_1.HttpsError("invalid-argument", "objectPath is required.");
    }
    const callerAuthUid = req.auth?.uid?.trim();
    if (!callerAuthUid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    const ownerAuthUid = objectPath.slice("encrypted-media/".length).split("/")[0] ?? "";
    if (!ownerAuthUid) {
        throw new https_1.HttpsError("invalid-argument", "objectPath is required.");
    }
    if (callerAuthUid !== ownerAuthUid) {
        const db = (0, firebaseAdmin_1.getFirestore)();
        const ownerMap = await db.collection("firebaseAuthToAppUid").doc(ownerAuthUid).get();
        const ownerAppUid = String(ownerMap.data()?.appUid ?? "").trim();
        if (!ownerAppUid) {
            throw new https_1.HttpsError("permission-denied", "Media owner not found.");
        }
        const edge = await db.collection("friendships").doc(friendshipId(appUid, ownerAppUid)).get();
        const status = edge.data()?.status;
        if (status !== "accepted") {
            throw new https_1.HttpsError("permission-denied", "Only friends can open this media.");
        }
    }
    const expires = Date.now() + READ_URL_TTL_MS;
    const [url] = await firebaseAdmin_1.admin.storage().bucket().file(objectPath).getSignedUrl({
        action: "read",
        expires,
    });
    return { url, expiresInSec: Math.floor(READ_URL_TTL_MS / 1000) };
});
