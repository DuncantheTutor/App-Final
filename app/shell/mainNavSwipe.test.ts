import assert from "node:assert/strict";
import { test } from "node:test";

import { neighborMainNav } from "./mainNavOrder.ts";

test("main nav neighbors follow top-bar order", () => {
  assert.equal(neighborMainNav("myProfile", 1), "friendsList");
  assert.equal(neighborMainNav("friendsList", 1), "chats");
  assert.equal(neighborMainNav("chats", 1), "feed");
  assert.equal(neighborMainNav("feed", 1), "addFriend");
  assert.equal(neighborMainNav("addFriend", 1), "settings");
  assert.equal(neighborMainNav("settings", 1), null);
  assert.equal(neighborMainNav("chats", -1), "friendsList");
  assert.equal(neighborMainNav("myProfile", -1), null);
});
