import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const { decodeBase64, decodeUTF8 } = naclUtil;

export type PublicBundleFields = {
  keyVersion: number;
  encryptionPublicKey: string;
  identitySigningPublicKey: string;
};

export function publicBundleSigningMessage(bundle: PublicBundleFields): Uint8Array {
  return decodeUTF8(
    `erdos-key-bundle-v1|${bundle.keyVersion}|${bundle.encryptionPublicKey}|${bundle.identitySigningPublicKey}`
  );
}

export function verifyPublicBundleSignature(bundle: PublicBundleFields, signatureB64: string): boolean {
  try {
    if (!signatureB64.trim() || !bundle.identitySigningPublicKey) return false;
    return nacl.sign.detached.verify(
      publicBundleSigningMessage(bundle),
      decodeBase64(signatureB64),
      decodeBase64(bundle.identitySigningPublicKey)
    );
  } catch {
    return false;
  }
}

/** Five-digit groups derived from the identity signing key. Compare this in person. */
export function safetyNumberForIdentityKey(identitySigningPublicKey: string): string {
  const digest = nacl.hash(decodeBase64(identitySigningPublicKey));
  const groups: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const n = ((digest[i * 2] << 8) | digest[i * 2 + 1]) % 100000;
    groups.push(String(n).padStart(5, "0"));
  }
  return groups.join(" ");
}
