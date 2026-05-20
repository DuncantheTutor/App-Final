/**
 * Single Firebase Admin bootstrap — must load before any module calls Firestore at import time.
 */
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export { admin };

export function getFirestore() {
  return admin.firestore();
}
