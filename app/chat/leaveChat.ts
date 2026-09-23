import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert } from "react-native";
import { Audio } from "expo-av";

import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import type { Chat, Friend, ViewState } from "../domain/types";
import {
  isCanonicalDirectChatId,
  resolveCanonicalDirectChatLocalId,
  serverConversationIdsToHide,
} from "../lib/directChatId";
import type { PhotoEditorAsset } from "../media/usePhotoEditorSession";
import type { BackendSession } from "../messaging/types";
import {
  CHAT_UI_INITIAL_DISPLAY_COUNT,
  CURRENT_USER_ID,
  DEMO_OFFLINE_MODE,
} from "../theme/preludeConstants";

type LeaveChatDeps = {
  setView: Dispatch<SetStateAction<ViewState>>;
  setChatSearch: Dispatch<SetStateAction<string>>;
  clearComposerOnLeave: () => void;
  setChatSearchVisible: Dispatch<SetStateAction<boolean>>;
  setChatOverflowOpen: Dispatch<SetStateAction<boolean>>;
  setMembersModalOpen: Dispatch<SetStateAction<boolean>>;
  setReplyTargetMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setMessageActionTargetId: Dispatch<SetStateAction<string | null>>;
  setReactionPickerOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedBroadcastThreadFriendId: Dispatch<SetStateAction<string | null>>;
  setPhotoEditorOpen: Dispatch<SetStateAction<boolean>>;
  setPhotoEditorAsset: Dispatch<SetStateAction<PhotoEditorAsset | null>>;
  setAddMemberModalOpen: Dispatch<SetStateAction<boolean>>;
  setAddMemberSearch: Dispatch<SetStateAction<string>>;
  setPlayingVoiceMessageId: Dispatch<SetStateAction<string | null>>;
  setVoiceLoadingMessageId: Dispatch<SetStateAction<string | null>>;
  setVoicePlaybackProgress: Dispatch<
    SetStateAction<{ messageId: string; positionMs: number; durationMs: number } | null>
  >;
  setPlayingVideoMessageId: Dispatch<SetStateAction<string | null>>;
  setVideoPrepareRequestedIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setChatListDisplayLimit: Dispatch<SetStateAction<number>>;
  setVideoPlayAfterPrepareId: Dispatch<SetStateAction<string | null>>;
  messageSoundRef: MutableRefObject<Audio.Sound | null>;
  chats: Chat[];
  getBackendSession: () => BackendSession | null;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  rememberHiddenConversationIds: (conversationIds: string[]) => void;
  hideChatIds: (ids: string[]) => void;
  removeChatsAndMessages: (ids: Iterable<string>) => void;
  persistSocialMessagingNow: () => void;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
  view: ViewState;
  resolveConversationId: (chatOrLocalId: Chat | string) => string;
};

