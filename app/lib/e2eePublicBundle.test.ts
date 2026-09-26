import assert from "node:assert/strict";
import { test } from "node:test";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const { encodeBase64 } = naclUtil;

import {
  publicBundleSigningMessage,
  safetyNumberForIdentityKey,
  verifyPublicBundleSignature,
  type PublicBundleFields,
} from "./e2eePublicBundle.ts";

function bundleFor(signKey: nacl.SignKeyPair, encryptionPublicKey = "enc"): PublicBundleFields {
  return {
    keyVersion: 1,
    encryptionPublicKey,
    identitySigningPublicKey: encodeBase64(signKey.publicKey),
  };
}

function sign(bundle: PublicBundleFields, secretKey: Uint8Array): string {
  return encodeBase64(nacl.sign.detached(publicBundleSigningMessage(bundle), secretKey));
}

test("a bundle signed with its identity key verifies", () => {
  const keys = nacl.sign.keyPair();
  const bundle = bundleFor(keys);
  assert.equal(verifyPublicBundleSignature(bundle, sign(bundle, keys.secretKey)), true);
});

test("a flipped signature byte or a different key does not verify", () => {
  const keys = nacl.sign.keyPair();
  const bundle = bundleFor(keys);
  const signature = sign(bundle, keys.secretKey);
  const bytes = Buffer.from(signature, "base64");
  bytes[0] ^= 0xff;
  assert.equal(verifyPublicBundleSignature(bundle, bytes.toString("base64")), false);
  const other = nacl.sign.keyPair();
  assert.equal(verifyPublicBundleSignature(bundle, sign(bundle, other.secretKey)), false);
});

test("an empty signature does not verify", () => {
  const keys = nacl.sign.keyPair();
  assert.equal(verifyPublicBundleSignature(bundleFor(keys), "  "), false);
});

test("the safety number is stable and changes with the key", () => {
  const first = encodeBase64(nacl.sign.keyPair().publicKey);
  const second = encodeBase64(nacl.sign.keyPair().publicKey);
  const number = safetyNumberForIdentityKey(first);
  assert.match(number, /^\d{5}( \d{5}){5}$/);
  assert.equal(safetyNumberForIdentityKey(first), number);
  assert.notEqual(safetyNumberForIdentityKey(second), number);
});
