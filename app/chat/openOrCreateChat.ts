import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert } from "react-native";

import type { Chat, Friend, PendingDraft, SavedBroadcastGroup, ViewState } from "../domain/types";
import { CURRENT_USER_LOCAL_ID } from "../lib/chatMemberJoinedAt";
import { resolveDirectChatOpenTarget } from "../lib/directChatId";
import type { OpenDirectChatFromController } from "../messaging/useMessagingController";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID } from "../theme/preludeConstants";
import type { StartChatComposerMode } from "./availableStartChatFriends";

type DisplayNameFor = (friendId: string) => string;

/** Comma-separated friend names, or the single friend's name. */
export function buildDefaultChatName(friendIds: string[], displayNameFor: DisplayNameFor): string {
  if (friendIds.length === 1) return displayNameFor(friendIds[0]);
  return friendIds.map((id) => displayNameFor(id)).join(", ");
}

type OpenOrCreateChatDeps = {
  composerCustomTitle: string;
  composerMode: StartChatComposerMode;
  selectedComposerIds: string[];
  allFriends: Friend[];
  chats: Chat[];
  savedBroadcastGroups: SavedBroadcastGroup[];
  pendingBroadcastCreateIds: string[] | null;
  broadcastGroupNameDraft: string;
  broadcastPickerOpen: boolean;
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  identityLockedChatIdsSet: ReadonlySet<string>;
  unfriendedIds: string[];
  serverAcceptedFriendBackendUids: ReadonlySet<string>;
  hiddenChatIdsRef: MutableRefObject<string[]>;
  hiddenServerConversationIdsRef: MutableRefObject<Set<string>>;
  resolvePd: (friendId: string, chatId?: string) => { displayName: string };
  resolveChatMemberFriendId: (memberId: string) => string;
  getBackendSession: () => BackendSession | null;
  normalizeSet: (ids: string[]) => string;
  upsertChat: (chat: Chat) => void;
  unhideChatId: (chatId: string) => void;
  openDirectChat: (params: OpenDirectChatFromController) => void;
  commitSavedBroadcastGroup: (ids: string[], name: string, existingId: string | null) => void;
  beginGroupTitleStep: () => void;
  closeComposer: () => void;
  closeBroadcastPicker: () => void;
  setView: Dispatch<SetStateAction<ViewState>>;
  setChatInputSynced: (text: string) => void;
  setShouldFocusChatInput: Dispatch<SetStateAction<boolean>>;
  setChatOverflowOpen: Dispatch<SetStateAction<boolean>>;
  setMembersModalOpen: Dispatch<SetStateAction<boolean>>;
  setChatSearchVisible: Dispatch<SetStateAction<boolean>>;
  setChatSearch: Dispatch<SetStateAction<string>>;
  setSelectedBroadcastThreadFriendId: Dispatch<SetStateAction<string | null>>;
  setReplyTargetMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setPendingBroadcastCreateIds: Dispatch<SetStateAction<string[] | null>>;
  setSaveBroadcastGroupPromptOpen: Dispatch<SetStateAction<boolean>>;
};

