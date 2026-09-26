import { scryptAsync } from "@noble/hashes/scrypt.js";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } = naclUtil;

/** Must match `passwordKeyBackup.ts` on the server. The server checks these and never derives the key. */
export const PASSWORD_KEY_BACKUP_VERSION = 2;
export const PASSWORD_KEY_BACKUP_KDF = "scrypt";
export const PASSWORD_KEY_BACKUP_N = 32768;
export const PASSWORD_KEY_BACKUP_R = 8;
export const PASSWORD_KEY_BACKUP_P = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

export type PasswordWrappedKeyBackup = {
  v: 2;
  kdf: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
  nonce: string;
  ciphertext: string;
};

export type DeviceKeySecrets = {
  v: 1;
  encryptionPublicKey: string;
  encryptionSecretKey: string;
  identitySigningPublicKey: string;
  identitySigningSecretKey: string;
};

function utf8(value: string): Uint8Array {
  return decodeUTF8(value);
}

async function wrappingKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return scryptAsync(utf8(password), salt, {
    N: PASSWORD_KEY_BACKUP_N,
    r: PASSWORD_KEY_BACKUP_R,
    p: PASSWORD_KEY_BACKUP_P,
    dkLen: KEY_BYTES,
  });
}

export function isDeviceKeySecrets(value: unknown): value is DeviceKeySecrets {
  if (!value || typeof value !== "object") return false;
  const row = value as DeviceKeySecrets;
  return (
    row.v === 1 &&
    typeof row.encryptionPublicKey === "string" &&
    row.encryptionPublicKey.length > 0 &&
    typeof row.encryptionSecretKey === "string" &&
    row.encryptionSecretKey.length > 0 &&
    typeof row.identitySigningPublicKey === "string" &&
    row.identitySigningPublicKey.length > 0 &&
    typeof row.identitySigningSecretKey === "string" &&
    row.identitySigningSecretKey.length > 0
  );
}

/** Locks the device key bundle with the account password. The password never leaves the phone. */
export async function wrapKeyBundleWithPassword(
  secrets: DeviceKeySecrets,
  password: string,
  randomBytes: (length: number) => Promise<Uint8Array>
): Promise<PasswordWrappedKeyBackup> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error("Password is required to save message keys.");
  const salt = await randomBytes(SALT_BYTES);
  const nonce = await randomBytes(nacl.secretbox.nonceLength);
  const key = await wrappingKey(trimmed, salt);
  const cipher = nacl.secretbox(utf8(JSON.stringify(secrets)), nonce, key);
  return {
    v: PASSWORD_KEY_BACKUP_VERSION,
    kdf: PASSWORD_KEY_BACKUP_KDF,
    N: PASSWORD_KEY_BACKUP_N,
    r: PASSWORD_KEY_BACKUP_R,
    p: PASSWORD_KEY_BACKUP_P,
    salt: encodeBase64(salt),
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(cipher),
  };
}

/** Opens a password-wrapped bundle. A wrong password throws and does not return partial keys. */
export async function unwrapKeyBundleWithPassword(
  backup: PasswordWrappedKeyBackup,
  password: string
): Promise<DeviceKeySecrets> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error("Password is required to open message keys.");
  if (
    backup.v !== PASSWORD_KEY_BACKUP_VERSION ||
    backup.kdf !== PASSWORD_KEY_BACKUP_KDF ||
    backup.N !== PASSWORD_KEY_BACKUP_N ||
    backup.r !== PASSWORD_KEY_BACKUP_R ||
    backup.p !== PASSWORD_KEY_BACKUP_P
  ) {
    throw new Error("This key backup is not a password-wrapped bundle.");
  }
  const salt = decodeBase64(backup.salt);
  const nonce = decodeBase64(backup.nonce);
  const cipher = decodeBase64(backup.ciphertext);
  const key = await wrappingKey(trimmed, salt);
  const opened = nacl.secretbox.open(cipher, nonce, key);
  if (!opened) throw new Error("Could not open message keys with this password.");
  const parsed = JSON.parse(encodeUTF8(opened)) as unknown;
  if (!isDeviceKeySecrets(parsed)) throw new Error("The saved message keys are incomplete.");
  return parsed;
}
