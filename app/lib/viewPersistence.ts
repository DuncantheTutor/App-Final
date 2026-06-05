import { backendUidForFriendId } from "../../backendBridge";
import type { Chat, Friend, FriendsListRestore, Message, PendingDraft, ViewState } from "../domain/types";
import { dedupeFriendsByBackendUid } from "./mergeFriendsCatalog";

/**
 * Drops chats that have no visible messages **and** no saved draft text owned by the viewer.
 *
 * Product rule (see `Planning/MASTER_PRODUCT_PLAN.md` and `FEATURE_TEST_SCENARIOS.md`):
 * a chat row is only allowed to exist with zero messages when it carries an explicit saved
 * draft for *this* user. Anything else (ghosts from cold-kills, abandoned composer entries,
 * tombstone leftovers without any history) must be hidden and pruned at restore time so it
 * does not surface the friend's identity in an otherwise empty thread.
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

/** Restores ritual/backend friends from persisted social JSON (best-effort). */
export function sanitizePersistedFriendsFromStorage(value: unknown): Friend[] {
  if (!Array.isArray(value)) return [];
  const out: Friend[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rawId = typeof o.id === "string" ? o.id.trim() : "";
    const backendUid = typeof o.backendUid === "string" ? o.backendUid.trim() : "";
    if (!rawId || !backendUid || !backendUid.startsWith("u_")) continue;
    const id =
      backendUid.startsWith("u_") ? backendUidForFriendId(backendUid) : rawId;
    out.push({
      id,
      backendUid,
      displayName:
        typeof o.displayName === "string" && o.displayName.trim()
          ? o.displayName.trim()
          : `User ${backendUid.slice(0, 6)}`,
      online: false,
      profilePictureUrl: typeof o.profilePictureUrl === "string" ? o.profilePictureUrl : "",
      bio: typeof o.bio === "string" ? o.bio : "",
      messageCount: typeof o.messageCount === "number" ? o.messageCount : 0,
    });
  }
  return dedupeFriendsByBackendUid(out);
}

/** Cold start: hide auth/main UI until Firebase initial auth resolves and this minimum elapses. */
export const APP_BOOT_SPLASH_MIN_MS = 500;
/** Product name shown on the boot splash under the wordmark. */
export const PLACEHOLDER_APP_PRODUCT_NAME = "Erdos";

export function lastViewStorageKey(email: string): string {
  return `app:lastView:v1:${email.trim().toLowerCase()}`;
}

export function lastHomeTabStorageKey(email: string): string {
  return `app:lastHomeTab:v1:${email.trim().toLowerCase()}`;
}

export function parsePendingDraftPayload(value: unknown): PendingDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.memberIds) || !o.memberIds.every((id): id is string => typeof id === "string")) {
    return undefined;
  }
  if (typeof o.name !== "string") return undefined;
  const pending: PendingDraft = {
    memberIds: o.memberIds,
    name: o.name,
    profilePicture: typeof o.profilePicture === "string" ? o.profilePicture : undefined,
  };
  if (o.kind === "standard" || o.kind === "broadcast") pending.kind = o.kind;
  if (typeof o.createdBy === "string") pending.createdBy = o.createdBy;
  if (Array.isArray(o.broadcastRecipientIds)) {
    pending.broadcastRecipientIds = o.broadcastRecipientIds.filter(
      (id): id is string => typeof id === "string"
    );
  }
  if (o.standardGroupTitle === "custom" || o.standardGroupTitle === "members") {
    pending.standardGroupTitle = o.standardGroupTitle;
  }
  return pending;
}

export function parseFriendsListRestorePayload(
  value: unknown,
  chatIds: Set<string>
): FriendsListRestore | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const returnTo = o.returnTo === "chat" ? "chat" : "home";
  const returnChatId = typeof o.returnChatId === "string" ? o.returnChatId : undefined;
  if (returnTo === "chat" && returnChatId && !chatIds.has(returnChatId)) return undefined;
  const returnPendingDraft = parsePendingDraftPayload(o.returnPendingDraft);
  return { returnTo, returnChatId, returnPendingDraft };
}

export function parseStoredViewState(raw: string, chatIds: Set<string>): ViewState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const screen = o.screen;
  if (screen === "home") return { screen: "home" };
  if (screen === "myProfile") return { screen: "myProfile" };
  if (screen === "settings") return { screen: "settings" };
  if (screen === "openSourceLicenses") return { screen: "settings" };
  if (screen === "addFriend") return { screen: "addFriend" };
  if (screen === "publishPost") return { screen: "home" };
  if (screen === "chatSharedMedia") {
    const chatId = typeof o.chatId === "string" ? o.chatId.trim() : "";
    if (chatId) return { screen: "chat", chatId };
    return { screen: "home" };
  }
  if (screen === "friendsList") {
    const returnTo = o.returnTo === "chat" ? "chat" : "home";
    const returnChatId = typeof o.returnChatId === "string" ? o.returnChatId : undefined;
    if (returnTo === "chat" && returnChatId && !chatIds.has(returnChatId)) {
      return { screen: "friendsList", returnTo: "home" };
    }
    const returnPendingDraft = parsePendingDraftPayload(o.returnPendingDraft);
    return { screen: "friendsList", returnTo, returnChatId, returnPendingDraft };
  }
  if (screen === "chat") {
    if (typeof o.chatId === "string" && chatIds.has(o.chatId)) {
      return { screen: "chat", chatId: o.chatId };
    }
    const pendingDraft = parsePendingDraftPayload(o.pendingDraft);
    if (pendingDraft && pendingDraft.memberIds.length > 0) {
      return { screen: "chat", pendingDraft };
    }
    return null;
  }
  if (screen === "friendProfile") {
    const friendId = typeof o.friendId === "string" ? o.friendId : "";
    if (!friendId) return null;
    const returnTo =
      o.returnTo === "chat" || o.returnTo === "friendsList" || o.returnTo === "home" ? o.returnTo : "home";
    const returnChatId = typeof o.returnChatId === "string" ? o.returnChatId : undefined;
    if (returnTo === "chat" && returnChatId && !chatIds.has(returnChatId)) {
      return { screen: "friendProfile", friendId, returnTo: "home" };
    }
    const returnPendingDraft = parsePendingDraftPayload(o.returnPendingDraft);
    const friendsListRestore = parseFriendsListRestorePayload(o.friendsListRestore, chatIds);
    return {
      screen: "friendProfile",
      friendId,
      returnTo,
      returnChatId: returnTo === "chat" ? returnChatId : undefined,
      returnPendingDraft: returnTo === "chat" ? returnPendingDraft : undefined,
      friendsListRestore: returnTo === "friendsList" ? friendsListRestore : undefined,
    };
  }
  return null;
}
