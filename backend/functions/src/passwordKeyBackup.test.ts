import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { parsePasswordKeyBackup } from "./passwordKeyBackup.ts";

function b64(length: number): string {
  return randomBytes(length).toString("base64");
}

test("a password-wrapped backup is stored as given", () => {
  const backup = {
    v: 2,
    kdf: "scrypt",
    N: 32768,
    r: 8,
    p: 1,
    salt: b64(16),
    nonce: b64(24),
    ciphertext: b64(64),
  };
  assert.deepEqual(parsePasswordKeyBackup(backup), backup);
});

test("a legacy server-readable backup is rejected", () => {
  assert.equal(parsePasswordKeyBackup({ ciphertext: b64(64), nonce: b64(24) }), null);
  assert.equal(parsePasswordKeyBackup({ v: 1, kdf: "sha256", ciphertext: b64(64) }), null);
});

test("a weaker scrypt cost is rejected", () => {
  assert.equal(
    parsePasswordKeyBackup({
      v: 2,
      kdf: "scrypt",
      N: 1024,
      r: 8,
      p: 1,
      salt: b64(16),
      nonce: b64(24),
      ciphertext: b64(64),
    }),
    null
  );
});
