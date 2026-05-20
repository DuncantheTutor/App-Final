import type { Message } from "../domain/types";

export type ReadByMap = Record<string, { lastReadAtMs: number; lastReadMessageId?: string }>;

/** For each message id, uids whose read cursor includes this message (avatar row below bubble). */
export function readAvatarsByMessageId(
  messagesChronological: Message[],
  readBy: ReadByMap | undefined,
  excludeUid: string
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!readBy || messagesChronological.length === 0) return out;

  for (const [uid, cursor] of Object.entries(readBy)) {
    if (uid === excludeUid) continue;
    const readMs = cursor.lastReadAtMs ?? 0;
    if (!readMs) continue;

    let anchor: Message | undefined;
    for (const msg of messagesChronological) {
      if (msg.createdAt <= readMs) anchor = msg;
      else break;
    }
    if (!anchor) continue;
    if (!out[anchor.id]) out[anchor.id] = [];
    if (!out[anchor.id].includes(uid)) out[anchor.id].push(uid);
  }
  return out;
}
