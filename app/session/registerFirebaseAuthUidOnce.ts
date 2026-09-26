import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";

const registeredKeys = new Set<string>();

export type AccountLinkStatus = "pending" | "ready" | "failed";

let accountLinkStatus: AccountLinkStatus = "pending";
const accountLinkListeners = new Set<(status: AccountLinkStatus) => void>();

function setAccountLinkStatus(next: AccountLinkStatus): void {
  accountLinkStatus = next;
  for (const listener of accountLinkListeners) listener(next);
}

export function getAccountLinkStatus(): AccountLinkStatus {
  return accountLinkStatus;
}

export function subscribeAccountLinkStatus(listener: (status: AccountLinkStatus) => void): () => void {
  accountLinkListeners.add(listener);
  return () => {
    accountLinkListeners.delete(listener);
  };
}

export function resetAccountLinkStatus(): void {
  registeredKeys.clear();
  setAccountLinkStatus("pending");
}

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
      setAccountLinkStatus("ready");
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  setAccountLinkStatus("failed");
  throw lastError;
}
