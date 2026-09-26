import { createPublicKey, verify } from "crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type KeyBundleFields = {
  keyVersion: number;
  encryptionPublicKey: string;
  identitySigningPublicKey: string;
};

/** Must match `publicBundleSigningMessage` in `app/lib/e2eePublicBundle.ts`. */
export function publicBundleSigningMessage(bundle: KeyBundleFields): Buffer {
  return Buffer.from(
    `erdos-key-bundle-v1|${bundle.keyVersion}|${bundle.encryptionPublicKey}|${bundle.identitySigningPublicKey}`,
    "utf8"
  );
}

/** True when `signatureB64` is an Ed25519 signature by the bundle's identity key. */
export function verifyKeyBundleSignature(bundle: KeyBundleFields, signatureB64: string): boolean {
  try {
    const signature = Buffer.from(signatureB64, "base64");
    const publicKeyRaw = Buffer.from(bundle.identitySigningPublicKey, "base64");
    if (publicKeyRaw.length !== 32 || signature.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyRaw]),
      format: "der",
      type: "spki",
    });
    return verify(null, publicBundleSigningMessage(bundle), key, signature);
  } catch {
    return false;
  }
}
