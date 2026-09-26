import { useMemo } from "react";
import type { Chat, Friend, Message, ViewState } from "../domain/types";
import { useActiveChatMessages } from "./useActiveChatMessages";
import { buildDefaultChatName as chatNameFromFriendIds } from "./openOrCreateChat";
import { joinCutoffMsForViewer } from "../lib/chatMemberJoinedAt";
import {
  buildLastMessageByChatId,
  buildVisibleThreadMessagesByChatId,
  chatListSortTimestampMs,
  filterChatsVisibleInInbox,
} from "../lib/chatListLastMessage";
import { isIncomingChatUnread } from "../lib/chatUnreadState";
import { localChatIdsForDirectThread } from "../lib/directChatId";
import { isChatIdentityLocked } from "../lib/identityLockedChats";
import { readAvatarsByMessageId, type ReadByMap } from "../lib/readReceipts";
import { TOMBSTONE_DISPLAY_NAME } from "../lib/participantDisplay";
import { CURRENT_USER_LOCAL_ID } from "../lib/resolveChatMemberBackendUid";
import type { BackendSession } from "../messaging/types";
import { activeChatIdFromView, pendingDraftFromView } from "../shell/routes";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

type ResolvePd = (friendId: string, chatId?: string) => { displayName: string; canOpenProfile: boolean };

