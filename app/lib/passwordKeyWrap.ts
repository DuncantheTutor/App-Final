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

export type DeviceKeyArchive = {
  v: 2;
  current: DeviceKeySecrets;
  previous: DeviceKeySecrets[];
};

function archiveFromParsed(value: unknown): DeviceKeyArchive | null {
  if (isDeviceKeySecrets(value)) return { v: 2, current: value, previous: [] };
  if (!value || typeof value !== "object") return null;
  const row = value as DeviceKeyArchive;
  if (row.v !== 2 || !isDeviceKeySecrets(row.current)) return null;
  const previous = Array.isArray(row.previous)
    ? row.previous.filter(isDeviceKeySecrets).slice(0, 3)
    : [];
  return { v: 2, current: row.current, previous };
}

async function wrapBytes(
  plaintext: string,
  password: string,
  randomBytes: (length: number) => Promise<Uint8Array>
): Promise<PasswordWrappedKeyBackup> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error("Password is required to save message keys.");
  const salt = await randomBytes(SALT_BYTES);
  const nonce = await randomBytes(nacl.secretbox.nonceLength);
  const key = await wrappingKey(trimmed, salt);
  const cipher = nacl.secretbox(utf8(plaintext), nonce, key);
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

async function openWrappedBytes(backup: PasswordWrappedKeyBackup, password: string): Promise<unknown> {
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
  if (!opened) throw new Error("Can't unlock your messages with this password.");
  return JSON.parse(encodeUTF8(opened)) as unknown;
}

/** Locks one device key bundle with the account password. The password never leaves the phone. */
export async function wrapKeyBundleWithPassword(
  secrets: DeviceKeySecrets,
  password: string,
  randomBytes: (length: number) => Promise<Uint8Array>
): Promise<PasswordWrappedKeyBackup> {
  return wrapBytes(JSON.stringify(secrets), password, randomBytes);
}

/** Locks the current key and the previous keys that still open older messages. */
export async function wrapKeyArchiveWithPassword(
  archive: DeviceKeyArchive,
  password: string,
  randomBytes: (length: number) => Promise<Uint8Array>
): Promise<PasswordWrappedKeyBackup> {
  const previous = archive.previous.filter(isDeviceKeySecrets).slice(0, 3);
  return wrapBytes(
    JSON.stringify({ v: 2, current: archive.current, previous }),
    password,
    randomBytes
  );
}

/** Opens a password-wrapped bundle. A wrong password throws and does not return partial keys. */
export async function unwrapKeyArchiveWithPassword(
  backup: PasswordWrappedKeyBackup,
  password: string
): Promise<DeviceKeyArchive> {
  const parsed = await openWrappedBytes(backup, password);
  const archive = archiveFromParsed(parsed);
  if (!archive) throw new Error("The saved message keys are incomplete.");
  return archive;
}

export async function unwrapKeyBundleWithPassword(
  backup: PasswordWrappedKeyBackup,
  password: string
): Promise<DeviceKeySecrets> {
  const archive = await unwrapKeyArchiveWithPassword(backup, password);
  return archive.current;
}
