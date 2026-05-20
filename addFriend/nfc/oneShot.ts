import type { AddFriendNfcPairMode } from "./handshake";
import {
  cancelActiveNfcRequest,
  readAddFriendNdefPayload,
  writeAddFriendNdefPayload,
} from "./handshake";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses `FN1.AF1|<voucherCode>` from raw NDEF text (optional `APPV2|fh1|` prefix).
 */
export function parseAf1VoucherCode(raw: string): string | null {
  const t = raw.trim().replace(/^APPV2\|fh1\|/i, "").trim();
  const m = t.match(/^FN1\.AF1\|([A-Za-z0-9_]+)$/i);
  return m?.[1]?.trim() ?? null;
}

export type NfcAddFriendOneShotDeps<TFriend> = {
  pairMode: AddFriendNfcPairMode;
  /** Max wait for a single NFC read/write (ms). */
  nfcIoTimeoutMs: number;
  /** Issuer polls for redeem after write (ms). */
  pollIntervalMs: number;
  mintVoucher: () => Promise<{ voucherCode: string } | null>;
  redeemVoucher: (voucherCode: string) => Promise<TFriend | null>;
  /** Issuer-only: returns redeemer's backend uid once voucher is redeemed, else null. */
  pollRedeemerUid: (voucherCode: string) => Promise<string | null>;
  hydrateFriendByBackendUid: (backendUid: string) => Promise<TFriend | null>;
};

const TRANSMIT_PRE_WRITE_SETTLE_MS = 900;
const TRANSMIT_WRITE_ATTEMPTS = 5;
const TRANSMIT_WRITE_RETRY_GAP_MS = 550;

/**
 * Single over-the-air NDEF exchange (legacy NFC path).
 */
export async function runNfcAddFriendOneShot<TFriend>(
  deps: NfcAddFriendOneShotDeps<TFriend>
): Promise<TFriend | null> {
  const {
    pairMode,
    nfcIoTimeoutMs,
    pollIntervalMs,
    mintVoucher,
    redeemVoucher,
    pollRedeemerUid,
    hydrateFriendByBackendUid,
  } = deps;

  if (pairMode === "receive") {
    const raw = await readAddFriendNdefPayload(nfcIoTimeoutMs, pairMode);
    if (!raw) return null;
    const code = parseAf1VoucherCode(raw);
    if (!code) return null;
    return redeemVoucher(code);
  }

  await cancelActiveNfcRequest();
  await delay(180);

  const minted = await mintVoucher().catch(() => null);
  if (!minted?.voucherCode?.trim()) return null;
  const payload = `FN1.AF1|${minted.voucherCode.trim()}`;

  await cancelActiveNfcRequest();
  await delay(TRANSMIT_PRE_WRITE_SETTLE_MS);

  const perWriteTimeoutMs = Math.min(16_000, Math.max(9_000, Math.floor(nfcIoTimeoutMs / 3)));
  let written = false;
  for (let attempt = 0; attempt < TRANSMIT_WRITE_ATTEMPTS; attempt += 1) {
    written = await writeAddFriendNdefPayload(payload, perWriteTimeoutMs, pairMode);
    if (written) break;
    await cancelActiveNfcRequest();
    await delay(TRANSMIT_WRITE_RETRY_GAP_MS);
  }
  if (!written) return null;

  const deadline = Date.now() + nfcIoTimeoutMs;
  while (Date.now() < deadline) {
    let redeemerUid: string | null = null;
    try {
      redeemerUid = await pollRedeemerUid(minted.voucherCode.trim());
    } catch {
      redeemerUid = null;
    }
    if (redeemerUid) {
      return hydrateFriendByBackendUid(redeemerUid);
    }
    await delay(pollIntervalMs);
  }
  return null;
}
