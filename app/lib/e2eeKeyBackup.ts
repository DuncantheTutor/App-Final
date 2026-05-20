import * as Random from "expo-random";

import * as SecureStore from "expo-secure-store";

import nacl from "tweetnacl";

import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from "tweetnacl-util";



import { callEmulatorFunction } from "../../backendBridge";

import { firebaseAuth } from "../../firebaseAuthClient";

import { logAppError } from "../../telemetry";



const KEY_BUNDLE_PREFIX = "app.e2ee.bundle.v1.";



type PersistedKeyBundle = {

  v: 1;

  encryptionPublicKey: string;

  encryptionSecretKey: string;

  identitySigningPublicKey: string;

  identitySigningSecretKey: string;

};



export type KeyRestoreResult =

  | { status: "skipped_local" }

  | { status: "no_backup" }

  | { status: "restored" }

  /** Server has a backup but this device/account could not decrypt it — do not mint new keys. */

  | { status: "backup_decrypt_failed" };



function keyForUid(uid: string): string {

  return `${KEY_BUNDLE_PREFIX}${uid}`;

}



function isValidBundle(parsed: unknown): parsed is PersistedKeyBundle {

  if (!parsed || typeof parsed !== "object") return false;

  const b = parsed as PersistedKeyBundle;

  return (

    b.v === 1 &&

    typeof b.encryptionPublicKey === "string" &&

    b.encryptionPublicKey.length > 0 &&

    typeof b.encryptionSecretKey === "string" &&

    b.encryptionSecretKey.length > 0 &&

    typeof b.identitySigningPublicKey === "string" &&

    b.identitySigningPublicKey.length > 0 &&

    typeof b.identitySigningSecretKey === "string" &&

    b.identitySigningSecretKey.length > 0

  );

}



/** Derive a wrapping key from Firebase Auth + app uid (stable across reinstall for same account). */

function deriveBackupWrappingKey(appUid: string, firebaseAuthUid: string): Uint8Array {

  const material = decodeUTF8(`mvpplus-key-backup-v1|${appUid}|${firebaseAuthUid}`);

  return nacl.hash(material).slice(0, 32);

}



async function readLocalBundle(appUid: string): Promise<PersistedKeyBundle | null> {

  const raw = await SecureStore.getItemAsync(keyForUid(appUid));

  if (!raw) return null;

  try {

    const parsed = JSON.parse(raw) as unknown;

    return isValidBundle(parsed) ? parsed : null;

  } catch {

    return null;

  }

}



/**

 * After uninstall, SecureStore is empty but Firebase Auth is the same. Pull the

 * encrypted key backup and restore local keys **before** generating new ones.

 */

export async function restoreKeyBundleFromCloudIfMissing(

  appUid: string,

  deviceId: string

): Promise<KeyRestoreResult> {

  const existing = await readLocalBundle(appUid);

  if (existing) return { status: "skipped_local" };



  const firebaseAuthUid = firebaseAuth.currentUser?.uid?.trim();

  if (!firebaseAuthUid) return { status: "no_backup" };

  if (!deviceId?.trim()) return { status: "no_backup" };



  let ciphertext = "";

  let nonce = "";

  try {

    const res = await callEmulatorFunction<{

      ciphertext?: string | null;

      nonce?: string | null;

    }>("getUserKeyBackup", { uid: appUid, deviceId });

    ciphertext = String(res.ciphertext ?? "").trim();

    nonce = String(res.nonce ?? "").trim();

  } catch (err) {

    logAppError("e2ee.key_backup.restore_fetch", err, { uid: appUid });

    return { status: "no_backup" };

  }

  if (!ciphertext || !nonce) return { status: "no_backup" };



  try {

    const wrapKey = deriveBackupWrappingKey(appUid, firebaseAuthUid);

    const plainBytes = nacl.secretbox.open(decodeBase64(ciphertext), decodeBase64(nonce), wrapKey);

    if (!plainBytes) {

      logAppError(

        "e2ee.key_backup.restore_decrypt",

        new Error("secretbox open failed"),

        { uid: appUid }

      );

      return { status: "backup_decrypt_failed" };

    }

    const parsed = JSON.parse(encodeUTF8(plainBytes)) as unknown;

    if (!isValidBundle(parsed)) return { status: "backup_decrypt_failed" };

    await SecureStore.setItemAsync(keyForUid(appUid), JSON.stringify(parsed));

    return { status: "restored" };

  } catch (err) {

    logAppError("e2ee.key_backup.restore_persist", err, { uid: appUid });

    return { status: "backup_decrypt_failed" };

  }

}



/** Upload encrypted private key bundle (automatic; no user action). */

export async function uploadKeyBundleToCloudBackup(

  appUid: string,

  deviceId: string

): Promise<void> {

  const bundle = await readLocalBundle(appUid);

  if (!bundle) return;



  const firebaseAuthUid = firebaseAuth.currentUser?.uid?.trim();

  if (!firebaseAuthUid) return;



  const wrapKey = deriveBackupWrappingKey(appUid, firebaseAuthUid);

  const backupNonce = Uint8Array.from(await Random.getRandomBytesAsync(24));

  const plainBytes = decodeUTF8(JSON.stringify(bundle));

  const cipherBytes = nacl.secretbox(plainBytes, backupNonce, wrapKey);



  await callEmulatorFunction("putUserKeyBackup", {

    uid: appUid,

    deviceId,

    ciphertext: encodeBase64(cipherBytes),

    nonce: encodeBase64(backupNonce),

  });

}


