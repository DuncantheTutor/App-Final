import * as Random from "expo-random";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from "tweetnacl-util";

import {
  publicBundleSigningMessage,
  safetyNumberForIdentityKey,
  verifyPublicBundleSignature,
} from "./app/lib/e2eePublicBundle";

export { publicBundleSigningMessage, safetyNumberForIdentityKey, verifyPublicBundleSignature };

const KEY_BUNDLE_PREFIX = "app.e2ee.bundle.v1.";
const MAX_PREVIOUS_KEYS = 3;

export type PersistedKeyBundle = {
  v: 1;
  encryptionPublicKey: string;
  encryptionSecretKey: string;
  identitySigningPublicKey: string;
  identitySigningSecretKey: string;
};

export type E2eePublicBundle = {
  keyVersion: number;
  encryptionPublicKey: string;
  identitySigningPublicKey: string;
};

type EnvelopeBlobV1 = {
  v: 1;
  epk: string;
  n: string;
  c: string;
};

function keyForUid(uid: string): string {
  return `${KEY_BUNDLE_PREFIX}${uid}`;
}

async function randomBytes(length: number): Promise<Uint8Array> {
  return Uint8Array.from(await Random.getRandomBytesAsync(length));
}

async function generateBundle(): Promise<PersistedKeyBundle> {
  const boxSeed = await randomBytes(32);
  const signSeed = await randomBytes(32);
  const enc = nacl.box.keyPair.fromSecretKey(boxSeed);
  const sig = nacl.sign.keyPair.fromSeed(signSeed);
  return {
    v: 1,
    encryptionPublicKey: encodeBase64(enc.publicKey),
    encryptionSecretKey: encodeBase64(enc.secretKey),
    identitySigningPublicKey: encodeBase64(sig.publicKey),
    identitySigningSecretKey: encodeBase64(sig.secretKey),
  };
}

type StoredKeyArchive = {
  v: 2;
  current: PersistedKeyBundle;
  previous: PersistedKeyBundle[];
};

function parseStoredKeyArchive(value: unknown): StoredKeyArchive | null {
  if (isPersistedKeyBundle(value)) return { v: 2, current: value, previous: [] };
  if (!value || typeof value !== "object") return null;
  const row = value as StoredKeyArchive;
  if (row.v !== 2 || !isPersistedKeyBundle(row.current)) return null;
  const previous = Array.isArray(row.previous)
    ? row.previous.filter(isPersistedKeyBundle).slice(0, MAX_PREVIOUS_KEYS)
    : [];
  return { v: 2, current: row.current, previous };
}

