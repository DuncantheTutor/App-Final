import type { Friend } from "../domain/types";

export type StartChatComposerMode = "standard" | "broadcast";

/**
 * Start Chat modal rows: selected members stay pinned; search filters the rest.
 * Standard mode also requires a mutual-friendship link to everyone already selected.
 */
export function availableStartChatFriends(params: {
  allFriends: Friend[];
  unfriendedIds: readonly string[];
  selectedComposerIds: readonly string[];
  composerSearch: string;
  composerMode: StartChatComposerMode;
  friendLinksState: Record<string, string[]>;
}): Friend[] {
  const {
    allFriends,
    unfriendedIds,
    selectedComposerIds,
    composerSearch,
    composerMode,
    friendLinksState,
  } = params;
  const base = allFriends.filter((f) => !unfriendedIds.includes(f.id));
  const q = composerSearch.trim().toLowerCase();
  const nameMatches = (f: Friend) => !q || f.displayName.toLowerCase().includes(q);

  const selectedRows = selectedComposerIds
    .map((id) => base.find((f) => f.id === id))
    .filter((f): f is Friend => !!f);

  const linkedToAllSelected = (candidateId: string, selection: readonly string[]) => {
    if (selection.length === 0) return true;
    return selection.every((sid) => (friendLinksState[sid] ?? []).includes(candidateId));
  };

  if (composerMode === "broadcast") {
    const rest = base
      .filter((f) => !selectedComposerIds.includes(f.id))
      .filter(nameMatches)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return [...selectedRows, ...rest];
  }

  const rest = base
    .filter((f) => !selectedComposerIds.includes(f.id))
    .filter((f) => linkedToAllSelected(f.id, selectedComposerIds))
    .filter(nameMatches)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return [...selectedRows, ...rest];
}
