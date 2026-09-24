import type { Chat } from "../domain/types";

type SaveChatMetaDeps = {
  resolvedChat: Chat | null;
  chatTitleDraft: string;
  chatPictureDraft: string;
  patchChat: (chatId: string, updater: (chat: Chat) => Chat) => void;
  setEditChatMetaOpen: (open: boolean) => void;
  setEditChatPictureOpen: (open: boolean) => void;
};

/** Rename the open chat, or set its emoji picture. Recreated each render. */
export function createChatMetaActions(deps: SaveChatMetaDeps) {
  const {
    resolvedChat,
    chatTitleDraft,
    chatPictureDraft,
    patchChat,
    setEditChatMetaOpen,
    setEditChatPictureOpen,
  } = deps;

  const saveChatTitle = () => {
    if (!resolvedChat || !chatTitleDraft.trim()) return;
    patchChat(resolvedChat.id, (chat) => ({
      ...chat,
      name: chatTitleDraft.trim(),
      isCustomName: true,
      updatedAt: Date.now(),
    }));
    setEditChatMetaOpen(false);
  };

  const saveChatPicture = () => {
    if (!resolvedChat || !chatPictureDraft.trim()) return;
    patchChat(resolvedChat.id, (chat) => ({
      ...chat,
      profilePicture: chatPictureDraft.trim().slice(0, 2),
      updatedAt: Date.now(),
    }));
    setEditChatPictureOpen(false);
  };

  return { saveChatTitle, saveChatPicture };
}
