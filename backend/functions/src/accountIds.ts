import { createHash } from "crypto";

import { canonicalizeEmail, legacyAppUidForEmail } from "./canonicalizeEmail";
import { mintAppUid } from "./mintAppUid";

/** Firestore doc id binding a canonical email to its owning app uid. */
export function emailAccountDocId(email: string): string {
  return createHash("sha256").update(`email-account|${canonicalizeEmail(email)}`).digest("hex");
}

export { legacyAppUidForEmail, mintAppUid };
