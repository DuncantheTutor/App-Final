import assert from "node:assert/strict";
import test from "node:test";

import { assertEmailOtpAvailable } from "./emailOtpAvailability.ts";

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

test("email OTP is refused outside the emulator", () => {
  withEmulatorFlag(undefined, () => {
    assert.throws(() => assertEmailOtpAvailable(), /mail sender/);
  });
});

test("email OTP stays available in the emulator", () => {
  withEmulatorFlag("true", () => {
    assert.doesNotThrow(() => assertEmailOtpAvailable());
  });
});
