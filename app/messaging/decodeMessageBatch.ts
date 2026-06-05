import { rosterFriendBackendUidsFromMap } from "../lib/messageIngestPolicy";
import { yieldToUi } from "../lib/yieldToUi";
import { decodeIncomingEncryptedMessage, logDecodeIncomingError } from "./decodeIncoming";
import { mergeMissingChatsIntoState, mergeMessagesIntoState } from "./applyMessageBatch";
import type { Chat, Friend, Message } from "../domain/types";
import type { DecodedIncomingBatch, MessagingSyncRefs } from "./types";

export type EncryptedMessagePullItem = {
  messageId: string;
  conversationId: string;
  senderUid: string;
  ciphertext: string;
  nonce: string;
  envelope: string;
  createdAtMs?: number;
  reactions?: Record<string, string>;
  editedAt?: number | null;
  unsentAt?: number | null;
};

export function messageSyncCursorMs(message: Pick<Message, "createdAt" | "editedAt">): number {
  const edited = message.editedAt;
  return Math.max(message.createdAt, typeof edited === "number" && Number.isFinite(edited) ? edited : 0);
}

/**
 * Compute the next sync watermark without ever advancing past a message that
 * failed to decode. Advancing to the newest *successful* cursor when an older
 * message in the same batch threw would permanently skip that message (the next
 * pull starts after it), causing silent message loss. When a failure exists we
 * cap the watermark just below the earliest failed message so the next pull
 * re-fetches and retries it.
 */
export function nextSafeWatermarkMs(params: {
  prior: number;
  successCursorMs: number;
  earliestFailureMs: number | null;
}): number {
  const { prior, successCursorMs, earliestFailureMs } = params;
  let candidate = successCursorMs;
  if (earliestFailureMs != null && Number.isFinite(earliestFailureMs)) {
    candidate = Math.min(candidate, earliestFailureMs - 1);
  }
  return Math.max(prior, candidate);
}

export async function decodeEncryptedMessagePullItems(params: {
  sessionUid: string;
  items: EncryptedMessagePullItem[];
  refs: MessagingSyncRefs;
  allFriends?: Friend[];
}): Promise<{ batch: DecodedIncomingBatch; decodeFailures: number; earliestFailureMs: number | null }> {
  const { sessionUid, items, refs, allFriends } = params;
  const knownChatIds = new Set(refs.chatsRef.current?.map((chat) => chat.id) ?? []);
  const hiddenChatIdSet = new Set(refs.hiddenChatIdsRef.current ?? []);
  const hiddenServerConversationIds = refs.hiddenServerConversationIdsRef.current ?? new Set();
  const uidToFriendId = refs.backendUidToFriendIdRef.current ?? {};
  const rosterFriendBackendUids = rosterFriendBackendUidsFromMap(refs.friendMapRef.current);
  const batch: DecodedIncomingBatch = { decoded: [], missingChats: [] };
  let decodeFailures = 0;
  let earliestFailureMs: number | null = null;
  let decodedSinceYield = 0;

  for (const item of items) {
    try {
      if (!item.envelope) continue;
      const result = await decodeIncomingEncryptedMessage({
        sessionUid,
        ciphertext: item.ciphertext,
        nonce: item.nonce,
        envelope: item.envelope,
        senderUid: item.senderUid,
        conversationId: item.conversationId,
        messageDocId: item.messageId,
        createdAtMs: item.createdAtMs ?? Date.now(),
        uidToFriendId,
        knownChatIds,
        hiddenChatIdSet,
        hiddenServerConversationIds,
        chats: refs.chatsRef.current ?? [],
        friendMap: refs.friendMapRef.current ?? {},
        friendIdToBackendUid: refs.friendIdToBackendUidRef.current ?? {},
        identityLockedChatIds: new Set(refs.identityLockedChatIdsRef.current ?? []),
        allFriends,
        acceptedFriendBackendUids: refs.acceptedFriendBackendUidsRef.current,
        rosterFriendBackendUids,
        docMetadata: {
          reactions: item.reactions,
          editedAt: item.editedAt,
          unsentAt: item.unsentAt,
        },
      });
      if (!result) continue;
      batch.decoded.push(result.message);
      if (result.missingChat) batch.missingChats.push(result.missingChat);
      decodedSinceYield += 1;
      if (decodedSinceYield >= 8) {
        decodedSinceYield = 0;
        await yieldToUi();
      }
    } catch (err) {
      decodeFailures += 1;
      const failMs = item.createdAtMs ?? 0;
      if (failMs > 0 && (earliestFailureMs == null || failMs < earliestFailureMs)) {
        earliestFailureMs = failMs;
      }
      logDecodeIncomingError("messages.pull.decode", err, { conversationId: item.conversationId });
    }
  }

  return { batch, decodeFailures, earliestFailureMs };
}

export function applyDecodedBatchToState(params: {
  batch: DecodedIncomingBatch;
  decodeFailures: number;
  earliestFailureMs?: number | null;
  incremental: boolean;
  refs: MessagingSyncRefs;
  persistWatermarksNow: () => void;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setMessages: (updater: (current: Message[]) => Message[]) => void;
}): void {
  const {
    batch,
    earliestFailureMs = null,
    incremental,
    refs,
    persistWatermarksNow,
    setChats,
    setMessages,
  } = params;
  if (batch.missingChats.length > 0) {
    setChats((current) => mergeMissingChatsIntoState(current, batch.missingChats));
  }
  if (batch.decoded.length > 0) {
    setMessages((current) => mergeMessagesIntoState(current, batch.decoded, incremental));
    const successCursor = Math.max(...batch.decoded.map((m) => messageSyncCursorMs(m)));
    const prior = refs.messagesWatermarkMsRef.current ?? 0;
    const next = nextSafeWatermarkMs({ prior, successCursorMs: successCursor, earliestFailureMs });
    if (next > prior) {
      refs.messagesWatermarkMsRef.current = next;
      persistWatermarksNow();
    }
  }
}
