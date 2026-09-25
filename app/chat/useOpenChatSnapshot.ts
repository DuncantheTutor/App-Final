import { useEffect } from "react";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "../../firebaseAuthClient";
import type { Chat, ViewState } from "../domain/types";
import { normalizeMemberJoinedAtForClient } from "../lib/chatMemberJoinedAt";
import { mergeReadByMaps } from "../lib/mergeChatReadBy";
import type { BackendSession } from "../messaging/types";
import { DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

type OpenChatSnapshotDeps = {
  view: ViewState;
  activeChatForRead: Chat | null;
  friendIdToBackendUid: Record<string, string>;
  getBackendSession: () => BackendSession | null;
  resolveConversationId: (chatId: string) => string;
  applyChats: (updater: (current: Chat[]) => Chat[]) => void;
};

/** Live read receipts, join times, admins, and mute for the open chat. */
export function useOpenChatSnapshot({
  view,
  activeChatForRead,
  friendIdToBackendUid,
  getBackendSession,
  resolveConversationId,
  applyChats,
}: OpenChatSnapshotDeps) {
  useEffect(() => {
    if (view.screen !== "chat" || !("chatId" in view) || DEMO_OFFLINE_MODE) return;
    const chatRowId = activeChatForRead?.id ?? view.chatId;
    const session = getBackendSession();
    if (!session) return;
    const db = getFirestoreDb();
    const conversationDocId = resolveConversationId(chatRowId);
    const unsub = onSnapshot(firestoreDoc(db, "conversations", conversationDocId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        readBy?: Chat["readBy"];
        memberJoinedAt?: Record<string, number>;
        adminIds?: string[];
        participantUids?: string[];
        mutedBy?: Record<string, boolean>;
      };
      const serverMuted = Boolean(data.mutedBy?.[session.uid]);
      applyChats((current) =>
        current.map((c) =>
          c.id === chatRowId
            ? {
                ...c,
                readBy: mergeReadByMaps(c.readBy, data.readBy),
                memberJoinedAt:
                  normalizeMemberJoinedAtForClient(
                    data.memberJoinedAt,
                    session.uid,
                    c.memberIds,
                    friendIdToBackendUid
                  ) ?? c.memberJoinedAt,
                adminIds: data.adminIds ?? c.adminIds,
                mutedForNotifications: serverMuted,
              }
            : c
        )
      );
    });
    return () => unsub();
  }, [view, activeChatForRead?.id, getBackendSession, resolveConversationId, friendIdToBackendUid, applyChats]);
}
