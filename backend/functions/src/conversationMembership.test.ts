import assert from "node:assert/strict";
import test from "node:test";

import {
  decideSendMembership,
  decideUpsertMembership,
  normalizeParticipantUids,
} from "./conversationMembership.ts";

const stored = ["u_me", "u_a", "u_b"];

test("upsert creates when the conversation does not exist", () => {
  assert.equal(decideUpsertMembership(null, ["u_me", "u_a"]), "create");
});

test("upsert is unchanged when the member set matches in any order", () => {
  assert.equal(decideUpsertMembership(stored, ["u_b", "u_me", "u_a"]), "unchanged");
});

test("a member cannot add, drop, or replace people through upsert", () => {
  assert.equal(decideUpsertMembership(stored, ["u_me", "u_a", "u_b", "u_c"]), "reject");
  assert.equal(decideUpsertMembership(stored, ["u_me", "u_a"]), "reject");
  assert.equal(decideUpsertMembership(stored, ["u_me", "u_c"]), "reject");
});

test("send uses the stored members when the client repeats that set", () => {
  const decision = decideSendMembership(stored, ["u_b", "u_a", "u_me"], "u_me");
  assert.deepEqual(decision, { ok: true, participants: ["u_a", "u_b", "u_me"] });
});

test("send uses the stored members when the client omits a list", () => {
  const decision = decideSendMembership(stored, [], "u_a");
  assert.deepEqual(decision, { ok: true, participants: ["u_a", "u_b", "u_me"] });
});

test("a member who passes a different participant list is rejected on send", () => {
  assert.deepEqual(decideSendMembership(stored, ["u_me", "u_a", "u_c"], "u_me"), {
    ok: false,
    reason: "reject",
  });
  assert.deepEqual(decideSendMembership(stored, ["u_me", "u_a"], "u_me"), {
    ok: false,
    reason: "reject",
  });
});

test("send does not create a conversation or accept a non-member", () => {
  assert.deepEqual(decideSendMembership(null, ["u_me", "u_a"], "u_me"), {
    ok: false,
    reason: "missing",
  });
  assert.deepEqual(decideSendMembership([], ["u_me", "u_a"], "u_me"), {
    ok: false,
    reason: "missing",
  });
  assert.deepEqual(decideSendMembership(stored, stored, "u_stranger"), {
    ok: false,
    reason: "not-member",
  });
});

test("participant lists ignore blanks and duplicates", () => {
  assert.deepEqual(normalizeParticipantUids([" u_b ", "u_a", "u_a", ""]), ["u_a", "u_b"]);
});
