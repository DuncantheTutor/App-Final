import { doc, getDoc } from "firebase/firestore";

import { getFirestoreDb } from "../../firebaseAuthClient";

/** Maps friendship `participants` entries to canonical app `u_*` uids (client-side). */
export async function resolveParticipantToAppUid(raw: string): Promise<string | null> {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if (id.startsWith("u_")) return id;
  try {
    const snap = await getDoc(doc(getFirestoreDb(), "firebaseAuthToAppUid", id));
    const appUid = String(snap.data()?.appUid ?? "").trim();
    return appUid.startsWith("u_") ? appUid : null;
  } catch {
    return null;
  }
}
