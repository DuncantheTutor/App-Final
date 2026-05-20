import { Alert } from "react-native";

import type { Dispatch, SetStateAction } from "react";

import type { Chat, Friend, PendingDraft, ViewState } from "../domain/types";
import type { BackendSession } from "./types";
import { chatFromPending } from "./localChatId";

export function promotePendingChatToRow(params: {
  pending: PendingDraft;
  session: BackendSession | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  setChats: (updater: (current: Chat[]) => Chat[]) => void;
  setView: Dispatch<SetStateAction<ViewState>>;
}): Chat | null {
  const { pending, session, friendMap, friendIdToBackendUid, setChats, setView } = params;
  const created = chatFromPending(
    pending,
    session?.uid ?? null,
    friendMap,
    friendIdToBackendUid
  );
  if (!created) {
    Alert.alert(
      "Cannot start chat",
      "Could not resolve this conversation for the server. For direct messages, the friend must be fully linked (server account)."
    );
    return null;
  }
  setChats((current) => {
    const existing = current.find((c) => c.id === created.id);
    if (existing) return current;
    return [created, ...current];
  });
  setView({ screen: "chat", chatId: created.id });
  return created;
}
