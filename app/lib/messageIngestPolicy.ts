/** Whether an inbound encrypted message should be merged into local state. */

export function shouldIngestInboundMessage(params: {

  sessionUid: string;

  senderUid: string;

  resolvedChatId: string;

  knownChatIds: Set<string>;

  acceptedFriendBackendUids: Set<string>;

}): boolean {

  const { sessionUid, senderUid, resolvedChatId, knownChatIds, acceptedFriendBackendUids } =

    params;

  const sender = senderUid.trim();

  if (sender.startsWith("u_") && sender !== sessionUid && !acceptedFriendBackendUids.has(sender)) {

    return false;

  }

  if (knownChatIds.has(resolvedChatId)) return true;

  if (!sender.startsWith("u_") || sender === sessionUid) return false;

  return acceptedFriendBackendUids.has(sender);

}

