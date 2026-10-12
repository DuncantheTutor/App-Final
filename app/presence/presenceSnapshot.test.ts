import assert from "node:assert/strict";
import { test } from "node:test";

import { presenceSnapshotSaysActive } from "./presenceSnapshot.ts";

const windowMs = 45_000;
const now = 1_700_000_000_000;

test("a fresh foreground heartbeat is online", () => {
  assert.equal(
    presenceSnapshotSaysActive(
      { state: "active", online: true, heartbeatAtMs: now - 1_000 },
      now,
      windowMs
    ),
    true
  );
});

test("online true with a stale or missing heartbeat is offline", () => {
  assert.equal(
    presenceSnapshotSaysActive(
      { state: "active", online: true, heartbeatAtMs: now - 46_000 },
      now,
      windowMs
    ),
    false
  );
  assert.equal(presenceSnapshotSaysActive({ online: true }, now, windowMs), false);
});

test("background or explicit offline is not active", () => {
  assert.equal(
    presenceSnapshotSaysActive(
      { state: "background", online: false, heartbeatAtMs: now },
      now,
      windowMs
    ),
    false
  );
  assert.equal(
    presenceSnapshotSaysActive(
      { state: "active", online: false, heartbeatAtMs: now },
      now,
      windowMs
    ),
    false
  );
});
