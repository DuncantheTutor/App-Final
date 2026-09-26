import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePairingProximity,
  gpsSeparationAllowed,
  type PairingProximityEvidence,
} from "./pairingProximityMath.ts";

test("gps pairs inside 100m are accepted even with a tight fix", () => {
  const combinedUncertainty = Math.sqrt(10 * 10 + 10 * 10);
  assert.equal(gpsSeparationAllowed(25, combinedUncertainty), true);
  assert.equal(gpsSeparationAllowed(100, combinedUncertainty), true);
});

test("gps pairs clearly beyond 100m and the uncertainty radius are rejected", () => {
  const combinedUncertainty = Math.sqrt(5 * 5 + 5 * 5);
  assert.equal(gpsSeparationAllowed(150, combinedUncertainty), false);
});

test("a coarse fix can still accept a reading slightly over 100m", () => {
  const combinedUncertainty = Math.sqrt(50 * 50 + 50 * 50);
  assert.equal(gpsSeparationAllowed(110, combinedUncertainty), true);
});

test("negative and non-finite separations are rejected", () => {
  assert.equal(gpsSeparationAllowed(-1, 10), false);
  assert.equal(gpsSeparationAllowed(Number.NaN, 10), false);
});

test("the uncertainty radius is an exact boundary", () => {
  const combinedUncertainty = Math.sqrt(50 * 50 + 50 * 50);
  const radius = 1.75 * combinedUncertainty;
  assert.equal(gpsSeparationAllowed(radius, combinedUncertainty), true);
  assert.equal(gpsSeparationAllowed(radius + 0.01, combinedUncertainty), false);
});

const now = 1_700_000_000_000;

function fix(overrides: Partial<PairingProximityEvidence> = {}): PairingProximityEvidence {
  return {
    lat: 51.5,
    lng: -0.12,
    horizontalAccuracyM: 5,
    locationTimestampMs: now,
    isWifiConnected: false,
    localIp: null,
    ...overrides,
  };
}

function wifi(ip: string): PairingProximityEvidence {
  return {
    lat: null,
    lng: null,
    horizontalAccuracyM: null,
    locationTimestampMs: null,
    isWifiConnected: true,
    localIp: ip,
  };
}

test("two usable gps fixes inside 100m are accepted", () => {
  assert.deepEqual(evaluatePairingProximity(fix(), fix({ lat: 51.5001 }), now), { ok: true });
});

test("two usable gps fixes far apart are rejected as gps", () => {
  assert.deepEqual(evaluatePairingProximity(fix(), fix({ lat: 52.5 }), now), { ok: false, reason: "gps" });
});

test("unusable gps falls back to the same private wifi subnet", () => {
  assert.deepEqual(
    evaluatePairingProximity(wifi("192.168.1.10"), wifi("192.168.1.40"), now),
    { ok: true }
  );
});

test("a different subnet or a public address is rejected", () => {
  assert.deepEqual(
    evaluatePairingProximity(wifi("192.168.1.10"), wifi("192.168.2.10"), now),
    { ok: false, reason: "fallback" }
  );
  assert.equal(evaluatePairingProximity(wifi("8.8.8.8"), wifi("8.8.8.9"), now).ok, false);
});

test("172.16 through 172.31 are private and 172.32 is not", () => {
  assert.equal(evaluatePairingProximity(wifi("172.16.1.2"), wifi("172.16.1.9"), now).ok, true);
  assert.equal(evaluatePairingProximity(wifi("172.31.1.2"), wifi("172.31.1.9"), now).ok, true);
  assert.equal(evaluatePairingProximity(wifi("172.32.1.2"), wifi("172.32.1.9"), now).ok, false);
});

test("a stale fix is not used as gps and a coarse fix with no wifi is rejected", () => {
  const stale = fix({
    locationTimestampMs: now - 61_000,
    isWifiConnected: true,
    localIp: "10.0.0.2",
  });
  const peer = fix({ lat: 80, isWifiConnected: true, localIp: "10.0.0.8" });
  assert.equal(evaluatePairingProximity(stale, peer, now).ok, true);
  assert.deepEqual(
    evaluatePairingProximity(fix({ horizontalAccuracyM: 51 }), fix({ lat: 60, horizontalAccuracyM: 51 }), now),
    { ok: false, reason: "fallback" }
  );
});
