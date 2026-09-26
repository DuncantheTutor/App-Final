import * as admin from "firebase-admin";

import { resolveParticipantAuthUids } from "./authUidMirror";
import { getFirestore } from "./firebaseAdmin";

/** Metadata-only. Adding a friend can read existing posts without rewriting ciphertext. */
export async function grantFriendReadOnOwnedContent(ownerUid: string, friendUid: string): Promise<void> {
  const db = getFirestore();
  const authUids = await resolveParticipantAuthUids([friendUid]);
  const friendAuthUid = authUids[0];
  const arrayUnion = admin.firestore.FieldValue.arrayUnion;
  if (friendAuthUid) {
    await db
      .collection("encryptedProfiles")
      .doc(ownerUid)
      .update({ recipientAuthUids: arrayUnion(friendAuthUid) })
      .catch(() => undefined);
  }
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query: FirebaseFirestore.Query = db
      .collection("encryptedPosts")
      .where("ownerUid", "==", ownerUid)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(200);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    const writer = db.bulkWriter();
    for (const doc of snap.docs) {
      const patch: Record<string, unknown> = {
        recipientUids: arrayUnion(friendUid),
      };
      if (friendAuthUid) patch.recipientAuthUids = arrayUnion(friendAuthUid);
      writer.set(doc.ref, patch, { merge: true });
    }
    await writer.close();
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }
}
