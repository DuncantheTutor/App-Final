"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintAppUid = mintAppUid;
const crypto_1 = require("crypto");
/** 128-bit account id with no relationship to the email. */
function mintAppUid() {
    return `u_${(0, crypto_1.randomBytes)(16).toString("hex")}`;
}
