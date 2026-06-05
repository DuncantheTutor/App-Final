import { backendUidForFriendId } from "../../backendBridge";
import { CURRENT_USER_ID } from "../theme/preludeConstants";

/** Map `encryptedPostReactions` app uids to local friend ids for feed UI. */
export function mapServerPostReactionsToFeed(
  reactions: Record<string, string> | undefined,
  sessionAppUid: string,
  backendUidToFriendId: Record<string, string>
): Record<string, string> {
  if (!reactions) return {};
  const mapped: Record<string, string> = {};
  for (const [uid, emoji] of Object.entries(reactions)) {
    const trimmed = String(emoji ?? "").trim();
    if (!trimmed) continue;
    const localId =
      uid === sessionAppUid ? CURRENT_USER_ID : backendUidToFriendId[uid] ?? backendUidForFriendId(uid);
    mapped[localId] = trimmed;
  }
  return mapped;
}
