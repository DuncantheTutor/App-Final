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
  serverAcceptedFriendBackendUids: ReadonlySet<string> | null | undefined,
  localAcceptedFriendIds?: ReadonlySet<string> | null
): boolean {
  /** `null` = roster still loading (demo offline or pre–`initialServerSyncDone`). */
  if (serverAcceptedFriendBackendUids === null) return true;
  const backendUid = friend.backendUid?.trim();
  if (!backendUid?.startsWith("u_")) return false;
  if (!serverAcceptedFriendBackendUids) return false;
  if (serverAcceptedFriendBackendUids.has(backendUid)) return true;
  /**
   * Trust the local undirected friend graph while the server roster catches up
   * (recent Add Friend, `listMyFriends` lag, or friendships listener delay).
   * Unfriend clears the local edge and sets `unfriendedIds` before this runs.
   */
  if (localAcceptedFriendIds?.has(friend.id)) return true;
  return false;
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
  options?: ResolveParticipantDisplayOptions & {
    /** Friend ids with a local undirected edge to the current user (roster fallback). */
    localAcceptedFriendIds?: ReadonlySet<string> | null;
  }
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
  if (!isServerAcceptedFriend(f, serverAcceptedFriendBackendUids, options?.localAcceptedFriendIds)) {
    return tombstone();
  }
  const dn = f.displayName?.trim();
  if (!dn) return tombstone();
  return {
    displayName: dn,
    profilePictureUrl: f.profilePictureUrl ?? "",
    letter: dn.slice(0, 1) || "?",
    canOpenProfile: true,
  };
}
