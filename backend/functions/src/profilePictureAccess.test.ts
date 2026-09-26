import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mediaPathOwnedByAuthUid,
  normalizeOwnedMediaPath,
  profilePictureFieldsForStorage,
  storageObjectPathFromDownloadUrl,
} from "./profilePictureAccess.ts";

const TOKEN_URL =
  "https://firebasestorage.googleapis.com/v0/b/nfc-app-7095e.appspot.com/o/encrypted-media%2FauthUser%2Fabc123?alt=media&token=secret-token";

test("firebase download URLs reduce to the object path", () => {
  assert.equal(storageObjectPathFromDownloadUrl(TOKEN_URL), "encrypted-media/authUser/abc123");
  assert.equal(storageObjectPathFromDownloadUrl("https://example.com/photo.jpg"), null);
});

test("profile storage keeps the path and drops the download token", () => {
  const stored = profilePictureFieldsForStorage(TOKEN_URL, "", "authUser");
  assert.equal(stored.profilePicturePath, "encrypted-media/authUser/abc123");
  assert.equal(stored.profilePictureUrl, null);
});

test("a path is accepted only for the signed-in Firebase user", () => {
  assert.equal(mediaPathOwnedByAuthUid("encrypted-media/authUser/abc123", "authUser"), true);
  assert.equal(mediaPathOwnedByAuthUid("encrypted-media/someoneElse/abc123", "authUser"), false);
  assert.equal(normalizeOwnedMediaPath("encrypted-media/authUser/../secret"), null);
});
