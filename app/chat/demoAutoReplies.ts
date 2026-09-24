import type { MutableRefObject } from "react";

import type { Chat, Message } from "../domain/types";
import {
  AUTO_REPLY_LINES,
  AUTO_REPLY_MAX_DELAY_MS,
  AUTO_REPLY_MIN_DELAY_MS,
  CURRENT_USER_ID,
  DEMO_OFFLINE_MODE,
} from "../theme/preludeConstants";

type DemoAutoReplyDeps = {
  demoActiveInboundFriendIds: string[];
  appendMessages: (incoming: Message[]) => void;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
  autoReplyTimersRef: MutableRefObject<Array<ReturnType<typeof setTimeout>>>;
};

/** Offline-demo replies after the user sends. No-op when demo mode is off. */
export function scheduleDemoAutoReplies(
  chat: Chat,
  latestMessages: Message[],
  deps: DemoAutoReplyDeps
): void {
  if (!DEMO_OFFLINE_MODE) return;
  const { demoActiveInboundFriendIds, appendMessages, patchChat, autoReplyTimersRef } = deps;
  const now = Date.now();
  const outgoing = latestMessages.filter((m) => m.senderId === CURRENT_USER_ID);
  if (outgoing.length === 0) return;

  const scheduleReply = (message: Message, delayMs: number) => {
    const timer = setTimeout(() => {
      appendMessages([message]);
      patchChat(chat.id, (c) => ({ ...c, updatedAt: Date.now() }));
    }, delayMs);
    autoReplyTimersRef.current.push(timer);
  };

  if ((chat.kind ?? "standard") === "broadcast") {
    const recipients =
      chat.broadcastRecipientIds ?? chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    for (const outgoingMessage of outgoing) {
      const threadFriendId = outgoingMessage.broadcastThreadFriendId;
      const targets = threadFriendId
        ? [threadFriendId]
        : recipients;
      for (const targetId of targets) {
        if (DEMO_OFFLINE_MODE && !demoActiveInboundFriendIds.includes(targetId)) continue;
        if (Math.random() > (DEMO_OFFLINE_MODE ? 0.5 : 0.68)) continue;
        const delayMs =
          AUTO_REPLY_MIN_DELAY_MS +
          Math.floor(Math.random() * (AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS + 1));
        scheduleReply(
          {
            id: `auto-${now}-${targetId}-${Math.random().toString(36).slice(2, 6)}`,
            chatId: chat.id,
            senderId: targetId,
            text: AUTO_REPLY_LINES[Math.floor(Math.random() * AUTO_REPLY_LINES.length)] ?? "Got it.",
            createdAt: Date.now() + delayMs,
            kind: "text",
            replyToMessageId: outgoingMessage.id,
            broadcastThreadFriendId: targetId,
          },
          delayMs
        );
      }
    }
    return;
  }
  const recipients = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
  const candidateRecipients = DEMO_OFFLINE_MODE
    ? recipients.filter((id) => demoActiveInboundFriendIds.includes(id))
    : recipients;
  if (candidateRecipients.length === 0 || Math.random() > (DEMO_OFFLINE_MODE ? 0.5 : 0.7)) return;
  const sender =
    candidateRecipients[Math.floor(Math.random() * candidateRecipients.length)] ?? candidateRecipients[0];
  if (!sender) return;
  const anchor = outgoing[outgoing.length - 1];
  if (!anchor) return;
  const delayMs =
    AUTO_REPLY_MIN_DELAY_MS +
    Math.floor(Math.random() * (AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS + 1));
  const reply: Message = {
    id: `auto-${now}-${sender}-${Math.random().toString(36).slice(2, 6)}`,
    chatId: chat.id,
    senderId: sender,
    text: AUTO_REPLY_LINES[Math.floor(Math.random() * AUTO_REPLY_LINES.length)] ?? "Nice.",
    createdAt: Date.now() + delayMs,
    kind: "text",
    replyToMessageId: anchor.id,
  };
  scheduleReply(reply, delayMs);
}
