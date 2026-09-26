import assert from "node:assert/strict";
import test from "node:test";

import { firstNonFriendPair } from "./pairwiseFriendship.ts";

test("a group is allowed when every pair is friends", () => {
  const friends = new Set(["a|b", "a|c", "b|c"]);
  const areFriends = (left: string, right: string) => friends.has([left, right].sort().join("|"));
  assert.equal(firstNonFriendPair(["a", "b", "c"], areFriends), null);
});

test("group create finds a pair that is not friends", () => {
  const friends = new Set(["a|b", "a|c"]);
  const areFriends = (left: string, right: string) => friends.has([left, right].sort().join("|"));
  assert.deepEqual(firstNonFriendPair(["a", "b", "c"], areFriends), ["b", "c"]);
});

test("blanks and duplicates are ignored, and one person is allowed", () => {
  assert.equal(firstNonFriendPair([" a ", "a", ""], () => false), null);
  assert.equal(firstNonFriendPair(["solo"], () => false), null);
  assert.deepEqual(firstNonFriendPair(["b", "a", "b"], () => false), ["b", "a"]);
});
