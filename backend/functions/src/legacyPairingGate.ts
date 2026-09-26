import { HttpsError } from "firebase-functions/v2/https";

/**
 * Retired friendship transports (NFC voucher, BLE code, HS2, one-shot handshake).
 * Production must create friendships only through the QR offer plus proximity
 * plus dual confirm. The emulator keeps these callables for old test harnesses.
 */
export function assertLegacyFriendshipCallableAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;
  throw new HttpsError(
    "permission-denied",
    "This pairing method is retired. Add friends with Show QR / Read QR."
  );
}
