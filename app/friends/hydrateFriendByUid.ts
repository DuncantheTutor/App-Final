import { useCallback, type MutableRefObject } from "react";

import { backendUidForFriendId, callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { logAppError } from "../../telemetry";
import type { Friend } from "../domain/types";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import { registerPushTokenWithBackend } from "../lib/pushNotifications";
import type { BackendSession } from "../messaging/types";
import { publishActivePresence } from "../presence/heartbeat";

type HydrateFriendDeps = {
  acceptFriend: (friend: Friend, options?: { withLink?: boolean }) => void;
  syncServerAcceptedFriendBackendUids: (uids: Set<string>) => void;
  acceptedFriendBackendUidsRef: MutableRefObject<Set<string>>;
  persistSocialMessagingNow: () => void;
};

/**
 * Load a friend profile for a server uid and, unless preview-only, accept them
 * when the server roster already includes that uid.
 */
export function useHydrateFriendByUid({
  acceptFriend,
  syncServerAcceptedFriendBackendUids,
  acceptedFriendBackendUidsRef,
  persistSocialMessagingNow,
}: HydrateFriendDeps) {
  return useCallback(
    async (
      session: BackendSession,
      friendUid: string,
      opts?: { pairingPin?: string | null; previewOnly?: boolean }
    ): Promise<Friend | null> => {
      const offerId = (opts?.pairingPin?.trim() ?? "").replace(/\s+/g, "");
      const pairingProfileArg =
        /^\d{4}$/.test(offerId) || /^[0-9a-f]{32}$/i.test(offerId)
          ? { pairingPin: offerId.toLowerCase(), pairingToken: offerId.toLowerCase() }
          : {};
      const profiles = await callEmulatorFunction<{
        profiles?: Record<string, { username?: string; bio?: string; profilePictureUrl?: string | null } | null>;
      }>("getUserProfiles", {
        uid: session.uid,
        deviceId: session.deviceId,
        targetUids: [friendUid],
        ...pairingProfileArg,
      });
      const profile = profiles.profiles?.[friendUid] ?? {};
      const friend: Friend = {
        id: backendUidForFriendId(friendUid),
        backendUid: friendUid,
        displayName: friendDisplayNameFromProfile(profile?.username, friendUid),
        online: false,
        profilePictureUrl: profile?.profilePictureUrl || "",
        bio: profile?.bio || "",
        messageCount: 0,
      };
      if (!opts?.previewOnly) {
        const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
          uid: session.uid,
          deviceId: session.deviceId,
        });
        if (!(friendsRes.friendUids ?? []).includes(friendUid)) {
          return friend;
        }
        acceptFriend(friend, { withLink: true });
        syncServerAcceptedFriendBackendUids(
          new Set([...acceptedFriendBackendUidsRef.current, friendUid])
        );
        persistSocialMessagingNow();
        const firebaseAuthUid = firebaseAuth.currentUser?.uid?.trim();
        if (firebaseAuthUid) {
          try {
            await callEmulatorFunction("registerFirebaseAuthUid", {
              uid: session.uid,
              deviceId: session.deviceId,
              firebaseAuthUid,
            });
          } catch (err) {
            logAppError("friends.hydrate.register_firebase_uid", err, { friendUid });
          }
        }
        void registerPushTokenWithBackend(session).catch((err) => {
          logAppError("friends.hydrate.push_token", err, { friendUid });
        });
        void publishActivePresence(session, Date.now()).catch(() => undefined);
      }
      return friend;
    },
    [acceptFriend, syncServerAcceptedFriendBackendUids, acceptedFriendBackendUidsRef, persistSocialMessagingNow]
  );
}
