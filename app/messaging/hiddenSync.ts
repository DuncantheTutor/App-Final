import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import {
  canonicalDirectChatLocalId,
  localChatIdsForDirectThread,
  serverConversationIdsToHide,
} from "../lib/directChatId";
import { localChatIdsFromHiddenConversationIds } from "../lib/hiddenConversations";
import type { Chat, Friend } from "../domain/types";
import type { BackendSession } from "./types";

export function applyServerHiddenConversationIds(params: {
  conversationIds: string[];
  hiddenServerConversationIdsRef: { current: Set<string> };
  setHiddenChatIds: (updater: (current: string[]) => string[]) => void;
}): void {
  const { conversationIds, hiddenServerConversationIdsRef, setHiddenChatIds } = params;
  const nextServer = new Set(
    conversationIds.map((id) => String(id ?? "").trim()).filter(Boolean)
  );
  hiddenServerConversationIdsRef.current = nextServer;
  const localIds = localChatIdsFromHiddenConversationIds([...nextServer]);
  if (localIds.length === 0) return;
  setHiddenChatIds((current) => {
    const merged = new Set([...current, ...localIds]);
    return merged.size === current.length ? current : [...merged];
  });
}

export function clearHiddenConversationThreadLocally(params: {
  conversationIds: string[];
  localChatIds: string[];
  hiddenServerConversationIdsRef: { current: Set<string> };
  setHiddenChatIds: (updater: (current: string[]) => string[]) => void;
}): void {
  const { conversationIds, localChatIds, hiddenServerConversationIdsRef, setHiddenChatIds } =
    params;
  const serverIds = new Set(conversationIds.map((id) => id.trim()).filter(Boolean));
  const localIdSet = new Set([
    ...localChatIds.map((id) => id.trim()).filter(Boolean),
    ...localChatIdsFromHiddenConversationIds([...serverIds]),
  ]);

  if (serverIds.size > 0) {
    const nextServer = new Set(hiddenServerConversationIdsRef.current);
    for (const id of serverIds) nextServer.delete(id);
    hiddenServerConversationIdsRef.current = nextServer;
  }

  if (localIdSet.size === 0) return;
  setHiddenChatIds((current) => {
    const next = current.filter((id) => !localIdSet.has(id));
    return next.length === current.length ? current : next;
  });
}

export async function unhideConversationThreadOnServer(params: {
  session: BackendSession;
  conversationIds: string[];
}): Promise<void> {
  const unique = [...new Set(params.conversationIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await callEmulatorFunction("unhideConversationForUser", {
      uid: params.session.uid,
      deviceId: params.session.deviceId,
      conversationIds: unique,
    });
  } catch (err) {
    logAppError("hidden_conversations.unhide", err, {
      uid: params.session.uid,
      count: unique.length,
    });
  }
}

/** Clears server + local hide tombstones for a 1:1 thread so list + sync resume. */
export async function restoreDirectFriendThreadVisibility(params: {
  session: BackendSession;
  demoOfflineMode: boolean;
  friendBackendUid: string;
  chats: Chat[];
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  chat?: Chat | null;
  hiddenServerConversationIdsRef: { current: Set<string> };
  setHiddenChatIds: (updater: (current: string[]) => string[]) => void;
}): Promise<void> {
  const {
    session,
    demoOfflineMode,
    friendBackendUid,
    chats,
    friendMap,
    friendIdToBackendUid,
    chat,
    hiddenServerConversationIdsRef,
    setHiddenChatIds,
  } = params;

  const canonicalLocalId = canonicalDirectChatLocalId(session.uid, friendBackendUid);
  const conversationIds = new Set<string>([`enc_${canonicalLocalId}`]);
  if (chat) {
    for (const id of serverConversationIdsToHide(
      chat,
      session.uid,
      friendMap,
      friendIdToBackendUid
    )) {
      conversationIds.add(id);
    }
  }

  const localChatIds = new Set<string>([canonicalLocalId]);
  for (const row of chats) {
    const threadIds = localChatIdsForDirectThread(
      row.id,
      chats,
      session.uid,
      friendMap,
      friendIdToBackendUid
    );
    if (threadIds.has(canonicalLocalId) || row.id === canonicalLocalId) {
      for (const id of threadIds) localChatIds.add(id);
    }
  }

  clearHiddenConversationThreadLocally({
    conversationIds: [...conversationIds],
    localChatIds: [...localChatIds],
    hiddenServerConversationIdsRef,
    setHiddenChatIds,
  });

  if (!demoOfflineMode) {
    await unhideConversationThreadOnServer({
      session,
      conversationIds: [...conversationIds],
    });
  }
}

export async function refreshHiddenConversationIdsFromServer(params: {
  session: BackendSession;
  demoOfflineMode: boolean;
  hiddenServerConversationIdsRef: { current: Set<string> };
  setHiddenChatIds: (updater: (current: string[]) => string[]) => void;
}): Promise<void> {
  const { session, demoOfflineMode, hiddenServerConversationIdsRef, setHiddenChatIds } = params;
  if (demoOfflineMode) return;
  try {
    const res = await callEmulatorFunction<{ conversationIds?: string[] }>(
      "getHiddenConversationIds",
      {
        uid: session.uid,
        deviceId: session.deviceId,
      }
    );
    applyServerHiddenConversationIds({
      conversationIds: res.conversationIds ?? [],
      hiddenServerConversationIdsRef,
      setHiddenChatIds,
    });
  } catch (err) {
    logAppError("hidden_conversations.refresh", err, { uid: session.uid });
  }
}

export function rememberHiddenConversationIds(params: {
  conversationIds: string[];
  hiddenServerConversationIdsRef: { current: Set<string> };
  setHiddenChatIds: (updater: (current: string[]) => string[]) => void;
}): void {
  const { conversationIds, hiddenServerConversationIdsRef, setHiddenChatIds } = params;
  for (const id of conversationIds) {
    const trimmed = String(id ?? "").trim();
    if (trimmed) hiddenServerConversationIdsRef.current.add(trimmed);
  }
  applyServerHiddenConversationIds({
    conversationIds: [...hiddenServerConversationIdsRef.current],
    hiddenServerConversationIdsRef,
    setHiddenChatIds,
  });
}
