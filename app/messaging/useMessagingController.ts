import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { Chat, Message } from "../domain/types";
import { openDirectChatWithFriend, type OpenDirectChatParams } from "./openDirectChat";

export type OpenDirectChatFromController = Omit<
  OpenDirectChatParams,
  "chats" | "setChats" | "hiddenLocalChatIds" | "hiddenServerConversationIds"
>;

export type MessagingController = {
  chats: Chat[];
  setChats: Dispatch<SetStateAction<Chat[]>>;
  chatsRef: MutableRefObject<Chat[]>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  messagesRef: MutableRefObject<Message[]>;
  hiddenChatIds: string[];
  setHiddenChatIds: Dispatch<SetStateAction<string[]>>;
  hiddenChatIdsRef: MutableRefObject<string[]>;
  hiddenServerConversationIdsRef: MutableRefObject<Set<string>>;
  openDirectChat: (params: OpenDirectChatFromController) => void;
};

/**
 * Sole owner of in-memory chat / message / hide-tombstone state.
 * Sync and send hooks still receive these setters; screens should go through this controller.
 */
export function useMessagingController(): MessagingController {
  const [chats, setChats] = useState<Chat[]>([]);
  const chatsRef = useRef<Chat[]>([]);
  chatsRef.current = chats;

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>([]);
  const hiddenChatIdsRef = useRef<string[]>([]);
  hiddenChatIdsRef.current = hiddenChatIds;

  const hiddenServerConversationIdsRef = useRef<Set<string>>(new Set());

  const openDirectChat = useCallback((params: OpenDirectChatFromController) => {
    openDirectChatWithFriend({
      ...params,
      chats: chatsRef.current,
      setChats,
      hiddenLocalChatIds: new Set(hiddenChatIdsRef.current),
      hiddenServerConversationIds: hiddenServerConversationIdsRef.current,
    });
  }, []);

  return {
    chats,
    setChats,
    chatsRef,
    messages,
    setMessages,
    messagesRef,
    hiddenChatIds,
    setHiddenChatIds,
    hiddenChatIdsRef,
    hiddenServerConversationIdsRef,
    openDirectChat,
  };
}
