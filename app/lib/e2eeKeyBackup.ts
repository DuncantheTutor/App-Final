import * as Random from "expo-random";

import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { readPersistedKeyBundle, savePersistedKeyBundle } from "../../e2eeCrypto";
import {
  unwrapKeyBundleWithPassword,
  wrapKeyBundleWithPassword,
  type PasswordWrappedKeyBackup,
} from "./passwordKeyWrap";

async function deviceRandom(length: number): Promise<Uint8Array> {
  return Uint8Array.from(await Random.getRandomBytesAsync(length));
}

function backupFromResponse(raw: unknown): PasswordWrappedKeyBackup | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as PasswordWrappedKeyBackup;
  if (row.v !== 2 || row.kdf !== "scrypt" || !row.salt || !row.nonce || !row.ciphertext) return null;
  return row;
}

export type KeyBackupFetch = {
  status: "missing" | "present";
  hasPublishedKeyBundle: boolean;
  backup: PasswordWrappedKeyBackup | null;
};

/** Reads the password-wrapped backup. Legacy server-readable copies are deleted by the callable. */
export async function fetchPasswordKeyBackup(appUid: string, deviceId: string): Promise<KeyBackupFetch> {
  const res = await callEmulatorFunction<{
    keyBackup?: PasswordWrappedKeyBackup | null;
    hasPublishedKeyBundle?: boolean;
  }>("getUserKeyBackup", {
    uid: appUid,
    deviceId,
  });
  const backup = backupFromResponse(res.keyBackup);
  return {
    status: backup ? "present" : "missing",
    hasPublishedKeyBundle: Boolean(res.hasPublishedKeyBundle),
    backup,
  };
}

/**
 * Installs the account keys when this phone does not have them yet.
 * A wrong password throws. It does not create a new key.
 */
export async function restoreKeyBundleFromCloud(
  appUid: string,
  password: string,
  backup: PasswordWrappedKeyBackup
): Promise<void> {
  const secrets = await unwrapKeyBundleWithPassword(backup, password);
  await savePersistedKeyBundle(appUid, secrets);
}

/** Saves the keys already on this phone, locked with the account password. */
export async function uploadKeyBundleToCloudBackup(
  appUid: string,
  deviceId: string,
  password: string
): Promise<void> {
  const secrets = await readPersistedKeyBundle(appUid);
  if (!secrets) throw new Error("This phone has no message keys to save.");
  const keyBackup = await wrapKeyBundleWithPassword(secrets, password, deviceRandom);
  await callEmulatorFunction("putUserKeyBackup", {
    uid: appUid,
    deviceId,
    keyBackup,
  });
}

/** Checks the password against the signed-in account, then saves the key backup. */
export async function confirmAccountPasswordAndUploadKeyBackup(
  appUid: string,
  deviceId: string,
  password: string
): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user?.email) throw new Error("Sign in again before saving message keys.");
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } catch {
    throw new Error("That password does not match this account.");
  }
  await uploadKeyBundleToCloudBackup(appUid, deviceId, password);
}
