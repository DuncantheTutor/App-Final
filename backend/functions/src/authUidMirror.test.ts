import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const srcDir = path.join(process.cwd(), "backend", "functions", "src");

test("auth uid mirrors are resolved in one module", () => {
  for (const name of ["index.ts", "socialExtensions.ts", "legacyFriendshipCallables.ts"]) {
    const src = readFileSync(path.join(srcDir, name), "utf8");
    assert.equal(src.includes("function resolveParticipantAuthUids"), false, name);
    assert.match(src, /from "\.\/authUidMirror"/, name);
  }
});
