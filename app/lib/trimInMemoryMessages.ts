import type { Message } from "../domain/types";

/** Keep only messages for retained chats, capped to the newest `perChatLimit` per chat. */
export function trimInMemoryMessages(
  messages: Message[],
  retainedChatIds: Set<string>,
  perChatLimit: number
): Message[] {
  if (retainedChatIds.size === 0 || perChatLimit <= 0) return [];
  const byChat = new Map<string, Message[]>();
  for (const message of messages) {
    if (!retainedChatIds.has(message.chatId)) continue;
    const list = byChat.get(message.chatId);
    if (list) list.push(message);
    else byChat.set(message.chatId, [message]);
  }
  const out: Message[] = [];
  for (const list of byChat.values()) {
    list.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });
    out.push(...(list.length <= perChatLimit ? list : list.slice(-perChatLimit)));
  }
  return out;
}
