import type { Dispatch, SetStateAction } from "react";
import { Alert } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import type { Chat, Friend, ViewState } from "../domain/types";
import { resolveChatMemberToBackendUid } from "../lib/resolveChatMemberBackendUid";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

type ChatMembershipDeps = {
  view: ViewState;
  chats: Chat[];
  getBackendSession: () => BackendSession | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  resolveConversationId: (chatOrLocalId: Chat | string) => string;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
  allFriends: Friend[];
  friendLinksState: Record<string, string[]>;
  buildDefaultChatName: (friendIds: string[]) => string;
  setAddMemberModalOpen: Dispatch<SetStateAction<boolean>>;
  setAddMemberSearch: Dispatch<SetStateAction<string>>;
};

/** Kick, mute, and add-member for the open chat. Recreated each render, same as the old MainApp closures. */
export function createChatMembershipActions(deps: ChatMembershipDeps) {
  const {
    view,
    chats,
    getBackendSession,
    friendMap,
    friendIdToBackendUid,
    resolveConversationId,
    patchChat,
    allFriends,
    friendLinksState,
    buildDefaultChatName,
    setAddMemberModalOpen,
    setAddMemberSearch,
  } = deps;

  const kickMemberFromChat = (friendId: string) => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;
    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    const targetBackendUid = resolveChatMemberToBackendUid(
      friendId,
      session.uid,
      friendMap,
      friendIdToBackendUid
    );
    if (!targetBackendUid?.startsWith("u_")) {
      Alert.alert("Could not remove member", "This member is not linked to a server account.");
      return;
    }
    void (async () => {
      try {
        await callEmulatorFunction("manageConversationMembership", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId: resolveConversationId(chatId),
          action: "kick",
          targetUid: targetBackendUid,
        });
        const nextMemberIds = chat.memberIds.filter((id) => id !== friendId);
        patchChat(chatId, (x) => ({
          ...x,
          memberIds: nextMemberIds,
          memberJoinedAt: x.memberJoinedAt
            ? Object.fromEntries(Object.entries(x.memberJoinedAt).filter(([k]) => k !== friendId))
            : undefined,
          updatedAt: Date.now(),
        }));
      } catch (err) {
        Alert.alert("Could not remove member", err instanceof Error ? err.message : "Try again.");
      }
    })();
  };

  const toggleChatMute = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;
    const nextMuted = !chat.mutedForNotifications;
    patchChat(chatId, (c) => ({ ...c, mutedForNotifications: nextMuted }));
    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    void callEmulatorFunction("setConversationNotificationMute", {
      uid: session.uid,
      deviceId: session.deviceId,
      conversationId: resolveConversationId(chatId),
      muted: nextMuted,
    }).catch((err) => {
      logAppError("chat.mute.sync", err, { chatId, muted: nextMuted });
      patchChat(chatId, (c) => ({ ...c, mutedForNotifications: !nextMuted }));
    });
  };

  const addMemberToChat = (friendId: string) => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat || chat.kind === "broadcast" || chat.isDraft) return;
    const peers = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    const candidate = allFriends.find((f) => f.id === friendId);
    if (!candidate || chat.memberIds.includes(friendId)) return;
    if (!peers.every((pid) => (friendLinksState[pid] ?? []).includes(friendId))) return;

    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    const targetBackendUid = resolveChatMemberToBackendUid(
      friendId,
      session.uid,
      friendMap,
      friendIdToBackendUid
    );
    if (!targetBackendUid?.startsWith("u_")) {
      Alert.alert("Could not add member", "This friend is not linked to a server account yet.");
      return;
    }

    void (async () => {
      try {
        const res = await callEmulatorFunction<{
          participantUids?: string[];
          memberJoinedAt?: Record<string, number>;
        }>("manageConversationMembership", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId: resolveConversationId(chatId),
          action: "addMember",
          targetUid: targetBackendUid,
        });
        const now = Date.now();
        const joinedAt = res.memberJoinedAt?.[targetBackendUid] ?? now;
        const nextMemberIds = [...chat.memberIds, friendId];
        const counterpartIds = nextMemberIds.filter((id) => id !== CURRENT_USER_ID);
        const newName = chat.isCustomName ? chat.name : buildDefaultChatName(counterpartIds);
        patchChat(chatId, (x) => ({
          ...x,
          memberIds: nextMemberIds,
          memberJoinedAt: { ...x.memberJoinedAt, [friendId]: joinedAt },
          name: newName,
          updatedAt: now,
        }));
        setAddMemberModalOpen(false);
        setAddMemberSearch("");
      } catch (err) {
        Alert.alert("Could not add member", err instanceof Error ? err.message : "Try again.");
      }
    })();
  };

  return { kickMemberFromChat, toggleChatMute, addMemberToChat };
}
