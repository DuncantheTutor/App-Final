import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert, Keyboard, type TextInput } from "react-native";

import { logAppError } from "../../telemetry";
import type { VideoTextOverlayData } from "../../PhotoEditorModal";
import { readComposerTextTrimmed } from "../lib/syncedComposerText";
import {
  broadcastCreatorFriendId,
  canReplyToBroadcastMessage,
  isBroadcastCreator,
} from "../lib/broadcastMessaging";
import type { Chat, Friend, Message } from "../domain/types";
import type { BackendSession } from "./types";
import { updateOutgoingMessageContent } from "./send";
import type { PendingChatPhoto, PendingVoiceNote } from "../chat/useInThreadComposer";
import {
  AUTO_REPLY_LINES,
  AUTO_REPLY_MAX_DELAY_MS,
  AUTO_REPLY_MIN_DELAY_MS,
  BROADCAST_EVERYONE_SEND_MESSAGE,
  BROADCAST_EVERYONE_SEND_TITLE,
  CURRENT_USER_ID,
  DEMO_OFFLINE_MODE,
} from "../theme/preludeConstants";

export type SendChatPayloadInput = {
  text: string;
  kind?: "text" | "photo" | "video" | "voice" | "gif";
  mediaUri?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  durationSec?: number;
  videoTextOverlays?: VideoTextOverlayData[];
};

export type SendChatPayloadDeps = {
  ensureChatForSend: () => Chat | null;
  isDirectTombstoneChat: boolean;
  getBackendSession: () => BackendSession | null;
  isOnline: boolean;
  editingMessageId: string | null;
  patchMessage: (messageId: string, updater: (message: Message) => Message) => void;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setChatInputSynced: (text: string) => void;
  messages: Message[];
  friendIdToBackendUid: Record<string, string>;
  friendMapRef: MutableRefObject<Record<string, Friend>>;
  friendIdToBackendUidRef: MutableRefObject<Record<string, string>>;
  recipientKeyCacheRef: MutableRefObject<Record<string, string>>;
  persistFriendKeyCacheNow: () => void;
  resolveConversationId: (chat: Chat | string) => string;
  replyTargetMessage: Message | undefined;
  commitOutgoingMessages: (chat: Chat, outgoing: Message[]) => void;
  setReplyTargetMessageId: Dispatch<SetStateAction<string | null>>;
  appendMessages: (incoming: Message[]) => void;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
  autoReplyTimersRef: MutableRefObject<Array<ReturnType<typeof setTimeout>>>;
  setSelectedBroadcastThreadFriendId: Dispatch<SetStateAction<string | null>>;
  selectedBroadcastThreadFriendId: string | null;
};

