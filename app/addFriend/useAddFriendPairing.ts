import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { Friend } from "../domain/types";
import { useHydrateFriendByUid } from "../friends/hydrateFriendByUid";
import type { BackendSession } from "../messaging/types";
import { DEMO_OFFLINE_MODE } from "../theme/preludeConstants";
import { usePairingParentActions } from "./usePairingParentActions";

type AddFriendPairingDeps = {
  sessionEmailRef: MutableRefObject<string | null>;
  getBackendSession: () => BackendSession | null;
  waitForBackendSession: (maxMs?: number) => Promise<BackendSession | null>;
  acceptFriend: (friend: Friend, options?: { withLink?: boolean }) => void;
  syncServerAcceptedFriendBackendUids: (uids: Set<string>) => void;
  acceptedFriendBackendUidsRef: MutableRefObject<Set<string>>;
  persistSocialMessagingNow: () => void;
  demoPendingAddableQueue: string[];
  setDemoPendingAddableQueue: Dispatch<SetStateAction<string[]>>;
};

/**
 * Wires friend hydration to the dual-confirm pairing callables.
 * MainApp passes roster writers; this hook owns the composition.
 */
export function useAddFriendPairing(deps: AddFriendPairingDeps) {
  const {
    sessionEmailRef,
    getBackendSession,
    waitForBackendSession,
    acceptFriend,
    syncServerAcceptedFriendBackendUids,
    acceptedFriendBackendUidsRef,
    persistSocialMessagingNow,
    demoPendingAddableQueue,
    setDemoPendingAddableQueue,
  } = deps;

  const hydrateFriendByUid = useHydrateFriendByUid({
    acceptFriend,
    syncServerAcceptedFriendBackendUids,
    acceptedFriendBackendUidsRef,
    persistSocialMessagingNow,
  });

  return usePairingParentActions({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    sessionEmailRef,
    getBackendSession,
    waitForBackendSession,
    hydrateFriendByUid,
    acceptFriend,
    syncServerAcceptedFriendBackendUids,
    acceptedFriendBackendUidsRef,
    demoPendingAddableQueue,
    setDemoPendingAddableQueue,
  });
}
