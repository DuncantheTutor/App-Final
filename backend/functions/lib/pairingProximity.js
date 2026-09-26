"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPairingProximity = assertPairingProximity;
const https_1 = require("firebase-functions/v2/https");
const pairingProximityMath_1 = require("./pairingProximityMath");
function assertPairingProximity(a, b, nowMs) {
    const verdict = (0, pairingProximityMath_1.evaluatePairingProximity)(a, b, nowMs);
    if (verdict.ok)
        return;
    if (verdict.reason === "gps") {
        throw new https_1.HttpsError("failed-precondition", "Could not verify in-person proximity (GPS distance exceeds 100m cap).");
    }
    throw new https_1.HttpsError("failed-precondition", "Could not verify proximity with GPS. Connect both phones to the same Wi-Fi network (personal hotspot also counts) and try again.");
}
