"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveParticipantAuthUids = resolveParticipantAuthUids;
const firebaseAdmin_1 = require("./firebaseAdmin");
/**
 * The only place that turns app uids (`u_…`) into the Firebase Auth uid arrays
 * Firestore rules use (`participantAuthUids`, `recipientAuthUids`, `viewerAuthUids`).
 * Missing map rows are omitted. Callers must not invent these arrays elsewhere.
 */
async function resolveParticipantAuthUids(appUids) {
    const unique = [...new Set(appUids.filter((uid) => !!uid))];
    if (unique.length === 0)
        return [];
    const db = (0, firebaseAdmin_1.getFirestore)();
    const refs = unique.map((uid) => db.collection("userFirebaseAuthMap").doc(uid));
    const snaps = await db.getAll(...refs);
    const out = [];
    for (const snap of snaps) {
        const data = snap.data();
        const authUid = (data?.firebaseAuthUid ?? "").trim();
        if (authUid)
            out.push(authUid);
    }
    return [...new Set(out)].sort();
}
