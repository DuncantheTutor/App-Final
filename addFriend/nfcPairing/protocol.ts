/**
 * NFC pairing wire format for {@link NFC_PAIRING_METHOD_ID}.
 * Session handle = server offer token (opaque hex) or legacy 4-digit PIN.
 */
import {
  encodeNfcPairOfferNdefPayload,
  parseNfcPairOfferPlaintext,
} from "../nfcPinTransport/pairOfferProtocol";

export type NfcPairingSessionHandle = string;

/** NDEF plaintext written by the sender phone (`PN2|<token>` or legacy `PN1|1234`). */
export function encodeNfcPairingNdefPayload(sessionHandle: NfcPairingSessionHandle): string {
  return encodeNfcPairOfferNdefPayload(sessionHandle);
}

/** Parse session handle from receiver NDEF read. */
export function parseNfcPairingNdefPayload(plain: string): NfcPairingSessionHandle | null {
  return parseNfcPairOfferPlaintext(plain);
}

export function parseNfcPairingNdefPayloadAnyVersion(plain: string): NfcPairingSessionHandle | null {
  return parseNfcPairOfferPlaintext(plain);
}

/** @deprecated Same as {@link parseNfcPairingNdefPayload} — v2 opaque tokens included. */
export function parseNfcPairingNdefPayloadV2(plain: string): NfcPairingSessionHandle | null {
  const t = plain.trim().replace(/\s+/g, "");
  const m = t.match(/^PN2\|([0-9a-f]{32})$/i);
  return m?.[1] ? m[1].toLowerCase() : null;
}
