import assert from "node:assert/strict";
import { test } from "node:test";

import {
  beginIntentionalSignOut,
  endIntentionalSignOut,
  isIntentionalSignOut,
  keepSignedInAfterNullAuthEvent,
} from "./firebaseAuthPersistence.ts";

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

test("stays signed in when Firebase has dropped both the user and the blob", () => {
  assert.equal(
    keepSignedInAfterNullAuthEvent({
      currentUserEmail: "  ",
      persistedAuthBlob: false,
    }),
    true
  );
});

test("intentional logout is flagged until it ends", () => {
  endIntentionalSignOut();
  try {
    assert.equal(isIntentionalSignOut(), false);
    beginIntentionalSignOut();
    assert.equal(isIntentionalSignOut(), true);
  } finally {
    endIntentionalSignOut();
  }
  assert.equal(isIntentionalSignOut(), false);
});
