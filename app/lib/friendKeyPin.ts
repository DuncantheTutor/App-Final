export type PinnedFriendKeys = {
  encryptionPublicKey: string;
  identitySigningPublicKey: string;
};

export type IncomingFriendBundle = PinnedFriendKeys & {
  signature?: string | null;
};

export type PinDecision =
  | { action: "pin"; keys: PinnedFriendKeys }
  | { action: "accept" }
  | { action: "changed"; keys: PinnedFriendKeys };

/**
 * A bundle must carry a valid signature before it can be pinned.
 * The same keys are accepted. A different key is a change the user must confirm.
 */
export function decideFriendKeyPin(
  pinned: PinnedFriendKeys | null,
  incoming: IncomingFriendBundle,
  signatureOk: boolean
): PinDecision {
  if (!incoming.signature || !signatureOk) {
    throw new Error("This friend's encryption key failed verification.");
  }
  const keys: PinnedFriendKeys = {
    encryptionPublicKey: incoming.encryptionPublicKey,
    identitySigningPublicKey: incoming.identitySigningPublicKey,
  };
  if (!pinned) return { action: "pin", keys };
  if (
    pinned.encryptionPublicKey === keys.encryptionPublicKey &&
    pinned.identitySigningPublicKey === keys.identitySigningPublicKey
  ) {
    return { action: "accept" };
  }
  return { action: "changed", keys };
}
