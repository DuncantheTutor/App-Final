import assert from "node:assert/strict";
import { test } from "node:test";

import { messageSyncCursorMs, nextSafeWatermarkMs } from "./syncWatermark.ts";

test("an older decode failure caps the watermark just below that message", () => {
  assert.equal(
    nextSafeWatermarkMs({ prior: 0, successCursorMs: 500, earliestFailureMs: 200 }),
    199
  );
});

test("the watermark never moves backward past the prior cursor", () => {
  assert.equal(
    nextSafeWatermarkMs({ prior: 300, successCursorMs: 500, earliestFailureMs: 200 }),
    300
  );
});

test("no failure advances to the success cursor", () => {
  assert.equal(nextSafeWatermarkMs({ prior: 10, successCursorMs: 40, earliestFailureMs: null }), 40);
});

test("a non-finite failure timestamp is ignored", () => {
  assert.equal(
    nextSafeWatermarkMs({ prior: 10, successCursorMs: 40, earliestFailureMs: Number.NaN }),
    40
  );
});

test("an edit moves the sync cursor to the later timestamp", () => {
  assert.equal(messageSyncCursorMs({ createdAt: 100, editedAt: 250 }), 250);
  assert.equal(messageSyncCursorMs({ createdAt: 100, editedAt: null }), 100);
});
