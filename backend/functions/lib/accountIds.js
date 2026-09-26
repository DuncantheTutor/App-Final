"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintAppUid = exports.legacyAppUidForEmail = void 0;
exports.emailAccountDocId = emailAccountDocId;
const crypto_1 = require("crypto");
const canonicalizeEmail_1 = require("./canonicalizeEmail");
Object.defineProperty(exports, "legacyAppUidForEmail", { enumerable: true, get: function () { return canonicalizeEmail_1.legacyAppUidForEmail; } });
const mintAppUid_1 = require("./mintAppUid");
Object.defineProperty(exports, "mintAppUid", { enumerable: true, get: function () { return mintAppUid_1.mintAppUid; } });
/** Firestore doc id binding a canonical email to its owning app uid. */
function emailAccountDocId(email) {
    return (0, crypto_1.createHash)("sha256").update(`email-account|${(0, canonicalizeEmail_1.canonicalizeEmail)(email)}`).digest("hex");
}
