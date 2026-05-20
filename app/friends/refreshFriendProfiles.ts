import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import { mergeProfilePictureUrl } from "../lib/profilePictureUrl";
import { dedupeFriendsByBackendUid } from "../lib/mergeFriendsCatalog";
import type { Friend } from "../domain/types";
import type { BackendSession } from "../messaging/types";

/**
 * Pulls `users.profilePictureUrl` for current friends and merges into local rows.
 * Callable path is the durable source for friend avatars (encryptedProfiles is additive).
 */
export async function refreshFriendProfilesFromServer(
  session: BackendSession,
  currentFriends: Friend[]
): Promise<Friend[]> {
  const friendUids = [
    ...new Set(
      currentFriends
        .map((f) => f.backendUid?.trim())
        .filter((uid): uid is string => !!uid?.startsWith("u_") && uid !== session.uid)
    ),
  ].slice(0, 200);
  if (friendUids.length === 0) return currentFriends;

  try {
    const res = await callEmulatorFunction<{
      profiles?: Record<
        string,
        { username?: string; bio?: string; profilePictureUrl?: string | null } | null
      >;
    }>("getUserProfiles", {
      uid: session.uid,
      deviceId: session.deviceId,
      targetUids: friendUids,
    });
    const profiles = res.profiles ?? {};
    const byBackendUid = new Map(
      currentFriends
        .map((f) => {
          const bu = f.backendUid?.trim();
          return bu?.startsWith("u_") ? ([bu, f] as const) : null;
        })
        .filter((x): x is readonly [string, Friend] => !!x)
    );

    const nextFriends: Friend[] = [];
    for (const uid of friendUids) {
      const prior = byBackendUid.get(uid);
      if (!prior) continue;
      const profile = profiles[uid];
      if (profile === null) {
        nextFriends.push(prior);
        continue;
      }
      const rawName = (profile?.username ?? "").trim();
      nextFriends.push({
        ...prior,
        displayName: rawName || prior.displayName,
        profilePictureUrl: mergeProfilePictureUrl(profile?.profilePictureUrl, prior.profilePictureUrl),
        bio: profile?.bio?.trim() ? profile.bio : prior.bio,
      });
    }

    for (const friend of currentFriends) {
      const bu = friend.backendUid?.trim();
      if (!bu?.startsWith("u_") || bu === session.uid) {
        nextFriends.push(friend);
        continue;
      }
      if (!friendUids.includes(bu)) {
        nextFriends.push(friend);
      }
    }

    return dedupeFriendsByBackendUid(nextFriends);
  } catch (err) {
    logAppError("friends.refresh_profiles", err, { uid: session.uid, count: friendUids.length });
    return currentFriends;
  }
}
