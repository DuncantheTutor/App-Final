import * as Random from "expo-random";
import { doc, getDoc } from "firebase/firestore";

import { callEmulatorFunction } from "../../backendBridge";
import { readPersistedKeyBundle } from "../../e2eeCrypto";
import { getFirestoreDb } from "../../firebaseAuthClient";
import { logAppError } from "../../telemetry";
import type { BackendSession } from "../messaging/types";
import {
  FRIEND_CONTENT_SEAL,
  openJsonWithKey,
  sealJsonWithKey,
  unwrapRawKeyForRecipient,
  wrapRawKeyForRecipient,
} from "./friendContentSeal";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";

const COLLECTION = "friendContentKeys";

type CachedKey = { generation: number; key: Uint8Array };
const cache = new Map<string, CachedKey>();
let rotation: Promise<void> | null = null;

async function nonce(length: number): Promise<Uint8Array> {
  return Uint8Array.from(await Random.getRandomBytesAsync(length));
}

async function wrapFor(
  sessionUid: string,
  rawKey: Uint8Array,
  recipientUids: string[],
  resolveRecipientEncryptionKeys: (uids: string[]) => Promise<Record<string, string>>
): Promise<Record<string, string>> {
  const mine = await readPersistedKeyBundle(sessionUid);
  if (!mine) throw new Error("Message keys are not on this phone.");
  const pubs = await resolveRecipientEncryptionKeys(recipientUids);
  const envelopes: Record<string, string> = {};
  for (const uid of recipientUids) {
    const recipientPublicKey = pubs[uid];
    if (!recipientPublicKey) continue;
    envelopes[uid] = wrapRawKeyForRecipient({
      senderPublicKey: mine.encryptionPublicKey,
      senderSecretKey: mine.encryptionSecretKey,
      recipientPublicKey,
      rawKey,
      nonce: await nonce(24),
    });
  }
  if (!envelopes[sessionUid]) throw new Error("Could not lock the friends key for this phone.");
  return envelopes;
}

export async function openFriendContentKey(
  sessionUid: string,
  ownerUid: string
): Promise<CachedKey | null> {
  const db = getFirestoreDb();
  let snap;
  try {
    snap = await getDoc(doc(db, COLLECTION, ownerUid));
  } catch {
    return null;
  }
  if (!snap.exists()) return null;
  const data = snap.data() as { generation?: number; envelopes?: Record<string, string> };
  const generation = Number(data.generation);
  const cached = cache.get(ownerUid);
  if (cached && cached.generation === generation) return cached;
  const envelope = data.envelopes?.[sessionUid];
  if (!envelope || !Number.isInteger(generation)) return null;
  const mine = await readPersistedKeyBundle(sessionUid);
  if (!mine) return null;
  const key = unwrapRawKeyForRecipient(mine.encryptionSecretKey, envelope);
  const next = { generation, key };
  cache.set(ownerUid, next);
  return next;
}

export async function sealForFriends<T>(
  session: BackendSession,
  payload: T,
  friendUids: string[],
  resolveRecipientEncryptionKeys: (uids: string[]) => Promise<Record<string, string>>
): Promise<{ ciphertext: string; nonce: string; keyGeneration: number; sealedWith: typeof FRIEND_CONTENT_SEAL }> {
  const current = await ensureFriendContentKey(session, friendUids, resolveRecipientEncryptionKeys);
  const sealed = sealJsonWithKey(payload, current.key, await nonce(24));
  return { ...sealed, keyGeneration: current.generation, sealedWith: FRIEND_CONTENT_SEAL };
}

async function publishKey(params: {
  session: BackendSession;
  generation: number;
  envelopes: Record<string, string>;
  grantUid?: string;
}): Promise<void> {
  await callEmulatorFunction("putFriendContentKey", {
    uid: params.session.uid,
    deviceId: params.session.deviceId,
    generation: params.generation,
    envelopes: params.envelopes,
    ...(params.grantUid ? { grantUid: params.grantUid } : {}),
  });
}

/** Creates the friends key if needed. Existing posts are sealed once, not on later friend adds. */
export async function ensureFriendContentKey(
  session: BackendSession,
  friendUids: string[],
  resolveRecipientEncryptionKeys: (uids: string[]) => Promise<Record<string, string>>
): Promise<CachedKey> {
  const existing = await openFriendContentKey(session.uid, session.uid);
  if (existing) return existing;
  const key = await nonce(32);
  const generation = 1;
  const recipients = [...new Set([session.uid, ...friendUids.filter((id) => id.startsWith("u_"))])];
  const envelopes = await wrapFor(session.uid, key, recipients, resolveRecipientEncryptionKeys);
  await publishKey({ session, generation, envelopes });
  cache.set(session.uid, { generation, key });
  await resealOwnedPosts(session, null, key, generation);
  return { generation, key };
}

/** Adds one wrap for a new friend. Post and profile ciphertext stay the same. */
export async function grantFriendContentKey(params: {
  session: BackendSession;
  friendUid: string;
  friendUids: string[];
  resolveRecipientEncryptionKeys: (uids: string[]) => Promise<Record<string, string>>;
}): Promise<void> {
  const { session, friendUid, friendUids, resolveRecipientEncryptionKeys } = params;
  const current = await ensureFriendContentKey(session, friendUids, resolveRecipientEncryptionKeys);
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, COLLECTION, session.uid));
  const envelopes = (snap.data()?.envelopes ?? {}) as Record<string, string>;
  if (envelopes[friendUid]) return;
  const added = await wrapFor(session.uid, current.key, [friendUid], resolveRecipientEncryptionKeys);
  if (!added[friendUid]) throw new Error("Could not lock the friends key for this friend.");
  await publishKey({
    session,
    generation: current.generation,
    envelopes: { ...envelopes, ...added },
    grantUid: friendUid,
  });
}