/** Open an existing chat or start a standard, group, or broadcast draft. Recreated each render. */
export function createOpenOrCreateChatActions(deps: OpenOrCreateChatDeps) {
  const {
    composerCustomTitle,
    composerMode,
    selectedComposerIds,
    allFriends,
    chats,
    savedBroadcastGroups,
    pendingBroadcastCreateIds,
    broadcastGroupNameDraft,
    broadcastPickerOpen,
    friendMap,
    friendIdToBackendUid,
    identityLockedChatIdsSet,
    unfriendedIds,
    serverAcceptedFriendBackendUids,
    hiddenChatIdsRef,
    hiddenServerConversationIdsRef,
    resolvePd,
    resolveChatMemberFriendId,
    getBackendSession,
    normalizeSet,
    upsertChat,
    unhideChatId,
    openDirectChat,
    commitSavedBroadcastGroup,
    beginGroupTitleStep,
    closeComposer,
    closeBroadcastPicker,
    setView,
    setChatInputSynced,
    setShouldFocusChatInput,
    setChatOverflowOpen,
    setMembersModalOpen,
    setChatSearchVisible,
    setChatSearch,
    setSelectedBroadcastThreadFriendId,
    setReplyTargetMessageId,
    setEditingMessageId,
    setPendingBroadcastCreateIds,
    setSaveBroadcastGroupPromptOpen,
  } = deps;

  const nameFromFriends = (friendIds: string[]) =>
    buildDefaultChatName(friendIds, (id) => resolvePd(id).displayName);

  const resetChatEntryChrome = () => {
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setChatSearchVisible(false);
    setChatSearch("");
    setSelectedBroadcastThreadFriendId(null);
    setReplyTargetMessageId(null);
    setEditingMessageId(null);
  };

  const goToPendingDraftChat = (pending: PendingDraft) => {
    resetChatEntryChrome();
    setChatInputSynced("");
    setShouldFocusChatInput(false);
    setView({ screen: "chat", pendingDraft: pending });
  };

  const goToChat = (chatId: string) => {
    resetChatEntryChrome();
    let targetChatId = chatId;
    const session = getBackendSession();
    if (session) {
      const resolved = resolveDirectChatOpenTarget({
        requestedChatId: chatId,
        chats,
        sessionAppUid: session.uid,
        friendMap,
        friendIdToBackendUid,
        identityLockedChatIds: identityLockedChatIdsSet,
        unfriendedIds,
        serverAcceptedFriendBackendUids,
        hiddenLocalChatIds: new Set(hiddenChatIdsRef.current),
        hiddenServerConversationIds: hiddenServerConversationIdsRef.current,
        resolveMemberFriendId: resolveChatMemberFriendId,
      });
      targetChatId = resolved.targetChatId;
      if (resolved.allocateLive && !chats.some((c) => c.id === resolved.allocateLive!.localId)) {
        const friendId = resolved.allocateLive.friendId;
        const profile = friendMap[friendId];
        const liveRow: Chat = {
          id: resolved.allocateLive.localId,
          memberIds: [CURRENT_USER_LOCAL_ID, friendId],
          name: profile?.displayName?.trim() || resolvePd(friendId).displayName,
          profilePicture: profile?.profilePictureUrl || undefined,
          kind: "standard",
          createdBy: CURRENT_USER_LOCAL_ID,
          isCustomName: false,
          isDraft: true,
          visibleToRecipients: false,
          updatedAt: Date.now(),
        };
        upsertChat(liveRow);
      }
    }
    const chat = chats.find((c) => c.id === targetChatId);
    const draftText = chat?.draftComposerText ?? "";
    unhideChatId(targetChatId);
    setChatInputSynced(draftText);
    setShouldFocusChatInput(draftText.trim().length > 0);
    setView({ screen: "chat", chatId: targetChatId });
  };

  const continueToBroadcastDraft = (ids: string[], fallbackName?: string) => {
    goToPendingDraftChat({
      memberIds: [CURRENT_USER_ID, ...ids],
      name: composerCustomTitle.trim() || fallbackName || "Broadcast",
      profilePicture: "📣",
      kind: "broadcast",
      createdBy: CURRENT_USER_ID,
      broadcastRecipientIds: ids,
    });
    closeBroadcastPicker();
  };

  const handleBroadcastGroupNameConfirm = () => {
    const ids = pendingBroadcastCreateIds;
    if (!ids) return;
    const name = broadcastGroupNameDraft.trim() || "Saved Group";
    const existing = savedBroadcastGroups.find(
      (g) => g.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      Alert.alert("That group name already exists", "Do you want to overwrite?", [
        { text: "No", style: "cancel" },
        {
          text: "Yes",
          onPress: () => {
            commitSavedBroadcastGroup(ids, name, existing.id);
            continueToBroadcastDraft(ids, name);
          },
        },
      ]);
      return;
    }
    commitSavedBroadcastGroup(ids, name, null);
    continueToBroadcastDraft(ids, name);
  };

  const findOrCreateChatWithFriend = (friendId: string) => {
    openDirectChat({
      friendId,
      session: getBackendSession(),
      friendMap,
      friendIdToBackendUid,
      unfriendedIds,
      identityLockedChatIds: identityLockedChatIdsSet,
      resolveDisplayName: (id) => friendMap[id]?.displayName?.trim() || resolvePd(id).displayName,
      normalizeMemberSet: normalizeSet,
      goToChat,
    });
  };

  const createOrOpenChat = (
    modeOverride?: StartChatComposerMode,
    composerTitleOverride?: string,
    createOptions?: { groupProfilePictureUri?: string | null }
  ) => {
    const mode = modeOverride ?? composerMode;
    const titleFromComposer =
      composerTitleOverride !== undefined ? composerTitleOverride.trim() : composerCustomTitle.trim();
    const groupPicUri = createOptions?.groupProfilePictureUri?.trim() ?? "";
    if (selectedComposerIds.length === 0) return;
    if (mode === "broadcast") {
      const createBroadcastFromSelection = (ids: string[]) => {
        goToPendingDraftChat({
          memberIds: [CURRENT_USER_ID, ...ids],
          name: titleFromComposer || "Broadcast",
          profilePicture: "📣",
          kind: "broadcast",
          createdBy: CURRENT_USER_ID,
          broadcastRecipientIds: ids,
        });
        if (broadcastPickerOpen) closeBroadcastPicker();
        else closeComposer();
      };

      const selectionHash = normalizeSet(selectedComposerIds);
      const alreadySaved = savedBroadcastGroups.some(
        (group) => normalizeSet(group.memberIds) === selectionHash
      );
      if (selectedComposerIds.length === allFriends.length) {
        createBroadcastFromSelection(selectedComposerIds);
        return;
      }
      if (!alreadySaved && selectedComposerIds.length > 1) {
        setPendingBroadcastCreateIds([...selectedComposerIds]);
        setSaveBroadcastGroupPromptOpen(true);
        return;
      }
      createBroadcastFromSelection(selectedComposerIds);
      return;
    }

    if (mode === "standard" && selectedComposerIds.length > 1) {
      const memberIds = [CURRENT_USER_ID, ...selectedComposerIds];
      const target = normalizeSet(memberIds);
      const existing = chats.find((chat) => normalizeSet(chat.memberIds) === target);
      if (existing) {
        goToChat(existing.id);
        closeComposer();
        return;
      }
      goToPendingDraftChat({
        memberIds,
        name: titleFromComposer || nameFromFriends(selectedComposerIds),
        standardGroupTitle: titleFromComposer ? "custom" : "members",
        profilePicture:
          selectedComposerIds.length > 1
            ? groupPicUri.length > 0
              ? groupPicUri
              : "^"
            : undefined,
        kind: "standard",
        createdBy: CURRENT_USER_ID,
      });
      closeComposer();
      return;
    }

    if (mode === "standard" && selectedComposerIds.length === 1 && titleFromComposer) {
      const memberIds = [CURRENT_USER_ID, ...selectedComposerIds];
      const target = normalizeSet(memberIds);
      const existing = chats.find((chat) => normalizeSet(chat.memberIds) === target);
      if (existing) {
        goToChat(existing.id);
        closeComposer();
        return;
      }
      goToPendingDraftChat({
        memberIds,
        name: titleFromComposer,
        profilePicture: undefined,
        kind: "standard",
        createdBy: CURRENT_USER_ID,
      });
      closeComposer();
      return;
    }

    if (mode === "standard" && selectedComposerIds.length === 1) {
      findOrCreateChatWithFriend(selectedComposerIds[0]);
      closeComposer();
      return;
    }

    const memberIds = [CURRENT_USER_ID, ...selectedComposerIds];
    const target = normalizeSet(memberIds);
    const existing = chats.find((chat) => normalizeSet(chat.memberIds) === target);
    if (existing) {
      goToChat(existing.id);
      closeComposer();
      return;
    }
    goToPendingDraftChat({
      memberIds,
      name: nameFromFriends(selectedComposerIds),
      ...(selectedComposerIds.length > 1 ? { standardGroupTitle: "members" as const } : {}),
      profilePicture:
        selectedComposerIds.length > 1 ? (groupPicUri.length > 0 ? groupPicUri : "^") : undefined,
      kind: "standard",
      createdBy: CURRENT_USER_ID,
    });
    closeComposer();
  };

  const onPressCreateStandardChat = () => {
    if (selectedComposerIds.length === 0) return;
    if (composerMode === "standard" && selectedComposerIds.length > 1) {
      beginGroupTitleStep();
      return;
    }
    createOrOpenChat();
  };

  const openChatFromHome = (chatId: string) => {
    goToChat(chatId);
  };

  return {
    buildDefaultChatName: nameFromFriends,
    continueToBroadcastDraft,
    handleBroadcastGroupNameConfirm,
    goToChat,
    goToPendingDraftChat,
    createOrOpenChat,
    onPressCreateStandardChat,
    findOrCreateChatWithFriend,
    openChatFromHome,
  };
}
