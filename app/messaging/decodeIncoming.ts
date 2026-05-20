import { logAppError } from "../../telemetry";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import { joinCutoffMsForViewer } from "../lib/chatMemberJoinedAt";
import { resolveIncomingDirectChatId } from "../lib/directChatId";
import { isConversationHiddenForViewer } from "../lib/hiddenConversations";
import { shouldIngestInboundMessage } from "../lib/messageIngestPolicy";
import {
  CURRENT_USER_LOCAL_ID,
  resolveIncomingSenderFriendId,
} from "../lib/resolveChatMemberBackendUid";
import { overlayMessageDocMetadata, type MessageDocMetadata } from "./messageMetadata";
import type { Chat, Friend, Message } from "../domain/types";
import type { EncryptedPlainPayload } from "./types";

export type DecodeIncomingParams = {
  sessionUid: string;
  ciphertext: string;
  nonce: string;
  envelope: string;
  senderUid: string;
  conversationId: string;
  messageDocId: string;
  createdAtMs: number;
  uidToFriendId: Record<string, string>;
  knownChatIds: Set<string>;
  hiddenChatIdSet: Set<string>;
  hiddenServerConversationIds: Set<string>;
  chats: Chat[];
  allFriends?: Friend[];
  /** Skip listener docs already covered by boot callable watermark. */
  watermarkMs?: number;
  /** When set, unknown 1:1 threads from non-friends are dropped. */
  acceptedFriendBackendUids?: Set<string>;
  docMetadata?: MessageDocMetadata;
};

export type DecodeIncomingResult = {
  message: Message;
  missingChat?: Chat;
};

/**
 * Decrypt one encrypted message doc and map it to local chat/message ids.
 * Returns null when the doc should be skipped (hidden, cutoff, watermark, etc.).
 */
export async function decodeIncomingEncryptedMessage(
  params: DecodeIncomingParams
): Promise<DecodeIncomingResult | null> {
  const {
    sessionUid,
    ciphertext,
    nonce,
    envelope,
    senderUid,
    conversationId,
    messageDocId,
    createdAtMs,
    uidToFriendId,
    knownChatIds,
    hiddenChatIdSet,
    hiddenServerConversationIds,
    chats,
    allFriends,
    watermarkMs,
    acceptedFriendBackendUids,
    docMetadata,
  } = params;

  const rawConvLocalId = conversationId.replace(/^enc_/, "");
  const senderUidTrimmed = String(senderUid ?? "").trim();
  const canonicalConvLocalId = resolveIncomingDirectChatId(
    rawConvLocalId,
    senderUidTrimmed,
    sessionUid
  );

  if (
    isConversationHiddenForViewer(
      conversationId,
      { raw: rawConvLocalId, resolved: canonicalConvLocalId },
      hiddenChatIdSet,
      hiddenServerConversationIds
    )
  ) {
    return null;
  }

  if (
    typeof watermarkMs === "number" &&
    watermarkMs > 0 &&
    createdAtMs > 0 &&
    createdAtMs <= watermarkMs - 5_000
  ) {
    return null;
  }

  const chatRow =
    chats.find((c) => c.id === canonicalConvLocalId) ??
    chats.find((c) => c.id === rawConvLocalId);
  const joinCutoff = joinCutoffMsForViewer(chatRow ?? null, sessionUid);
  if (senderUidTrimmed === sessionUid && createdAtMs < joinCutoff) {
    return null;
  }

  const plain = await decryptPayloadForRecipient<EncryptedPlainPayload>(
    sessionUid,
    ciphertext,
    nonce,
    envelope
  );

  const rawChatId = plain.chatId || rawConvLocalId;
  const resolvedChatId = resolveIncomingDirectChatId(
    rawChatId,
    senderUidTrimmed,
    sessionUid
  );
  if (!resolvedChatId) return null;

  if (
    isConversationHiddenForViewer(
      conversationId,
      { raw: rawChatId, resolved: resolvedChatId },
      hiddenChatIdSet,
      hiddenServerConversationIds
    )
  ) {
    return null;
  }

  if (acceptedFriendBackendUids) {
    if (
      !shouldIngestInboundMessage({
        sessionUid,
        senderUid: senderUidTrimmed,
        resolvedChatId,
        knownChatIds,
        acceptedFriendBackendUids,
      })
    ) {
      return null;
    }
  }

  let missingChat: Chat | undefined;
  if (!knownChatIds.has(resolvedChatId)) {
    const senderFriendId = resolveIncomingSenderFriendId(
      senderUidTrimmed,
      sessionUid,
      uidToFriendId
    );
    if (senderFriendId === CURRENT_USER_LOCAL_ID) return null;
    const senderProfile = allFriends?.find(
      (f) => f.id === senderFriendId || f.backendUid === senderUidTrimmed
    );
    missingChat = {
      id: resolvedChatId,
      memberIds: [CURRENT_USER_LOCAL_ID, senderFriendId],
      name: senderProfile?.displayName?.trim() || "Friend",
      profilePicture: senderProfile?.profilePictureUrl || undefined,
      kind: "standard",
      createdBy: senderFriendId,
      isCustomName: false,
      isDraft: false,
      visibleToRecipients: true,
      updatedAt: plain.createdAt ?? createdAtMs ?? Date.now(),
    };
    knownChatIds.add(resolvedChatId);
  }

  // Prefer the Firestore doc id — it matches metadata callables and send path.
  let message: Message = {
    id: messageDocId || plain.messageId,
    chatId: resolvedChatId,
    senderId:
      plain.senderId ??
      resolveIncomingSenderFriendId(senderUidTrimmed, sessionUid, uidToFriendId),
    text: plain.text,
    createdAt: createdAtMs || plain.createdAt || Date.now(),
    kind: plain.kind ?? "text",
    mediaUri: plain.mediaUri ?? undefined,
    durationSec:
      typeof plain.durationSec === "number" && Number.isFinite(plain.durationSec)
        ? Math.max(0, Math.round(plain.durationSec))
        : undefined,
    replyToMessageId: plain.replyToMessageId ?? undefined,
    broadcastThreadFriendId: plain.broadcastThreadFriendId ?? undefined,
  };

  if (docMetadata) {
    message = overlayMessageDocMetadata(message, docMetadata, sessionUid, uidToFriendId);
  }

  return { message, missingChat };
}

export function logDecodeIncomingError(
  scope: string,
  err: unknown,
  context: Record<string, unknown>
): void {
  logAppError(scope, err, context);
}
