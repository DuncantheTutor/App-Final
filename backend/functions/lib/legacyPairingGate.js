"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertLegacyFriendshipCallableAllowed = assertLegacyFriendshipCallableAllowed;
const https_1 = require("firebase-functions/v2/https");
/**
 * Retired friendship transports (NFC voucher, BLE code, HS2, one-shot handshake).
 * Production must create friendships only through the QR offer plus proximity
 * plus dual confirm. The emulator keeps these callables for old test harnesses.
 */
function assertLegacyFriendshipCallableAllowed() {
    if (process.env.FUNCTIONS_EMULATOR === "true")
        return;
    throw new https_1.HttpsError("permission-denied", "This pairing method is retired. Add friends with Show QR / Read QR.");
}
