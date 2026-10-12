import assert from "node:assert/strict";
import { test } from "node:test";

import { pairingQrModules } from "./pairingQrMatrix.ts";

test("a pairing payload encodes a square with a finder pattern", () => {
  const grid = pairingQrModules(`AFQR2|${"ab".repeat(16)}`);
  assert.ok(grid);
  assert.equal(grid.length, grid[0]?.length);
  assert.equal(grid[0]?.[0], true);
  assert.equal(grid[0]?.[6], true);
  assert.equal(grid[6]?.[0], true);
});

test("an empty payload does not encode", () => {
  assert.equal(pairingQrModules("   "), null);
});
