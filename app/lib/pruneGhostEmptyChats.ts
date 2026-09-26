import type { Chat, Message } from "../domain/types";

/**
 * Drops chats that have no visible messages and no saved draft text owned by the viewer.
 * A chat row may exist with zero messages only when it carries an explicit saved draft
 * for this user. Ghosts from cold-kills, abandoned composers, and empty tombstones are pruned.
 */
export function pruneGhostEmptyChats(
  chats: Chat[],
  messages: Message[],
  currentUserId: string
): Chat[] {
  const chatIdsWithMessages = new Set<string>();
  for (const message of messages) {
    if (message.hiddenFromOwner) continue;
    chatIdsWithMessages.add(message.chatId);
  }
  return chats.filter((chat) => {
    if (chatIdsWithMessages.has(chat.id)) return true;
    const ownedByMe = (chat.createdBy ?? currentUserId) === currentUserId;
    const hasSavedDraftText = (chat.draftComposerText ?? "").trim().length > 0;
    return chat.isDraft && ownedByMe && hasSavedDraftText;
  });
}
