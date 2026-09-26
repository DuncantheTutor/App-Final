import { randomBytes } from "crypto";

/** 128-bit account id with no relationship to the email. */
export function mintAppUid(): string {
  return `u_${randomBytes(16).toString("hex")}`;
}