/** Local reset when leaving a thread, plus hide/leave on the server. */
export function createLeaveChatActions(deps: LeaveChatDeps) {
  const {
    setView,
    setChatSearch,
    clearComposerOnLeave,
    setChatSearchVisible,
    setChatOverflowOpen,
    setMembersModalOpen,
    setReplyTargetMessageId,
    setEditingMessageId,
    setMessageActionTargetId,
    setReactionPickerOpen,
    setSelectedBroadcastThreadFriendId,
    setPhotoEditorOpen,
    setPhotoEditorAsset,
    setAddMemberModalOpen,
    setAddMemberSearch,
    setPlayingVoiceMessageId,
    setVoiceLoadingMessageId,
    setVoicePlaybackProgress,
    setPlayingVideoMessageId,
    setVideoPrepareRequestedIds,
    setChatListDisplayLimit,
    setVideoPlayAfterPrepareId,
    messageSoundRef,
    chats,
    getBackendSession,
    friendMap,
    friendIdToBackendUid,
    rememberHiddenConversationIds,
    hideChatIds,
    removeChatsAndMessages,
    persistSocialMessagingNow,
    patchChat,
    view,
    resolveConversationId,
  } = deps;

  const leaveChatToHome = () => {
    setView({ screen: "home" });
    setChatSearch("");
    clearComposerOnLeave();
    setChatSearchVisible(false);
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setReplyTargetMessageId(null);
    setEditingMessageId(null);
    setMessageActionTargetId(null);
    setReactionPickerOpen(false);
    setSelectedBroadcastThreadFriendId(null);
    setPhotoEditorOpen(false);
    setPhotoEditorAsset(null);
    setAddMemberModalOpen(false);
    setAddMemberSearch("");
    setPlayingVoiceMessageId(null);
    setVoiceLoadingMessageId(null);
    setVoicePlaybackProgress(null);
    setPlayingVideoMessageId(null);
    setVideoPrepareRequestedIds(new Set());
    setChatListDisplayLimit(CHAT_UI_INITIAL_DISPLAY_COUNT);
    setVideoPlayAfterPrepareId(null);
    if (messageSoundRef.current) {
      void messageSoundRef.current.unloadAsync();
      messageSoundRef.current = null;
    }
  };

  /** Remove the current user from a chat or delete it entirely (same rules as leaving from inside the chat). */
  const removeChatForCurrentUser = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const session = getBackendSession();
    const idsToHide = new Set<string>([chatId]);
    if (session) {
      const canonicalId = resolveCanonicalDirectChatLocalId(
        chat,
        session.uid,
        friendMap,
        friendIdToBackendUid
      );
      // Tombstone canonical local row only when deleting the canonical thread — not a `__live` row.
      if (canonicalId && isCanonicalDirectChatId(chat.id)) {
        idsToHide.add(canonicalId);
      }
      if (!DEMO_OFFLINE_MODE) {
        const conversationIdsToHide = serverConversationIdsToHide(
          chat,
          session.uid,
          friendMap,
          friendIdToBackendUid
        );
        rememberHiddenConversationIds(conversationIdsToHide);
        for (const conversationId of conversationIdsToHide) {
          void callEmulatorFunction("hideConversationForUser", {
            uid: session.uid,
            deviceId: session.deviceId,
            conversationId,
          }).catch((err) => logAppError("chat.hide.server", err, { conversationId }));
          void callEmulatorFunction("manageConversationMembership", {
            uid: session.uid,
            deviceId: session.deviceId,
            conversationId,
            action: "leave",
          }).catch(() => undefined);
        }
      }
    }
    hideChatIds([...idsToHide]);
    if (chat.kind === "broadcast") {
      removeChatsAndMessages([chatId]);
      persistSocialMessagingNow();
      return;
    }

    const newMemberIds = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    if (newMemberIds.length < 2) {
      removeChatsAndMessages(idsToHide);
    } else {
      const nextJoined = chat.memberJoinedAt
        ? Object.fromEntries(Object.entries(chat.memberJoinedAt).filter(([k]) => k !== CURRENT_USER_ID))
        : undefined;
      patchChat(chatId, (x) => ({
        ...x,
        memberIds: newMemberIds,
        memberJoinedAt: nextJoined,
        updatedAt: Date.now(),
      }));
    }
    persistSocialMessagingNow();
  };

  const leaveChat = () => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    const session = getBackendSession();
    if (session && !DEMO_OFFLINE_MODE) {
      const chat = chats.find((c) => c.id === chatId);
      const conversationIds = chat
        ? serverConversationIdsToHide(chat, session.uid, friendMap, friendIdToBackendUid)
        : [resolveConversationId(chatId)];
      rememberHiddenConversationIds(conversationIds);
      for (const conversationId of conversationIds) {
        void callEmulatorFunction("hideConversationForUser", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId,
        }).catch(() => undefined);
        void callEmulatorFunction("manageConversationMembership", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId,
          action: "leave",
        }).catch(() => undefined);
      }
    }
    removeChatForCurrentUser(chatId);
    leaveChatToHome();
  };

  const confirmLeaveChat = () => {
    Alert.alert("Leave chat?", "You will stop receiving messages in this chat.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: leaveChat },
    ]);
  };

  return { leaveChatToHome, removeChatForCurrentUser, leaveChat, confirmLeaveChat };
}
