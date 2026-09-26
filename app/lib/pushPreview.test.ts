import assert from "node:assert/strict";
import { test } from "node:test";

import { PUSH_PREVIEW_MAX_CHARS, buildChatMessagePushCopy } from "./pushPreview.ts";

const viewer = "me";

test("a 1:1 title uses the sender name", () => {
  const copy = buildChatMessagePushCopy({
    chat: { name: "My name", kind: "standard", memberIds: [viewer, "u_a"] },
    message: { text: "hello", kind: "text" },
    currentUserLocalId: viewer,
    senderDisplayName: "Amy",
  });
  assert.equal(copy.title, "New message from Amy");
  assert.equal(copy.body, "hello");
});

test("a blank 1:1 sender falls back to Someone", () => {
  const copy = buildChatMessagePushCopy({
    chat: { name: "", kind: "standard", memberIds: [viewer, "u_a"] },
    message: { text: "hello", kind: "text" },
    currentUserLocalId: viewer,
    senderDisplayName: "  ",
  });
  assert.equal(copy.title, "New message from Someone");
});

test("a group uses the chat title, or Group chat when the title is blank", () => {
  const named = buildChatMessagePushCopy({
    chat: { name: "Trip", kind: "standard", memberIds: [viewer, "u_a", "u_b"] },
    message: { text: "hi", kind: "text" },
    currentUserLocalId: viewer,
    senderDisplayName: "Amy",
  });
  assert.equal(named.title, "New message from Trip");
  const untitled = buildChatMessagePushCopy({
    chat: { name: "  ", kind: "standard", memberIds: [viewer, "u_a", "u_b"] },
    message: { text: "hi", kind: "text" },
    currentUserLocalId: viewer,
    senderDisplayName: "Amy",
  });
  assert.equal(untitled.title, "New message from Group chat");
});

test("a broadcast uses its title", () => {
  const copy = buildChatMessagePushCopy({
    chat: { name: "News", kind: "broadcast", memberIds: [viewer, "u_a"] },
    message: { text: "hi", kind: "text" },
    currentUserLocalId: viewer,
    senderDisplayName: "Amy",
  });
  assert.equal(copy.title, "New message from News");
  const untitled = buildChatMessagePushCopy({
    chat: { name: "", kind: "broadcast", memberIds: [viewer] },
    message: { text: "hi", kind: "text" },
    currentUserLocalId: viewer,
    senderDisplayName: "Amy",
  });
  assert.equal(untitled.title, "New message from Broadcast");
});

test("media without a caption uses a fixed label, and long text is cut", () => {
  for (const [kind, body] of [
    ["photo", "Photo"],
    ["video", "Video"],
    ["voice", "Voice note"],
    ["gif", "GIF"],
  ] as const) {
    const copy = buildChatMessagePushCopy({
      chat: { name: "Amy", kind: "standard", memberIds: [viewer, "u_a"] },
      message: { text: "  ", kind },
      currentUserLocalId: viewer,
      senderDisplayName: "Amy",
    });
    assert.equal(copy.body, body);
  }
  const long = "a".repeat(PUSH_PREVIEW_MAX_CHARS + 20);
  const copy = buildChatMessagePushCopy({
    chat: { name: "Amy", kind: "standard", memberIds: [viewer, "u_a"] },
    message: { text: long, kind: "text" },
    currentUserLocalId: viewer,
    senderDisplayName: "Amy",
  });
  assert.equal(copy.body.endsWith("…"), true);
  assert.equal(copy.body.length <= PUSH_PREVIEW_MAX_CHARS, true);
  assert.notEqual(copy.body, long);
});
