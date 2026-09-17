import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { backendUidForFriendId, callEmulatorFunction } from "../../backendBridge";
import { publishActivePresence } from "../presence/heartbeat";
import type { Friend, PairingProximityEvidence } from "../domain/types";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import { ensureCameraForPairing } from "../lib/pairingCamera";
import {
  collectPrecisePairingProximityEvidence,
  ensurePreciseLocationForPairing,
  preciseLocationGateMessage,
} from "../lib/pairingLocation";
import type { BackendSession } from "../messaging/types";
import {
  ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS,
  DEMO_USER_A_QR_PIN,
  FRIENDS,
} from "../theme/preludeConstants";
import { registerPairOfferToken } from "./registerPairOffer";
import { resolvePairingSession } from "./resolvePairingSession";

export type PairingOfferStatus =
  | "pending"
  | "awaiting_redeemer_confirm"
  | "awaiting_issuer_confirm"
  | "joined"
  | "gone";

export type HydrateFriendByUid = (
  session: BackendSession,
  friendUid: string,
  opts?: { pairingPin?: string | null; previewOnly?: boolean }
) => Promise<Friend | null>;

export type PairingParentActions = {
  ensurePairingLocationPermission: (options?: { showAlerts?: boolean }) => Promise<boolean>;
  ensurePairingCameraPermission: (options?: { showAlerts?: boolean }) => Promise<boolean>;
  pairingRegisterPinWithRetryParent: () => Promise<string | null>;
  pairingAwaitPinRedeemParent: (pin: string) => Promise<Friend | null>;
  pairingConfirmPinReadParent: (pin: string) => Promise<Friend | null>;
  pairingConfirmRedeemerDualConfirmParent: (pin: string) => Promise<boolean>;
  pairingAwaitIssuerFinalConfirmParent: (pin: string) => Promise<Friend | null>;
  pairingFinalizePinOfferParent: (pin: string) => Promise<Friend | null>;
  pairingCancelPinOfferParent: (pin: string) => Promise<void>;
  pairingPollOfferStillPresentParent: (pin: string) => Promise<boolean>;
  pairingGetOfferStatusParent: (pin: string) => Promise<PairingOfferStatus>;
};

/**
 * Dual-confirm QR/NFC pairing callables used by AddFriendScreen.
 * Friend hydration and roster writes stay composed through MainApp.
 */
