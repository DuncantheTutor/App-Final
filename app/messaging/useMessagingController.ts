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
  hideChatIds: (ids: string[]) => void;
  unhideChatId: (chatId: string) => void;
  removeChatsAndMessages: (ids: Iterable<string>) => void;
  upsertChat: (chat: Chat) => void;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
  appendMessages: (incoming: Message[]) => void;
  removeMessageById: (messageId: string) => void;
  patchMessage: (messageId: string, updater: (message: Message) => Message) => void;
  resetMessagingState: () => void;
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

  const hideChatIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setHiddenChatIds((current) => [...new Set([...current, ...ids])]);
  }, []);

  const unhideChatId = useCallback((chatId: string) => {
    setHiddenChatIds((current) => current.filter((id) => id !== chatId));
  }, []);

  const removeChatsAndMessages = useCallback((ids: Iterable<string>) => {
    const hide = ids instanceof Set ? ids : new Set(ids);
    if (hide.size === 0) return;
    setChats((c) => c.filter((x) => !hide.has(x.id)));
    setMessages((m) => m.filter((msg) => !hide.has(msg.chatId)));
  }, []);

  const upsertChat = useCallback((chat: Chat) => {
    setChats((current) => [chat, ...current.filter((c) => c.id !== chat.id)]);
  }, []);

  const patchChat = useCallback((chatId: string, updater: (chat: Chat) => Chat) => {
    setChats((current) => current.map((c) => (c.id === chatId ? updater(c) : c)));
  }, []);

  const appendMessages = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    setMessages((current) => [...current, ...incoming]);
  }, []);

  const removeMessageById = useCallback((messageId: string) => {
    setMessages((current) => current.filter((m) => m.id !== messageId));
  }, []);

  const patchMessage = useCallback((messageId: string, updater: (message: Message) => Message) => {
    setMessages((current) => current.map((m) => (m.id === messageId ? updater(m) : m)));
  }, []);

  const resetMessagingState = useCallback(() => {
    setChats([]);
    setMessages([]);
    setHiddenChatIds([]);
    hiddenServerConversationIdsRef.current = new Set();
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
    hideChatIds,
    unhideChatId,
    removeChatsAndMessages,
    upsertChat,
    patchChat,
    appendMessages,
    removeMessageById,
    patchMessage,
    resetMessagingState,
  };
}
