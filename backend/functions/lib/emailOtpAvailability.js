"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertEmailOtpAvailable = assertEmailOtpAvailable;
const https_1 = require("firebase-functions/v2/https");
/**
 * OTP codes are only minted in the emulator, where the callable can return
 * `debugCode`. Production has no mail sender, so issuing a code there would
 * be a check nobody can complete.
 */
function assertEmailOtpAvailable() {
    if (process.env.FUNCTIONS_EMULATOR === "true")
        return;
    throw new https_1.HttpsError("failed-precondition", "Email verification is unavailable until a mail sender is configured.");
}
