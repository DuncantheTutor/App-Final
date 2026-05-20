import { Alert } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { logAppError, logAppEvent } from "../../telemetry";
import { uploadSharedMediaIfNeeded } from "../../mediaStorageUpload";
import { ensureLocalKeyBundle, encryptPayloadForRecipients } from "../../e2eeCrypto";
import {
  CURRENT_USER_LOCAL_ID,
  resolveChatParticipantBackendUids,
} from "../lib/resolveChatMemberBackendUid";
import {
  normalizeMemberJoinedAtForClient,
} from "../lib/chatMemberJoinedAt";
import {
  isCanonicalDirectChatId,
  isLiveDirectChatLocalId,
  resolveCanonicalDirectChatLocalId,
} from "../lib/directChatId";
import { isLegacyDraftChatId } from "./localChatId";
import { resolveRecipientEncryptionKeys } from "./recipientKeys";
import type { Chat, Friend, Message } from "../domain/types";
import type { BackendSession } from "./types";

export type MigrateDirectChatResult = {
  chatForSend: Chat;
  migratedFromId?: string;
};

/** Promote a 1:1 thread to canonical `dm_*` when we know both app uids. */
export function migrateDirectChatToCanonical(params: {
  chat: Chat;
  session: BackendSession;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
}): MigrateDirectChatResult {
  const { chat, session, friendMap, friendIdToBackendUid } = params;
  if (isCanonicalDirectChatId(chat.id) || isLiveDirectChatLocalId(chat.id)) {
    return { chatForSend: chat };
  }
  const canonicalId = resolveCanonicalDirectChatLocalId(
    chat,
    session.uid,
    friendMap,
    friendIdToBackendUid
  );
  if (!canonicalId || canonicalId === chat.id) {
    return { chatForSend: chat };
  }
  const migratedFromId = isLegacyDraftChatId(chat.id) ? chat.id : undefined;
  return {
    chatForSend: { ...chat, id: canonicalId },
    migratedFromId: migratedFromId ?? (chat.id !== canonicalId ? chat.id : undefined),
  };
}

export type DeliverOutgoingMessagesParams = {
  session: BackendSession;
  chatForSend: Chat;
  outgoingForState: Message[];
  friendIdToBackendUid: Record<string, string>;
  friendMapRef: { current: Record<string, Friend> };
  friendIdToBackendUidRef: { current: Record<string, string> };
  recipientKeyCacheRef: { current: Record<string, string> };
  persistFriendKeyCacheNow: () => void;
  resolveConversationId: (chat: Chat) => string;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setMessages: (updater: (current: Message[]) => Message[]) => void;
  onDelivered: () => void;
  onFailed: (failedIds: Set<string>) => void;
};

