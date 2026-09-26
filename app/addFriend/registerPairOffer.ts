import { callEmulatorFunction } from "../../backendBridge";
import { logAppError, logAppEvent } from "../../telemetry";
import type { PairingProximityEvidence } from "../domain/types";
import type { BackendSession } from "../messaging/types";

function parseRegisterResponse(res: { pairingToken?: string; pin?: string }): string | null {
  const token = String(res.pairingToken ?? res.pin ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return token.length > 0 ? token : null;
}

/** Server-minted QR/NFC offer token (opaque hex). */
export async function registerPairOfferToken(
  session: BackendSession,
  proximityEvidence: PairingProximityEvidence
): Promise<string | null> {
  logAppEvent("pairing.session.create", {});

  try {
    const res = await callEmulatorFunction<{
      ok?: boolean;
      pin?: string;
      pairingToken?: string;
    }>("registerNfcPinPairOffer", {
      uid: session.uid,
      deviceId: session.deviceId,
      proximityEvidence,
    });
    return parseRegisterResponse(res);
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    const lower = raw.toLowerCase();
    logAppError("pairing.session.create", e, {});
    if (lower.includes("404") || lower.includes("not found") || lower.includes("failed to fetch")) {
      throw new Error(
        "Could not reach pairing service. Deploy latest Cloud Functions (registerNfcPinPairOffer and related) or check network."
      );
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}
