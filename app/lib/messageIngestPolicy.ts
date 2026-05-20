import type { Friend } from "../domain/types";

/** Whether an inbound encrypted message should be merged into local state. */
export function shouldIngestInboundMessage(params: {
  sessionUid: string;
  senderUid: string;
  resolvedChatId: string;
  knownChatIds: Set<string>;
  acceptedFriendBackendUids: Set<string>;
  /** Local roster `backendUid` values — trust UI friends when server set lags. */
  rosterFriendBackendUids?: Set<string>;
}): boolean {
  const {
    sessionUid,
    senderUid,
    resolvedChatId,
    knownChatIds,
    acceptedFriendBackendUids,
    rosterFriendBackendUids,
  } = params;
  const sender = senderUid.trim();

  // Existing thread always wins — do not block delivery on a stale friends set.
  if (knownChatIds.has(resolvedChatId)) return true;

  if (!sender.startsWith("u_") || sender === sessionUid) return false;

  if (acceptedFriendBackendUids.size === 0) return true;

  if (acceptedFriendBackendUids.has(sender)) return true;

  if (rosterFriendBackendUids?.has(sender)) return true;

  return false;
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
