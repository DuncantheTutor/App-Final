import { backendUidForFriendId, callEmulatorFunction } from "../../backendBridge";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import { dedupeFriendsByBackendUid } from "../lib/mergeFriendsCatalog";
import { normalizeHttpsProfilePictureUrl } from "../lib/profilePictureUrl";
import type { Friend } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export async function fetchFriendsOnBoot(session: BackendSession): Promise<Friend[]> {
  const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
    uid: session.uid,
    deviceId: session.deviceId,
  });
  const friendUids = (friendsRes.friendUids ?? []).filter((uid) => uid.startsWith("u_"));
  if (friendUids.length === 0) return [];

  const profilesRes = await callEmulatorFunction<{
    profiles?: Record<
      string,
      { username?: string; bio?: string; profilePictureUrl?: string | null } | null
    >;
  }>("getUserProfiles", {
    uid: session.uid,
    deviceId: session.deviceId,
    targetUids: friendUids,
  });

  const profiles = profilesRes.profiles ?? {};
  return dedupeFriendsByBackendUid(
    friendUids.map((uid) => {
      const profile = profiles[uid] ?? {};
      return {
        id: backendUidForFriendId(uid),
        backendUid: uid,
        displayName: friendDisplayNameFromProfile(profile?.username, uid),
        online: false,
        profilePictureUrl: normalizeHttpsProfilePictureUrl(profile?.profilePictureUrl),
        bio: profile?.bio || "",
        messageCount: 0,
      };
    })
  );
}
