import { HttpsError } from "firebase-functions/v2/https";

/**
 * OTP codes are only minted in the emulator, where the callable can return
 * `debugCode`. Production has no mail sender, so issuing a code there would
 * be a check nobody can complete.
 */
export function assertEmailOtpAvailable(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;
  throw new HttpsError(
    "failed-precondition",
    "Email verification is unavailable until a mail sender is configured."
  );
}
