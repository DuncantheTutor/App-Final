import { HttpsError, onCall } from "firebase-functions/v2/https";

import { assertVerifiedCallableCaller } from "./deviceSession";
import { admin, getFirestore } from "./firebaseAdmin";
import { normalizePostStorageObjectPaths } from "./postStorageCleanup";

const READ_URL_TTL_MS = 10 * 60 * 1000;

function friendshipId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * Short-lived signed URL for one encrypted-media object.
 * The owner can read their own files. Anyone else must be an accepted friend of the owner.
 */
export const getEncryptedMediaReadUrl = onCall(async (req) => {
  const { appUid } = await assertVerifiedCallableCaller(req);
  const objectPath = normalizePostStorageObjectPaths([req.data?.objectPath])[0];
  if (!objectPath) {
    throw new HttpsError("invalid-argument", "objectPath is required.");
  }
  const callerAuthUid = req.auth?.uid?.trim();
  if (!callerAuthUid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const ownerAuthUid = objectPath.slice("encrypted-media/".length).split("/")[0] ?? "";
  if (!ownerAuthUid) {
    throw new HttpsError("invalid-argument", "objectPath is required.");
  }
  if (callerAuthUid !== ownerAuthUid) {
    const db = getFirestore();
    const ownerMap = await db.collection("firebaseAuthToAppUid").doc(ownerAuthUid).get();
    const ownerAppUid = String(ownerMap.data()?.appUid ?? "").trim();
    if (!ownerAppUid) {
      throw new HttpsError("permission-denied", "Media owner not found.");
    }
    const edge = await db.collection("friendships").doc(friendshipId(appUid, ownerAppUid)).get();
    const status = (edge.data() as { status?: string } | undefined)?.status;
    if (status !== "accepted") {
      throw new HttpsError("permission-denied", "Only friends can open this media.");
    }
  }
  const expires = Date.now() + READ_URL_TTL_MS;
  const [url] = await admin.storage().bucket().file(objectPath).getSignedUrl({
    action: "read",
    expires,
  });
  return { url, expiresInSec: Math.floor(READ_URL_TTL_MS / 1000) };
});
