import { useMemo } from "react";

import type { Friend } from "../domain/types";
import { friendsForFriendsList } from "../lib/mergeFriendsCatalog";

/** Alphabetical friends list, narrowed by the search box. */
export function useFriendsListSearch(params: {
  allFriends: Friend[];
  unfriendedIds: string[];
  friendsListSearch: string;
}): Friend[] {
  const { allFriends, unfriendedIds, friendsListSearch } = params;

  const allFriendsSortedAlphabetically = useMemo(
    () =>
      friendsForFriendsList(allFriends, unfriendedIds)
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [unfriendedIds, allFriends]
  );

  return useMemo(() => {
    const q = friendsListSearch.trim().toLowerCase();
    if (!q) return allFriendsSortedAlphabetically;
    return allFriendsSortedAlphabetically.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [allFriendsSortedAlphabetically, friendsListSearch]);
}
