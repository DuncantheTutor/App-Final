/**
 * NFC 4-digit PIN pair — link-layer payload (server doc id = PIN).
 * Plaintext on NFC only; register/confirm over HTTPS.
 *
 * Silo: live PIN-pair encoding lives here, separate from legacy NFC under `addFriend/nfc/`.
 */

/** Encode exactly 4 digits for NDEF (smallest useful payload). */
export function encodeNfcPinPairNdefPayload(pin: string): string {
  const p = pin.trim();
  if (!/^\d{4}$/.test(p)) return "";
  return p;
}

/** Parse 4-digit PIN from decoded NDEF text (bare `1234` or optional `PN1|1234`). */
export function parsePinFromNfcPairPlaintext(plain: string): string | null {
  const t = plain.trim().replace(/\s+/g, "");
  if (/^\d{4}$/.test(t)) return t;
  const m = t.match(/^PN1\|(\d{4})$/i);
  return m?.[1] && /^\d{4}$/.test(m[1]) ? m[1] : null;
}
