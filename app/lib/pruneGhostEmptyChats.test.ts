import assert from "node:assert/strict";
import { test } from "node:test";

import type { Chat, Message } from "../domain/types.ts";
import { pruneGhostEmptyChats } from "./pruneGhostEmptyChats.ts";

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: "c1",
    memberIds: ["me", "u_a"],
    name: "Amy",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: 1,
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    chatId: "c1",
    senderId: "u_a",
    text: "hi",
    createdAt: 1,
    ...overrides,
  };
}

test("a thread with a visible message is kept", () => {
  const kept = pruneGhostEmptyChats([chat()], [message()], "me");
  assert.deepEqual(kept.map((row) => row.id), ["c1"]);
});

test("a chat with no messages and no draft is removed", () => {
  assert.deepEqual(pruneGhostEmptyChats([chat()], [], "me"), []);
});

test("my draft with saved text is kept", () => {
  const kept = pruneGhostEmptyChats(
    [chat({ isDraft: true, createdBy: "me", draftComposerText: "later" })],
    [],
    "me"
  );
  assert.equal(kept.length, 1);
});

test("someone else's draft, or a whitespace draft, is removed", () => {
  const rows = pruneGhostEmptyChats(
    [
      chat({ id: "theirs", isDraft: true, createdBy: "u_a", draftComposerText: "secret" }),
      chat({ id: "blank", isDraft: true, createdBy: "me", draftComposerText: "   " }),
    ],
    [],
    "me"
  );
  assert.deepEqual(rows, []);
});

test("a message hidden from the owner does not keep the row", () => {
  const kept = pruneGhostEmptyChats([chat()], [message({ hiddenFromOwner: true })], "me");
  assert.deepEqual(kept, []);
});
