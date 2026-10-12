/**
 * Foreground only while the stored heartbeat is inside the online window.
 * A later snapshot with `online: true` and an old heartbeat stays offline.
 * `heartbeatAtMs` is already epoch milliseconds.
 */
export function presenceSnapshotSaysActive(
  data: {
    state?: string;
    online?: boolean;
    heartbeatAtMs?: number | null;
  },
  nowMs: number,
  onlineWindowMs: number
): boolean {
  if (data.state === "background" || data.online === false) return false;
  if (data.state !== "active" && data.online !== true) return false;
  const heartbeatAtMs = data.heartbeatAtMs;
  if (typeof heartbeatAtMs !== "number" || !Number.isFinite(heartbeatAtMs) || heartbeatAtMs <= 0) {
    return false;
  }
  const age = nowMs - heartbeatAtMs;
  if (age > onlineWindowMs || age < -onlineWindowMs) return false;
  return true;
}
