import type { Chat, Message } from "../domain/types";

type FailedMessageDeps = {
  chats: Chat[];
  removeMessageById: (messageId: string) => void;
  commitOutgoingMessages: (chat: Chat, outgoing: Message[]) => void;
};

/** Retry or drop a message that failed to send. Memoize the returned handlers in the caller. */
export function createFailedMessageActions(deps: FailedMessageDeps) {
  const { chats, removeMessageById, commitOutgoingMessages } = deps;

  const retryFailedMessage = (message: Message) => {
    const chat = chats.find((c) => c.id === message.chatId);
    if (!chat || message.unsentAt || message.deliveryStatus !== "failed") return;
    const retryMessage: Message = {
      ...message,
      deliveryStatus: undefined,
      unsentAt: undefined,
    };
    removeMessageById(message.id);
    commitOutgoingMessages(chat, [retryMessage]);
  };

  const deleteFailedMessage = (messageId: string) => {
    removeMessageById(messageId);
  };

  const handleChatMessagePress = (message: Message, isMine: boolean, defaultAction: () => void) => {
    if (isMine && message.deliveryStatus === "failed" && !message.unsentAt) {
      retryFailedMessage(message);
      return;
    }
    defaultAction();
  };

  return { retryFailedMessage, deleteFailedMessage, handleChatMessagePress };
}
