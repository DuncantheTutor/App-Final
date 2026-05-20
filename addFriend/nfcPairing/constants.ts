/**
 * Identifies the button-driven NFC in-person pairing method (distinct from QR and legacy hold-to-pair).
 * Server phases reuse `nfcPinPairSessions` callables; only RF delivery differs.
 */
export const NFC_PAIRING_METHOD_ID = "nfc_in_person_button_v1" as const;

export type NfcPairingMethodId = typeof NFC_PAIRING_METHOD_ID;

/** Default NDEF read/write race timeout (matches Add Friend screen). */
export const NFC_PAIRING_RF_TIMEOUT_MS = 45_000;

/** Pause after server register before first NDEF write (reduces writer/reader races). */
export const NFC_PAIRING_POST_REGISTER_DELAY_MS = 900;

/** Bounded NDEF write attempts after register. */
export const NFC_PAIRING_WRITE_MAX_ATTEMPTS = 3;

export const NFC_PAIRING_WRITE_RETRY_BASE_MS = 200;
