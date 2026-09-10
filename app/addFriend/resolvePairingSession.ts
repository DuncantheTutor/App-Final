import type { BackendSession } from "../messaging/types";

/** Use a ready session, or wait briefly after claimDeviceSession before pairing fails. */
export async function resolvePairingSession(
  getBackendSession: () => BackendSession | null,
  waitForBackendSession: (maxMs?: number) => Promise<BackendSession | null>,
  maxMs = 3000
): Promise<BackendSession | null> {
  return getBackendSession() ?? (await waitForBackendSession(maxMs));
}
