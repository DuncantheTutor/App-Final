import { useEffect } from "react";

import { attachFriendRosterListener } from "./roster";
import type { Friend } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export function useFriendRosterSync(params: {
  demoOfflineMode: boolean;
  signedIn: boolean;
  getBackendSession: () => BackendSession | null;
  acceptedFriendBackendUidsRef: { current: Set<string> };
  onServerFriendBackendUidsChanged?: (uids: Set<string>) => void;
  addedFriendsFromRitualRef: { current: Friend[] };
  setAddedFriendsFromRitual: (updater: (current: Friend[]) => Friend[]) => void;
  setUnfriendedIds: (updater: (current: string[]) => string[]) => void;
  setFriendLinksState: (
    updater: (current: Record<string, string[]>) => Record<string, string[]>
  ) => void;
  addUndirectedEdge: (
    links: Record<string, string[]>,
    a: string,
    b: string
  ) => Record<string, string[]>;
  removeUndirectedEdge: (
    links: Record<string, string[]>,
    a: string,
    b: string
  ) => Record<string, string[]>;
}): void {
  const {
    demoOfflineMode,
    signedIn,
    getBackendSession,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged,
    addedFriendsFromRitualRef,
    setAddedFriendsFromRitual,
    setUnfriendedIds,
    setFriendLinksState,
    addUndirectedEdge,
    removeUndirectedEdge,
  } = params;

  useEffect(() => {
    if (demoOfflineMode) return;
    const session = getBackendSession();
    if (!session || !signedIn) return;
    return attachFriendRosterListener({
      session,
      acceptedFriendBackendUidsRef,
      onServerFriendBackendUidsChanged,
      addedFriendsFromRitualRef,
      setAddedFriendsFromRitual,
      setUnfriendedIds,
      setFriendLinksState,
      addUndirectedEdge,
      removeUndirectedEdge,
    });
  }, [
    demoOfflineMode,
    signedIn,
    getBackendSession,
    setAddedFriendsFromRitual,
    setUnfriendedIds,
    setFriendLinksState,
    addUndirectedEdge,
    removeUndirectedEdge,
    addedFriendsFromRitualRef,
  ]);
}
