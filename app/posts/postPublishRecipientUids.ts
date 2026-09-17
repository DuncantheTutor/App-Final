import type { Friend } from "../domain/types";

export function postPublishRecipientUids(params: {
  sessionUid: string;
  visibleFriendIds: string[];
  allFriends: Friend[];
  acceptedFriendBackendUids?: ReadonlySet<string>;
}): string[] {
  const { sessionUid, visibleFriendIds, allFriends, acceptedFriendBackendUids } = params;
  const fromRoster = visibleFriendIds
    .map((id) => allFriends.find((friend) => friend.id === id)?.backendUid?.trim())
    .filter((uid): uid is string => !!uid && uid.startsWith("u_") && uid !== sessionUid);
  const accepted = acceptedFriendBackendUids
    ? [...acceptedFriendBackendUids].filter((uid) => uid.startsWith("u_") && uid !== sessionUid)
    : [];
  const friendUids = accepted.length > 0 ? accepted : fromRoster;
  return [...new Set([sessionUid, ...friendUids])];
}
