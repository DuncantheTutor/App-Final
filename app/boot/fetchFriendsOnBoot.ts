import { backendUidForFriendId, callEmulatorFunction } from "../../backendBridge";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import { dedupeFriendsByBackendUid } from "../lib/mergeFriendsCatalog";
import { mergeProfileBio } from "../lib/mergeProfileBio";
import { mergeProfilePictureUrl } from "../lib/profilePictureUrl";
import type { Friend } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export async function fetchFriendsOnBoot(
  session: BackendSession,
  priorFriends: Friend[] = []
): Promise<Friend[]> {
  const priorByBackendUid = new Map<string, Friend>();
  for (const friend of priorFriends) {
    const bu = friend.backendUid?.trim();
    if (bu?.startsWith("u_")) priorByBackendUid.set(bu, friend);
  }
  let friendUids: string[] = [];
  try {
    const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
      uid: session.uid,
      deviceId: session.deviceId,
    });
    friendUids = (friendsRes.friendUids ?? []).filter((uid) => uid.startsWith("u_"));
  } catch {
    return dedupeFriendsByBackendUid(priorFriends);
  }
  if (friendUids.length === 0) {
    return dedupeFriendsByBackendUid(priorFriends);
  }

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
  const serverUids = new Set(friendUids);
  const fromServer = friendUids.map((uid) => {
    const profile = profiles[uid] ?? {};
    const prior = priorByBackendUid.get(uid);
    return {
      id: backendUidForFriendId(uid),
      backendUid: uid,
      displayName: friendDisplayNameFromProfile(profile?.username ?? prior?.displayName, uid),
      online: prior?.online ?? false,
      profilePictureUrl: mergeProfilePictureUrl(
        profile?.profilePictureUrl,
        prior?.profilePictureUrl
      ),
      bio: mergeProfileBio(profile?.bio, prior?.bio),
      messageCount: prior?.messageCount ?? 0,
    };
  });
  const localOnly = priorFriends.filter((f) => {
    const bu = f.backendUid?.trim();
    return bu?.startsWith("u_") && bu !== session.uid && !serverUids.has(bu);
  });
  return dedupeFriendsByBackendUid([...fromServer, ...localOnly]);
}
