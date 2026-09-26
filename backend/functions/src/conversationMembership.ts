/** Server-owned chat membership. Add, leave, and kick stay on `manageConversationMembership`. */

export function normalizeParticipantUids(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((entry) => String(entry ?? "").trim()).filter(Boolean))].sort();
}

export function sameParticipantSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

/** `null` means the conversation document does not exist. */
export function decideUpsertMembership(
  storedParticipantUids: readonly string[] | null,
  requestedParticipantUids: readonly string[]
): "create" | "unchanged" | "reject" {
  if (storedParticipantUids == null) return "create";
  return sameParticipantSet(storedParticipantUids, requestedParticipantUids) ? "unchanged" : "reject";
}

export type SendMembershipDecision =
  | { ok: true; participants: string[] }
  | { ok: false; reason: "missing" | "not-member" | "reject" };

/**
 * Send always uses the stored member list.
 * A non-empty client list that differs is rejected. It is not applied.
 */
export function decideSendMembership(
  storedParticipantUids: readonly string[] | null,
  requestedParticipantUids: readonly string[],
  callerUid: string
): SendMembershipDecision {
  if (storedParticipantUids == null || storedParticipantUids.length === 0) {
    return { ok: false, reason: "missing" };
  }
  const participants = normalizeParticipantUids(storedParticipantUids);
  if (!participants.includes(callerUid)) {
    return { ok: false, reason: "not-member" };
  }
  const requested = normalizeParticipantUids(requestedParticipantUids);
  if (requested.length > 0 && !sameParticipantSet(participants, requested)) {
    return { ok: false, reason: "reject" };
  }
  return { ok: true, participants };
}
