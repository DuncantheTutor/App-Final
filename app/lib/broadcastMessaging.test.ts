import assert from "node:assert/strict";
import { test } from "node:test";

import { canReplyToBroadcastMessage, isBroadcastMessageVisibleToViewer } from "./broadcastMessaging.ts";

const chat = { kind: "broadcast" as const, createdBy: "creator" };
const viewer = "recipientA";

test("a recipient sees general posts, their private thread, and their own replies", () => {
  assert.equal(
    isBroadcastMessageVisibleToViewer({ senderId: "creator" }, chat, viewer),
    true
  );
  assert.equal(
    isBroadcastMessageVisibleToViewer(
      { senderId: "creator", broadcastThreadFriendId: "recipientA" },
      chat,
      viewer
    ),
    true
  );
  assert.equal(
    isBroadcastMessageVisibleToViewer(
      { senderId: "recipientA", broadcastThreadFriendId: "recipientA" },
      chat,
      viewer
    ),
    true
  );
});

test("a recipient does not see another recipient's private thread", () => {
  assert.equal(
    isBroadcastMessageVisibleToViewer(
      { senderId: "recipientB", broadcastThreadFriendId: "recipientB" },
      chat,
      viewer
    ),
    false
  );
  assert.equal(
    isBroadcastMessageVisibleToViewer(
      { senderId: "creator", broadcastThreadFriendId: "recipientB" },
      chat,
      viewer
    ),
    false
  );
});

test("a recipient can reply only to a broadcaster message", () => {
  assert.equal(canReplyToBroadcastMessage({ senderId: "creator" }, chat, viewer), true);
  assert.equal(
    canReplyToBroadcastMessage(
      { senderId: "recipientA", broadcastThreadFriendId: "recipientA" },
      chat,
      viewer
    ),
    false
  );
  assert.equal(
    canReplyToBroadcastMessage(
      { senderId: "recipientB", broadcastThreadFriendId: "recipientB" },
      chat,
      viewer
    ),
    false
  );
});

test("an unsent message is not replyable, and the creator can reply to anything else", () => {
  assert.equal(
    canReplyToBroadcastMessage({ senderId: "creator", unsentAt: 10 }, chat, "creator"),
    false
  );
  assert.equal(
    canReplyToBroadcastMessage(
      { senderId: "recipientA", broadcastThreadFriendId: "recipientA" },
      chat,
      "creator"
    ),
    true
  );
});

test("a normal chat does not apply broadcast visibility rules", () => {
  const direct = { kind: "standard" as const, createdBy: "creator" };
  assert.equal(
    isBroadcastMessageVisibleToViewer({ senderId: "recipientB" }, direct, viewer),
    true
  );
  assert.equal(canReplyToBroadcastMessage({ senderId: "recipientB" }, direct, viewer), true);
});
