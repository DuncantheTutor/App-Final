import assert from "node:assert/strict";
import { test } from "node:test";

import type { Post } from "../domain/types.ts";
import { mergeSyncedPosts } from "./mergeEncryptedSync.ts";

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "p1",
    authorId: "u_a",
    createdAt: 1,
    text: "hello",
    ...overrides,
  };
}

const options = { incremental: false, optimisticWindowMs: 0 };

test("a locally deleted id never comes back from the server", () => {
  const row = post();
  const merged = mergeSyncedPosts([row], [row], {
    ...options,
    suppressedPostIds: new Set(["p1"]),
  });
  assert.deepEqual(merged, []);
});

test("a post with deletedAt stays hidden when the server still sends it", () => {
  const merged = mergeSyncedPosts(
    [post({ deletedAt: 9 })],
    [post({ text: "still there" })],
    { incremental: true, optimisticWindowMs: 0 }
  );
  assert.deepEqual(merged, []);
});
