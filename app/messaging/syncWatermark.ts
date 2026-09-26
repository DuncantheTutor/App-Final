import type { Message } from "../domain/types";

export function messageSyncCursorMs(message: Pick<Message, "createdAt" | "editedAt">): number {
  const edited = message.editedAt;
  return Math.max(message.createdAt, typeof edited === "number" && Number.isFinite(edited) ? edited : 0);
}

/**
 * Compute the next sync watermark without ever advancing past a message that
 * failed to decode. Advancing to the newest *successful* cursor when an older
 * message in the same batch threw would permanently skip that message (the next
 * pull starts after it), causing silent message loss. When a failure exists we
 * cap the watermark just below the earliest failed message so the next pull
 * re-fetches and retries it.
 */
export function nextSafeWatermarkMs(params: {
  prior: number;
  successCursorMs: number;
  earliestFailureMs: number | null;
}): number {
  const { prior, successCursorMs, earliestFailureMs } = params;
  let candidate = successCursorMs;
  if (earliestFailureMs != null && Number.isFinite(earliestFailureMs)) {
    candidate = Math.min(candidate, earliestFailureMs - 1);
  }
  return Math.max(prior, candidate);
}
