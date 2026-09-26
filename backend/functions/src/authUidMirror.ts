import { getFirestore } from "./firebaseAdmin";

/**
 * The only place that turns app uids (`u_…`) into the Firebase Auth uid arrays
 * Firestore rules use (`participantAuthUids`, `recipientAuthUids`, `viewerAuthUids`).
 * Missing map rows are omitted. Callers must not invent these arrays elsewhere.
 */
export async function resolveParticipantAuthUids(appUids: string[]): Promise<string[]> {
  const unique = [...new Set(appUids.filter((uid) => !!uid))];
  if (unique.length === 0) return [];
  const db = getFirestore();
  const refs = unique.map((uid) => db.collection("userFirebaseAuthMap").doc(uid));
  const snaps = await db.getAll(...refs);
  const out: string[] = [];
  for (const snap of snaps) {
    const data = snap.data() as { firebaseAuthUid?: string } | undefined;
    const authUid = (data?.firebaseAuthUid ?? "").trim();
    if (authUid) out.push(authUid);
  }
  return [...new Set(out)].sort();
}
