/** Normalize Firestore heartbeat fields (number or Timestamp-like) to epoch ms. */
export function normalizePresenceHeartbeatMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object") {
    const withToMillis = raw as { toMillis?: () => number };
    if (typeof withToMillis.toMillis === "function") {
      const ms = withToMillis.toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    const withSeconds = raw as { seconds?: number; nanoseconds?: number };
    if (typeof withSeconds.seconds === "number" && Number.isFinite(withSeconds.seconds)) {
      const nano = Number(withSeconds.nanoseconds ?? 0);
      return withSeconds.seconds * 1000 + Math.floor(nano / 1_000_000);
    }
  }
  return 0;
}
