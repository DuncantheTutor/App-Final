/** Returns the first pair that is not friends, or null when every pair is friends. */
export function firstNonFriendPair(
  participantUids: string[],
  areFriends: (a: string, b: string) => boolean
): [string, string] | null {
  const unique = [...new Set(participantUids.map((id) => id.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      if (!areFriends(unique[i], unique[j])) return [unique[i], unique[j]];
    }
  }
  return null;
}
