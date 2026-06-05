import { CURRENT_USER_LOCAL_ID } from "./chatMemberJoinedAt";
import { isConversationHiddenForViewer } from "./hiddenConversations";
import {
  findActiveDirectChatForFriend,
  isAppBackendUid,
  resolveChatMemberToBackendUid,
} from "./resolveChatMemberBackendUid";
import type { Chat, Friend } from "../domain/types";

/** Stable local + server thread id for a 1:1 DM between two app accounts. */
export function canonicalDirectChatLocalId(uidA: string, uidB: string): string {
  const [a, b] = [uidA.trim(), uidB.trim()].sort();
  return `dm_${a}__${b}`;
}

/** Base id for the active post-refriend DM (same on both devices when friendship is live). */
export function liveDirectChatLocalIdBase(uidA: string, uidB: string): string {
  const [a, b] = [uidA.trim(), uidB.trim()].sort();
  return `dm_${a}__${b}__live`;
}

/**
 * Allocates the current live DM id: `dm_*__live`, then `dm_*__live2`, … when older live threads are locked.
 */
export function allocateLiveDirectChatLocalId(
  uidA: string,
  uidB: string,
  identityLockedChatIds?: ReadonlySet<string>
): string {
  const base = liveDirectChatLocalIdBase(uidA, uidB);
  if (!identityLockedChatIds?.has(base)) return base;
  for (let n = 2; n < 50; n += 1) {
    const candidate = `${base}${n}`;
    if (!identityLockedChatIds.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

export function isDirectChatLocalId(chatId: string): boolean {
  return chatId.trim().startsWith("dm_");
}

/** Broadcast (`bc_*`) or group (`grp_*`) thread — addressed to multiple recipients, not a 1:1 DM. */
export function isMultiPartyChatLocalId(chatId: string): boolean {
  const id = chatId.trim();
  return id.startsWith("bc_") || id.startsWith("grp_");
}

/** Broadcast thread id (`bc_*`). */
export function isBroadcastChatLocalId(chatId: string): boolean {
  return chatId.trim().startsWith("bc_");
}

export function isLiveDirectChatLocalId(chatId: string): boolean {
  const id = chatId.trim();
  return id.startsWith("dm_") && id.includes("__live");
}

export function isCanonicalDirectChatId(chatId: string): boolean {
  const id = chatId.trim();
  return id.startsWith("dm_") && !isLiveDirectChatLocalId(id);
}

/** Resolve canonical `dm_*` id for a 1:1 chat, or null when not a linked direct DM. */
export function resolveCanonicalDirectChatLocalId(
  chat: Chat,
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): string | null {
  if ((chat.kind ?? "standard") !== "standard") return null;
  const others = chat.memberIds.filter((id) => id !== CURRENT_USER_LOCAL_ID);
  if (others.length !== 1) return null;
  const friendBackendUid = resolveChatMemberToBackendUid(
    others[0],
    sessionAppUid,
    friendMap,
    friendIdToBackendUid
  );
  if (!friendBackendUid || !isAppBackendUid(friendBackendUid)) return null;
  return canonicalDirectChatLocalId(sessionAppUid, friendBackendUid);
}

/** Firestore conversation doc id for encrypted DMs. */
export function serverConversationIdForChat(
  chat: Chat,
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): string {
  if (isLiveDirectChatLocalId(chat.id)) {
    return `enc_${chat.id.trim()}`;
  }
  const canonical = resolveCanonicalDirectChatLocalId(
    chat,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid
  );
  return `enc_${canonical ?? chat.id}`;
}

/** Resolve server conversation id when only the local chat id (or Chat) is known. */
export function serverConversationIdFromLocalChatId(
  chatOrLocalId: Chat | string,
  sessionAppUid: string,
  chats: Chat[],
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): string {
  const localId = typeof chatOrLocalId === "string" ? chatOrLocalId.trim() : chatOrLocalId.id;
  const chat =
    typeof chatOrLocalId === "string"
      ? chats.find((c) => c.id === localId)
      : chatOrLocalId;
  if (chat) {
    return serverConversationIdForChat(chat, sessionAppUid, friendMap, friendIdToBackendUid);
  }
  return `enc_${localId}`;
}

/** Server conversation doc ids to tombstone when hiding a thread. */
export function serverConversationIdsToHide(
  chat: Chat,
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): string[] {
  const out = new Set<string>();
  out.add(serverConversationIdForChat(chat, sessionAppUid, friendMap, friendIdToBackendUid));
  // Only tombstone the canonical `enc_dm_*` when deleting that canonical row — not when
  // deleting a `__live` thread (otherwise new live chats would still hit a hidden canonical).
  if (isCanonicalDirectChatId(chat.id)) {
    const canonical = resolveCanonicalDirectChatLocalId(
      chat,
      sessionAppUid,
      friendMap,
      friendIdToBackendUid
    );
    if (canonical) out.add(`enc_${canonical}`);
  }
  return [...out];
}

export function canonicalServerConversationId(
  sessionAppUid: string,
  friendBackendUid: string
): string {
  return `enc_${canonicalDirectChatLocalId(sessionAppUid, friendBackendUid)}`;
}

export function isCanonicalDmHiddenForFriend(
  sessionAppUid: string,
  friendBackendUid: string,
  hiddenServerConversationIds: ReadonlySet<string>
): boolean {
  return hiddenServerConversationIds.has(canonicalServerConversationId(sessionAppUid, friendBackendUid));
}

/** Canonical DM tombstoned locally and/or on the server (survives cold start before hidden refresh). */
export function isCanonicalDmHiddenForViewer(
  sessionAppUid: string,
  friendBackendUid: string,
  hiddenLocalChatIds: ReadonlySet<string>,
  hiddenServerConversationIds: ReadonlySet<string>
): boolean {
  const canonicalLocal = canonicalDirectChatLocalId(sessionAppUid, friendBackendUid);
  if (hiddenLocalChatIds.has(canonicalLocal)) return true;
  return isCanonicalDmHiddenForFriend(sessionAppUid, friendBackendUid, hiddenServerConversationIds);
}

export function isDirectChatActiveFriend(params: {
  friendId: string;
  friendBackendUid: string | null;
  unfriendedIds: string[];
  serverAcceptedFriendBackendUids: ReadonlySet<string>;
}): boolean {
  const { friendId, friendBackendUid, unfriendedIds, serverAcceptedFriendBackendUids } = params;
  if (unfriendedIds.includes(friendId)) return false;
  const bu = friendBackendUid?.trim();
  if (!bu?.startsWith("u_")) return false;
  return serverAcceptedFriendBackendUids.has(bu);
}

/**
 * When a friendship is live again, open the active `__live` row instead of a locked or hidden canonical artifact.
 */
export function resolveDirectChatOpenTarget(params: {
  requestedChatId: string;
  chats: Chat[];
  sessionAppUid: string;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  identityLockedChatIds: ReadonlySet<string>;
  unfriendedIds: string[];
  serverAcceptedFriendBackendUids: ReadonlySet<string>;
  hiddenLocalChatIds: ReadonlySet<string>;
  hiddenServerConversationIds: ReadonlySet<string>;
  resolveMemberFriendId: (memberId: string) => string;
}): { targetChatId: string; allocateLive?: { localId: string; friendId: string } } {
  const chat = params.chats.find((c) => c.id === params.requestedChatId);
  if (!chat || (chat.kind ?? "standard") !== "standard") {
    return { targetChatId: params.requestedChatId };
  }
  const others = chat.memberIds.filter((id) => id !== CURRENT_USER_LOCAL_ID);
  if (others.length !== 1) {
    return { targetChatId: params.requestedChatId };
  }

  const friendId = params.resolveMemberFriendId(others[0]);
  const friendBackendUid =
    friendBackendUidFromDirectChatLocalId(params.requestedChatId, params.sessionAppUid) ??
    resolveChatMemberToBackendUid(
      others[0],
      params.sessionAppUid,
      params.friendMap,
      params.friendIdToBackendUid
    );
  if (!friendBackendUid?.startsWith("u_")) {
    return { targetChatId: params.requestedChatId };
  }

  const canonicalId = canonicalDirectChatLocalId(params.sessionAppUid, friendBackendUid);
  const canonicalHidden = isCanonicalDmHiddenForViewer(
    params.sessionAppUid,
    friendBackendUid,
    params.hiddenLocalChatIds,
    params.hiddenServerConversationIds
  );
  const active = isDirectChatActiveFriend({
    friendId,
    friendBackendUid,
    unfriendedIds: params.unfriendedIds,
    serverAcceptedFriendBackendUids: params.serverAcceptedFriendBackendUids,
  });

  if (!active) {
    if (canonicalHidden && params.requestedChatId === canonicalId) {
      const live = findLiveDirectChatForFriend(
        params.chats,
        params.sessionAppUid,
        friendBackendUid,
        params.friendMap,
        params.friendIdToBackendUid
      );
      if (live) return { targetChatId: live.id };
    }
    return { targetChatId: params.requestedChatId };
  }

  const shouldRouteToActiveThread =
    params.identityLockedChatIds.has(params.requestedChatId) ||
    (canonicalHidden && params.requestedChatId === canonicalId);

  if (!shouldRouteToActiveThread) {
    return { targetChatId: params.requestedChatId };
  }

  const existing = findActiveDirectChatForFriend(
    params.chats,
    friendId,
    params.sessionAppUid,
    params.friendMap,
    params.friendIdToBackendUid,
    params.identityLockedChatIds,
    params.hiddenServerConversationIds,
    params.hiddenLocalChatIds
  );
  if (existing) return { targetChatId: existing.id };

  const localId = allocateLiveDirectChatLocalId(
    params.sessionAppUid,
    friendBackendUid,
    params.identityLockedChatIds
  );
  return { targetChatId: localId, allocateLive: { localId, friendId } };
}

/** Newest `dm_*__live` row for a friend when the canonical thread is hidden. */
export function findLiveDirectChatForFriend(
  chats: Chat[],
  sessionAppUid: string,
  friendBackendUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): Chat | undefined {
  const canonical = canonicalDirectChatLocalId(sessionAppUid, friendBackendUid);
  const matches = chats.filter((chat) => {
    if (!isLiveDirectChatLocalId(chat.id)) return false;
    if ((chat.kind ?? "standard") !== "standard") return false;
    const canon = resolveCanonicalDirectChatLocalId(
      chat,
      sessionAppUid,
      friendMap,
      friendIdToBackendUid
    );
    return canon === canonical;
  });
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
}

export type InboundDirectMessageTarget = {
  conversationIdForHiddenCheck: string;
  rawLocalChatId: string;
  resolvedLocalChatId: string;
  /** When inbound arrives on a hidden canonical server conv, allocate a live row if missing. */
  ensureLiveChat?: { localId: string; friendBackendUid: string };
};

/**
 * Maps inbound encrypted DM docs to the local chat row that should receive them.
 * When the canonical thread is hidden, redirects to `dm_*__live` instead of dropping.
 */
export function resolveInboundDirectMessageTarget(params: {
  conversationId: string;
  rawLocalChatId: string;
  senderAppUid: string;
  sessionAppUid: string;
  chats: Chat[];
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  hiddenLocalChatIds: ReadonlySet<string>;
  hiddenServerConversationIds: ReadonlySet<string>;
  identityLockedChatIds?: ReadonlySet<string>;
  /** Optional payload `chatId` after decrypt. */
  plainLocalChatId?: string;
}): InboundDirectMessageTarget | { drop: true } {
  const {
    conversationId,
    rawLocalChatId,
    senderAppUid,
    sessionAppUid,
    chats,
    friendMap,
    friendIdToBackendUid,
    hiddenLocalChatIds,
    hiddenServerConversationIds,
    identityLockedChatIds,
    plainLocalChatId,
  } = params;

  const sender = senderAppUid.trim();
  const rawFromPlain = plainLocalChatId?.trim() ?? "";
  const rawBase = (rawFromPlain || rawLocalChatId).trim();

  // Multi-party threads (broadcast `bc_*` / group `grp_*`) must never collapse
  // into the 1:1 DM with the sender — they get their own chat card. The id is
  // stable across messages of the same thread, so it maps back to the same
  // server conversation for replies.
  if (isMultiPartyChatLocalId(rawBase)) {
    if (
      isConversationHiddenForViewer(
        conversationId,
        { raw: rawBase, resolved: rawBase },
        hiddenLocalChatIds,
        hiddenServerConversationIds
      )
    ) {
      return { drop: true };
    }
    return {
      conversationIdForHiddenCheck: conversationId,
      rawLocalChatId: rawBase,
      resolvedLocalChatId: rawBase,
    };
  }

  let resolved = resolveIncomingDirectChatId(rawBase, sender, sessionAppUid);

  const friendBackendUid =
    sender && sender !== sessionAppUid && isAppBackendUid(sender) ? sender : null;

  if (friendBackendUid && isCanonicalDmHiddenForViewer(
    sessionAppUid,
    friendBackendUid,
    hiddenLocalChatIds,
    hiddenServerConversationIds
  )) {
    const live = findLiveDirectChatForFriend(
      chats,
      sessionAppUid,
      friendBackendUid,
      friendMap,
      friendIdToBackendUid
    );
    const liveLocalId =
      live?.id ??
      allocateLiveDirectChatLocalId(sessionAppUid, friendBackendUid, identityLockedChatIds);
    resolved = liveLocalId;
    const target: InboundDirectMessageTarget = {
      conversationIdForHiddenCheck: `enc_${liveLocalId}`,
      rawLocalChatId: liveLocalId,
      resolvedLocalChatId: liveLocalId,
    };
    if (!live) {
      target.ensureLiveChat = { localId: liveLocalId, friendBackendUid };
    }
    return target;
  }

  const rawForHidden = rawBase || rawLocalChatId;
  if (
    isConversationHiddenForViewer(
      conversationId,
      { raw: rawForHidden, resolved },
      hiddenLocalChatIds,
      hiddenServerConversationIds
    )
  ) {
    return { drop: true };
  }

  return {
    conversationIdForHiddenCheck: conversationId,
    rawLocalChatId: rawForHidden,
    resolvedLocalChatId: resolved,
  };
}

/** All local chat row ids that belong to the same 1:1 thread (canonical + any legacy local id). */
export function localChatIdsForDirectThread(
  chatId: string,
  chats: Chat[],
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): Set<string> {
  const trimmed = chatId.trim();
  const ids = new Set<string>([trimmed]);
  const primary = chats.find((c) => c.id === trimmed);
  if (primary && isLiveDirectChatLocalId(primary.id)) {
    return ids;
  }
  const canonical = primary
    ? resolveCanonicalDirectChatLocalId(primary, sessionAppUid, friendMap, friendIdToBackendUid)
    : null;
  if (canonical) ids.add(canonical);
  for (const chat of chats) {
    if ((chat.kind ?? "standard") !== "standard") continue;
    if (isLiveDirectChatLocalId(chat.id)) continue;
    const canon = resolveCanonicalDirectChatLocalId(
      chat,
      sessionAppUid,
      friendMap,
      friendIdToBackendUid
    );
    if (!canon) continue;
    if (canon === canonical || canon === trimmed || chat.id === trimmed) {
      ids.add(chat.id);
      ids.add(canon);
    }
  }
  return ids;
}

/** Other participant's `u_*` id from a `dm_*` local chat id. */
export function friendBackendUidFromDirectChatLocalId(
  localChatId: string,
  sessionAppUid: string
): string | null {
  const id = localChatId.trim();
  if (!isDirectChatLocalId(id)) return null;
  let rest = id.replace(/^dm_/, "");
  const liveMatch = rest.match(/(__live\d*)$/);
  if (liveMatch) rest = rest.slice(0, -liveMatch[1].length);
  const sep = rest.indexOf("__");
  if (sep < 0) return null;
  const u1 = rest.slice(0, sep).trim();
  const u2 = rest.slice(sep + 2).trim();
  if (u1 === sessionAppUid && isAppBackendUid(u2)) return u2;
  if (u2 === sessionAppUid && isAppBackendUid(u1)) return u1;
  return null;
}

export function resolveIncomingDirectChatId(
  rawChatId: string,
  senderAppUid: string,
  sessionAppUid: string
): string {
  const trimmed = rawChatId.trim();
  if (isDirectChatLocalId(trimmed)) return trimmed;
  // Never fold a multi-party thread into the 1:1 DM.
  if (isMultiPartyChatLocalId(trimmed)) return trimmed;
  if (
    senderAppUid &&
    senderAppUid !== sessionAppUid &&
    isAppBackendUid(senderAppUid)
  ) {
    return canonicalDirectChatLocalId(sessionAppUid, senderAppUid);
  }
  return trimmed;
}
