import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { appUidsFromEdgeParticipants, friendshipId } from "./friendIndexIds.ts";

const srcDir = path.join(process.cwd(), "backend", "functions", "src");

test("friendship ids are the same for either order", () => {
  assert.equal(friendshipId("u_b", "u_a"), "u_a_u_b");
  assert.equal(friendshipId("u_a", "u_b"), friendshipId("u_b", "u_a"));
});

test("edge participants keep other app uids only", () => {
  assert.deepEqual(
    appUidsFromEdgeParticipants("u_me", ["u_me", "u_friend", "firebaseAuthUid", ""]),
    ["u_friend"]
  );
  assert.deepEqual(appUidsFromEdgeParticipants("u_me", "nope"), []);
});

test("presence heartbeat does not rescan friends or rewrite their docs", () => {
  const src = readFileSync(path.join(srcDir, "socialExtensions.ts"), "utf8");
  const start = src.indexOf("export async function writePresenceWithViewers");
  const end = src.indexOf("/** Normalize stored heartbeat");
  assert.ok(start >= 0 && end > start);
  const fn = src.slice(start, end);
  assert.equal(fn.includes("getAcceptedFriendUids"), false);
  assert.equal(fn.includes("viewerAuthUids"), false);
});

test("auth registration skips the friend fan-out when the map is already current", () => {
  const src = readFileSync(path.join(srcDir, "index.ts"), "utf8");
  assert.match(src, /mapped === firebaseAuthUid && reverseApp === uid/);
  assert.equal(src.includes("async function normalizeParticipantToAppUid"), false);
  assert.equal(src.includes("async function assertAcceptedFriendship"), false);
});
