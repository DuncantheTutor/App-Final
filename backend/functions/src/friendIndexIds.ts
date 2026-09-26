/** Canonical friendship document id. Both orders of a pair share one doc. */
export function friendshipId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** App uids on an edge other than `selfUid`. Non-`u_*` ids are left for a legacy lookup. */
export function appUidsFromEdgeParticipants(selfUid: string, participants: unknown): string[] {
  if (!Array.isArray(participants)) return [];
  const out: string[] = [];
  for (const raw of participants) {
    const id = String(raw ?? "").trim();
    if (!id || id === selfUid || !id.startsWith("u_")) continue;
    out.push(id);
  }
  return out;
}
