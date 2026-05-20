import type { Chat } from "../domain/types";

export const CURRENT_USER_LOCAL_ID = "me";

/** Map server `memberJoinedAt` (app uid keys) to client chat keys (`me`, `f_*`). */
export function normalizeMemberJoinedAtForClient(
  serverMap: Record<string, number> | undefined,
  sessionAppUid: string,
  memberIds: string[],
  friendIdToBackendUid: Record<string, string>
): Record<string, number> | undefined {
  if (!serverMap || Object.keys(serverMap).length === 0) return undefined;
  const out: Record<string, number> = {};
  for (const [key, ts] of Object.entries(serverMap)) {
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (key === sessionAppUid) {
      out[CURRENT_USER_LOCAL_ID] = ts;
      continue;
    }
    const friendId = memberIds.find((id) => {
      if (id === CURRENT_USER_LOCAL_ID) return false;
      if (id.trim() === key) return true;
      if (id.trim().startsWith("u_") && id.trim() === key) return true;
      const backendUid = friendIdToBackendUid[id]?.trim();
      if (backendUid && backendUid === key) return true;
      return false;
    });
    out[friendId ?? key] = ts;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Join cutoff for the signed-in viewer (supports legacy client keys + server uid keys). */
export function joinCutoffMsForViewer(
  chat: Chat | null | undefined,
  sessionAppUid: string | null | undefined
): number {
  if (!chat?.memberJoinedAt) return 0;
  const local = chat.memberJoinedAt[CURRENT_USER_LOCAL_ID];
  if (typeof local === "number" && Number.isFinite(local)) return local;
  if (sessionAppUid) {
    const server = chat.memberJoinedAt[sessionAppUid];
    if (typeof server === "number" && Number.isFinite(server)) return server;
  }
  return 0;
}
