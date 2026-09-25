import type { Chat } from "../domain/types";
import { isChatIdentityLocked } from "../lib/identityLockedChats";
import { TOMBSTONE_DISPLAY_NAME } from "../lib/participantDisplay";
import { CURRENT_USER_ID } from "../theme/preludeConstants";

type ParticipantDisplay = {
  displayName: string;
  canOpenProfile: boolean;
};

/** Inbox row title: broadcast name, tombstone, live friend name, or a custom group name. */
export function storedChatListTitle(
  chat: Chat,
  resolvePd: (friendId: string, chatId?: string) => ParticipantDisplay,
  identityLockedChatIds: ReadonlySet<string>
): string {
  if (chat.kind === "broadcast") return chat.name;
  const counterpartIds = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
  if (counterpartIds.length === 1) {
    if (isChatIdentityLocked(chat.id, identityLockedChatIds)) return TOMBSTONE_DISPLAY_NAME;
    const pd = resolvePd(counterpartIds[0], chat.id);
    if (!pd.canOpenProfile) return TOMBSTONE_DISPLAY_NAME;
    return pd.displayName;
  }
  if (counterpartIds.length > 1 && !chat.isCustomName) {
    return counterpartIds.map((id) => resolvePd(id, chat.id).displayName).join(", ");
  }
  return chat.name;
}
