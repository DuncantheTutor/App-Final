/** Must match `app/lib/passwordKeyWrap.ts`. The server stores this blob and does not derive the key. */

export const PASSWORD_KEY_BACKUP_VERSION = 2;
export const PASSWORD_KEY_BACKUP_KDF = "scrypt";
export const PASSWORD_KEY_BACKUP_N = 32768;
export const PASSWORD_KEY_BACKUP_R = 8;
export const PASSWORD_KEY_BACKUP_P = 1;

const SALT_BYTES = 16;
const NONCE_BYTES = 24;
const MIN_CIPHERTEXT_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 4096;

export type PasswordKeyBackupRecord = {
  v: 2;
  kdf: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
  nonce: string;
  ciphertext: string;
};

function base64ByteLength(value: string): number | null {
  if (!value || value.length > 8192 || !/^[A-Za-z0-9+/]+=*$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  return decoded.length > 0 ? decoded.length : null;
}

/** Accepts only a current password-wrapped backup. Older server-readable blobs return null. */
export function parsePasswordKeyBackup(raw: unknown): PasswordKeyBackupRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as PasswordKeyBackupRecord;
  if (row.v !== PASSWORD_KEY_BACKUP_VERSION || row.kdf !== PASSWORD_KEY_BACKUP_KDF) return null;
  if (row.N !== PASSWORD_KEY_BACKUP_N || row.r !== PASSWORD_KEY_BACKUP_R || row.p !== PASSWORD_KEY_BACKUP_P) {
    return null;
  }
  if (typeof row.salt !== "string" || typeof row.nonce !== "string" || typeof row.ciphertext !== "string") {
    return null;
  }
  const saltLen = base64ByteLength(row.salt);
  const nonceLen = base64ByteLength(row.nonce);
  const cipherLen = base64ByteLength(row.ciphertext);
  if (saltLen !== SALT_BYTES || nonceLen !== NONCE_BYTES) return null;
  if (cipherLen == null || cipherLen < MIN_CIPHERTEXT_BYTES || cipherLen > MAX_CIPHERTEXT_BYTES) return null;
  return {
    v: PASSWORD_KEY_BACKUP_VERSION,
    kdf: PASSWORD_KEY_BACKUP_KDF,
    N: PASSWORD_KEY_BACKUP_N,
    r: PASSWORD_KEY_BACKUP_R,
    p: PASSWORD_KEY_BACKUP_P,
    salt: row.salt,
    nonce: row.nonce,
    ciphertext: row.ciphertext,
  };
}