export function usePairingParentActions(params: {
  demoOfflineMode: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
  getBackendSession: () => BackendSession | null;
  waitForBackendSession: (maxMs?: number) => Promise<BackendSession | null>;
  hydrateFriendByUid: HydrateFriendByUid;
  acceptFriend: (friend: Friend, options?: { withLink?: boolean }) => void;
  syncServerAcceptedFriendBackendUids: (uids: Set<string>) => void;
  acceptedFriendBackendUidsRef: MutableRefObject<Set<string>>;
  demoPendingAddableQueue: string[];
  setDemoPendingAddableQueue: Dispatch<SetStateAction<string[]>>;
}): PairingParentActions {
  const {
    demoOfflineMode,
    sessionEmailRef,
    getBackendSession,
    waitForBackendSession,
    hydrateFriendByUid,
    acceptFriend,
    syncServerAcceptedFriendBackendUids,
    acceptedFriendBackendUidsRef,
    demoPendingAddableQueue,
    setDemoPendingAddableQueue,
  } = params;

  const collectPairingProximityEvidence = useCallback(
    (): Promise<PairingProximityEvidence> => collectPrecisePairingProximityEvidence(),
    []
  );

  const ensurePairingLocationPermission = useCallback(
    async (options?: { showAlerts?: boolean }): Promise<boolean> => {
      const gate = await ensurePreciseLocationForPairing({
        showAlerts: options?.showAlerts !== false,
      });
      return gate.ok;
    },
    []
  );

  const ensurePairingCameraPermission = useCallback(
    async (options?: { showAlerts?: boolean }): Promise<boolean> => {
      const gate = await ensureCameraForPairing({
        showAlerts: options?.showAlerts !== false,
      });
      return gate.ok;
    },
    []
  );

  const pairingRegisterPinWithRetryParent = useCallback(async (): Promise<string | null> => {
    if (demoOfflineMode) {
      const email = (sessionEmailRef.current ?? "").trim().toLowerCase();
      if (email === "usera@demo.local") return DEMO_USER_A_QR_PIN;
      let demoToken = "";
      for (let i = 0; i < 32; i++) demoToken += Math.floor(Math.random() * 16).toString(16);
      return demoToken;
    }
    const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
    if (!session) return null;
    const proximityEvidence = await collectPairingProximityEvidence();
    return registerPairOfferToken(session, proximityEvidence);
  }, [collectPairingProximityEvidence, demoOfflineMode, getBackendSession, sessionEmailRef, waitForBackendSession]);

  const pairingAwaitPinRedeemParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (demoOfflineMode) {
        await new Promise<void>((r) => setTimeout(r, 1200));
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        setDemoPendingAddableQueue((q) => q.slice(1));
        const friend = FRIENDS.find((f) => f.id === nextId) ?? null;
        if (!friend) return null;
        acceptFriend(friend);
        return friend;
      }
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return null;
      await new Promise<void>((r) => setTimeout(r, 450));
      const deadline = Date.now() + ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          const res = await callEmulatorFunction<{ status?: string; redeemerUid?: string | null }>(
            "getNfcPinPairOfferStatus",
            {
              uid: session.uid,
              deviceId: session.deviceId,
              pin: pin.trim(),
            }
          );
          if (
            (res.status === "awaiting_redeemer_confirm" || res.status === "awaiting_issuer_confirm") &&
            res.redeemerUid?.trim()
          ) {
            const redeemerUid = res.redeemerUid.trim();
            try {
              const hydrated = await hydrateFriendByUid(session, redeemerUid, {
                pairingPin: pin,
                previewOnly: true,
              });
              if (hydrated) return hydrated;
            } catch {
              /* keep polling while session is active; hydration may lag behind status update */
            }
          }
        } catch {
          /* Keep polling: undeployed function, network blips, cold start, or not-found race. */
        }
        await new Promise<void>((r) => setTimeout(r, 700));
      }
      return null;
    },
    [
      acceptFriend,
      demoOfflineMode,
      demoPendingAddableQueue,
      getBackendSession,
      hydrateFriendByUid,
      setDemoPendingAddableQueue,
      waitForBackendSession,
    ]
  );

  const pairingConfirmPinReadParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (demoOfflineMode) {
        const raw = pin.trim();
        if (raw === DEMO_USER_A_QR_PIN) {
          const friend: Friend = {
            id: "demo-user-a",
            backendUid: "demo-user-a",
            displayName: "User A",
            online: false,
            profilePictureUrl: "https://picsum.photos/seed/demo-user-a/400/400",
            bio: "Demo mode account A",
            messageCount: 0,
          };
          acceptFriend(friend);
          return friend;
        }
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        setDemoPendingAddableQueue((q) => q.slice(1));
        const friend = FRIENDS.find((f) => f.id === nextId) ?? null;
        if (!friend) return null;
        acceptFriend(friend);
        return friend;
      }
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return null;
      const locGate = await ensurePreciseLocationForPairing({ showAlerts: true });
      if (!locGate.ok) {
        throw new Error(preciseLocationGateMessage(locGate.reason));
      }
      const trimmedPin = pin.trim();
      const buildIssuerPreviewFriend = (
        issuerUid: string,
        username?: string,
        profilePictureUrl?: string | null
      ): Friend => ({
        id: backendUidForFriendId(issuerUid),
        backendUid: issuerUid,
        displayName: friendDisplayNameFromProfile(username, issuerUid),
        online: false,
        profilePictureUrl: profilePictureUrl || "",
        bio: "",
        messageCount: 0,
      });

      let previewFriend: Friend | null = null;
      try {
        const preview = await callEmulatorFunction<{
          issuerUid?: string;
          username?: string;
          profilePictureUrl?: string | null;
        }>("previewNfcPinPairOffer", {
          uid: session.uid,
          deviceId: session.deviceId,
          pin: trimmedPin,
        });
        const previewUid = preview.issuerUid?.trim() ?? "";
        if (previewUid) {
          previewFriend = buildIssuerPreviewFriend(
            previewUid,
            preview.username,
            preview.profilePictureUrl
          );
        }
      } catch {
        /* preview optional before phase-1 confirm */
      }

      const proximityEvidence = await collectPairingProximityEvidence();
      const res = await callEmulatorFunction<{ accepted?: boolean; friendUid?: string }>(
        "confirmNfcPinPairOffer",
        {
          uid: session.uid,
          deviceId: session.deviceId,
          pin: trimmedPin,
          proximityEvidence,
        }
      );
      const friendUid = res.friendUid?.trim() ?? previewFriend?.backendUid ?? "";
      if (!res.accepted || !friendUid) return null;

      const quickFriend =
        previewFriend?.backendUid === friendUid
          ? previewFriend
          : buildIssuerPreviewFriend(
              friendUid,
              previewFriend?.displayName,
              previewFriend?.profilePictureUrl
            );

      void hydrateFriendByUid(session, friendUid, {
        pairingPin: trimmedPin,
        previewOnly: true,
      }).catch(() => undefined);

      return quickFriend;
    },
    [
      acceptFriend,
      collectPairingProximityEvidence,
      demoOfflineMode,
      demoPendingAddableQueue,
      getBackendSession,
      hydrateFriendByUid,
      setDemoPendingAddableQueue,
      waitForBackendSession,
    ]
  );

  const pairingConfirmRedeemerDualConfirmParent = useCallback(
    async (pin: string): Promise<boolean> => {
      if (demoOfflineMode) return true;
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return false;
      const res = await callEmulatorFunction<{ accepted?: boolean }>("confirmRedeemerNfcPinPairOffer", {
        uid: session.uid,
        deviceId: session.deviceId,
        pin: pin.trim(),
      });
      return Boolean(res.accepted);
    },
    [demoOfflineMode, getBackendSession, waitForBackendSession]
  );

  const pairingAwaitIssuerFinalConfirmParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (demoOfflineMode) {
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        return FRIENDS.find((f) => f.id === nextId) ?? null;
      }
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return null;
      const deadline = Date.now() + ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          const res = await callEmulatorFunction<{ status?: string; issuerUid?: string | null }>(
            "getNfcPinPairOfferStatus",
            {
              uid: session.uid,
              deviceId: session.deviceId,
              pin: pin.trim(),
            }
          );
          if (res.status === "joined" && res.issuerUid?.trim()) {
            const issuerUid = res.issuerUid.trim();
            try {
              const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
                uid: session.uid,
                deviceId: session.deviceId,
              });
              if (!(friendsRes.friendUids ?? []).includes(issuerUid)) {
                continue;
              }
              syncServerAcceptedFriendBackendUids(
                new Set([...acceptedFriendBackendUidsRef.current, issuerUid])
              );
              const hydrated = await hydrateFriendByUid(session, issuerUid, { pairingPin: pin });
              if (hydrated) return hydrated;
            } catch {
              /* keep polling while session is active; hydration may lag behind status update */
            }
          }
        } catch {
          /* transient */
        }
        await new Promise<void>((r) => setTimeout(r, 700));
      }
      return null;
    },
    [
      acceptedFriendBackendUidsRef,
      demoOfflineMode,
      demoPendingAddableQueue,
      getBackendSession,
      hydrateFriendByUid,
      syncServerAcceptedFriendBackendUids,
      waitForBackendSession,
    ]
  );

  const pairingFinalizePinOfferParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (demoOfflineMode) {
        const session = getBackendSession();
        if (!session) return null;
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        setDemoPendingAddableQueue((q) => q.slice(1));
        const seed = FRIENDS.find((f) => f.id === nextId) ?? null;
        if (!seed) return null;
        const friend: Friend = { ...seed, online: false };
        acceptFriend(friend, { withLink: true });
        return friend;
      }
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return null;
      const deadline = Date.now() + ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS;
      let friendUid = "";
      while (Date.now() < deadline) {
        try {
          const res = await callEmulatorFunction<{ accepted?: boolean; friendUid?: string }>(
            "finalizeNfcPinPairOffer",
            {
              uid: session.uid,
              deviceId: session.deviceId,
              pin: pin.trim(),
            }
          );
          friendUid = res.friendUid?.trim() ?? "";
          if (res.accepted && friendUid) break;
        } catch (e: unknown) {
          const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
          if (msg.includes("waiting for your friend to confirm")) {
            await new Promise<void>((r) => setTimeout(r, 700));
            continue;
          }
          throw e instanceof Error ? e : new Error(String(e));
        }
        await new Promise<void>((r) => setTimeout(r, 700));
      }
      if (!friendUid) return null;
      const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
        uid: session.uid,
        deviceId: session.deviceId,
      });
      const onServer = (friendsRes.friendUids ?? []).includes(friendUid);
      if (!onServer) {
        throw new Error(
          "Friendship was not saved on the server. Delete collection nfcPinPairSessions in Firebase (stale pairing sessions), then pair again."
        );
      }
      syncServerAcceptedFriendBackendUids(
        new Set([...acceptedFriendBackendUidsRef.current, friendUid])
      );
      const hydrated = await hydrateFriendByUid(session, friendUid, { pairingPin: pin });
      void publishActivePresence(session, Date.now()).catch(() => undefined);
      return hydrated;
    },
    [
      acceptFriend,
      acceptedFriendBackendUidsRef,
      demoOfflineMode,
      demoPendingAddableQueue,
      getBackendSession,
      hydrateFriendByUid,
      setDemoPendingAddableQueue,
      syncServerAcceptedFriendBackendUids,
      waitForBackendSession,
    ]
  );

  const pairingCancelPinOfferParent = useCallback(
    async (pin: string): Promise<void> => {
      if (demoOfflineMode) return;
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return;
      try {
        await callEmulatorFunction("cancelNfcPinPairOffer", {
          uid: session.uid,
          deviceId: session.deviceId,
          pin: pin.trim(),
        });
      } catch {
        /* ignore */
      }
    },
    [demoOfflineMode, getBackendSession, waitForBackendSession]
  );

  const pairingPollOfferStillPresentParent = useCallback(
    async (pin: string): Promise<boolean> => {
      if (demoOfflineMode) return true;
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return false;
      try {
        await callEmulatorFunction("getNfcPinPairOfferStatus", {
          uid: session.uid,
          deviceId: session.deviceId,
          pin: pin.trim(),
        });
        return true;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
        if (msg.includes("not found") || msg.includes("not-found")) {
          return false;
        }
        return true;
      }
    },
    [demoOfflineMode, getBackendSession, waitForBackendSession]
  );

  const pairingGetOfferStatusParent = useCallback(
    async (pin: string): Promise<PairingOfferStatus> => {
      if (demoOfflineMode) return "awaiting_redeemer_confirm";
      const session = await resolvePairingSession(getBackendSession, waitForBackendSession);
      if (!session) return "gone";
      try {
        const res = await callEmulatorFunction<{ status?: string }>("getNfcPinPairOfferStatus", {
          uid: session.uid,
          deviceId: session.deviceId,
          pin: pin.trim(),
        });
        const status = res.status ?? "pending";
        if (
          status === "pending" ||
          status === "awaiting_redeemer_confirm" ||
          status === "awaiting_issuer_confirm" ||
          status === "joined"
        ) {
          return status;
        }
        return "pending";
      } catch {
        return "gone";
      }
    },
    [demoOfflineMode, getBackendSession, waitForBackendSession]
  );

  return {
    ensurePairingLocationPermission,
    ensurePairingCameraPermission,
    pairingRegisterPinWithRetryParent,
    pairingAwaitPinRedeemParent,
    pairingConfirmPinReadParent,
    pairingConfirmRedeemerDualConfirmParent,
    pairingAwaitIssuerFinalConfirmParent,
    pairingFinalizePinOfferParent,
    pairingCancelPinOfferParent,
    pairingPollOfferStillPresentParent,
    pairingGetOfferStatusParent,
  };
}