export function sendChatPayload(payload: SendChatPayloadInput, deps: SendChatPayloadDeps): void {
  const {
    ensureChatForSend,
    isDirectTombstoneChat,
    getBackendSession,
    isOnline,
    editingMessageId,
    patchMessage,
    setEditingMessageId,
    setChatInputSynced,
    messages,
    friendIdToBackendUid,
    friendMapRef,
    friendIdToBackendUidRef,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
    resolveConversationId,
    replyTargetMessage,
    commitOutgoingMessages,
    setReplyTargetMessageId,
    appendMessages,
    patchChat,
    autoReplyTimersRef,
    setSelectedBroadcastThreadFriendId,
    selectedBroadcastThreadFriendId,
  } = deps;
  try {
  const chat = ensureChatForSend();
  if (!chat) return;
  if (isDirectTombstoneChat) return;
  if (!DEMO_OFFLINE_MODE && !getBackendSession()) {
    Alert.alert(
      isOnline ? "Not connected" : "You're offline",
      isOnline
        ? "Your account session is still starting. Wait a few seconds and try again."
        : "Connect to the internet to send messages. You can still browse cached chats and posts."
    );
    return;
  }

  if (editingMessageId) {
    const trimmed = payload.text.trim();
    if (!trimmed) return;
    const editedAt = Date.now();
    const targetId = editingMessageId;
    patchMessage(targetId, (message) => ({
      ...message,
      text: trimmed,
      editedAt,
      kind: payload.kind ?? "text",
      mediaUri: payload.mediaUri,
      durationSec: payload.durationSec,
      videoTextOverlays: payload.videoTextOverlays,
      unsentAt: undefined,
    }));
    setEditingMessageId(null);
    setChatInputSynced("");
    if (!DEMO_OFFLINE_MODE) {
      const session = getBackendSession();
      const target = messages.find((m) => m.id === targetId);
      const editedMessage = {
        ...(target ?? { id: targetId, chatId: chat.id, senderId: CURRENT_USER_ID, createdAt: editedAt }),
        text: trimmed,
        editedAt,
        kind: payload.kind ?? "text",
        mediaUri: payload.mediaUri,
        durationSec: payload.durationSec,
        videoTextOverlays: payload.videoTextOverlays,
        unsentAt: undefined,
      } as Message;
      if (session && target) {
        void updateOutgoingMessageContent({
          session,
          chat,
          message: editedMessage,
          friendIdToBackendUid,
          friendMapRef,
          friendIdToBackendUidRef,
          recipientKeyCacheRef,
          persistFriendKeyCacheNow,
          resolveConversationId,
        }).catch((err) => logAppError("messages.edit_body", err, { messageId: targetId }));
      }
    }
    return;
  }

  const now = Date.now();
  const trimmedText = payload.text.trim();
  if (!trimmedText && !payload.mediaUri) return;
  const chatKind = chat.kind ?? "standard";
  if (chatKind === "broadcast") {
    const isCreator = isBroadcastCreator(chat, CURRENT_USER_ID);
    const creatorId = broadcastCreatorFriendId(chat, CURRENT_USER_ID);

    if (!isCreator) {
      const rt = replyTargetMessage;
      if (!rt || !canReplyToBroadcastMessage(rt, chat, CURRENT_USER_ID)) {
        Alert.alert(
          "Private reply only",
          "Long-press a message from the broadcaster and choose Reply to respond privately. You cannot message the whole group."
        );
        return;
      }
      const followUp: Message = {
        id: `m-${now}`,
        chatId: chat.id,
        senderId: CURRENT_USER_ID,
        text: trimmedText,
        createdAt: now,
        kind: payload.kind ?? "text",
        mediaUri: payload.mediaUri,
        mediaWidth: payload.mediaWidth,
        mediaHeight: payload.mediaHeight,
        durationSec: payload.durationSec,
        videoTextOverlays: payload.videoTextOverlays,
        replyToMessageId: rt.id,
        broadcastThreadFriendId: CURRENT_USER_ID,
      };
      commitOutgoingMessages(chat, [followUp]);
      setChatInputSynced("");
      setReplyTargetMessageId(null);
      return;
    }

    const existingInChat = messages.filter((m) => m.chatId === chat.id);
    const recipients =
      chat.broadcastRecipientIds ?? chat.memberIds.filter((id) => id !== CURRENT_USER_ID);

    const scheduleDemoThreadRepliesToRoot = (rootId: string, t0: number) => {
      if (!DEMO_OFFLINE_MODE) return;
      recipients.slice(0, Math.max(1, Math.min(2, recipients.length))).forEach((friendId, idx) => {
        const delayMs =
          AUTO_REPLY_MIN_DELAY_MS +
          Math.floor(Math.random() * (AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS + 1));
        const guaranteedReply: Message = {
          id: `br-${t0}-${friendId}-${idx}`,
          chatId: chat.id,
          senderId: friendId,
          text: AUTO_REPLY_LINES[(idx + 1) % AUTO_REPLY_LINES.length] ?? "Got it.",
          createdAt: Date.now() + delayMs,
          kind: "text",
          replyToMessageId: rootId,
          broadcastThreadFriendId: friendId,
        };
        const timer = setTimeout(() => {
          appendMessages([guaranteedReply]);
          patchChat(chat.id, (c) => ({ ...c, updatedAt: Date.now() }));
        }, delayMs);
        autoReplyTimersRef.current.push(timer);
      });
    };

    if (existingInChat.length === 0) {
      Alert.alert(BROADCAST_EVERYONE_SEND_TITLE, BROADCAST_EVERYONE_SEND_MESSAGE, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () => {
            const t = Date.now();
            const rootMessage: Message = {
              id: `m-${t}-broadcast-root`,
              chatId: chat.id,
              senderId: CURRENT_USER_ID,
              text: trimmedText,
              createdAt: t,
              kind: payload.kind ?? "text",
              mediaUri: payload.mediaUri,
              mediaWidth: payload.mediaWidth,
              mediaHeight: payload.mediaHeight,
              durationSec: payload.durationSec,
              videoTextOverlays: payload.videoTextOverlays,
            };
            commitOutgoingMessages(chat, [rootMessage]);
            scheduleDemoThreadRepliesToRoot(rootMessage.id, t);
            setSelectedBroadcastThreadFriendId(recipients[0] ?? null);
            setChatInputSynced("");
            setReplyTargetMessageId(null);
          },
        },
      ]);
      return;
    }

    const rt = replyTargetMessage;
    const replyingToOwnGlobalBroadcast =
      !!rt && rt.senderId === creatorId && !rt.broadcastThreadFriendId;
    const threadFriendId =
      selectedBroadcastThreadFriendId ?? rt?.broadcastThreadFriendId ?? undefined;

    const isPrivateThreadSend = !replyingToOwnGlobalBroadcast && !!threadFriendId;

    if (isPrivateThreadSend) {
      const followUp: Message = {
        id: `m-${now}`,
        chatId: chat.id,
        senderId: CURRENT_USER_ID,
        text: trimmedText,
        createdAt: now,
        kind: payload.kind ?? "text",
        mediaUri: payload.mediaUri,
        mediaWidth: payload.mediaWidth,
        mediaHeight: payload.mediaHeight,
        durationSec: payload.durationSec,
        videoTextOverlays: payload.videoTextOverlays,
        replyToMessageId: rt?.id,
        broadcastThreadFriendId: threadFriendId as string,
      };
      commitOutgoingMessages(chat, [followUp]);
      setChatInputSynced("");
      setReplyTargetMessageId(null);
      return;
    }

    const globalReplyToId = rt && !rt.broadcastThreadFriendId ? rt.id : undefined;
    Alert.alert(BROADCAST_EVERYONE_SEND_TITLE, BROADCAST_EVERYONE_SEND_MESSAGE, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: () => {
          const t = Date.now();
          const everyoneMessage: Message = {
            id: `m-${t}`,
            chatId: chat.id,
            senderId: CURRENT_USER_ID,
            text: trimmedText,
            createdAt: t,
            kind: payload.kind ?? "text",
            mediaUri: payload.mediaUri,
            mediaWidth: payload.mediaWidth,
            mediaHeight: payload.mediaHeight,
            durationSec: payload.durationSec,
            videoTextOverlays: payload.videoTextOverlays,
            ...(globalReplyToId ? { replyToMessageId: globalReplyToId } : {}),
          };
          commitOutgoingMessages(chat, [everyoneMessage]);
          setSelectedBroadcastThreadFriendId(null);
          setChatInputSynced("");
          setReplyTargetMessageId(null);
        },
      },
    ]);
    return;
  } else {
    const out: Message = {
      id: `m-${now}`,
      chatId: chat.id,
      senderId: CURRENT_USER_ID,
      text: trimmedText,
      createdAt: now,
      kind: payload.kind ?? "text",
      mediaUri: payload.mediaUri,
      mediaWidth: payload.mediaWidth,
      mediaHeight: payload.mediaHeight,
      durationSec: payload.durationSec,
      videoTextOverlays: payload.videoTextOverlays,
      replyToMessageId: replyTargetMessage?.id,
    };
    commitOutgoingMessages(chat, [out]);
  }

  setChatInputSynced("");
  setReplyTargetMessageId(null);
  } catch (err) {
    logAppError("send.payload", err, {});
    Alert.alert(
      "Could not send",
      err instanceof Error ? err.message : "Something went wrong. Try again."
    );
  }
}

