import type { Chat, Friend, PendingDraft } from "../domain/types";
import { CURRENT_USER_LOCAL_ID } from "../lib/chatMemberJoinedAt";
import { canonicalDirectChatLocalId } from "../lib/directChatId";
import { resolveChatMemberToBackendUid } from "../lib/resolveChatMemberBackendUid";

function hashInput(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

/** Per-device DM ids from builds before canonical `dm_*` threads (removed for new chats). */
export function isLegacyDraftChatId(chatId: string): boolean {
  return chatId.trim().startsWith("draft-");
}

/** Deterministic id for group / broadcast threads (same members → same id on one device). */
export function stableMultiPartyChatLocalId(
  kind: "standard" | "broadcast",
  memberIds: string[]
): string {
  const prefix = kind === "broadcast" ? "bc_" : "grp_";
  const sorted = [...memberIds].map((id) => id.trim()).filter(Boolean).sort();
  return `${prefix}${hashInput(sorted.join("|"))}`;
}

/**
 * Local chat row id for a pending composer or new thread.
 * 1:1 requires a linked `u_*` friend; returns null when DM cannot be addressed.
 */
export function resolveLocalChatIdForPending(
  pending: PendingDraft,
  sessionAppUid: string | null,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): string | null {
  const kind = pending.kind ?? "standard";
  const others = pending.memberIds.filter((id) => id !== CURRENT_USER_LOCAL_ID);
  if (kind === "standard" && others.length === 1 && sessionAppUid) {
    const friendBackendUid = resolveChatMemberToBackendUid(
      others[0],
      sessionAppUid,
      friendMap,
      friendIdToBackendUid
    );
    if (friendBackendUid?.startsWith("u_")) {
      return canonicalDirectChatLocalId(sessionAppUid, friendBackendUid);
    }
    return null;
  }
  return stableMultiPartyChatLocalId(kind, pending.memberIds);
}

export function chatFromPending(
  pending: PendingDraft,
  sessionAppUid: string | null,
  friendMap: Record<string, Friend>,
  friendIdToBackendUid: Record<string, string>
): Chat | null {
  const id = resolveLocalChatIdForPending(
    pending,
    sessionAppUid,
    friendMap,
    friendIdToBackendUid
  );
  if (!id) return null;
  const now = Date.now();
  return {
    id,
    memberIds: pending.memberIds,
    name: pending.name,
    profilePicture: pending.profilePicture,
    kind: pending.kind ?? "standard",
    createdBy: pending.createdBy ?? CURRENT_USER_LOCAL_ID,
    isCustomName: false,
    isDraft: true,
    visibleToRecipients: false,
    updatedAt: now,
    broadcastRecipientIds: pending.broadcastRecipientIds,
  };
}
