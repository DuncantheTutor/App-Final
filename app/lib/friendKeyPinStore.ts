import * as SecureStore from "expo-secure-store";

import type { PinnedFriendKeys } from "./friendKeyPin";

function pinKey(myUid: string, friendUid: string): string {
  return `e2ee.pin.${myUid}.${friendUid}`.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function readFriendKeyPin(
  myUid: string,
  friendUid: string
): Promise<PinnedFriendKeys | null> {
  const raw = await SecureStore.getItemAsync(pinKey(myUid, friendUid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PinnedFriendKeys;
    if (!parsed?.encryptionPublicKey || !parsed?.identitySigningPublicKey) return null;
    return {
      encryptionPublicKey: parsed.encryptionPublicKey,
      identitySigningPublicKey: parsed.identitySigningPublicKey,
    };
  } catch {
    return null;
  }
}

export async function writeFriendKeyPin(
  myUid: string,
  friendUid: string,
  keys: PinnedFriendKeys
): Promise<void> {
  await SecureStore.setItemAsync(pinKey(myUid, friendUid), JSON.stringify(keys));
}
