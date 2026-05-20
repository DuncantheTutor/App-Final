import { CURRENT_USER_LOCAL_ID } from "./chatMemberJoinedAt";
import { mapServerReactionsToLocal } from "../messaging/messageMetadata";

export function getMyReactionEmoji(
  reactions: Record<string, string> | undefined,
  sessionAppUid: string | null | undefined,
  uidToFriendId: Record<string, string>
): string | undefined {
  if (!reactions) return undefined;
  const mapped = sessionAppUid
    ? mapServerReactionsToLocal(reactions, sessionAppUid, uidToFriendId)
    : reactions;
  return mapped?.[CURRENT_USER_LOCAL_ID];
}

export function aggregateReactionCounts(
  reactions: Record<string, string> | undefined,
  sessionAppUid: string | null | undefined,
  uidToFriendId: Record<string, string>,
  visibleFriendIds?: string[]
): Array<[string, number]> {
  const mapped = sessionAppUid
    ? mapServerReactionsToLocal(reactions, sessionAppUid, uidToFriendId)
    : reactions;
  if (!mapped) return [];
  const counts = new Map<string, number>();
  for (const [userId, emoji] of Object.entries(mapped)) {
    const trimmed = String(emoji ?? "").trim();
    if (!trimmed) continue;
    if (visibleFriendIds && userId !== CURRENT_USER_LOCAL_ID && !visibleFriendIds.includes(userId)) {
      continue;
    }
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
