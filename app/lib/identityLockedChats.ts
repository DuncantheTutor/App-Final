import type { Chat } from "../domain/types";
import { CURRENT_USER_ID } from "../theme/preludeConstants";

/** Chats whose counterpart identity stays **User** even after refriend (set on unfriend). */
export function isChatIdentityLocked(
  chatId: string | undefined | null,
  identityLockedChatIds: ReadonlySet<string>
): boolean {
  const id = chatId?.trim();
  if (!id) return false;
  return identityLockedChatIds.has(id);
}

/** All 1:1 standard threads with this friend — locked when the friendship ends. */
export function collectDirectChatIdsToLockForFriend(chats: Chat[], friendId: string): string[] {
  return chats
    .filter((chat) => {
      const kind = chat.kind ?? "standard";
      if (kind !== "standard") return false;
      const others = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
      return others.length === 1 && others[0] === friendId;
    })
    .map((chat) => chat.id);
}

export function mergeIdentityLockedChatIds(
  current: string[],
  additions: string[]
): string[] {
  if (additions.length === 0) return current;
  return [...new Set([...current, ...additions])];
}
