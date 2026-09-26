import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } = naclUtil;

export const FRIEND_CONTENT_SEAL = "friend-content-key";

type EnvelopeBlobV1 = { v: 1; epk: string; n: string; c: string };

/** Locks the friends key to one recipient. The server stores this and cannot open it. */
export function wrapRawKeyForRecipient(params: {
  senderPublicKey: string;
  senderSecretKey: string;
  recipientPublicKey: string;
  rawKey: Uint8Array;
  nonce: Uint8Array;
}): string {
  const wrapped = nacl.box(
    params.rawKey,
    params.nonce,
    decodeBase64(params.recipientPublicKey),
    decodeBase64(params.senderSecretKey)
  );
  const blob: EnvelopeBlobV1 = {
    v: 1,
    epk: params.senderPublicKey,
    n: encodeBase64(params.nonce),
    c: encodeBase64(wrapped),
  };
  return JSON.stringify(blob);
}

export function unwrapRawKeyForRecipient(recipientSecretKey: string, envelopeBlobRaw: string): Uint8Array {
  const envelope = JSON.parse(envelopeBlobRaw) as EnvelopeBlobV1;
  if (!envelope || envelope.v !== 1 || !envelope.epk || !envelope.n || !envelope.c) {
    throw new Error("Invalid friends key envelope.");
  }
  const opened = nacl.box.open(
    decodeBase64(envelope.c),
    decodeBase64(envelope.n),
    decodeBase64(envelope.epk),
    decodeBase64(recipientSecretKey)
  );
  if (!opened) throw new Error("Could not open the friends key.");
  return opened;
}

export function sealJsonWithKey(
  payload: unknown,
  rawKey: Uint8Array,
  nonce: Uint8Array
): { ciphertext: string; nonce: string } {
  const cipher = nacl.secretbox(decodeUTF8(JSON.stringify(payload)), nonce, rawKey);
  return { ciphertext: encodeBase64(cipher), nonce: encodeBase64(nonce) };
}

export function openJsonWithKey<T>(ciphertextB64: string, nonceB64: string, rawKey: Uint8Array): T {
  const plain = nacl.secretbox.open(decodeBase64(ciphertextB64), decodeBase64(nonceB64), rawKey);
  if (!plain) throw new Error("Could not open content with the friends key.");
  return JSON.parse(encodeUTF8(plain)) as T;
}
