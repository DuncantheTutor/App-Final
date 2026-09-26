import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

import {
  unwrapKeyArchiveWithPassword,
  unwrapKeyBundleWithPassword,
  wrapKeyArchiveWithPassword,
  wrapKeyBundleWithPassword,
  type DeviceKeySecrets,
} from "./passwordKeyWrap.ts";
import { parsePasswordKeyBackup } from "../../backend/functions/src/passwordKeyBackup.ts";

const secrets: DeviceKeySecrets = {
  v: 1,
  encryptionPublicKey: "enc-pub",
  encryptionSecretKey: "enc-sec",
  identitySigningPublicKey: "sign-pub",
  identitySigningSecretKey: "sign-sec",
};

async function random(length: number): Promise<Uint8Array> {
  return new Uint8Array(randomBytes(length));
}

test("the same password opens the wrapped message keys", async () => {
  const wrapped = await wrapKeyBundleWithPassword(secrets, "correct horse", random);
  const opened = await unwrapKeyBundleWithPassword(wrapped, "correct horse");
  assert.deepEqual(opened, secrets);
});

test("a different password cannot open the wrapped message keys", async () => {
  const wrapped = await wrapKeyBundleWithPassword(secrets, "correct horse", random);
  await assert.rejects(() => unwrapKeyBundleWithPassword(wrapped, "other password"), /password/i);
});

test("an archive keeps the previous key that still opens older messages", async () => {
  const previous = { ...secrets, encryptionSecretKey: "older-sec" };
  const wrapped = await wrapKeyArchiveWithPassword(
    { v: 2, current: secrets, previous: [previous] },
    "correct horse",
    random
  );
  const opened = await unwrapKeyArchiveWithPassword(wrapped, "correct horse");
  assert.equal(opened.current.encryptionSecretKey, secrets.encryptionSecretKey);
  assert.equal(opened.previous[0]?.encryptionSecretKey, "older-sec");
  assert.equal((await unwrapKeyBundleWithPassword(wrapped, "correct horse")).encryptionSecretKey, secrets.encryptionSecretKey);
});

test("two wraps of the same keys are not the same blob", async () => {
  const first = await wrapKeyBundleWithPassword(secrets, "correct horse", random);
  const second = await wrapKeyBundleWithPassword(secrets, "correct horse", random);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.salt, second.salt);
  assert.equal(first.kdf, "scrypt");
  assert.equal(first.v, 2);
  assert.deepEqual(parsePasswordKeyBackup(first), first);
});
