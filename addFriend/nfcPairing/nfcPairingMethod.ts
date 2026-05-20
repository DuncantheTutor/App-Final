import { Platform } from "react-native";

import { readAddFriendNdefPayload, writeAddFriendNdefPayload } from "../nfc/handshake";
import {
  NFC_PAIRING_METHOD_ID,
  NFC_PAIRING_POST_REGISTER_DELAY_MS,
  NFC_PAIRING_RF_TIMEOUT_MS,
  NFC_PAIRING_WRITE_MAX_ATTEMPTS,
  NFC_PAIRING_WRITE_RETRY_BASE_MS,
} from "./constants";
import { encodeNfcPairingNdefPayload, parseNfcPairingNdefPayloadAnyVersion } from "./protocol";
import type {
  NfcPairingFailure,
  NfcPairingFlowHooks,
  NfcPairingPresenterResult,
  NfcPairingResponderResult,
  NfcPairingServerBridge,
} from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failure(stage: string, userMessage: string): NfcPairingFailure {
  return { ok: false, methodId: NFC_PAIRING_METHOD_ID, stage, userMessage };
}

/**
 * NFC pairing — sender (`share`): register session → write NDEF → poll until joiner confirms proximity.
 * Mirrors QR presenter flow; does not finalize friendship (screen dual-confirm handles that).
 */
export async function runNfcPairingPresenterFlow<TFriend>(
  server: NfcPairingServerBridge<TFriend>,
  hooks: NfcPairingFlowHooks,
  options?: { rfTimeoutMs?: number }
): Promise<NfcPairingPresenterResult<TFriend>> {
  const rfTimeoutMs = options?.rfTimeoutMs ?? NFC_PAIRING_RF_TIMEOUT_MS;
  const attemptId = `nfc-presenter-${Date.now()}`;

  if (Platform.OS === "web") {
    return failure("unsupported_web", "NFC pairing is not available on web. Use QR instead.");
  }

  hooks.logEvent("pairing.nfc.method.presenter.start", { attemptId, methodId: NFC_PAIRING_METHOD_ID });
  hooks.onStatus("NFC: preparing…");

  const sessionHandle = await server.registerSessionWithRetry();
  hooks.logEvent("pairing.nfc.method.register.result", { attemptId, ok: !!sessionHandle });
  if (hooks.isCancelled()) {
    return failure("cancelled", "NFC pairing cancelled.");
  }
  if (!sessionHandle) {
    return failure(
      "register_failed",
      "NFC: could not reserve a session. Check network and try again, or switch to QR."
    );
  }

  hooks.onStatus("NFC: ask your friend to tap Receive, then keep phones close…");
  await sleep(NFC_PAIRING_POST_REGISTER_DELAY_MS);
  if (hooks.isCancelled()) {
    await server.cancelSession(sessionHandle).catch(() => {});
    return failure("cancelled", "NFC pairing cancelled.");
  }

  const ndefPayload = encodeNfcPairingNdefPayload(sessionHandle);
  let written = false;
  for (let attempt = 1; attempt <= NFC_PAIRING_WRITE_MAX_ATTEMPTS; attempt += 1) {
    hooks.logEvent("pairing.nfc.method.write.start", {
      attemptId,
      attempt,
      payloadLen: ndefPayload.length,
    });
    hooks.onStatus(
      attempt > 1 ? `NFC: sending… (retry ${attempt}/${NFC_PAIRING_WRITE_MAX_ATTEMPTS})` : "NFC: sending…"
    );
    written = await writeAddFriendNdefPayload(ndefPayload, rfTimeoutMs, "transmit");
    hooks.logEvent("pairing.nfc.method.write.result", { attemptId, attempt, written });
    if (written) break;
    if (attempt < NFC_PAIRING_WRITE_MAX_ATTEMPTS) {
      await sleep(NFC_PAIRING_WRITE_RETRY_BASE_MS * attempt);
    }
  }

  if (hooks.isCancelled()) {
    await server.cancelSession(sessionHandle).catch(() => {});
    return failure("cancelled", "NFC pairing cancelled.");
  }
  if (!written) {
    await server.cancelSession(sessionHandle).catch(() => {});
    return failure(
      "write_failed",
      "NFC send failed. Turn NFC on, keep phones close, or switch to QR."
    );
  }

  hooks.onStatus("NFC: waiting for your friend to confirm…");
  hooks.logEvent("pairing.nfc.method.await_redeem.start", { attemptId });
  const friend = await server.awaitRedeem(sessionHandle);
  hooks.logEvent("pairing.nfc.method.await_redeem.result", {
    attemptId,
    accepted: !!friend,
    friendId: friend && typeof friend === "object" && "id" in friend ? (friend as { id: string }).id : null,
  });

  if (hooks.isCancelled()) {
    await server.cancelSession(sessionHandle).catch(() => {});
    return failure("cancelled", "NFC pairing cancelled.");
  }
  if (!friend) {
    await server.cancelSession(sessionHandle).catch(() => {});
    return failure(
      "await_redeem_timeout",
      "NFC: no one confirmed before this offer expired. Try again or use QR."
    );
  }

  hooks.onStatus("NFC verified. Confirm this friend.");
  hooks.logEvent("pairing.nfc.method.presenter.ok", { attemptId, methodId: NFC_PAIRING_METHOD_ID });
  return { ok: true, methodId: NFC_PAIRING_METHOD_ID, sessionHandle, friend };
}

