import { maxCreatedAtMs, mergeSyncedMessages } from "../lib/mergeEncryptedSync";
import type { Chat, Message } from "../domain/types";
import type { DecodedIncomingBatch } from "./types";

export function applyDecodedMessageBatch(params: {
  batch: DecodedIncomingBatch;
  incremental: boolean;
  optimisticWindowMs?: number;
}): {
  messagesToMerge: Message[];
  chatsToAdd: Chat[];
  watermarkMs: number;
} {
  const { batch, incremental, optimisticWindowMs = 120_000 } = params;
  return {
    messagesToMerge: batch.decoded,
    chatsToAdd: batch.missingChats,
    watermarkMs: batch.decoded.length > 0 ? maxCreatedAtMs(batch.decoded) : 0,
  };
}

export function mergeMessagesIntoState(
  current: Message[],
  incoming: Message[],
  incremental: boolean,
  optimisticWindowMs = 120_000
): Message[] {
  return mergeSyncedMessages(current, incoming, { incremental, optimisticWindowMs });
}

export function mergeMissingChatsIntoState(current: Chat[], additions: Chat[]): Chat[] {
  if (additions.length === 0) return current;
  const existing = new Set(current.map((chat) => chat.id));
  const filtered = additions.filter((chat) => !existing.has(chat.id));
  return filtered.length ? [...filtered, ...current] : current;
}
