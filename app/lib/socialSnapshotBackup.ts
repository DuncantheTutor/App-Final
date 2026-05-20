import * as Random from "expo-random";
import nacl from "tweetnacl";
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from "tweetnacl-util";

import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import type { Chat, Message, Post } from "../domain/types";
import { maxCreatedAtMs } from "./mergeEncryptedSync";

export type SocialSnapshotPayload = {
  v: 1;
  chats: Chat[];
  messages: Message[];
  posts: Post[];
  messagesWatermarkMs: number;
  postsWatermarkMs: number;
  savedAtMs: number;
};

function deriveBackupWrappingKey(appUid: string, firebaseAuthUid: string): Uint8Array {
  const material = decodeUTF8(`mvpplus-key-backup-v1|${appUid}|${firebaseAuthUid}`);
  return nacl.hash(material).slice(0, 32);
}

function trimSnapshot(payload: SocialSnapshotPayload): SocialSnapshotPayload {
  const messages = [...payload.messages].sort((a, b) => b.createdAt - a.createdAt).slice(0, 2500);
  const posts = [...payload.posts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  return {
    ...payload,
    messages,
    posts,
    messagesWatermarkMs: messages.length > 0 ? maxCreatedAtMs(messages) : payload.messagesWatermarkMs,
    postsWatermarkMs: posts.length > 0 ? maxCreatedAtMs(posts) : payload.postsWatermarkMs,
  };
}

/**
 * Restore decrypted social timeline from cloud (instant UI after reinstall).
 */
export async function restoreSocialSnapshotFromCloud(
  appUid: string,
  deviceId: string
): Promise<SocialSnapshotPayload | null> {
  const firebaseAuthUid = firebaseAuth.currentUser?.uid?.trim();
  if (!firebaseAuthUid) return null;

  let ciphertext = "";
  let nonce = "";
  try {
    const res = await callEmulatorFunction<{
      ciphertext?: string | null;
      nonce?: string | null;
    }>("getUserSocialSnapshot", { uid: appUid, deviceId });
    ciphertext = String(res.ciphertext ?? "").trim();
    nonce = String(res.nonce ?? "").trim();
  } catch {
    return null;
  }
  if (!ciphertext || !nonce) return null;

  try {
    const wrapKey = deriveBackupWrappingKey(appUid, firebaseAuthUid);
    const plainBytes = nacl.secretbox.open(decodeBase64(ciphertext), decodeBase64(nonce), wrapKey);
    if (!plainBytes) return null;
    const parsed = JSON.parse(encodeUTF8(plainBytes)) as SocialSnapshotPayload;
    if (parsed?.v !== 1 || !Array.isArray(parsed.chats) || !Array.isArray(parsed.messages)) {
      return null;
    }
    return {
      v: 1,
      chats: parsed.chats,
      messages: parsed.messages,
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      messagesWatermarkMs: Number(parsed.messagesWatermarkMs) || 0,
      postsWatermarkMs: Number(parsed.postsWatermarkMs) || 0,
      savedAtMs: Number(parsed.savedAtMs) || Date.now(),
    };
  } catch {
    return null;
  }
}

/** Upload encrypted chats/messages/posts for fast reinstall restore. */
export async function uploadSocialSnapshotToCloud(
  appUid: string,
  deviceId: string,
  snapshot: Omit<SocialSnapshotPayload, "v" | "savedAtMs">
): Promise<void> {
  const firebaseAuthUid = firebaseAuth.currentUser?.uid?.trim();
  if (!firebaseAuthUid) return;
  if (snapshot.messages.length === 0 && snapshot.posts.length === 0 && snapshot.chats.length === 0) {
    return;
  }

  const payload = trimSnapshot({
    v: 1,
    ...snapshot,
    savedAtMs: Date.now(),
  });

  const wrapKey = deriveBackupWrappingKey(appUid, firebaseAuthUid);
  const backupNonce = Uint8Array.from(await Random.getRandomBytesAsync(24));
  const plainBytes = decodeUTF8(JSON.stringify(payload));
  const cipherBytes = nacl.secretbox(plainBytes, backupNonce, wrapKey);
  const ciphertext = encodeBase64(cipherBytes);
  if (ciphertext.length > 750_000) {
    return;
  }

  await callEmulatorFunction("putUserSocialSnapshot", {
    uid: appUid,
    deviceId,
    ciphertext,
    nonce: encodeBase64(backupNonce),
  });
}
