import { createHash, randomBytes } from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  PAIRING_DEVICE_CHECK_UNCONFIGURED,
  PAIRING_DEVICE_UNPROVEN,
  verifyProductionPairingAttestation,
} from "./androidKeyAttestation";
import { assertActiveDeviceSession, resolveAppUidFromRequest } from "./deviceSession";
import { getFirestore } from "./firebaseAdmin";
import type { PairingProximityEvidence } from "./pairingProximity";

const PAIRING_DEVICE_CHECKS = "pairingDeviceChecks";
const PAIRING_DEVICE_CHECK_TTL_MS = 2 * 60 * 1000;

export function pairingEvidenceHash(evidence: PairingProximityEvidence): string {
  const body = [
    evidence.lat ?? "",
    evidence.lng ?? "",
    evidence.horizontalAccuracyM ?? "",
    evidence.locationTimestampMs ?? "",
    evidence.isWifiConnected ? "1" : "0",
    evidence.localIp ?? "",
  ].join("|");
  return createHash("sha256").update(body).digest("hex");
}

function decodeCertificateChain(raw: unknown): Buffer[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 6) return [];
  const chain: Buffer[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length < 32 || item.length > 20000) return [];
    const der = Buffer.from(item, "base64");
    if (der.length < 32) return [];
    chain.push(der);
  }
  return chain;
}

/**
 * Binds this pairing call to a one-time hardware attestation of the genuine app.
 * A retry of the same check must present the same location evidence.
 * The emulator skips this so local pairing tests keep working.
 */
export async function consumePairingDeviceProof(args: {
  uid: string;
  deviceId: string;
  deviceCheckId: unknown;
  certificateChain: unknown;
  proximityEvidence: PairingProximityEvidence;
  locationMocked: boolean;
}): Promise<void> {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;
  if (args.locationMocked) {
    throw new HttpsError(
      "failed-precondition",
      "Mock location is turned on. Turn it off to add a friend."
    );
  }
  const checkId = String(args.deviceCheckId ?? "").trim().toLowerCase();
  const chain = decodeCertificateChain(args.certificateChain);
  if (!/^[0-9a-f]{32}$/.test(checkId) || chain.length === 0) {
    throw new HttpsError("failed-precondition", PAIRING_DEVICE_UNPROVEN);
  }

  const db = getFirestore();
  const ref = db.collection(PAIRING_DEVICE_CHECKS).doc(checkId);
  const existing = await ref.get();
  if (existing.exists && Number(existing.data()?.expiresAt ?? 0) < Date.now()) {
    await ref.delete().catch(() => undefined);
    throw new HttpsError("deadline-exceeded", "Pairing device check expired. Try again.");
  }
  const evidenceHash = pairingEvidenceHash(args.proximityEvidence);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", PAIRING_DEVICE_UNPROVEN);
    const data = snap.data() as {
      uid?: string;
      deviceId?: string;
      challengeB64?: string;
      expiresAt?: number;
      consumed?: boolean;
      evidenceHash?: string;
    };
    if (data.uid !== args.uid || data.deviceId !== args.deviceId) {
      throw new HttpsError("permission-denied", PAIRING_DEVICE_UNPROVEN);
    }
    if ((data.expiresAt ?? 0) < Date.now()) {
      throw new HttpsError("deadline-exceeded", "Pairing device check expired. Try again.");
    }
    const challenge = Buffer.from(String(data.challengeB64 ?? ""), "base64");
    try {
      verifyProductionPairingAttestation(chain, challenge, new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === PAIRING_DEVICE_CHECK_UNCONFIGURED) {
        throw new HttpsError("failed-precondition", PAIRING_DEVICE_CHECK_UNCONFIGURED);
      }
      throw new HttpsError("failed-precondition", PAIRING_DEVICE_UNPROVEN);
    }
    if (data.consumed) {
      if (data.evidenceHash === evidenceHash) return;
      throw new HttpsError("failed-precondition", "Pairing device check was already used.");
    }
    tx.update(ref, { consumed: true, evidenceHash });
  });
}

/** Mints the one-time challenge the phone must put in its hardware attestation. */
export const beginPairingDeviceCheck = onCall(async (req) => {
  const uid = await resolveAppUidFromRequest(req);
  const deviceId = String(req.data?.deviceId ?? "").trim();
  await assertActiveDeviceSession(uid, deviceId);
  const checkId = randomBytes(16).toString("hex");
  const challengeB64 = randomBytes(32).toString("base64");
  await getFirestore()
    .collection(PAIRING_DEVICE_CHECKS)
    .doc(checkId)
    .set({
      uid,
      deviceId,
      challengeB64,
      expiresAt: Date.now() + PAIRING_DEVICE_CHECK_TTL_MS,
      consumed: false,
      createdAt: Date.now(),
    });
  return { ok: true, deviceCheckId: checkId, challengeB64 };
});

/** Drops a check after the pairing call that consumed it has succeeded. */
export async function discardPairingDeviceCheck(deviceCheckId: unknown): Promise<void> {
  const checkId = String(deviceCheckId ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(checkId)) return;
  await getFirestore()
    .collection(PAIRING_DEVICE_CHECKS)
    .doc(checkId)
    .delete()
    .catch(() => undefined);
}
