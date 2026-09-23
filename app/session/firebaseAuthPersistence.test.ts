import assert from "node:assert/strict";
import { test } from "node:test";

import { keepSignedInAfterNullAuthEvent } from "./firebaseAuthPersistence.ts";

test("keeps the session when Firebase still has the current user", () => {
  assert.equal(
    keepSignedInAfterNullAuthEvent({
      currentUserEmail: "a@b.com",
      persistedAuthBlob: false,
    }),
    true
  );
});

test("keeps the session when the persisted auth blob is still on disk", () => {
  assert.equal(
    keepSignedInAfterNullAuthEvent({
      currentUserEmail: null,
      persistedAuthBlob: true,
    }),
    true
  );
});

test("drops the session only when both the user and the blob are gone", () => {
  assert.equal(
    keepSignedInAfterNullAuthEvent({
      currentUserEmail: "  ",
      persistedAuthBlob: false,
    }),
    false
  );
});
