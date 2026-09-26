/**
 * Collapses mailbox aliases to a single canonical address so one inbox cannot
 * own multiple accounts. Mirrors `canonicalizeEmail` in `app/lib/accountIdentity.ts`.
 * `app/lib/accountIdentity.test.ts` asserts the two copies stay identical.
 */
export function canonicalizeEmail(email: string): string {
  const trimmed = String(email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

/**
 * Pre-2026 account ids were a short hash of the email. Kept only so an existing
 * `users/{id}` document can be found on the next real sign-in.
 */
export function legacyAppUidForEmail(email: string): string {
  const input = canonicalizeEmail(email);
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `u_h${(h >>> 0).toString(16)}`;
}
