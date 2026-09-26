import type { Friend } from "../domain/types";

export type IngestDecision = "ingest" | "drop" | "hold";

/**
 * New threads from other accounts wait until this sign-in's friend list is known.
 * An empty list then drops them. An existing thread still accepts the sender.
 */
export function inboundMessageIngestDecision(params: {
  sessionUid: string;
  senderUid: string;
  resolvedChatId: string;
  knownChatIds: Set<string>;
  acceptedFriendBackendUids: Set<string>;
  /** Local roster `backendUid` values — trust UI friends when the server set lags. */
  rosterFriendBackendUids?: Set<string>;
  /** False until `listMyFriends` or a server friendship snapshot has returned. */
  rosterReady: boolean;
}): IngestDecision {
  const {
    sessionUid,
    senderUid,
    resolvedChatId,
    knownChatIds,
    acceptedFriendBackendUids,
    rosterFriendBackendUids,
    rosterReady,
  } = params;
  const sender = senderUid.trim();

  if (knownChatIds.has(resolvedChatId)) return "ingest";

  if (!sender.startsWith("u_") || sender === sessionUid) return "drop";

  if (!rosterReady) return "hold";

  if (acceptedFriendBackendUids.has(sender)) return "ingest";

  if (rosterFriendBackendUids?.has(sender)) return "ingest";

  return "drop";
}

/** Whether an inbound encrypted message should be merged into local state. */
export function shouldIngestInboundMessage(params: {
  sessionUid: string;
  senderUid: string;
  resolvedChatId: string;
  knownChatIds: Set<string>;
  acceptedFriendBackendUids: Set<string>;
  rosterFriendBackendUids?: Set<string>;
  rosterReady: boolean;
}): boolean {
  return inboundMessageIngestDecision(params) === "ingest";
}

export function rosterFriendBackendUidsFromMap(
  friendMap: Record<string, Friend> | null | undefined
): Set<string> {
  const out = new Set<string>();
  for (const friend of Object.values(friendMap ?? {})) {
    const bu = friend.backendUid?.trim();
    if (bu?.startsWith("u_")) out.add(bu);
  }
  return out;
}
