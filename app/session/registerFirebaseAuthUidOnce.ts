import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";

const registeredKeys = new Set<string>();

/**
 * Binds this Firebase Auth uid to the app account once per process.
 * Later sends and foreground resumes must not repeat the callable: the server
 * fan-out rewrites every friend's presence doc.
 */
export async function registerFirebaseAuthUidOnce(session: {
  uid: string;
  deviceId: string;
}): Promise<void> {
  const firebaseAuthUid = firebaseAuth.currentUser?.uid?.trim();
  if (!firebaseAuthUid) return;
  const key = `${session.uid}|${firebaseAuthUid}`;
  if (registeredKeys.has(key)) return;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await callEmulatorFunction("registerFirebaseAuthUid", {
        uid: session.uid,
        deviceId: session.deviceId,
        firebaseAuthUid,
      });
      registeredKeys.add(key);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
