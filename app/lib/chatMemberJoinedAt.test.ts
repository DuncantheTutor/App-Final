import assert from "node:assert/strict";
import { test } from "node:test";

import type { Chat } from "../domain/types.ts";
import { joinCutoffMsForViewer } from "./chatMemberJoinedAt.ts";

function chat(memberJoinedAt?: Chat["memberJoinedAt"]): Chat {
  return {
    id: "c1",
    memberIds: ["me", "u_a"],
    name: "Amy",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: 1,
    memberJoinedAt,
  };
}

test("the local me key wins over the server uid", () => {
  assert.equal(joinCutoffMsForViewer(chat({ me: 50, u_me: 80 }), "u_me"), 50);
});

test("the server uid is used when the local key is missing", () => {
  assert.equal(joinCutoffMsForViewer(chat({ u_me: 80 }), "u_me"), 80);
});

test("a missing join map means cutoff 0", () => {
  assert.equal(joinCutoffMsForViewer(chat(), "u_me"), 0);
  assert.equal(joinCutoffMsForViewer(undefined, "u_me"), 0);
});
