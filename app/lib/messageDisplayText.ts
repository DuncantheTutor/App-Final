import type { Message } from "../domain/types";

/** Safe message body for UI (legacy cache / media-only payloads may omit `text`). */
export function messageDisplayText(message: Pick<Message, "text"> | null | undefined): string {
  const raw = message?.text;
  return typeof raw === "string" ? raw : "";
}

export function normalizeMessageForUi(message: Message): Message {
  const text = messageDisplayText(message);
  return text === message.text ? message : { ...message, text };
}

export function normalizeMessagesForUi(messages: Message[]): Message[] {
  let changed = false;
  const out = messages.map((m) => {
    const next = normalizeMessageForUi(m);
    if (next !== m) changed = true;
    return next;
  });
  return changed ? out : messages;
}
