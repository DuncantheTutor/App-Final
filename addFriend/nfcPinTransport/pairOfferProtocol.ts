/**
 * In-person pairing offer codes — QR (`AFQR*`) and NFC (`PN*`) wire formats.
 * New offers use a 128-bit opaque token (32 hex chars). Legacy 4-digit PIN still parses.
 */

export const PAIRING_OFFER_TOKEN_HEX_LEN = 32;
const LEGACY_PIN_RE = /^\d{4}$/;
const OPAQUE_TOKEN_RE = new RegExp(`^[0-9a-f]{${PAIRING_OFFER_TOKEN_HEX_LEN}}$`, "i");

export function isLegacyPairingPin(code: string): boolean {
  return LEGACY_PIN_RE.test(code.trim());
}

export function isOpaquePairingToken(code: string): boolean {
  return OPAQUE_TOKEN_RE.test(code.trim());
}

export function normalizePairingOfferCode(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) return null;
  if (LEGACY_PIN_RE.test(t)) return t;
  if (OPAQUE_TOKEN_RE.test(t)) return t.toLowerCase();
  return null;
}

/** QR barcode payload for a server-minted or legacy offer code. */
export function encodeQrPairOfferPayload(offerCode: string): string {
  const code = normalizePairingOfferCode(offerCode);
  if (!code) return "";
  if (isLegacyPairingPin(code)) return `AFQR1|${code}`;
  return `AFQR2|${code}`;
}

/** Parse offer code from scanned QR text (v2 opaque, v1 legacy, bare codes). */
export function parseQrPairOfferPlaintext(plain: string): string | null {
  const t = plain.trim().replace(/\s+/g, "");
  if (!t) return null;
  const v2 = t.match(/^AFQR2\|([0-9a-f]{32})$/i);
  if (v2?.[1]) return v2[1].toLowerCase();
  const v1 = t.match(/^AFQR1\|(\d{4})$/i);
  if (v1?.[1]) return v1[1];
  return normalizePairingOfferCode(t);
}

/** NDEF plaintext for NFC transmit (smallest prefixed form). */
export function encodeNfcPairOfferNdefPayload(offerCode: string): string {
  const code = normalizePairingOfferCode(offerCode);
  if (!code) return "";
  if (isLegacyPairingPin(code)) return `PN1|${code}`;
  return `PN2|${code}`;
}

/** Parse offer code from decoded NDEF (v2, v1, bare). */
export function parseNfcPairOfferPlaintext(plain: string): string | null {
  const t = plain.trim().replace(/\s+/g, "");
  if (!t) return null;
  const v2 = t.match(/^PN2\|([0-9a-f]{32})$/i);
  if (v2?.[1]) return v2[1].toLowerCase();
  const v1 = t.match(/^PN1\|(\d{4})$/i);
  if (v1?.[1]) return v1[1];
  return normalizePairingOfferCode(t);
}

/** @deprecated Use {@link parseQrPairOfferPlaintext} */
export function parsePinFromNfcPairPlaintext(plain: string): string | null {
  return parseNfcPairOfferPlaintext(plain);
}

/** @deprecated Use {@link encodeNfcPairOfferNdefPayload} */
export function encodeNfcPinPairNdefPayload(pin: string): string {
  return encodeNfcPairOfferNdefPayload(pin);
}
