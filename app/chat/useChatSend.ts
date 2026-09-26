import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Chat, Friend, Message, ViewState } from "../domain/types";
import { scheduleDemoAutoReplies } from "./demoAutoReplies";
import { pickChatCameraMedia, pickChatGalleryPhoto, pickChatGalleryVideo } from "../media/pickMedia";
import { promotePendingChatToRow } from "../messaging/promotePendingChat";
import { sendChatPayload, sendComposerDraft, type SendChatPayloadInput } from "../messaging/sendChatPayload";
import { useOutgoingMessages } from "../messaging/useOutgoingMessages";
import type { BackendSession } from "../messaging/types";
import { DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

/** Promote a draft, send the composer, and open camera or gallery into the photo editor. */
export function useChatSend(params: {
  view: ViewState;
  chats: Chat[];
  friendMap: Record<string, Friend>;
  friendIdToBackendUid: Record<string, string>;
  friendMapRef: MutableRefObject<Record<string, Friend>>;
  friendIdToBackendUidRef: MutableRefObject<Record<string, string>>;
  getBackendSession: () => BackendSession | null;
  applyChats: (updater: (current: Chat[]) => Chat[]) => void;
  applyMessages: (updater: (current: Message[]) => Message[]) => void;
  setView: Dispatch<SetStateAction<ViewState>>;
  setHiddenChatIds: Dispatch<SetStateAction<string[]>>;
  demoActiveInboundFriendIds: string[];
  appendMessages: (incoming: Message[]) => void;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
  autoReplyTimersRef: MutableRefObject<Array<ReturnType<typeof setTimeout>>>;
  myDisplayNameRef: MutableRefObject<string>;
  recipientKeyCacheRef: MutableRefObject<Record<string, string>>;
  persistFriendKeyCacheNow: () => void;
  resolveConversationId: (chat: Chat | string) => string;
  pullEncryptedMessagesIncremental: () => Promise<void>;
  isDirectTombstoneChat: boolean;
  isOnline: boolean;
  editingMessageId: string | null;
  patchMessage: (messageId: string, updater: (message: Message) => Message) => void;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setChatInputSynced: (text: string) => void;
  messages: Message[];
  replyTargetMessage: Message | undefined;
  setReplyTargetMessageId: Dispatch<SetStateAction<string | null>>;
  setSelectedBroadcastThreadFriendId: Dispatch<SetStateAction<string | null>>;
  selectedBroadcastThreadFriendId: string | null;
  chatInputTextRef: MutableRefObject<string>;
  pendingChatMediaAttachment: Parameters<typeof sendComposerDraft>[0]["pendingChatMediaAttachment"];
  chatInputRef: Parameters<typeof sendComposerDraft>[0]["chatInputRef"];
  setPendingChatMediaAttachment: Parameters<typeof sendComposerDraft>[0]["setPendingChatMediaAttachment"];
  chatPicker: Parameters<typeof pickChatCameraMedia>[1];
}) {
  const {
    view,
    chats,
    friendMap,
    friendIdToBackendUid,
    getBackendSession,
    applyChats,
    setView,
    demoActiveInboundFriendIds,
    appendMessages,
    patchChat,
    autoReplyTimersRef,
    myDisplayNameRef,
    chatInputTextRef,
    pendingChatMediaAttachment,
    chatInputRef,
    setPendingChatMediaAttachment,
  } = params;

  const handleChatInputChange = (text: string) => {
    chatInputTextRef.current = text;
    if (view.screen === "chat" && "pendingDraft" in view && view.pendingDraft && text.trim().length > 0) {
      promotePendingChatToRow({
        pending: view.pendingDraft,
        session: getBackendSession(),
        friendMap,
        friendIdToBackendUid,
        setChats: applyChats,
        setView,
      });
    }
    params.setChatInputSynced(text);
  };

  const ensureChatForSend = (): Chat | null => {
    if (view.screen !== "chat") return null;
    if ("chatId" in view) {
      return chats.find((c) => c.id === view.chatId) ?? null;
    }
    return promotePendingChatToRow({
      pending: view.pendingDraft,
      session: getBackendSession(),
      friendMap,
      friendIdToBackendUid,
      setChats: applyChats,
      setView,
    });
  };

  const addAutoReplies = (chat: Chat, latestMessages: Message[]) =>
    scheduleDemoAutoReplies(chat, latestMessages, {
      demoActiveInboundFriendIds,
      appendMessages,
      patchChat,
      autoReplyTimersRef,
    });

  const getSenderDisplayName = useCallback(() => myDisplayNameRef.current.trim(), [myDisplayNameRef]);

  const { commitOutgoingMessages } = useOutgoingMessages({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    getBackendSession,
    friendMap,
    friendIdToBackendUid,
    friendMapRef: params.friendMapRef,
    friendIdToBackendUidRef: params.friendIdToBackendUidRef,
    recipientKeyCacheRef: params.recipientKeyCacheRef,
    persistFriendKeyCacheNow: params.persistFriendKeyCacheNow,
    resolveConversationId: (chat) => params.resolveConversationId(chat),
    getSenderDisplayName,
    pullEncryptedMessagesIncremental: params.pullEncryptedMessagesIncremental,
    setChats: applyChats,
    setMessages: params.applyMessages,
    setHiddenChatIds: params.setHiddenChatIds,
    setView,
    addAutoReplies,
  });

  const sendPayload = (payload: SendChatPayloadInput) =>
    sendChatPayload(payload, {
      ensureChatForSend,
      isDirectTombstoneChat: params.isDirectTombstoneChat,
      getBackendSession,
      isOnline: params.isOnline,
      editingMessageId: params.editingMessageId,
      patchMessage: params.patchMessage,
      setEditingMessageId: params.setEditingMessageId,
      setChatInputSynced: params.setChatInputSynced,
      messages: params.messages,
      friendIdToBackendUid,
      friendMapRef: params.friendMapRef,
      friendIdToBackendUidRef: params.friendIdToBackendUidRef,
      recipientKeyCacheRef: params.recipientKeyCacheRef,
      persistFriendKeyCacheNow: params.persistFriendKeyCacheNow,
      resolveConversationId: params.resolveConversationId,
      replyTargetMessage: params.replyTargetMessage,
      commitOutgoingMessages,
      setReplyTargetMessageId: params.setReplyTargetMessageId,
      appendMessages,
      patchChat,
      autoReplyTimersRef,
      setSelectedBroadcastThreadFriendId: params.setSelectedBroadcastThreadFriendId,
      selectedBroadcastThreadFriendId: params.selectedBroadcastThreadFriendId,
    });

  const sendMessage = () => {
    sendComposerDraft({
      chatInputTextRef,
      pendingChatMediaAttachment,
      chatInputRef,
      setPendingChatMediaAttachment,
      sendPayload,
    });
  };

  const sendCameraMedia = (mode: "photo" | "video") => pickChatCameraMedia(mode, params.chatPicker);

  const sendGalleryPhoto = () =>
    pickChatGalleryPhoto({
      ...params.chatPicker,
      sendPayload,
    });

  const sendGalleryVideo = () => pickChatGalleryVideo(params.chatPicker);

  return {
    handleChatInputChange,
    ensureChatForSend,
    addAutoReplies,
    getSenderDisplayName,
    commitOutgoingMessages,
    sendPayload,
    sendMessage,
    sendCameraMedia,
    sendGalleryPhoto,
    sendGalleryVideo,
  };
}
