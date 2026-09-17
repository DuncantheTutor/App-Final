import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { backendUidForFriendId } from "../../backendBridge";
import type { Friend } from "../domain/types";
import { dedupeFriendsByBackendUid, upsertRitualFriend } from "../lib/mergeFriendsCatalog";
import {
  CURRENT_USER_ID,
  FRIEND_LINKS,
  FRIENDS,
  addUndirectedEdge,
  cloneFriendLinks,
  removeUndirectedEdge,
} from "../theme/preludeConstants";

function friendsRowsUnchanged(current: Friend[], next: Friend[]): boolean {
  return (
    next.length === current.length &&
    next.every(
      (friend, i) =>
        current[i]?.id === friend.id &&
        current[i]?.profilePictureUrl === friend.profilePictureUrl &&
        current[i]?.displayName === friend.displayName &&
        current[i]?.bio === friend.bio
    )
  );
}

export type FriendsController = {
  addedFriendsFromRitual: Friend[];
  setAddedFriendsFromRitual: Dispatch<SetStateAction<Friend[]>>;
  applyFriends: Dispatch<SetStateAction<Friend[]>>;
  addedFriendsFromRitualRef: MutableRefObject<Friend[]>;
  unfriendedIds: string[];
  setUnfriendedIds: Dispatch<SetStateAction<string[]>>;
  unfriendedIdsRef: MutableRefObject<string[]>;
  friendLinksState: Record<string, string[]>;
  setFriendLinksState: Dispatch<SetStateAction<Record<string, string[]>>>;
  stickyUnfriendedFriendIdsRef: MutableRefObject<Set<string>>;
  acceptedFriendBackendUidsRef: MutableRefObject<Set<string>>;
  serverAcceptedFriendBackendUids: Set<string>;
  setServerAcceptedFriendBackendUids: Dispatch<SetStateAction<Set<string>>>;
  setServerAcceptedFriendUids: (uids: Set<string>) => void;
  resetFriendsState: () => void;
  hydrateFriends: (ritualFriends: Friend[], nextUnfriendedIds: string[]) => void;
  acceptFriend: (friend: Friend, options?: { withLink?: boolean }) => void;
  unfriendLocally: (friendId: string, otherUid?: string | null) => void;
  replaceFriendsIfChanged: (next: Friend[]) => void;
};

/**
 * Sole owner of in-memory friend roster / unfriend / link-graph state.
 * Pairing callables and profile refresh still live in MainApp; screens should
 * write through this controller.
 */
export function useFriendsController(): FriendsController {
  const [unfriendedIds, setUnfriendedIds] = useState<string[]>(() => FRIENDS.map((f) => f.id));
  const unfriendedIdsRef = useRef<string[]>([]);
  unfriendedIdsRef.current = unfriendedIds;

  const [friendLinksState, setFriendLinksState] = useState<Record<string, string[]>>(() =>
    cloneFriendLinks(FRIEND_LINKS)
  );
  const [addedFriendsFromRitual, setAddedFriendsFromRitual] = useState<Friend[]>([]);
  const addedFriendsFromRitualRef = useRef<Friend[]>([]);
  addedFriendsFromRitualRef.current = addedFriendsFromRitual;

  /** Prevents Firestore roster snapshots from briefly un-unfriending during `removeFriendship`. */
  const stickyUnfriendedFriendIdsRef = useRef<Set<string>>(new Set());
  const acceptedFriendBackendUidsRef = useRef<Set<string>>(new Set());
  const [serverAcceptedFriendBackendUids, setServerAcceptedFriendBackendUids] = useState<Set<string>>(
    () => new Set()
  );

  const setServerAcceptedFriendUids = useCallback((uids: Set<string>) => {
    acceptedFriendBackendUidsRef.current = uids;
    setServerAcceptedFriendBackendUids(new Set(uids));
  }, []);

  const resetFriendsState = useCallback(() => {
    setUnfriendedIds(FRIENDS.map((f) => f.id));
    setFriendLinksState(cloneFriendLinks(FRIEND_LINKS));
    setAddedFriendsFromRitual([]);
    stickyUnfriendedFriendIdsRef.current = new Set();
    acceptedFriendBackendUidsRef.current = new Set();
    setServerAcceptedFriendBackendUids(new Set());
  }, []);

  const hydrateFriends = useCallback((ritualFriends: Friend[], nextUnfriendedIds: string[]) => {
    setUnfriendedIds(nextUnfriendedIds);
    setFriendLinksState(() => {
      let next = cloneFriendLinks(FRIEND_LINKS);
      for (const friend of ritualFriends) {
        next = addUndirectedEdge(next, CURRENT_USER_ID, friend.id);
      }
      return next;
    });
    setAddedFriendsFromRitual(dedupeFriendsByBackendUid(ritualFriends));
  }, []);

  const acceptFriend = useCallback((friend: Friend, options?: { withLink?: boolean }) => {
    setAddedFriendsFromRitual((prev) => upsertRitualFriend(prev, friend));
    stickyUnfriendedFriendIdsRef.current.delete(friend.id);
    setUnfriendedIds((prev) => prev.filter((id) => id !== friend.id));
    if (options?.withLink) {
      setFriendLinksState((prev) => addUndirectedEdge(prev, CURRENT_USER_ID, friend.id));
    }
  }, []);

  const unfriendLocally = useCallback((friendId: string, otherUid?: string | null) => {
    stickyUnfriendedFriendIdsRef.current.add(friendId);
    setUnfriendedIds((cur) => (cur.includes(friendId) ? cur : [...cur, friendId]));
    setAddedFriendsFromRitual((prev) =>
      prev.filter((f) => f.id !== friendId && (!otherUid || f.backendUid?.trim() !== otherUid))
    );
    setFriendLinksState((prev) => {
      let next = removeUndirectedEdge(prev, CURRENT_USER_ID, friendId);
      if (otherUid) {
        next = removeUndirectedEdge(next, CURRENT_USER_ID, backendUidForFriendId(otherUid));
      }
      return next;
    });
  }, []);

  const replaceFriendsIfChanged = useCallback((next: Friend[]) => {
    setAddedFriendsFromRitual((current) => (friendsRowsUnchanged(current, next) ? current : next));
  }, []);

  return {
    addedFriendsFromRitual,
    setAddedFriendsFromRitual,
    applyFriends: setAddedFriendsFromRitual,
    addedFriendsFromRitualRef,
    unfriendedIds,
    setUnfriendedIds,
    unfriendedIdsRef,
    friendLinksState,
    setFriendLinksState,
    stickyUnfriendedFriendIdsRef,
    acceptedFriendBackendUidsRef,
    serverAcceptedFriendBackendUids,
    setServerAcceptedFriendBackendUids,
    setServerAcceptedFriendUids,
    resetFriendsState,
    hydrateFriends,
    acceptFriend,
    unfriendLocally,
    replaceFriendsIfChanged,
  };
}
