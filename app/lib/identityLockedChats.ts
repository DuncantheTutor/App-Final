import type { Chat, Friend } from "../domain/types";
import { isLiveDirectChatLocalId, localChatIdsForDirectThread } from "./directChatId";
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

/** All 1:1 standard threads with this friend (incl. `__live` aliases) — locked on unfriend. */
export function collectDirectChatIdsToLockForFriend(
  chats: Chat[],
  friendId: string,
  options?: {
    friendBackendUid?: string;
    sessionAppUid?: string | null;
    friendMap?: Record<string, Friend | undefined>;
    friendIdToBackendUid?: Record<string, string>;
  }
): string[] {
  const friendBackendUid = options?.friendBackendUid?.trim();
  const locked = new Set<string>();
  for (const chat of chats) {
    const kind = chat.kind ?? "standard";
    if (kind !== "standard") continue;
    const others = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    if (others.length !== 1) continue;
    const other = others[0];
    const matches =
      other === friendId || (friendBackendUid && other === friendBackendUid);
    if (!matches) continue;
    // Lock canonical history only; post-refriend messaging uses `dm_*__live` (see `resolveDirectChatOpenTarget`).
    if (isLiveDirectChatLocalId(chat.id)) continue;
    locked.add(chat.id);
    const sessionAppUid = options?.sessionAppUid?.trim();
    if (sessionAppUid) {
      const friendMapForThread: Record<string, Friend> = {};
      for (const [key, row] of Object.entries(options?.friendMap ?? {})) {
        if (row) friendMapForThread[key] = row;
      }
      for (const threadId of localChatIdsForDirectThread(
        chat.id,
        chats,
        sessionAppUid,
        friendMapForThread,
        options?.friendIdToBackendUid ?? {}
      )) {
        locked.add(threadId);
      }
    }
  }
  return [...locked];
}

export function mergeIdentityLockedChatIds(
  current: string[],
  additions: string[]
): string[] {
  if (additions.length === 0) return current;
  return [...new Set([...current, ...additions])];
}
