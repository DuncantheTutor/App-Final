import { NativeModules, Platform } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import type { PairingProximityEvidence } from "../domain/types";
import { collectPrecisePairingProximityEvidence } from "../lib/pairingLocation";

const UNPROVEN = "This phone could not prove it is the genuine Erdos app.";
const HARDWARE_KEY = "This phone could not create a hardware key for Add Friend. Update the app and try again.";

type AttestationNative = {
  createAttestation(challengeB64: string): Promise<string[]>;
};

function nativeAttestation(): AttestationNative | null {
  const native = NativeModules.ErdosPairingAttestation as AttestationNative | undefined;
  if (!native?.createAttestation) return null;
  return native;
}

async function createAndroidPairingAttestation(challengeB64: string): Promise<string[]> {
  if (Platform.OS !== "android") {
    throw new Error("Add Friend device check requires Android.");
  }
  const native = nativeAttestation();
  if (!native) {
    throw new Error(`${UNPROVEN} Rebuild the Android app and try again.`);
  }
  const chain = await native.createAttestation(challengeB64);
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error(UNPROVEN);
  }
  return chain.map((item) => String(item));
}

function proofError(err: unknown): Error {
  const message = err instanceof Error ? err.message.trim() : "";
  if (
    message.includes("Mock location") ||
    message.includes("genuine Erdos app") ||
    message.includes("not configured") ||
    message.includes("expired") ||
    message.includes("Turn on GPS") ||
    message.includes("Precise location") ||
    message.includes("hardware key") ||
    message.includes("requires Android")
  ) {
    return err instanceof Error ? err : new Error(message);
  }
  return new Error(HARDWARE_KEY);
}

/** Location plus a one-time hardware attestation for a pairing callable. */
export async function collectPairingDeviceProof(session: {
  uid: string;
  deviceId: string;
}): Promise<{
  proximityEvidence: PairingProximityEvidence;
  deviceCheckId: string;
  certificateChain: string[];
}> {
  let deviceCheckId = "";
  let certificateChain: string[] = [];
  const skipAttestation = __DEV__ && (Platform.OS !== "android" || !nativeAttestation());
  if (!skipAttestation) {
    try {
      const begun = await callEmulatorFunction<{
        deviceCheckId?: string;
        challengeB64?: string;
      }>("beginPairingDeviceCheck", {
        uid: session.uid,
        deviceId: session.deviceId,
      });
      deviceCheckId = String(begun.deviceCheckId ?? "").trim();
      const challengeB64 = String(begun.challengeB64 ?? "").trim();
      if (!deviceCheckId || !challengeB64) throw new Error(UNPROVEN);
      certificateChain = await createAndroidPairingAttestation(challengeB64);
    } catch (err) {
      throw proofError(err);
    }
  }
  const proximityEvidence = await collectPrecisePairingProximityEvidence({ fresh: true });
  if (proximityEvidence.locationMocked && !__DEV__) {
    throw new Error("Mock location is turned on. Turn it off to add a friend.");
  }
  return { proximityEvidence, deviceCheckId, certificateChain };
}
