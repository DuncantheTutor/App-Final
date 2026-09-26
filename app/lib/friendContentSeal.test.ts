import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import nacl from "tweetnacl";

import {
  openJsonWithKey,
  sealJsonWithKey,
  unwrapRawKeyForRecipient,
  wrapRawKeyForRecipient,
} from "./friendContentSeal.ts";

function nonce(length: number): Uint8Array {
  return new Uint8Array(randomBytes(length));
}

test("a new friend opens old posts with the same friends key", () => {
  const owner = nacl.box.keyPair();
  const friend = nacl.box.keyPair();
  const friendsKey = nonce(32);
  const sealed = sealJsonWithKey({ text: "hello" }, friendsKey, nonce(24));
  const envelope = wrapRawKeyForRecipient({
    senderPublicKey: Buffer.from(owner.publicKey).toString("base64"),
    senderSecretKey: Buffer.from(owner.secretKey).toString("base64"),
    recipientPublicKey: Buffer.from(friend.publicKey).toString("base64"),
    rawKey: friendsKey,
    nonce: nonce(24),
  });
  const openedKey = unwrapRawKeyForRecipient(Buffer.from(friend.secretKey).toString("base64"), envelope);
  const plain = openJsonWithKey<{ text: string }>(sealed.ciphertext, sealed.nonce, openedKey);
  assert.equal(plain.text, "hello");
});

test("replacing the friends key stops the previous key opening the new seal", () => {
  const oldKey = nonce(32);
  const nextKey = nonce(32);
  const resealed = sealJsonWithKey({ text: "after unfriend" }, nextKey, nonce(24));
  assert.throws(
    () => openJsonWithKey(resealed.ciphertext, resealed.nonce, oldKey),
    /friends key/
  );
});