/**
 * NFC pairing — receiver (`join`): read NDEF → `confirmNfcPinPairOffer` (proximity inside server).
 * Receiver must tap Receive before sender taps Send (RF order).
 */
export async function runNfcPairingResponderFlow<TFriend>(
  server: NfcPairingServerBridge<TFriend>,
  hooks: NfcPairingFlowHooks,
  options?: { rfTimeoutMs?: number }
): Promise<NfcPairingResponderResult<TFriend>> {
  const rfTimeoutMs = options?.rfTimeoutMs ?? NFC_PAIRING_RF_TIMEOUT_MS;
  const attemptId = `nfc-responder-${Date.now()}`;

  if (Platform.OS === "web") {
    return failure("unsupported_web", "NFC pairing is not available on web. Use QR instead.");
  }

  hooks.logEvent("pairing.nfc.method.responder.start", { attemptId, methodId: NFC_PAIRING_METHOD_ID });
  hooks.onStatus("NFC: listening… Ask your friend to tap Send, then keep phones close.");

  hooks.logEvent("pairing.nfc.method.read.start", { attemptId });
  const plain = await readAddFriendNdefPayload(rfTimeoutMs, "receive");
  hooks.logEvent("pairing.nfc.method.read.result", {
    attemptId,
    hasPayload: !!plain,
    payloadLen: plain?.length ?? 0,
  });

  if (hooks.isCancelled()) {
    return failure("cancelled", "NFC pairing cancelled.");
  }

  const sessionHandle = plain ? parseNfcPairingNdefPayloadAnyVersion(plain) : null;
  if (!sessionHandle) {
    return failure(
      "invalid_payload",
      "NFC: could not read a valid pairing code. Tap Receive first, then ask your friend to Send."
    );
  }

  hooks.onStatus("NFC: verifying proximity…");
  hooks.logEvent("pairing.nfc.method.confirm.start", { attemptId });
  const friend = await server.confirmRead(sessionHandle);
  hooks.logEvent("pairing.nfc.method.confirm.result", {
    attemptId,
    accepted: !!friend,
    friendId: friend && typeof friend === "object" && "id" in friend ? (friend as { id: string }).id : null,
  });

  if (hooks.isCancelled()) {
    return failure("cancelled", "NFC pairing cancelled.");
  }
  if (!friend) {
    return failure("confirm_rejected", "Add friend failed. Check location and proximity, or try QR.");
  }

  hooks.onStatus("NFC verified. Confirm this friend.");
  hooks.logEvent("pairing.nfc.method.responder.ok", { attemptId, methodId: NFC_PAIRING_METHOD_ID });
  return { ok: true, methodId: NFC_PAIRING_METHOD_ID, sessionHandle, friend };
}

/** Returns true when this pairing method can run on the current platform. */
export async function isNfcPairingMethodAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { getAddFriendNfcAvailability } = await import("../nfc/handshake");
  const state = await getAddFriendNfcAvailability();
  return state === "ready";
}
