import { getFirestore } from "./firebaseAdmin";

/**
 * The only place that turns app uids (`u_…`) into the Firebase Auth uid arrays
 * Firestore rules use (`participantAuthUids`, `recipientAuthUids`, `viewerAuthUids`).
 * Missing map rows are omitted. Callers must not invent these arrays elsewhere.
 */
/** App uid → Firebase Auth uid. Missing map rows are omitted. */
export async function resolveAuthUidByAppUid(appUids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(appUids.filter((uid) => !!uid))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const db = getFirestore();
  const snaps: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    snaps.push(...(await db.getAll(...chunk.map((uid) => db.collection("userFirebaseAuthMap").doc(uid)))));
  }
  snaps.forEach((snap, index) => {
    const appUid = unique[index];
    if (!appUid) return;
    const data = snap.data() as { firebaseAuthUid?: string } | undefined;
    const authUid = (data?.firebaseAuthUid ?? "").trim();
    if (authUid) out.set(appUid, authUid);
  });
  return out;
}

export async function resolveParticipantAuthUids(appUids: string[]): Promise<string[]> {
  const byApp = await resolveAuthUidByAppUid(appUids);
  return [...new Set(byApp.values())].sort();
}
