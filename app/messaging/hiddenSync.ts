import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import { localChatIdsFromHiddenConversationIds } from "../lib/hiddenConversations";
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
