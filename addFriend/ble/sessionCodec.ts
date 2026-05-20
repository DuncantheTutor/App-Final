import { TBH_BLE_MANUFACTURER_ID, TBH_BLE_SERVICE_UUID, TBH_BLE_SESSION_PREFIX } from "./constants";

/** 6-byte beacon derived from `BF1_<12 hex>` session id. */
export function beaconBytesFromSessionId(sessionId: string): number[] | null {
  const m = sessionId.trim().match(/^BF1_([a-f0-9]{12})$/i);
  if (!m?.[1]) return null;
  const hex = m[1].toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out.length === 6 ? out : null;
}

export function sessionIdFromBeaconBytes(buf: Uint8Array): string | null {
  if (buf.length !== 6) return null;
  let hex = "";
  for (let i = 0; i < 6; i += 1) {
    hex += buf[i].toString(16).padStart(2, "0");
  }
  return `${TBH_BLE_SESSION_PREFIX}${hex}`;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function uuidMatchesService(uuids: readonly string[] | null | undefined, service: string): boolean {
  if (!uuids?.length) return false;
  const want = service.replace(/-/g, "").toLowerCase();
  return uuids.some((u) => u.replace(/-/g, "").toLowerCase() === want);
}

/**
 * Decode `BF1_…` session id from a BLE scan record (manufacturer data layouts vary by OS).
 */
export function parseSessionIdFromScanDevice(device: {
  manufacturerData?: string | null;
  serviceUUIDs?: readonly string[] | null;
}): string | null {
  if (!uuidMatchesService(device.serviceUUIDs ?? null, TBH_BLE_SERVICE_UUID)) {
    return null;
  }
  const b64 = device.manufacturerData;
  if (!b64) return null;
  let raw: Uint8Array;
  try {
    raw = b64ToBytes(b64);
  } catch {
    return null;
  }
  const lo = TBH_BLE_MANUFACTURER_ID & 0xff;
  const hi = (TBH_BLE_MANUFACTURER_ID >> 8) & 0xff;
  if (raw.length >= 8 && raw[0] === lo && raw[1] === hi) {
    return sessionIdFromBeaconBytes(raw.subarray(2, 8));
  }
  if (raw.length === 6) {
    return sessionIdFromBeaconBytes(raw);
  }
  if (raw.length > 8) {
    const sid = sessionIdFromBeaconBytes(raw.subarray(raw.length - 6));
    if (sid) return sid;
  }
  return null;
}
