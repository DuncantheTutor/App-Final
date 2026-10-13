import assert from "node:assert/strict";
import { test } from "node:test";

import type { PostComment } from "../domain/types.ts";
import { mergeHydratedPostComments, PRIVATE_THREAD_UNREADABLE } from "./mergePostComments.ts";

function comment(overrides: Partial<PostComment> = {}): PostComment {
  return {
    id: "c1",
    authorId: "u_a",
    text: "Hi",
    createdAt: 1,
    ...overrides,
  };
}

test("an optimistic comment stays until the server has the same author and text", () => {
  const pending = comment({ id: "opt_1", authorId: "me", text: "Yo" });
  const merged = mergeHydratedPostComments([pending], [comment()]);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["c1", "opt_1"]
  );
});

test("the optimistic row is dropped once the server copy arrives", () => {
  const pending = comment({ id: "opt_1", authorId: "me", text: "Yo" });
  const server = comment({ id: "c2", authorId: "me", text: "Yo" });
  const merged = mergeHydratedPostComments([pending], [server]);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["c2"]
  );
});

test("a comment that failed to open keeps the text still on this phone", () => {
  const pending = comment({ id: "opt_1", authorId: "me", text: "Yo" });
  const server = comment({ id: "c2", authorId: "me", text: PRIVATE_THREAD_UNREADABLE });
  const merged = mergeHydratedPostComments([pending], [server]);
  assert.deepEqual(
    merged.map((row) => row.text),
    ["Yo"]
  );
  assert.equal(merged.length, 1);
});

test("a reply that failed to open stays on its comment", () => {
  const existing = comment({
    id: "c1",
    thread: [{ id: "opt_thread_1", authorId: "me", text: "Thanks", createdAt: 2 }],
  });
  const server = comment({
    id: "c1",
    thread: [{ id: "t1", authorId: "me", text: PRIVATE_THREAD_UNREADABLE, createdAt: 2 }],
  });
  const merged = mergeHydratedPostComments([existing], [server]);
  assert.equal(merged[0]?.thread?.length, 1);
  assert.equal(merged[0]?.thread?.[0]?.text, "Thanks");
});

test("a server thread that already contains the reply does not keep the optimistic row", () => {
  const pending = comment({ id: "opt_1", authorId: "me", text: "Thanks" });
  const server = comment({
    thread: [{ id: "t1", authorId: "me", text: "Thanks", createdAt: 2 }],
  });
  const merged = mergeHydratedPostComments([pending], [server]);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["c1"]
  );
});
