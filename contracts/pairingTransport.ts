/**
 * Out-of-band delivery of the short-lived pairing secret (QR + optional NFC payload helpers).
 * Callables wired via `FirebaseCallables`; `proximityEvidence` is enforced server-side (see Planning).
 */

export type PairingTransportKind = "qr" | "nfc";

/** Identifies the button-driven NFC method implemented in `addFriend/nfcPairing/`. */
export const NFC_PAIRING_METHOD_ID = "nfc_in_person_button_v1" as const;

/** Opaque string carrying the session handle for the joiner (QR barcode or NFC NDEF). */
export type PairingEncodedOffer = string;

export type PairingTransportCapabilities = {
  supportsSharer: boolean;
  supportsJoiner: boolean;
};

/** Implemented alongside camera/QR surfaces; callers dispose on cancel/unmount. */
export interface PairingTransport {
  readonly kind: PairingTransportKind;
  readonly capabilities: PairingTransportCapabilities;

  encodeSharerPayload(input: { pin: string }): Promise<PairingEncodedOffer>;

  decodeJoinerPayload(encoded: PairingEncodedOffer): Promise<{ pin: string }>;

  dispose(): Promise<void>;
}
