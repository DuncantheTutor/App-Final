import assert from "node:assert/strict";
import { test } from "node:test";

import type { Friend } from "../domain/types.ts";
import { availableStartChatFriends } from "./availableStartChatFriends.ts";

function friend(id: string, displayName = id): Friend {
  return {
    id,
    displayName,
    online: false,
    profilePictureUrl: "",
    bio: "",
    messageCount: 0,
  };
}

const roster = [friend("a", "Amy"), friend("b", "Ben"), friend("c", "Cara")];

test("pins selected friends above the searchable rest", () => {
  const rows = availableStartChatFriends({
    allFriends: roster,
    unfriendedIds: [],
    selectedComposerIds: ["c"],
    composerSearch: "",
    composerMode: "broadcast",
    friendLinksState: {},
  });
  assert.equal(rows[0]?.id, "c");
  assert.deepEqual(
    rows.slice(1).map((f) => f.id),
    ["a", "b"]
  );
});

test("standard mode only offers friends linked to everyone already selected", () => {
  const rows = availableStartChatFriends({
    allFriends: roster,
    unfriendedIds: [],
    selectedComposerIds: ["a"],
    composerSearch: "",
    composerMode: "standard",
    friendLinksState: { a: ["b"] },
  });
  assert.deepEqual(
    rows.map((f) => f.id),
    ["a", "b"]
  );
});

test("search filters only the unselected pool", () => {
  const rows = availableStartChatFriends({
    allFriends: roster,
    unfriendedIds: [],
    selectedComposerIds: ["a"],
    composerSearch: "ca",
    composerMode: "broadcast",
    friendLinksState: {},
  });
  assert.deepEqual(
    rows.map((f) => f.id),
    ["a", "c"]
  );
});

test("unfriended people are excluded even when selected", () => {
  const rows = availableStartChatFriends({
    allFriends: roster,
    unfriendedIds: ["b"],
    selectedComposerIds: ["b"],
    composerSearch: "",
    composerMode: "broadcast",
    friendLinksState: {},
  });
  assert.deepEqual(
    rows.map((f) => f.id),
    ["a", "c"]
  );
});

test("search is case-insensitive", () => {
  const rows = availableStartChatFriends({
    allFriends: roster,
    unfriendedIds: [],
    selectedComposerIds: [],
    composerSearch: "AMY",
    composerMode: "broadcast",
    friendLinksState: {},
  });
  assert.deepEqual(
    rows.map((f) => f.id),
    ["a"]
  );
});

test("standard mode excludes a friend linked to only one of the people already selected", () => {
  const rows = availableStartChatFriends({
    allFriends: roster,
    unfriendedIds: [],
    selectedComposerIds: ["a", "b"],
    composerSearch: "",
    composerMode: "standard",
    friendLinksState: { a: ["b", "c"], b: ["a"] },
  });
  assert.deepEqual(
    rows.map((f) => f.id),
    ["a", "b"]
  );
});
