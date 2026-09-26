import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalizeEmail as canonicalizeEmailOnServer, legacyAppUidForEmail } from "../../backend/functions/src/canonicalizeEmail.ts";
import { mintAppUid } from "../../backend/functions/src/mintAppUid.ts";
import { canonicalizeEmail, backendUidForEmail } from "./accountIdentity.ts";

const cases: Array<[string, string]> = [
  ["name@gmail.com", "name@gmail.com"],
  ["n.ame@gmail.com", "name@gmail.com"],
  ["name+test@gmail.com", "name@gmail.com"],
  ["N.Ame+Tag@googlemail.com", "name@googlemail.com"],
  ["first.last+news@outlook.com", "first.last@outlook.com"],
  ["  Jo.hn+x@Example.com ", "jo.hn@example.com"],
  ["not-an-email", "not-an-email"],
  ["", ""],
];

test("client and server collapse the same mailbox aliases", () => {
  for (const [input, expected] of cases) {
    assert.equal(canonicalizeEmail(input), expected, input);
    assert.equal(canonicalizeEmailOnServer(input), expected, input);
  }
});

test("legacy account ids stay tied to the historical email hash", () => {
  assert.equal(legacyAppUidForEmail("Name+tag@gmail.com"), backendUidForEmail("name@gmail.com"));
  assert.equal(legacyAppUidForEmail("n.ame@gmail.com"), backendUidForEmail("name@gmail.com"));
});

test("new account ids are random and not the email hash", () => {
  const minted = mintAppUid();
  assert.match(minted, /^u_[0-9a-f]{32}$/);
  assert.notEqual(minted, backendUidForEmail("name@gmail.com"));
  assert.notEqual(minted, mintAppUid());
});