async function readStoredKeyArchive(uid: string): Promise<StoredKeyArchive | null> {
  const raw = await SecureStore.getItemAsync(keyForUid(uid));
  if (!raw) return null;
  try {
    return parseStoredKeyArchive(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function writeStoredKeyArchive(uid: string, archive: StoredKeyArchive): Promise<void> {
  await SecureStore.setItemAsync(keyForUid(uid), JSON.stringify(archive));
}

function isPersistedKeyBundle(value: unknown): value is PersistedKeyBundle {
  if (!value || typeof value !== "object") return false;
  const parsed = value as PersistedKeyBundle;
  return (
    parsed.v === 1 &&
    Boolean(parsed.encryptionPublicKey) &&
    Boolean(parsed.encryptionSecretKey) &&
    Boolean(parsed.identitySigningPublicKey) &&
    Boolean(parsed.identitySigningSecretKey)
  );
}

export async function readAccountKeyArchive(uid: string): Promise<StoredKeyArchive | null> {
  return readStoredKeyArchive(uid);
}

export async function readPersistedKeyBundle(uid: string): Promise<PersistedKeyBundle | null> {
  return (await readStoredKeyArchive(uid))?.current ?? null;
}

export async function savePersistedKeyBundle(uid: string, bundle: PersistedKeyBundle): Promise<void> {
  if (!isPersistedKeyBundle(bundle)) throw new Error("Message keys are incomplete.");
  const existing = await readStoredKeyArchive(uid);
  await writeStoredKeyArchive(uid, {
    v: 2,
    current: bundle,
    previous: existing?.previous ?? [],
  });
}

export async function installRestoredKeyArchive(
  uid: string,
  archive: { current: PersistedKeyBundle; previous: PersistedKeyBundle[] }
): Promise<void> {
  if (!isPersistedKeyBundle(archive.current)) throw new Error("Message keys are incomplete.");
  await writeStoredKeyArchive(uid, {
    v: 2,
    current: archive.current,
    previous: archive.previous.filter(isPersistedKeyBundle).slice(0, MAX_PREVIOUS_KEYS),
  });
}

/** New messages use a new key. The previous secret stays on this phone so older messages still open. */
export async function rotateAccountEncryptionKey(uid: string): Promise<void> {
  const existing = await readStoredKeyArchive(uid);
  if (!existing) throw new Error("This phone has no message keys to rotate.");
  const next = await generateBundle();
  await writeStoredKeyArchive(uid, {
    v: 2,
    current: next,
    previous: [existing.current, ...existing.previous].slice(0, MAX_PREVIOUS_KEYS),
  });
}

async function getOrCreatePersistedBundle(uid: string): Promise<PersistedKeyBundle> {
  const existing = await readPersistedKeyBundle(uid);
  if (existing) return existing;
  const next = await generateBundle();
  await savePersistedKeyBundle(uid, next);
  return next;
}

export async function ensureLocalKeyBundle(uid: string): Promise<E2eePublicBundle> {
  const bundle = await getOrCreatePersistedBundle(uid);
  return {
    keyVersion: 1,
    encryptionPublicKey: bundle.encryptionPublicKey,
    identitySigningPublicKey: bundle.identitySigningPublicKey,
  };
}

export async function signLocalPublicBundle(
  uid: string
): Promise<{ bundle: E2eePublicBundle; signature: string }> {
  const persisted = await getOrCreatePersistedBundle(uid);
  const bundle: E2eePublicBundle = {
    keyVersion: 1,
    encryptionPublicKey: persisted.encryptionPublicKey,
    identitySigningPublicKey: persisted.identitySigningPublicKey,
  };
  const signature = nacl.sign.detached(
    publicBundleSigningMessage(bundle),
    decodeBase64(persisted.identitySigningSecretKey)
  );
  return { bundle, signature: encodeBase64(signature) };
}

/**
 * Encrypts a payload with a fresh symmetric key, then wraps that key for each
 * recipient using the sender's long-term encryption key (nacl.box).
 * This is not forward secret for the life of one key. A new phone keeps the
 * previous secret so older messages still open, then publishes a new key.
 * Messages wrapped to the new key stay closed to a copy of the old secret.
 * The envelope field `epk` is the sender's current long-term public key.
 */
export async function encryptPayloadForRecipients(
  senderUid: string,
  payload: unknown,
  recipientEncryptionPublicKeys: Record<string, string>
): Promise<{ ciphertext: string; nonce: string; envelopes: Record<string, string> }> {
  const sender = await getOrCreatePersistedBundle(senderUid);
  const senderSecretKey = decodeBase64(sender.encryptionSecretKey);
  const contentKey = await randomBytes(32);
  const contentNonce = await randomBytes(24);
  const plaintext = decodeUTF8(JSON.stringify(payload));
  const cipherBytes = nacl.secretbox(plaintext, contentNonce, contentKey);

  const envelopes: Record<string, string> = {};
  for (const [recipientUid, recipientPubB64] of Object.entries(recipientEncryptionPublicKeys)) {
    if (!recipientPubB64) continue;
    const recipientPub = decodeBase64(recipientPubB64);
    const wrapNonce = await randomBytes(24);
    const wrapped = nacl.box(contentKey, wrapNonce, recipientPub, senderSecretKey);
    const blob: EnvelopeBlobV1 = {
      v: 1,
      epk: sender.encryptionPublicKey,
      n: encodeBase64(wrapNonce),
      c: encodeBase64(wrapped),
    };
    envelopes[recipientUid] = JSON.stringify(blob);
  }

  return {
    ciphertext: encodeBase64(cipherBytes),
    nonce: encodeBase64(contentNonce),
    envelopes,
  };
}

export async function decryptPayloadForRecipient<T>(
  recipientUid: string,
  ciphertextB64: string,
  nonceB64: string,
  envelopeBlobRaw: string
): Promise<T> {
  const archive = await readStoredKeyArchive(recipientUid);
  const secrets = archive ? [archive.current, ...archive.previous] : [];
  if (secrets.length === 0) {
    throw new Error("Could not unwrap content key");
  }
  const envelope = JSON.parse(envelopeBlobRaw) as EnvelopeBlobV1;
  if (!envelope || envelope.v !== 1 || !envelope.epk || !envelope.n || !envelope.c) {
    throw new Error("Invalid envelope format");
  }
  const senderLongTermPublicKey = decodeBase64(envelope.epk);
  const wrapNonce = decodeBase64(envelope.n);
  const wrappedKey = decodeBase64(envelope.c);
  let contentKey: Uint8Array | null = null;
  for (const bundle of secrets) {
    const recipientSecretKey = decodeBase64(bundle.encryptionSecretKey);
    contentKey = nacl.box.open(wrappedKey, wrapNonce, senderLongTermPublicKey, recipientSecretKey);
    if (contentKey) break;
  }
  if (!contentKey) {
    throw new Error("Could not unwrap content key");
  }
  const nonce = decodeBase64(nonceB64);
  const ciphertext = decodeBase64(ciphertextB64);
  const plainBytes = nacl.secretbox.open(ciphertext, nonce, contentKey);
  if (!plainBytes) {
    throw new Error("Could not decrypt payload");
  }
  const json = encodeUTF8(plainBytes);
  return JSON.parse(json) as T;
}
