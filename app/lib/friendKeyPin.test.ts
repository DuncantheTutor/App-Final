import assert from "node:assert/strict";
import test from "node:test";

import { decideFriendKeyPin } from "./friendKeyPin.ts";

const keys = {
  encryptionPublicKey: "enc-a",
  identitySigningPublicKey: "id-a",
};

test("the first bundle is pinned", () => {
  assert.deepEqual(decideFriendKeyPin(null, { ...keys, signature: "sig" }, true), {
    action: "pin",
    keys,
  });
});

test("the same keys are accepted", () => {
  assert.deepEqual(decideFriendKeyPin(keys, { ...keys, signature: "sig" }, true), {
    action: "accept",
  });
});

test("a replaced key is a change", () => {
  const next = { encryptionPublicKey: "enc-b", identitySigningPublicKey: "id-b" };
  assert.deepEqual(decideFriendKeyPin(keys, { ...next, signature: "sig" }, true), {
    action: "changed",
    keys: next,
  });
});

test("a bad signature is refused", () => {
  assert.throws(
    () => decideFriendKeyPin(null, { ...keys, signature: "sig" }, false),
    /failed verification/
  );
});

test("a missing signature is refused", () => {
  assert.throws(() => decideFriendKeyPin(null, keys, false), /failed verification/);
  assert.throws(
    () => decideFriendKeyPin(keys, { ...keys, signature: "" }, true),
    /failed verification/
  );
});

test("changing only one key is a change", () => {
  const encryptionOnly = {
    encryptionPublicKey: "enc-b",
    identitySigningPublicKey: keys.identitySigningPublicKey,
    signature: "sig",
  };
  const signingOnly = {
    encryptionPublicKey: keys.encryptionPublicKey,
    identitySigningPublicKey: "id-b",
    signature: "sig",
  };
  assert.equal(decideFriendKeyPin(keys, encryptionOnly, true).action, "changed");
  assert.equal(decideFriendKeyPin(keys, signingOnly, true).action, "changed");
});
