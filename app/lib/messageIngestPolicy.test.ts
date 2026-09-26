import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldIngestInboundMessage } from "./messageIngestPolicy.ts";

const base = {
  sessionUid: "u_me",
  senderUid: "u_a",
  resolvedChatId: "dm_u_a__u_me",
  knownChatIds: new Set<string>(),
  acceptedFriendBackendUids: new Set<string>(["u_a"]),
};

test("an existing thread is ingested even when the sender is no longer accepted", () => {
  assert.equal(
    shouldIngestInboundMessage({
      ...base,
      knownChatIds: new Set([base.resolvedChatId]),
      acceptedFriendBackendUids: new Set(["u_other"]),
    }),
    true
  );
});

test("a new thread from a non-friend is dropped", () => {
  assert.equal(
    shouldIngestInboundMessage({
      ...base,
      acceptedFriendBackendUids: new Set(["u_other"]),
    }),
    false
  );
});

test("an empty accepted set still allows ingest while the server roster is loading", () => {
  assert.equal(
    shouldIngestInboundMessage({
      ...base,
      acceptedFriendBackendUids: new Set(),
    }),
    true
  );
});

test("a sender on the local roster is ingested when the server set lags", () => {
  assert.equal(
    shouldIngestInboundMessage({
      ...base,
      acceptedFriendBackendUids: new Set(["u_other"]),
      rosterFriendBackendUids: new Set(["u_a"]),
    }),
    true
  );
});

test("the viewer's own uid and a non-account sender are dropped for a new thread", () => {
  assert.equal(shouldIngestInboundMessage({ ...base, senderUid: "u_me" }), false);
  assert.equal(shouldIngestInboundMessage({ ...base, senderUid: "bob" }), false);
});
