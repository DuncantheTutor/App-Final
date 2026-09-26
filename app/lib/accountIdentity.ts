function hashInput(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

/**
 * Collapses mailbox aliases to a single canonical address so the same inbox
 * cannot register multiple accounts. For Gmail/Googlemail dots in the local
 * part are insignificant; across all providers a `+tag` suffix is an alias.
 * Keep this in sync with `backend/functions/src/canonicalizeEmail.ts`.
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

export function backendUidForEmail(email: string): string {
  return `u_${hashInput(canonicalizeEmail(email))}`;
}

export function backendUidForFriendId(friendId: string): string {
  return `f_${hashInput(friendId)}`;
}
