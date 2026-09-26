import assert from "node:assert/strict";
import { test } from "node:test";

import type { PostComment } from "../domain/types.ts";
import { mergeHydratedPostComments } from "./mergePostComments.ts";

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