export async function deliverOutgoingMessages(
  params: DeliverOutgoingMessagesParams
): Promise<void> {
  const {
    session,
    chatForSend,
    outgoingForState,
    friendIdToBackendUid,
    friendMapRef,
    friendIdToBackendUidRef,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
    resolveConversationId,
    setChats,
    setMessages,
    onDelivered,
    onFailed,
  } = params;

  const uniqueParticipantUids = resolveChatParticipantBackendUids(
    chatForSend.memberIds,
    session.uid,
    friendMapRef.current,
    friendIdToBackendUidRef.current
  );
  if (uniqueParticipantUids.length < 2) {
    throw new Error(
      "Could not resolve this chat's members for the server. Try reopening the chat or re-adding the friend."
    );
  }

  const authUid = firebaseAuth.currentUser?.uid;
  if (!authUid) {
    throw new Error("Firebase Auth is not ready. Please wait a moment and try again.");
  }

  const ownBundle = await ensureLocalKeyBundle(session.uid);
  await callEmulatorFunction("publishUserKeyBundle", {
    uid: session.uid,
    deviceId: session.deviceId,
    keyVersion: ownBundle.keyVersion,
    encryptionPublicKey: ownBundle.encryptionPublicKey,
    identitySigningPublicKey: ownBundle.identitySigningPublicKey,
  });

  const conversationId = resolveConversationId(chatForSend);
  const keyMap = await resolveRecipientEncryptionKeys({
    session,
    recipientUids: uniqueParticipantUids,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
  });

  const upsertRes = await callEmulatorFunction<{
    memberJoinedAt?: Record<string, number>;
  }>("upsertConversation", {
    uid: session.uid,
    deviceId: session.deviceId,
    conversationId,
    participantUids: uniqueParticipantUids,
  });

  if (upsertRes.memberJoinedAt) {
    const normalizedJoinedAt = normalizeMemberJoinedAtForClient(
      upsertRes.memberJoinedAt,
      session.uid,
      chatForSend.memberIds,
      friendIdToBackendUid
    );
    if (normalizedJoinedAt) {
      const joinedAtForClient = { ...normalizedJoinedAt };
      for (const message of outgoingForState) {
        const localCutoff = joinedAtForClient[CURRENT_USER_LOCAL_ID];
        if (typeof localCutoff === "number" && message.createdAt < localCutoff) {
          joinedAtForClient[CURRENT_USER_LOCAL_ID] = Math.min(localCutoff, message.createdAt);
        }
      }
      setChats((current) =>
        current.map((c) =>
          c.id === chatForSend.id ? { ...c, memberJoinedAt: joinedAtForClient } : c
        )
      );
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await callEmulatorFunction("registerFirebaseAuthUid", {
        uid: session.uid,
        deviceId: session.deviceId,
        firebaseAuthUid: authUid,
      });
      break;
    } catch (regErr) {
      if (attempt >= 2) {
        logAppError("send.register_firebase_uid", regErr, {
          uid: session.uid,
          note: "send_continues_via_callable_pull",
        });
      } else {
        await new Promise<void>((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
  }

  const deliveredIds: string[] = [];
  const failedIds: string[] = [];

  for (const message of outgoingForState) {
    try {
      const remoteMediaUri = await uploadSharedMediaIfNeeded(message.mediaUri, authUid);
      const encrypted = await encryptPayloadForRecipients(
        session.uid,
        {
          messageId: message.id,
          chatId: chatForSend.id,
          text: message.text,
          createdAt: message.createdAt,
          kind: message.kind ?? "text",
          mediaUri: remoteMediaUri ?? null,
          durationSec: message.durationSec ?? null,
          replyToMessageId: message.replyToMessageId ?? null,
          broadcastThreadFriendId: message.broadcastThreadFriendId ?? null,
        },
        keyMap
      );
      await callEmulatorFunction("sendEncryptedMessage", {
        uid: session.uid,
        deviceId: session.deviceId,
        conversationId,
        participantUids: uniqueParticipantUids,
        messageId: message.id,
        ...encrypted,
      });
      deliveredIds.push(message.id);
    } catch (err) {
      logAppError("send.message", err, {
        chatId: chatForSend.id,
        messageId: message.id,
        conversationId,
      });
      failedIds.push(message.id);
    }
  }

  if (deliveredIds.length > 0) {
    logAppEvent("send.delivered", {
      chatId: chatForSend.id,
      conversationId,
      messageCount: deliveredIds.length,
      failedCount: failedIds.length,
    });
    const deliveredSet = new Set(deliveredIds);
    setMessages((current) =>
      current.map((message) =>
        deliveredSet.has(message.id) &&
          (message.senderId === CURRENT_USER_LOCAL_ID || message.senderId === "me")
          ? { ...message, deliveryStatus: "sent" as const }
          : message
      )
    );
    onDelivered();
  }

  if (failedIds.length > 0) {
    onFailed(new Set(failedIds));
    if (deliveredIds.length === 0) {
      throw new Error("Could not deliver message.");
    }
  }
}

export async function updateOutgoingMessageContent(params: {
  session: BackendSession;
  chat: Chat;
  message: Message;
  friendIdToBackendUid: Record<string, string>;
  friendMapRef: { current: Record<string, Friend> };
  friendIdToBackendUidRef: { current: Record<string, string> };
  recipientKeyCacheRef: { current: Record<string, string> };
  persistFriendKeyCacheNow: () => void;
  resolveConversationId: (chat: Chat) => string;
}): Promise<void> {
  const {
    session,
    chat,
    message,
    friendIdToBackendUid,
    friendMapRef,
    friendIdToBackendUidRef,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
    resolveConversationId,
  } = params;

  const uniqueParticipantUids = resolveChatParticipantBackendUids(
    chat.memberIds,
    session.uid,
    friendMapRef.current,
    friendIdToBackendUidRef.current
  );
  if (uniqueParticipantUids.length < 2) {
    throw new Error("Could not resolve chat members for edit.");
  }

  const conversationId = resolveConversationId(chat);
  const keyMap = await resolveRecipientEncryptionKeys({
    session,
    recipientUids: uniqueParticipantUids,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
  });

  const authUid = firebaseAuth.currentUser?.uid;
  if (!authUid) {
    throw new Error("Firebase Auth is not ready. Please wait a moment and try again.");
  }
  const remoteMediaUri = await uploadSharedMediaIfNeeded(message.mediaUri, authUid);
  const encrypted = await encryptPayloadForRecipients(
    session.uid,
    {
      messageId: message.id,
      chatId: chat.id,
      text: message.text,
      createdAt: message.createdAt,
      kind: message.kind ?? "text",
      mediaUri: remoteMediaUri ?? null,
      durationSec: message.durationSec ?? null,
      replyToMessageId: message.replyToMessageId ?? null,
      broadcastThreadFriendId: message.broadcastThreadFriendId ?? null,
    },
    keyMap
  );

  const editedAt = message.editedAt ?? Date.now();
  await callEmulatorFunction("updateEncryptedMessage", {
    uid: session.uid,
    deviceId: session.deviceId,
    conversationId,
    messageId: message.id,
    editedAt,
    ...encrypted,
  });
}

export function alertOutgoingDeliveryFailure(err: unknown, onFailed: (ids: Set<string>) => void, ids: Set<string>): void {
  onFailed(ids);
  const message = err instanceof Error ? err.message : "Could not deliver message.";
  Alert.alert("Message not delivered", message);
}
