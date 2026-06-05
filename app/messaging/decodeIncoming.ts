import { logAppError } from "../../telemetry";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import { joinCutoffMsForViewer } from "../lib/chatMemberJoinedAt";
import {
  isBroadcastChatLocalId,
  resolveInboundDirectMessageTarget,
  resolveIncomingDirectChatId,
} from "../lib/directChatId";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import {
  rosterFriendBackendUidsFromMap,
  shouldIngestInboundMessage,
} from "../lib/messageIngestPolicy";
import {
  CURRENT_USER_LOCAL_ID,
  resolveIncomingSenderFriendId,
} from "../lib/resolveChatMemberBackendUid";
import { parseMessageMediaFromPlain } from "../lib/tierBMedia/messageMedia";
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
  friendMap?: Record<string, Friend>;
  friendIdToBackendUid?: Record<string, string>;
  identityLockedChatIds?: ReadonlySet<string>;
  /** Skip listener docs already covered by boot callable watermark. */
  watermarkMs?: number;
  /** When set, unknown 1:1 threads from non-friends are dropped. */
  acceptedFriendBackendUids?: Set<string>;
  rosterFriendBackendUids?: Set<string>;
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
    friendMap,
    friendIdToBackendUid,
    identityLockedChatIds,
    watermarkMs,
    acceptedFriendBackendUids,
    rosterFriendBackendUids,
    docMetadata,
  } = params;

  const rawConvLocalId = conversationId.replace(/^enc_/, "");
  const senderUidTrimmed = String(senderUid ?? "").trim();

  const preTarget = resolveInboundDirectMessageTarget({
    conversationId,
    rawLocalChatId: rawConvLocalId,
    senderAppUid: senderUidTrimmed,
    sessionAppUid: sessionUid,
    chats,
    friendMap: friendMap ?? {},
    friendIdToBackendUid: friendIdToBackendUid ?? {},
    hiddenLocalChatIds: hiddenChatIdSet,
    hiddenServerConversationIds,
    identityLockedChatIds,
  });
  if ("drop" in preTarget) return null;

  if (
    typeof watermarkMs === "number" &&
    watermarkMs > 0 &&
    createdAtMs > 0 &&
    createdAtMs <= watermarkMs - 5_000
  ) {
    return null;
  }

  const resolvedChatId = preTarget.resolvedLocalChatId;
  const chatRow =
    chats.find((c) => c.id === resolvedChatId) ??
    chats.find((c) => c.id === preTarget.rawLocalChatId);
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

  const postTarget = resolveInboundDirectMessageTarget({
    conversationId,
    rawLocalChatId: rawConvLocalId,
    senderAppUid: senderUidTrimmed,
    sessionAppUid: sessionUid,
    chats,
    friendMap: friendMap ?? {},
    friendIdToBackendUid: friendIdToBackendUid ?? {},
    hiddenLocalChatIds: hiddenChatIdSet,
    hiddenServerConversationIds,
    identityLockedChatIds,
    plainLocalChatId: plain.chatId,
  });
  if ("drop" in postTarget) return null;

  const finalChatId = postTarget.resolvedLocalChatId;
  if (!finalChatId) return null;

  if (acceptedFriendBackendUids) {
    const rosterUids =
      rosterFriendBackendUids ??
      rosterFriendBackendUidsFromMap(
        allFriends?.length
          ? Object.fromEntries(
              allFriends
                .filter((f) => f.backendUid?.startsWith("u_"))
                .map((f) => [f.id, f])
            )
          : undefined
      );
    if (
      !shouldIngestInboundMessage({
        sessionUid,
        senderUid: senderUidTrimmed,
        resolvedChatId: finalChatId,
        knownChatIds,
        acceptedFriendBackendUids,
        rosterFriendBackendUids: rosterUids,
      })
    ) {
      return null;
    }
  }

  let missingChat: Chat | undefined;
  const ensureLive = postTarget.ensureLiveChat;
  if (ensureLive && !knownChatIds.has(ensureLive.localId)) {
    const senderFriendId = resolveIncomingSenderFriendId(
      ensureLive.friendBackendUid,
      sessionUid,
      uidToFriendId
    );
    if (senderFriendId === CURRENT_USER_LOCAL_ID) return null;
    const senderProfile = allFriends?.find(
      (f) => f.id === senderFriendId || f.backendUid === ensureLive.friendBackendUid
    );
    missingChat = {
      id: ensureLive.localId,
      memberIds: [CURRENT_USER_LOCAL_ID, senderFriendId],
      name: friendDisplayNameFromProfile(
        senderProfile?.displayName,
        ensureLive.friendBackendUid
      ),
      profilePicture: senderProfile?.profilePictureUrl || undefined,
      kind: "standard",
      createdBy: senderFriendId,
      isCustomName: false,
      isDraft: false,
      visibleToRecipients: true,
      updatedAt: plain.createdAt ?? createdAtMs ?? Date.now(),
    };
    knownChatIds.add(ensureLive.localId);
  } else if (!knownChatIds.has(finalChatId)) {
    const senderFriendId = resolveIncomingSenderFriendId(
      senderUidTrimmed,
      sessionUid,
      uidToFriendId
    );
    if (senderFriendId === CURRENT_USER_LOCAL_ID) return null;
    const senderProfile = allFriends?.find(
      (f) => f.id === senderFriendId || f.backendUid === senderUidTrimmed
    );
    const isBroadcast = isBroadcastChatLocalId(finalChatId) || plain.isBroadcast === true;
    missingChat = {
      id: finalChatId,
      memberIds: [CURRENT_USER_LOCAL_ID, senderFriendId],
      name: isBroadcast
        ? plain.broadcastTitle?.trim() || "Broadcast"
        : friendDisplayNameFromProfile(senderProfile?.displayName, senderUidTrimmed),
      profilePicture: isBroadcast ? "📣" : senderProfile?.profilePictureUrl || undefined,
      kind: isBroadcast ? "broadcast" : "standard",
      createdBy: senderFriendId,
      isCustomName: false,
      isDraft: false,
      visibleToRecipients: true,
      updatedAt: plain.createdAt ?? createdAtMs ?? Date.now(),
    };
    knownChatIds.add(finalChatId);
  }

  const parsedMedia = parseMessageMediaFromPlain(plain);

  let message: Message = {
    id: messageDocId || plain.messageId,
    chatId: finalChatId,
    senderId:
      plain.senderId ??
      resolveIncomingSenderFriendId(senderUidTrimmed, sessionUid, uidToFriendId),
    text: typeof plain.text === "string" ? plain.text : String(plain.text ?? ""),
    createdAt: createdAtMs || plain.createdAt || Date.now(),
    kind: plain.kind ?? "text",
    mediaUri: parsedMedia.mediaUri,
    mediaEncrypted: parsedMedia.mediaEncrypted,
    durationSec:
      typeof plain.durationSec === "number" && Number.isFinite(plain.durationSec)
        ? Math.max(0, Math.round(plain.durationSec))
        : undefined,
    mediaWidth:
      typeof plain.mediaWidth === "number" && plain.mediaWidth > 0
        ? Math.round(plain.mediaWidth)
        : undefined,
    mediaHeight:
      typeof plain.mediaHeight === "number" && plain.mediaHeight > 0
        ? Math.round(plain.mediaHeight)
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

