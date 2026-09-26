import { Alert } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import {
  ensureLocalKeyBundle,
  safetyNumberForIdentityKey,
  verifyPublicBundleSignature,
  type E2eePublicBundle,
} from "../../e2eeCrypto";
import { decideFriendKeyPin, type PinnedFriendKeys } from "../lib/friendKeyPin";
import { readFriendKeyPin, writeFriendKeyPin } from "../lib/friendKeyPinStore";
import type { BackendSession } from "./types";

type RemoteBundle = {
  encryptionPublicKey?: string;
  identitySigningPublicKey?: string;
  bundleSignature?: string;
} | null;

function confirmKeyChange(previous: PinnedFriendKeys, next: PinnedFriendKeys): Promise<boolean> {
  const previousNumber = safetyNumberForIdentityKey(previous.identitySigningPublicKey);
  const nextNumber = safetyNumberForIdentityKey(next.identitySigningPublicKey);
  return new Promise((resolve) => {
    Alert.alert(
      "Encryption key changed",
      `This friend's safety number changed.\n\nWas ${previousNumber}\nNow ${nextNumber}\n\nTrust the new key only after you compare it in person.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Trust new key", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });
}

async function acceptFriendBundle(
  session: BackendSession,
  friendUid: string,
  bundle: RemoteBundle,
  cachedEncryptionKey: string | undefined
): Promise<string> {
  const encryptionPublicKey = bundle?.encryptionPublicKey?.trim() ?? "";
  const identitySigningPublicKey = bundle?.identitySigningPublicKey?.trim() ?? "";
  if (!encryptionPublicKey || !identitySigningPublicKey) {
    throw new Error(
      "Your friend has not finished setting up encrypted messaging yet. Ask them to open the app, stay on the home screen for a few seconds, then try again."
    );
  }
  const signature = bundle?.bundleSignature?.trim() ?? "";
  const bundleFields = {
    keyVersion: 1,
    encryptionPublicKey,
    identitySigningPublicKey,
  } satisfies E2eePublicBundle;
  if (!signature || !verifyPublicBundleSignature(bundleFields, signature)) {
    throw new Error("This friend's encryption key failed verification.");
  }
  const incoming = {
    encryptionPublicKey,
    identitySigningPublicKey,
    signature,
  };
  const stored = await readFriendKeyPin(session.uid, friendUid);
  if (!stored && cachedEncryptionKey && cachedEncryptionKey !== encryptionPublicKey) {
    const nextNumber = safetyNumberForIdentityKey(identitySigningPublicKey);
    const trusted = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Encryption key changed",
        `The key saved on this phone does not match the server.\n\nCurrent safety number: ${nextNumber}\n\nTrust it only after you compare it in person.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Trust new key", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });
    if (!trusted) {
      throw new Error("Message not sent. This friend's encryption key has changed.");
    }
    await writeFriendKeyPin(session.uid, friendUid, {
      encryptionPublicKey,
      identitySigningPublicKey,
    });
    return encryptionPublicKey;
  }
  const decision = decideFriendKeyPin(stored, incoming, true);
  if (decision.action === "changed" && stored) {
    const trusted = await confirmKeyChange(stored, decision.keys);
    if (!trusted) {
      throw new Error("Message not sent. This friend's encryption key has changed.");
    }
    await writeFriendKeyPin(session.uid, friendUid, decision.keys);
    return decision.keys.encryptionPublicKey;
  }
  if (decision.action === "pin") {
    await writeFriendKeyPin(session.uid, friendUid, decision.keys);
  }
  return encryptionPublicKey;
}

export async function resolveRecipientEncryptionKeys(params: {
  session: BackendSession;
  recipientUids: string[];
  recipientKeyCacheRef: { current: Record<string, string> };
  persistFriendKeyCacheNow: () => void;
}): Promise<Record<string, string>> {
  const { session, recipientUids, recipientKeyCacheRef, persistFriendKeyCacheNow } = params;
  const uniqueRecipients = [...new Set(recipientUids)].filter(Boolean);
  const ownBundle = await ensureLocalKeyBundle(session.uid);
  recipientKeyCacheRef.current[session.uid] = ownBundle.encryptionPublicKey;

  const friendUids = uniqueRecipients.filter((uid) => uid !== session.uid);
  const loadBundles = async () => {
    if (friendUids.length === 0) return;
    const res = await callEmulatorFunction<{
      keyBundles?: Record<string, RemoteBundle>;
    }>("getFriendKeyBundles", {
      uid: session.uid,
      deviceId: session.deviceId,
      friendUids,
    });
    const bundles = res.keyBundles ?? {};
    let cacheChanged = false;
    for (const friendUid of friendUids) {
      const bundle = bundles[friendUid];
      if (!bundle?.encryptionPublicKey) continue;
      const key = await acceptFriendBundle(
        session,
        friendUid,
        bundle,
        recipientKeyCacheRef.current[friendUid]
      );
      if (recipientKeyCacheRef.current[friendUid] !== key) {
        recipientKeyCacheRef.current[friendUid] = key;
        cacheChanged = true;
      }
    }
    if (cacheChanged) persistFriendKeyCacheNow();
  };

  await loadBundles();
  const stillMissing = friendUids.filter((uid) => !recipientKeyCacheRef.current[uid]?.trim());
  if (stillMissing.length > 0) {
    await new Promise<void>((r) => setTimeout(r, 600));
    await loadBundles();
  }

  const out: Record<string, string> = {};
  for (const uid of uniqueRecipients) {
    const key = recipientKeyCacheRef.current[uid];
    if (!key) {
      if (uid === session.uid) {
        throw new Error("Could not load your encryption keys. Try restarting the app.");
      }
      throw new Error(
        "Your friend has not finished setting up encrypted messaging yet. Ask them to open the app, stay on the home screen for a few seconds, then try again."
      );
    }
    out[uid] = key;
  }
  return out;
}

export async function ensureFriendSafetyNumber(
  session: BackendSession,
  friendUid: string
): Promise<string | null> {
  const cache = { current: {} as Record<string, string> };
  try {
    await resolveRecipientEncryptionKeys({
      session,
      recipientUids: [session.uid, friendUid],
      recipientKeyCacheRef: cache,
      persistFriendKeyCacheNow: () => undefined,
    });
  } catch {
    return friendSafetyNumber(session.uid, friendUid);
  }
  return friendSafetyNumber(session.uid, friendUid);
}

export async function friendSafetyNumber(myUid: string, friendUid: string): Promise<string | null> {
  const pinned = await readFriendKeyPin(myUid, friendUid);
  if (!pinned) return null;
  return safetyNumberForIdentityKey(pinned.identitySigningPublicKey);
}
