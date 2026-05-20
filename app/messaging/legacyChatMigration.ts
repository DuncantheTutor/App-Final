import type { Chat, Friend, Message } from "../domain/types";
import { CURRENT_USER_LOCAL_ID } from "../lib/chatMemberJoinedAt";
import { resolveCanonicalDirectChatLocalId } from "../lib/directChatId";
import {
  isLegacyDraftChatId,
  stableMultiPartyChatLocalId,
} from "./localChatId";

/**
 * Rewrites local state after upgrade: `draft-*` DMs → `dm_*`, group drafts → `grp_*` / `bc_*`.
 * Safe to run on every sign-in (no-op when nothing legacy remains).
 */
export function migrateLegacyDraftChats(
  chats: Chat[],
  messages: Message[],
  sessionAppUid: string,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): { chats: Chat[]; messages: Message[] } {
  const legacy = chats.filter((c) => isLegacyDraftChatId(c.id));
  if (legacy.length === 0) return { chats, messages };

  const idMap = new Map<string, string>();
  for (const chat of legacy) {
    const canonical = resolveCanonicalDirectChatLocalId(
      chat,
      sessionAppUid,
      friendMap,
      friendIdToBackendUid
    );
    if (canonical) {
      idMap.set(chat.id, canonical);
      continue;
    }
    const kind = chat.kind ?? "standard";
    idMap.set(chat.id, stableMultiPartyChatLocalId(kind, chat.memberIds));
  }

  const nextChats: Chat[] = [];
  const seen = new Set<string>();
  for (const chat of chats) {
    const targetId = idMap.get(chat.id) ?? chat.id;
    if (isLegacyDraftChatId(chat.id)) {
      const existing = nextChats.find((c) => c.id === targetId);
      const merged: Chat = {
        ...(existing ?? chat),
        id: targetId,
        memberIds: chat.memberIds,
        memberJoinedAt: { ...(existing?.memberJoinedAt ?? {}), ...(chat.memberJoinedAt ?? {}) },
        updatedAt: Math.max(existing?.updatedAt ?? 0, chat.updatedAt),
        isDraft: existing?.isDraft ?? chat.isDraft,
        visibleToRecipients: existing?.visibleToRecipients || chat.visibleToRecipients,
      };
      if (!seen.has(targetId)) {
        nextChats.push(merged);
        seen.add(targetId);
      } else {
        const idx = nextChats.findIndex((c) => c.id === targetId);
        if (idx >= 0) nextChats[idx] = merged;
      }
      continue;
    }
    if (!seen.has(targetId)) {
      nextChats.push(chat);
      seen.add(targetId);
    }
  }

  const nextMessages = messages.map((m) => {
    const mapped = idMap.get(m.chatId);
    return mapped ? { ...m, chatId: mapped } : m;
  });

  return { chats: nextChats, messages: nextMessages };
}

/** Drop orphan legacy rows that could not be mapped (should not happen after migration). */
export function stripUnmappedLegacyDraftChats(chats: Chat[]): Chat[] {
  return chats.filter((c) => !isLegacyDraftChatId(c.id));
}
