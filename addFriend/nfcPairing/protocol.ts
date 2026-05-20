/**
 * NFC pairing wire format for {@link NFC_PAIRING_METHOD_ID}.
 * Today the session handle is a server-reserved 4-digit PIN (legacy backend).
 * `PN2|<hex>` parsing is reserved for opaque-token migration (see Planning).
 */
import {
  encodeNfcPinPairNdefPayload,
  parsePinFromNfcPairPlaintext,
} from "../nfcPinTransport/pinPairProtocol";

export type NfcPairingSessionHandle = string;

/** NDEF plaintext written by the sender phone. */
export function encodeNfcPairingNdefPayload(sessionHandle: NfcPairingSessionHandle): string {
  return encodeNfcPinPairNdefPayload(sessionHandle);
}

/** Parse session handle from receiver NDEF read (bare PIN or `PN1|PIN`). */
export function parseNfcPairingNdefPayload(plain: string): NfcPairingSessionHandle | null {
  return parsePinFromNfcPairPlaintext(plain);
}

/** Future opaque token on wire (`PN2|<32 hex>`). Not used until backend accepts token doc ids. */
export function parseNfcPairingNdefPayloadV2(plain: string): NfcPairingSessionHandle | null {
  const t = plain.trim().replace(/\s+/g, "");
  const m = t.match(/^PN2\|([0-9a-f]{32})$/i);
  return m?.[1] ? m[1].toLowerCase() : null;
}

export function parseNfcPairingNdefPayloadAnyVersion(plain: string): NfcPairingSessionHandle | null {
  return parseNfcPairingNdefPayloadV2(plain) ?? parseNfcPairingNdefPayload(plain);
}