/** Sorted inbox, unread set, open-thread window, and the open-chat title. */
export function useChatInboxModel(params: {
  chats: Chat[];
  messages: Message[];
  hiddenChatIds: string[];
  unfriendedIds: string[];
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  backendUidToFriendId: Record<string, string>;
  identityLockedChatIds: string[];
  identityLockedChatIdsSet: Set<string>;
  serverFriendUidsForDisplay: ReadonlySet<string> | null;
  allFriends: Friend[];
  friendLinksState: Record<string, string[]>;
  view: ViewState;
  chatSearch: string;
  chatListDisplayLimit: number;
  addMemberSearch: string;
  backendSessionReady: boolean;
  getBackendSession: () => BackendSession | null;
  resolvePd: ResolvePd;
  resolveChatMemberFriendId: (memberId: string) => string;
}) {
  const {
    chats,
    messages,
    hiddenChatIds,
    unfriendedIds,
    friendMap,
    friendIdToBackendUid,
    backendUidToFriendId,
    identityLockedChatIds,
    identityLockedChatIdsSet,
    serverFriendUidsForDisplay,
    allFriends,
    friendLinksState,
    view,
    chatSearch,
    chatListDisplayLimit,
    addMemberSearch,
    backendSessionReady,
    getBackendSession,
    resolvePd,
    resolveChatMemberFriendId,
  } = params;

  const joinCutoffForViewer = useMemo(
    () => (chat: Chat | null | undefined) => {
      const session = getBackendSession();
      return joinCutoffMsForViewer(chat, session?.uid ?? null);
    },
    [getBackendSession]
  );

  const lastMessageByChatId = useMemo(() => {
    const session = getBackendSession();
    return buildLastMessageByChatId({
      chats,
      messages,
      sessionAppUid: session?.uid ?? null,
      friendMap,
      friendIdToBackendUid,
      currentUserId: CURRENT_USER_ID,
      currentUserLocalId: CURRENT_USER_LOCAL_ID,
    });
  }, [messages, chats, friendMap, friendIdToBackendUid, getBackendSession]);

  const visibleThreadMessagesByChatId = useMemo(() => {
    const session = getBackendSession();
    return buildVisibleThreadMessagesByChatId({
      chats,
      messages,
      sessionAppUid: session?.uid ?? null,
      friendMap,
      friendIdToBackendUid,
      currentUserId: CURRENT_USER_ID,
      currentUserLocalId: CURRENT_USER_LOCAL_ID,
    });
  }, [messages, chats, friendMap, friendIdToBackendUid, getBackendSession]);

  const sortedChats = useMemo(() => {
    const hidden = new Set(hiddenChatIds);
    const mine = chats.filter((c) => c.memberIds.includes(CURRENT_USER_ID) && !hidden.has(c.id));
    return [...mine].sort((a, b) => {
      const aTs = chatListSortTimestampMs(
        a,
        lastMessageByChatId[a.id],
        visibleThreadMessagesByChatId[a.id] ?? []
      );
      const bTs = chatListSortTimestampMs(
        b,
        lastMessageByChatId[b.id],
        visibleThreadMessagesByChatId[b.id] ?? []
      );
      return bTs - aTs;
    });
  }, [chats, lastMessageByChatId, visibleThreadMessagesByChatId, hiddenChatIds]);

  const visibleSortedChats = useMemo(
    () => filterChatsVisibleInInbox(sortedChats, lastMessageByChatId, unfriendedIds, CURRENT_USER_ID),
    [sortedChats, lastMessageByChatId, unfriendedIds]
  );

  const unreadChatIdSet = useMemo(() => {
    if (!backendSessionReady) return new Set<string>();
    const session = getBackendSession();
    const myUid = session?.uid ?? null;
    if (!myUid) return new Set<string>();
    const openChatId = activeChatIdFromView(view);
    const unread = new Set<string>();
    for (const chat of visibleSortedChats) {
      if (chat.mutedForNotifications) continue;
      if (chat.id === openChatId) continue;
      const last = lastMessageByChatId[chat.id];
      if (
        isIncomingChatUnread({
          chat,
          lastMessage: last,
          myUid,
          currentUserId: CURRENT_USER_ID,
          currentUserLocalId: CURRENT_USER_LOCAL_ID,
        })
      ) {
        unread.add(chat.id);
      }
    }
    return unread;
  }, [visibleSortedChats, lastMessageByChatId, view, getBackendSession, backendSessionReady]);

  const unreadChatCount = unreadChatIdSet.size;

  const pendingDraft = pendingDraftFromView(view);

  const resolvedChat = useMemo(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return null;
    const byViewId = chats.find((c) => c.id === view.chatId);
    if (byViewId) return byViewId;
    const session = getBackendSession();
    if (session && !DEMO_OFFLINE_MODE) {
      const threadIds = localChatIdsForDirectThread(
        view.chatId,
        chats,
        session.uid,
        friendMap,
        friendIdToBackendUid
      );
      return chats.find((c) => threadIds.has(c.id)) ?? null;
    }
    return null;
  }, [chats, view, friendMap, friendIdToBackendUid, getBackendSession]);

  const messageById = useMemo(
    () =>
      messages.reduce<Record<string, Message>>((acc, message) => {
        acc[message.id] = message;
        return acc;
      }, {}),
    [messages]
  );

  const activeChatKind = (resolvedChat?.kind ?? pendingDraft?.kind ?? "standard") as "standard" | "broadcast";
  const activeCounterpartIds = (resolvedChat?.memberIds ?? pendingDraft?.memberIds ?? []).filter(
    (id) => id !== CURRENT_USER_ID
  );
  const activeChatId = activeChatIdFromView(view) ?? undefined;
  const activeDirectCounterpartPd =
    activeChatKind === "standard" && activeCounterpartIds.length === 1
      ? resolvePd(activeCounterpartIds[0], activeChatId)
      : null;
  const activeChatIdentityLocked = isChatIdentityLocked(activeChatId, identityLockedChatIdsSet);
  const chatScreenTitle = useMemo(() => {
    if (activeChatKind !== "standard") {
      return pendingDraft?.name ?? resolvedChat?.name ?? "Chat";
    }
    if (activeCounterpartIds.length === 1) {
      if (activeChatIdentityLocked) return TOMBSTONE_DISPLAY_NAME;
      const counterpartId = resolveChatMemberFriendId(activeCounterpartIds[0]);
      const pd = resolvePd(counterpartId, activeChatId);
      if (!pd.canOpenProfile) return TOMBSTONE_DISPLAY_NAME;
      return pd.displayName;
    }
    if (activeCounterpartIds.length > 1) {
      if (resolvedChat?.isCustomName) return resolvedChat.name;
      if (pendingDraft?.standardGroupTitle === "custom") {
        return (
          pendingDraft.name?.trim() ||
          chatNameFromFriendIds(activeCounterpartIds, (id) => resolvePd(id).displayName)
        );
      }
      return chatNameFromFriendIds(activeCounterpartIds, (id) => resolvePd(id).displayName);
    }
    return pendingDraft?.name ?? resolvedChat?.name ?? "Chat";
  }, [
    activeChatKind,
    activeCounterpartIds,
    pendingDraft?.name,
    pendingDraft?.standardGroupTitle,
    resolvedChat?.name,
    resolvedChat?.isCustomName,
    resolvedChat?.kind,
    activeChatId,
    activeChatIdentityLocked,
    identityLockedChatIds,
    serverFriendUidsForDisplay,
    resolvePd,
    resolveChatMemberFriendId,
    unfriendedIds,
  ]);

  const isDirectTombstoneChat =
    view.screen === "chat" &&
    activeChatKind === "standard" &&
    activeCounterpartIds.length === 1 &&
    (activeChatIdentityLocked || (activeDirectCounterpartPd !== null && !activeDirectCounterpartPd.canOpenProfile));

  const broadcastMemberCount =
    resolvedChat?.kind === "broadcast"
      ? resolvedChat.broadcastRecipientIds?.length ??
        resolvedChat.memberIds.filter((id) => id !== CURRENT_USER_ID).length
      : 0;
  const chatScreenTitleWithCount =
    resolvedChat?.kind === "broadcast" && (resolvedChat.createdBy ?? CURRENT_USER_ID) === CURRENT_USER_ID
      ? `${chatScreenTitle} (${broadcastMemberCount})`
      : chatScreenTitle;
  const canEditActiveGroupMeta =
    !!resolvedChat &&
    (resolvedChat.createdBy ?? CURRENT_USER_ID) === CURRENT_USER_ID &&
    (activeChatKind === "broadcast" || activeCounterpartIds.length > 1);
  const activeHeaderPicture =
    resolvedChat?.profilePicture ??
    pendingDraft?.profilePicture ??
    (activeChatKind === "broadcast" ? "📣" : activeCounterpartIds.length > 1 ? "^" : "");

  const eligibleFriendsToAdd = useMemo(() => {
    if (!resolvedChat || resolvedChat.kind === "broadcast" || resolvedChat.isDraft) return [];
    const chat = resolvedChat;
    const memberSet = new Set(chat.memberIds);
    const peers = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    return allFriends.filter((friend) => {
      if (unfriendedIds.includes(friend.id)) return false;
      if (memberSet.has(friend.id)) return false;
      return peers.every((pid) => (friendLinksState[pid] ?? []).includes(friend.id));
    });
  }, [resolvedChat, unfriendedIds, allFriends, friendLinksState]);

  const filteredFriendsToAdd = useMemo(() => {
    const q = addMemberSearch.trim().toLowerCase();
    if (!q) return eligibleFriendsToAdd;
    return eligibleFriendsToAdd.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [eligibleFriendsToAdd, addMemberSearch]);

  const activeChatMessages = useActiveChatMessages({
    view,
    chats,
    messages,
    chatSearch,
    demoOfflineMode: DEMO_OFFLINE_MODE,
    sessionUid: getBackendSession()?.uid ?? null,
    friendMap,
    friendIdToBackendUid,
    currentUserId: CURRENT_USER_ID,
  });

  const invertedChatMessages = useMemo(() => [...activeChatMessages].reverse(), [activeChatMessages]);
  const invertedChatMessagesForList = useMemo(
    () => invertedChatMessages.slice(0, chatListDisplayLimit),
    [invertedChatMessages, chatListDisplayLimit]
  );
  const chatListCanExpandLocally = invertedChatMessages.length > chatListDisplayLimit;
  const activeChatIdForPagination = activeChatIdFromView(view);

  const activeChatListRenderKey = useMemo(() => {
    const last = activeChatMessages[activeChatMessages.length - 1];
    return `${activeChatMessages.length}:${last?.id ?? ""}:${last?.deliveryStatus ?? ""}:${last?.createdAt ?? 0}`;
  }, [activeChatMessages]);

  const activeChatForRead = useMemo(() => {
    const onChatThread = view.screen === "chat" || view.screen === "chatSharedMedia";
    if (!onChatThread || !("chatId" in view)) return null;
    const byViewId = chats.find((c) => c.id === view.chatId);
    if (byViewId) return byViewId;
    const session = getBackendSession();
    if (session && !DEMO_OFFLINE_MODE) {
      const threadIds = localChatIdsForDirectThread(
        view.chatId,
        chats,
        session.uid,
        friendMap,
        friendIdToBackendUid
      );
      return chats.find((c) => threadIds.has(c.id)) ?? null;
    }
    return null;
  }, [chats, view, friendMap, friendIdToBackendUid, getBackendSession]);

  const readAvatarsForActiveChat = useMemo(() => {
    const readByBackend = activeChatForRead?.readBy as ReadByMap | undefined;
    if (!readByBackend) return {};
    const readByFriendIds: ReadByMap = {};
    for (const [uid, cursor] of Object.entries(readByBackend)) {
      const friendId = uid === getBackendSession()?.uid ? CURRENT_USER_ID : backendUidToFriendId[uid] ?? uid;
      readByFriendIds[friendId] = cursor;
    }
    return readAvatarsByMessageId(activeChatMessages, readByFriendIds, CURRENT_USER_ID);
  }, [activeChatMessages, activeChatForRead?.readBy, backendUidToFriendId, getBackendSession]);

  return {
    joinCutoffForViewer,
    lastMessageByChatId,
    visibleThreadMessagesByChatId,
    sortedChats,
    visibleSortedChats,
    unreadChatIdSet,
    unreadChatCount,
    pendingDraft,
    resolvedChat,
    messageById,
    activeChatKind,
    activeCounterpartIds,
    activeChatId,
    activeDirectCounterpartPd,
    activeChatIdentityLocked,
    chatScreenTitle,
    isDirectTombstoneChat,
    chatScreenTitleWithCount,
    canEditActiveGroupMeta,
    activeHeaderPicture,
    eligibleFriendsToAdd,
    filteredFriendsToAdd,
    activeChatMessages,
    invertedChatMessages,
    invertedChatMessagesForList,
    chatListCanExpandLocally,
    activeChatIdForPagination,
    activeChatListRenderKey,
    activeChatForRead,
    readAvatarsForActiveChat,
  };
}
