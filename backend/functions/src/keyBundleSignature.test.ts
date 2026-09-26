import assert from "node:assert/strict";
import test from "node:test";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const { encodeBase64 } = naclUtil;

import { publicBundleSigningMessage, verifyKeyBundleSignature } from "./keyBundleSignature.ts";

test("a signature from the identity key is accepted", () => {
  const sign = nacl.sign.keyPair();
  const bundle = {
    keyVersion: 1,
    encryptionPublicKey: encodeBase64(nacl.box.keyPair().publicKey),
    identitySigningPublicKey: encodeBase64(sign.publicKey),
  };
  const signature = encodeBase64(
    nacl.sign.detached(Uint8Array.from(publicBundleSigningMessage(bundle)), sign.secretKey)
  );
  assert.equal(verifyKeyBundleSignature(bundle, signature), true);
});

test("a missing or forged signature is refused", () => {
  const sign = nacl.sign.keyPair();
  const bundle = {
    keyVersion: 1,
    encryptionPublicKey: "enc",
    identitySigningPublicKey: encodeBase64(sign.publicKey),
  };
  assert.equal(verifyKeyBundleSignature(bundle, ""), false);
  assert.equal(verifyKeyBundleSignature(bundle, encodeBase64(nacl.randomBytes(64))), false);
});
