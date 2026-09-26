import assert from "node:assert/strict";
import { test } from "node:test";

import type { Chat, Message } from "../domain/types.ts";
import { isIncomingChatUnread } from "./chatUnreadState.ts";

function chat(readBy?: Chat["readBy"]): Chat {
  return {
    id: "c1",
    memberIds: ["me", "u_a"],
    name: "Amy",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: 1,
    readBy,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    chatId: "c1",
    senderId: "u_a",
    text: "hi",
    createdAt: 100,
    ...overrides,
  };
}

const viewer = {
  myUid: "u_me",
  currentUserId: "me",
  currentUserLocalId: "me",
};

test("my own last message is never unread", () => {
  for (const senderId of ["me", "local-me"]) {
    const currentUserId = senderId === "local-me" ? "local-me" : "me";
    assert.equal(
      isIncomingChatUnread({
        chat: chat(),
        lastMessage: message({ senderId }),
        ...viewer,
        currentUserId,
      }),
      false
    );
  }
  assert.equal(
    isIncomingChatUnread({
      chat: chat(),
      lastMessage: message({ senderId: "me" }),
      ...viewer,
      currentUserId: "other-local",
    }),
    false
  );
});

test("a matching last-read message id is read even when the timestamp is newer", () => {
  assert.equal(
    isIncomingChatUnread({
      chat: chat({ u_me: { lastReadAtMs: 1, lastReadMessageId: "m1" } }),
      lastMessage: message({ createdAt: 500 }),
      ...viewer,
    }),
    false
  );
});

test("a message newer than the read cursor is unread, and an equal timestamp is read", () => {
  assert.equal(
    isIncomingChatUnread({
      chat: chat({ u_me: { lastReadAtMs: 100 } }),
      lastMessage: message({ createdAt: 101 }),
      ...viewer,
    }),
    true
  );
  assert.equal(
    isIncomingChatUnread({
      chat: chat({ u_me: { lastReadAtMs: 100 } }),
      lastMessage: message({ createdAt: 100 }),
      ...viewer,
    }),
    false
  );
});

test("no last message or no viewer uid is not unread", () => {
  assert.equal(isIncomingChatUnread({ chat: chat(), lastMessage: undefined, ...viewer }), false);
  assert.equal(
    isIncomingChatUnread({ chat: chat(), lastMessage: message(), ...viewer, myUid: null }),
    false
  );
});