export function sendComposerDraft(deps: {
  chatInputTextRef: MutableRefObject<string>;
  pendingChatMediaAttachment: PendingChatPhoto | null;
  chatInputRef: MutableRefObject<TextInput | null>;
  setPendingChatMediaAttachment: Dispatch<SetStateAction<PendingChatPhoto | null>>;
  sendPayload: (payload: SendChatPayloadInput) => void;
}): void {
  const {
    chatInputTextRef,
    pendingChatMediaAttachment,
    chatInputRef,
    setPendingChatMediaAttachment,
    sendPayload,
  } = deps;
  const text = readComposerTextTrimmed(chatInputTextRef);
  const pendingMedia = pendingChatMediaAttachment;
  if (!text && !pendingMedia) return;
  Keyboard.dismiss();
  chatInputRef.current?.blur();
  try {
    if (pendingMedia) {
      sendPayload({
        text,
        kind: pendingMedia.kind,
        mediaUri: pendingMedia.uri,
        mediaWidth: pendingMedia.width,
        mediaHeight: pendingMedia.height,
      });
      setPendingChatMediaAttachment(null);
      return;
    }
    sendPayload({ text, kind: "text" });
  } catch (err) {
    logAppError("send.compose", err, {});
    Alert.alert("Could not send", "Something went wrong. Try again.");
  }
}

export async function sendComposerVoiceNote(deps: {
  preparePendingVoiceNoteForSend: () => Promise<PendingVoiceNote | null>;
  sendPayload: (payload: SendChatPayloadInput) => void;
  setPendingVoiceNote: Dispatch<SetStateAction<PendingVoiceNote | null>>;
  setVoiceNoteMode: Dispatch<SetStateAction<boolean>>;
}): Promise<void> {
  const { preparePendingVoiceNoteForSend, sendPayload, setPendingVoiceNote, setVoiceNoteMode } = deps;
  const note = await preparePendingVoiceNoteForSend();
  if (!note) return;
  sendPayload({
    text: `Voice note (${note.durationSec}s)`,
    kind: "voice",
    durationSec: note.durationSec,
    mediaUri: note.uri,
  });
  setPendingVoiceNote(null);
  setVoiceNoteMode(false);
}
