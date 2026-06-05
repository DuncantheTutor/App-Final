import type { RefObject } from "react";

import type { Chat, EncryptedSyncChannelState, Friend, Message } from "../domain/types";

export type BackendSession = { uid: string; deviceId: string };

export type MessagingSyncRefs = {
  chatsRef: RefObject<Chat[]>;
  messagesRef: RefObject<Message[]>;
  hiddenChatIdsRef: RefObject<string[]>;
  hiddenServerConversationIdsRef: RefObject<Set<string>>;
  messagesWatermarkMsRef: RefObject<number>;
  backendUidToFriendIdRef: RefObject<Record<string, string>>;
  friendMapRef: RefObject<Record<string, Friend>>;
  friendIdToBackendUidRef: RefObject<Record<string, string>>;
  identityLockedChatIdsRef: RefObject<string[]>;
  /** Accepted server friend `u_*` ids; empty set = ingest no new stranger threads. */
  acceptedFriendBackendUidsRef: RefObject<Set<string>>;
};

export type EncryptedPlainPayload = {
  messageId: string;
  chatId: string;
  senderId?: string;
  text: string;
  createdAt: number;
  kind?: "text" | "photo" | "video" | "voice" | "gif";
  mediaUri?: string | null;
  mediaTier?: number | null;
  mediaObjectPath?: string | null;
  mediaKeyB64?: string | null;
  mediaNonceB64?: string | null;
  mediaContentType?: string | null;
  durationSec?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  replyToMessageId?: string | null;
  broadcastThreadFriendId?: string | null;
  /** True when the sender delivered this as a Broadcast (recipients see a dedicated card). */
  isBroadcast?: boolean | null;
  /** Sender-chosen broadcast title, used to name the recipient's broadcast card. */
  broadcastTitle?: string | null;
};

export type DecodedIncomingBatch = {
  decoded: Message[];
  missingChats: Chat[];
};

export type EncryptedSyncStateBundle = {
  profile: EncryptedSyncChannelState;
  posts: EncryptedSyncChannelState;
  messages: EncryptedSyncChannelState;
  lastSuccessAt: number | null;
};
