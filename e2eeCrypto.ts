import * as Random from "expo-random";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from "tweetnacl-util";

const KEY_BUNDLE_PREFIX = "app.e2ee.bundle.v1.";

type PersistedKeyBundle = {
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

async function getOrCreatePersistedBundle(uid: string): Promise<PersistedKeyBundle> {
  const storageKey = keyForUid(uid);
  const raw = await SecureStore.getItemAsync(storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistedKeyBundle;
      if (
        parsed?.v === 1 &&
        parsed.encryptionPublicKey &&
        parsed.encryptionSecretKey &&
        parsed.identitySigningPublicKey &&
        parsed.identitySigningSecretKey
      ) {
        return parsed;
      }
    } catch {
      // fall through to regeneration
    }
  }
  const next = await generateBundle();
  await SecureStore.setItemAsync(storageKey, JSON.stringify(next));
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

/**
 * Encrypts payload with per-object symmetric key, then wraps that key per recipient.
 * Envelope format is v1 JSON string with ephemeral pubkey + nonce + boxed content key.
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
  const recipient = await getOrCreatePersistedBundle(recipientUid);
  const recipientSecretKey = decodeBase64(recipient.encryptionSecretKey);
  const envelope = JSON.parse(envelopeBlobRaw) as EnvelopeBlobV1;
  if (!envelope || envelope.v !== 1 || !envelope.epk || !envelope.n || !envelope.c) {
    throw new Error("Invalid envelope format");
  }
  const senderEphemeralPub = decodeBase64(envelope.epk);
  const wrapNonce = decodeBase64(envelope.n);
  const wrappedKey = decodeBase64(envelope.c);
  const contentKey = nacl.box.open(wrappedKey, wrapNonce, senderEphemeralPub, recipientSecretKey);
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
