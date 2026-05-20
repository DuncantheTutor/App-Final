import { callEmulatorFunction } from "../../backendBridge";
import { ensureLocalKeyBundle } from "../../e2eeCrypto";
import type { BackendSession } from "./types";

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
      keyBundles?: Record<string, { encryptionPublicKey?: string } | null>;
    }>("getFriendKeyBundles", {
      uid: session.uid,
      deviceId: session.deviceId,
      friendUids,
    });
    const bundles = res.keyBundles ?? {};
    let cacheChanged = false;
    for (const [uid, bundle] of Object.entries(bundles)) {
      const key = bundle?.encryptionPublicKey;
      if (!key) continue;
      if (recipientKeyCacheRef.current[uid] !== key) {
        recipientKeyCacheRef.current[uid] = key;
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
