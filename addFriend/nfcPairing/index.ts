/**
 * NFC in-person pairing method (`nfc_in_person_button_v1`).
 * Plugs into Add Friend via {@link runNfcPairingPresenterFlow} / {@link runNfcPairingResponderFlow}
 * and the same server bridge as QR (`registerNfcPinPairOffer`, `confirmNfcPinPairOffer`, …).
 */
export {
  NFC_PAIRING_METHOD_ID,
  NFC_PAIRING_POST_REGISTER_DELAY_MS,
  NFC_PAIRING_RF_TIMEOUT_MS,
  NFC_PAIRING_WRITE_MAX_ATTEMPTS,
  NFC_PAIRING_WRITE_RETRY_BASE_MS,
} from "./constants";
export type { NfcPairingMethodId } from "./constants";
export {
  encodeNfcPairingNdefPayload,
  parseNfcPairingNdefPayload,
  parseNfcPairingNdefPayloadAnyVersion,
  parseNfcPairingNdefPayloadV2,
} from "./protocol";
export type { NfcPairingSessionHandle } from "./protocol";
export {
  isNfcPairingMethodAvailable,
  runNfcPairingPresenterFlow,
  runNfcPairingResponderFlow,
} from "./nfcPairingMethod";
export type {
  NfcPairingFailure,
  NfcPairingFlowHooks,
  NfcPairingPresenterResult,
  NfcPairingPresenterSuccess,
  NfcPairingResponderResult,
  NfcPairingResponderSuccess,
  NfcPairingServerBridge,
} from "./types";
