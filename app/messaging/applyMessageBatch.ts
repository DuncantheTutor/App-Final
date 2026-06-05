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
  const additionById = new Map(additions.map((chat) => [chat.id, chat]));
  const existingIds = new Set(current.map((chat) => chat.id));

  // Upgrade any existing row to "broadcast" if an incoming broadcast shares its id,
  // so a broadcast thread can never stay mistagged as a standard 1:1 on the receiver.
  const upgraded = current.map((chat) => {
    const incoming = additionById.get(chat.id);
    if (incoming?.kind === "broadcast" && chat.kind !== "broadcast") {
      return {
        ...chat,
        kind: "broadcast" as const,
        profilePicture: chat.profilePicture || incoming.profilePicture || "📣",
      };
    }
    return chat;
  });

  const filtered = additions.filter((chat) => !existingIds.has(chat.id));
  return filtered.length ? [...filtered, ...upgraded] : upgraded;
}
