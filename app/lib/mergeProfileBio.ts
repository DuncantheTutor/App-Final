/** Prefer non-empty incoming bio; keep prior when server returns empty. */
export function mergeProfileBio(
  incoming: string | null | undefined,
  prior: string | null | undefined
): string {
  const next = (incoming ?? "").trim();
  if (next) return next;
  return (prior ?? "").trim();
}
