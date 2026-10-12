import { HttpsError } from "firebase-functions/v2/https";

import {
  evaluatePairingProximity,
  type PairingProximityEvidence,
} from "./pairingProximityMath";

export type { PairingProximityEvidence } from "./pairingProximityMath";

export function assertPairingProximity(
  a: PairingProximityEvidence,
  b: PairingProximityEvidence,
  nowMs: number
): void {
  const verdict = evaluatePairingProximity(a, b, nowMs);
  if (verdict.ok) return;
  if (verdict.reason === "gps") {
    throw new HttpsError(
      "failed-precondition",
      "Could not verify in-person proximity (GPS distance exceeds 100m cap)."
    );
  }
  if (verdict.reason === "fallback") {
    throw new HttpsError(
      "failed-precondition",
      "Could not verify proximity with GPS. Connect both phones to the same Wi-Fi network (personal hotspot also counts) and try again."
    );
  }
  throw new HttpsError(
    "failed-precondition",
    "Turn on GPS and wait for a location fix before adding a friend."
  );
}
