import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";

export type KeyRestoreResult = { status: "no_backup" };

/**
 * Private keys stay in SecureStore only. Server copies used a wrapping key derived from
 * public account ids, so this deletes those copies instead of restoring them.
 */
export async function restoreKeyBundleFromCloudIfMissing(
  appUid: string,
  deviceId: string
): Promise<KeyRestoreResult> {
  try {
    await callEmulatorFunction("getUserKeyBackup", { uid: appUid, deviceId });
  } catch (err) {
    logAppError("e2ee.key_backup.purge", err, { uid: appUid });
  }
  return { status: "no_backup" };
}

/** @deprecated Uploading a key backup is disabled. This deletes any leftover server blob. */
export async function uploadKeyBundleToCloudBackup(appUid: string, deviceId: string): Promise<void> {
  try {
    await callEmulatorFunction("putUserKeyBackup", { uid: appUid, deviceId });
  } catch (err) {
    logAppError("e2ee.key_backup.purge", err, { uid: appUid });
  }
}
