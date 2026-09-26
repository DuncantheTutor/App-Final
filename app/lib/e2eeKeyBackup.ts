import * as Random from "expo-random";

import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { readAccountKeyArchive, readPersistedKeyBundle, installRestoredKeyArchive, rotateAccountEncryptionKey } from "../../e2eeCrypto";
import {
  unwrapKeyArchiveWithPassword,
  wrapKeyArchiveWithPassword,
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
  const hadLocal = Boolean(await readPersistedKeyBundle(appUid));
  if (hadLocal) return;
  const archive = await unwrapKeyArchiveWithPassword(backup, password);
  await installRestoredKeyArchive(appUid, archive);
  await rotateAccountEncryptionKey(appUid);
}

/** Saves the keys already on this phone, locked with the account password. */
export async function uploadKeyBundleToCloudBackup(
  appUid: string,
  deviceId: string,
  password: string
): Promise<void> {
  const archive = await readAccountKeyArchive(appUid);
  if (!archive) throw new Error("This phone has no message keys to save.");
  const keyBackup = await wrapKeyArchiveWithPassword(archive, password, deviceRandom);
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
