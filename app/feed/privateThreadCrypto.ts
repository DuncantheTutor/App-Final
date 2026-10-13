import { callEmulatorFunction } from "../../backendBridge";
import { PRIVATE_THREAD_UNREADABLE } from "../lib/mergePostComments";
import { decryptPayloadForRecipient, encryptPayloadForRecipients } from "../../e2eeCrypto";
import { resolveRecipientEncryptionKeys } from "../messaging/recipientKeys";
import type { BackendSession } from "../messaging/types";

export type PrivateThreadCipher = {
  ciphertext: string;
  nonce: string;
  envelopes: Record<string, string>;
};

export async function encryptPrivateThreadText(args: {
  session: BackendSession;
  participantUids: string[];
  text: string;
  recipientKeyCacheRef: { current: Record<string, string> };
  persistFriendKeyCacheNow: () => void;
}): Promise<PrivateThreadCipher> {
  const keys = await resolveRecipientEncryptionKeys({
    session: args.session,
    recipientUids: args.participantUids,
    recipientKeyCacheRef: args.recipientKeyCacheRef,
    persistFriendKeyCacheNow: args.persistFriendKeyCacheNow,
  });
  return encryptPayloadForRecipients(args.session.uid, { text: args.text }, keys);
}

export async function readPrivateThreadMessageText(
  recipientUid: string,
  item: {
    text?: string;
    ciphertext?: string;
    nonce?: string;
    envelope?: string;
  }
): Promise<string> {
  const ciphertext = item.ciphertext?.trim() ?? "";
  const nonce = item.nonce?.trim() ?? "";
  const envelope = item.envelope?.trim() ?? "";
  if (ciphertext && nonce && envelope) {
    try {
      const payload = await decryptPayloadForRecipient<{ text?: string }>(
        recipientUid,
        ciphertext,
        nonce,
        envelope
      );
      return String(payload.text ?? "");
    } catch {
      return PRIVATE_THREAD_UNREADABLE;
    }
  }
  return String(item.text ?? "");
}

export async function sendPrivateThreadMessage(args: {
  session: BackendSession;
  postId: string;
  postOwnerUid: string;
  friendUid: string;
  text: string;
  recipientKeyCacheRef: { current: Record<string, string> };
  persistFriendKeyCacheNow: () => void;
}): Promise<void> {
  const encrypted = await encryptPrivateThreadText({
    session: args.session,
    participantUids: [args.postOwnerUid, args.friendUid],
    text: args.text,
    recipientKeyCacheRef: args.recipientKeyCacheRef,
    persistFriendKeyCacheNow: args.persistFriendKeyCacheNow,
  });
  await callEmulatorFunction("createPrivatePostThreadMessage", {
    uid: args.session.uid,
    deviceId: args.session.deviceId,
    postId: args.postId,
    postOwnerUid: args.postOwnerUid,
    friendUid: args.friendUid,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    envelopes: encrypted.envelopes,
  });
}
