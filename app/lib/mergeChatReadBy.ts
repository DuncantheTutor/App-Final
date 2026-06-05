import type { Chat } from "../domain/types";

type ReadByMap = NonNullable<Chat["readBy"]>;

/** Per-participant read cursors — keeps the highest `lastReadAtMs` from each source. */
export function mergeReadByMaps(...maps: (ReadByMap | undefined)[]): ReadByMap | undefined {
  const merged: ReadByMap = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [uid, cursor] of Object.entries(map)) {
      const prev = merged[uid];
      if (!prev || cursor.lastReadAtMs > prev.lastReadAtMs) {
        merged[uid] = cursor;
      } else if (cursor.lastReadMessageId && !prev.lastReadMessageId) {
        merged[uid] = { ...prev, lastReadMessageId: cursor.lastReadMessageId };
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Cloud snapshot restore must not roll back read watermarks already on disk. */
export function mergeCloudChatsWithLocalReadBy(local: Chat[], cloud: Chat[]): Chat[] {
  const localById = new Map(local.map((chat) => [chat.id, chat]));
  const cloudIds = new Set(cloud.map((chat) => chat.id));
  const merged = cloud.map((chat) => {
    const localChat = localById.get(chat.id);
    if (!localChat?.readBy && !chat.readBy) return chat;
    return { ...chat, readBy: mergeReadByMaps(localChat?.readBy, chat.readBy) };
  });
  const localOnly = local.filter((chat) => !cloudIds.has(chat.id));
  return localOnly.length ? [...merged, ...localOnly] : merged;
}
