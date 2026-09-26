import assert from "node:assert/strict";
import test from "node:test";

import { assertLegacyFriendshipCallableAllowed } from "./legacyPairingGate.ts";

function withEmulatorFlag(value: string | undefined, run: () => void): void {
  const previous = process.env.FUNCTIONS_EMULATOR;
  if (value === undefined) delete process.env.FUNCTIONS_EMULATOR;
  else process.env.FUNCTIONS_EMULATOR = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = previous;
  }
}

test("legacy friendship callables are refused outside the emulator", () => {
  withEmulatorFlag(undefined, () => {
    assert.throws(
      () => assertLegacyFriendshipCallableAllowed(),
      /retired/
    );
  });
});

test("legacy friendship callables stay available in the emulator", () => {
  withEmulatorFlag("true", () => {
    assert.doesNotThrow(() => assertLegacyFriendshipCallableAllowed());
  });
});
