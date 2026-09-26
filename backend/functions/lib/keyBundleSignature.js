"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicBundleSigningMessage = publicBundleSigningMessage;
exports.verifyKeyBundleSignature = verifyKeyBundleSignature;
const crypto_1 = require("crypto");
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
/** Must match `publicBundleSigningMessage` in `app/lib/e2eePublicBundle.ts`. */
function publicBundleSigningMessage(bundle) {
    return Buffer.from(`erdos-key-bundle-v1|${bundle.keyVersion}|${bundle.encryptionPublicKey}|${bundle.identitySigningPublicKey}`, "utf8");
}
/** True when `signatureB64` is an Ed25519 signature by the bundle's identity key. */
function verifyKeyBundleSignature(bundle, signatureB64) {
    try {
        const signature = Buffer.from(signatureB64, "base64");
        const publicKeyRaw = Buffer.from(bundle.identitySigningPublicKey, "base64");
        if (publicKeyRaw.length !== 32 || signature.length !== 64)
            return false;
        const key = (0, crypto_1.createPublicKey)({
            key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyRaw]),
            format: "der",
            type: "spki",
        });
        return (0, crypto_1.verify)(null, publicBundleSigningMessage(bundle), key, signature);
    }
    catch {
        return false;
    }
}
