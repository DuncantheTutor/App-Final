import assert from "node:assert/strict";
import { test } from "node:test";

import type { Chat, Friend } from "../domain/types.ts";
import {
  canonicalDirectChatLocalId,
  liveDirectChatLocalIdBase,
  resolveDirectChatOpenTarget,
  resolveInboundDirectMessageTarget,
} from "./directChatId.ts";

const sessionAppUid = "u_me";
const friendUid = "u_amy";
const canonicalId = canonicalDirectChatLocalId(sessionAppUid, friendUid);
const liveId = liveDirectChatLocalIdBase(sessionAppUid, friendUid);

function chat(id: string): Chat {
  return {
    id,
    memberIds: ["me", friendUid],
    name: "Amy",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: 1,
    kind: "standard",
  };
}

const friend: Friend = {
  id: friendUid,
  backendUid: friendUid,
  displayName: "Amy",
  online: false,
  profilePictureUrl: "",
  bio: "",
  messageCount: 0,
};

const friendMap = { [friendUid]: friend };

function open(overrides: Partial<Parameters<typeof resolveDirectChatOpenTarget>[0]> = {}) {
  return resolveDirectChatOpenTarget({
    requestedChatId: canonicalId,
    chats: [chat(canonicalId), chat(liveId)],
    sessionAppUid,
    friendMap,
    friendIdToBackendUid: { [friendUid]: friendUid },
    identityLockedChatIds: new Set([canonicalId]),
    unfriendedIds: [],
    serverAcceptedFriendBackendUids: new Set([friendUid]),
    hiddenLocalChatIds: new Set(),
    hiddenServerConversationIds: new Set(),
    resolveMemberFriendId: (memberId) => memberId,
    ...overrides,
  });
}

test("tapping a locked User row while friends again opens the live thread", () => {
  assert.equal(open().targetChatId, liveId);
});

test("a refriend with no live row allocates dm_*__live", () => {
  const result = open({ chats: [chat(canonicalId)] });
  assert.equal(result.targetChatId, liveId);
  assert.deepEqual(result.allocateLive, { localId: liveId, friendId: friendUid });
});

test("while unfriended, opening the tombstone stays on that thread", () => {
  const result = open({
    unfriendedIds: [friendUid],
    serverAcceptedFriendBackendUids: new Set(),
  });
  assert.equal(result.targetChatId, canonicalId);
  assert.equal(result.allocateLive, undefined);
});

test("a second refriend allocates __live2 when __live is already locked", () => {
  const result = open({
    identityLockedChatIds: new Set([canonicalId, liveId]),
  });
  assert.equal(result.targetChatId, `${liveId}2`);
  assert.equal(result.allocateLive?.localId, `${liveId}2`);
});

test("inbound messages on a hidden canonical conversation land on the live row", () => {
  const target = resolveInboundDirectMessageTarget({
    conversationId: `enc_${canonicalId}`,
    rawLocalChatId: canonicalId,
    senderAppUid: friendUid,
    sessionAppUid,
    chats: [chat(liveId)],
    friendMap,
    friendIdToBackendUid: { [friendUid]: friendUid },
    hiddenLocalChatIds: new Set([canonicalId]),
    hiddenServerConversationIds: new Set(),
  });
  assert.equal("drop" in target, false);
  if ("drop" in target) return;
  assert.equal(target.resolvedLocalChatId, liveId);
  assert.equal(target.ensureLiveChat, undefined);
});

test("inbound on a hidden canonical thread allocates a live row when none exists", () => {
  const target = resolveInboundDirectMessageTarget({
    conversationId: `enc_${canonicalId}`,
    rawLocalChatId: canonicalId,
    senderAppUid: friendUid,
    sessionAppUid,
    chats: [],
    friendMap,
    friendIdToBackendUid: { [friendUid]: friendUid },
    hiddenLocalChatIds: new Set([canonicalId]),
    hiddenServerConversationIds: new Set(),
  });
  assert.equal("drop" in target, false);
  if ("drop" in target) return;
  assert.equal(target.resolvedLocalChatId, liveId);
  assert.deepEqual(target.ensureLiveChat, { localId: liveId, friendBackendUid: friendUid });
});
