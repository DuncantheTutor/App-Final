import { isChatIdentityLocked } from "./identityLockedChats";
import type { Friend } from "../domain/types";

/** Display when friendship does not unlock identity (ex-friend, deleted account, unknown member). */
export const TOMBSTONE_DISPLAY_NAME = "User";

export type ParticipantDisplay = {
  displayName: string;
  profilePictureUrl: string;
  letter: string;
  /** Only true when the viewer has a server-accepted friendship and profile may open. */
  canOpenProfile: boolean;
};

function tombstone(): ParticipantDisplay {
  return {
    displayName: TOMBSTONE_DISPLAY_NAME,
    profilePictureUrl: "",
    letter: "U",
    canOpenProfile: false,
  };
}

function isServerAcceptedFriend(
  friend: Friend,
  serverAcceptedFriendBackendUids: ReadonlySet<string> | null | undefined
): boolean {
  if (serverAcceptedFriendBackendUids === null) return true;
  const backendUid = friend.backendUid?.trim();
  if (!backendUid?.startsWith("u_")) return false;
  if (!serverAcceptedFriendBackendUids) return false;
  return serverAcceptedFriendBackendUids.has(backendUid);
}

/**
 * Resolves how another participant should render for the current viewer.
 * Non-friends (including `unfriendedIds`) always get tombstone; missing map entry is tombstone.
 *
 * Pass `serverAcceptedFriendBackendUids` from `listMyFriends` / Firestore `friendships` only.
 * Pass `null` in demo offline mode to trust the local friend catalog.
 */
export type ResolveParticipantDisplayOptions = {
  /** When set with `identityLockedChatIds`, this thread keeps **User** after refriend. */
  chatId?: string;
  identityLockedChatIds?: ReadonlySet<string>;
};

export function resolveParticipantDisplay(
  friendId: string,
  friendMap: Record<string, Friend | undefined>,
  unfriendedIds: string[],
  serverAcceptedFriendBackendUids?: ReadonlySet<string> | null,
  options?: ResolveParticipantDisplayOptions
): ParticipantDisplay {
  if (
    options?.chatId &&
    options.identityLockedChatIds &&
    isChatIdentityLocked(options.chatId, options.identityLockedChatIds)
  ) {
    return tombstone();
  }
  if (unfriendedIds.includes(friendId)) return tombstone();
  const f = friendMap[friendId];
  if (!f) return tombstone();
  if (!isServerAcceptedFriend(f, serverAcceptedFriendBackendUids)) return tombstone();
  const dn = f.displayName?.trim();
  if (!dn) return tombstone();
  return {
    displayName: dn,
    profilePictureUrl: f.profilePictureUrl ?? "",
    letter: dn.slice(0, 1) || "?",
    canOpenProfile: true,
  };
}