type OwnedItem = {
  postId: string;
  ciphertext: string;
  nonce: string;
  envelope?: string;
  sealedWith?: string;
  keyGeneration?: number;
  createdAtMs?: number;
};

async function listOwned(session: BackendSession, beforeMs?: number): Promise<{ items: OwnedItem[]; hasMore: boolean }> {
  const res = await callEmulatorFunction<{ items?: OwnedItem[]; hasMore?: boolean }>("listMyOwnedEncryptedPosts", {
    uid: session.uid,
    deviceId: session.deviceId,
    limit: 40,
    ...(beforeMs != null ? { beforeMs } : {}),
  });
  return { items: res.items ?? [], hasMore: Boolean(res.hasMore) };
}

async function resealOwnedPosts(
  session: BackendSession,
  previous: CachedKey | null,
  nextKey: Uint8Array,
  nextGeneration: number
): Promise<void> {
  let beforeMs: number | undefined;
  for (let page = 0; page < 8; page += 1) {
    const listed = await listOwned(session, beforeMs);
    if (listed.items.length === 0) break;
    for (const item of listed.items) {
      if (item.sealedWith === FRIEND_CONTENT_SEAL && item.keyGeneration === nextGeneration) continue;
      try {
        const plain = previous && item.sealedWith === FRIEND_CONTENT_SEAL
          ? openJsonWithKey<Record<string, unknown>>(item.ciphertext, item.nonce, previous.key)
          : await decryptPayloadForRecipient<Record<string, unknown>>(
              session.uid,
              item.ciphertext,
              item.nonce,
              item.envelope ?? ""
            );
        const sealed = sealJsonWithKey(plain, nextKey, await nonce(24));
        await callEmulatorFunction("updateEncryptedPost", {
          uid: session.uid,
          deviceId: session.deviceId,
          postId: item.postId,
          sealedWith: FRIEND_CONTENT_SEAL,
          keyGeneration: nextGeneration,
          ...sealed,
        });
      } catch (err) {
        logAppError("posts.reseal_friends_key", err, { postId: item.postId });
      }
    }
    if (!listed.hasMore) break;
    const oldest = listed.items[listed.items.length - 1]?.createdAtMs;
    if (!oldest) break;
    beforeMs = oldest - 1;
  }
}

async function resealProfile(
  session: BackendSession,
  previous: CachedKey | null,
  nextKey: Uint8Array,
  nextGeneration: number
): Promise<void> {
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, "encryptedProfiles", session.uid));
  if (!snap.exists()) return;
  const data = snap.data() as {
    ciphertext?: string;
    nonce?: string;
    envelopes?: Record<string, string>;
    sealedWith?: string;
  };
  if (!data.ciphertext || !data.nonce) return;
  let plain: Record<string, unknown>;
  if (data.sealedWith === FRIEND_CONTENT_SEAL && previous) {
    plain = openJsonWithKey(data.ciphertext, data.nonce, previous.key);
  } else {
    const envelope = data.envelopes?.[session.uid];
    if (!envelope) return;
    plain = await decryptPayloadForRecipient(session.uid, data.ciphertext, data.nonce, envelope);
  }
  const sealed = sealJsonWithKey(plain, nextKey, await nonce(24));
  await callEmulatorFunction("putEncryptedProfile", {
    uid: session.uid,
    deviceId: session.deviceId,
    sealedWith: FRIEND_CONTENT_SEAL,
    keyGeneration: nextGeneration,
    ...sealed,
  });
}

/** New friends key, then rewrite posts and the profile so the previous key cannot open them. */
export async function rotateFriendContentKey(params: {
  session: BackendSession;
  remainingFriendUids: string[];
  resolveRecipientEncryptionKeys: (uids: string[]) => Promise<Record<string, string>>;
}): Promise<void> {
  if (rotation) return rotation;
  rotation = (async () => {
    const { session, remainingFriendUids, resolveRecipientEncryptionKeys } = params;
    const previous = await openFriendContentKey(session.uid, session.uid);
    const nextKey = await nonce(32);
    const generation = (previous?.generation ?? 0) + 1;
    const recipients = [...new Set([session.uid, ...remainingFriendUids.filter((id) => id.startsWith("u_"))])];
    const envelopes = await wrapFor(session.uid, nextKey, recipients, resolveRecipientEncryptionKeys);
    await publishKey({ session, generation, envelopes });
    cache.set(session.uid, { generation, key: nextKey });
    await resealOwnedPosts(session, previous, nextKey, generation);
    await resealProfile(session, previous, nextKey, generation);
  })().finally(() => {
    rotation = null;
  });
  return rotation;
}

export async function openSealedJson<T>(
  sessionUid: string,
  ownerUid: string,
  ciphertext: string,
  nonceValue: string,
  keyGeneration: number
): Promise<T> {
  const opened = await openFriendContentKey(sessionUid, ownerUid);
  if (!opened || opened.generation !== keyGeneration) {
    throw new Error("Friends key is not available for this content.");
  }
  return openJsonWithKey<T>(ciphertext, nonceValue, opened.key);
}
