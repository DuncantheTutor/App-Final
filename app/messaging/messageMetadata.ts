import { CURRENT_USER_LOCAL_ID } from "../friends/roster";
import type { Message } from "../domain/types";

export type MessageDocMetadata = {
  reactions?: Record<string, string>;
  editedAt?: number | null;
  unsentAt?: number | null;
};

/** Map server reaction keys (`u_*`) to local roster ids (`me` / `f_*`). */
/** Prefer incoming (server) reaction keys when both sides have data. */
export function mergeMessageReactions(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!incoming || Object.keys(incoming).length === 0) return existing;
  if (!existing || Object.keys(existing).length === 0) return incoming;
  return { ...existing, ...incoming };
}

export function mapServerReactionsToLocal(
  reactions: Record<string, string> | undefined,
  sessionAppUid: string,
  uidToFriendId: Record<string, string>
): Record<string, string> | undefined {
  if (!reactions || typeof reactions !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [uid, emoji] of Object.entries(reactions)) {
    const trimmed = String(emoji ?? "").trim();
    if (!trimmed) continue;
    if (uid === sessionAppUid) {
      out[CURRENT_USER_LOCAL_ID] = trimmed;
      continue;
    }
    const friendId = uidToFriendId[uid];
    if (friendId) out[friendId] = trimmed;
    else if (uid.startsWith("f_")) out[uid] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function applyMetadataPatchesToMessages(
  messages: Message[],
  patches: Array<{ messageId: string; doc: MessageDocMetadata }>,
  sessionAppUid: string,
  uidToFriendId: Record<string, string>
): Message[] {
  if (patches.length === 0) return messages;
  const byId = new Map(patches.map((p) => [p.messageId, p.doc]));
  return messages.map((m) => {
    const doc = byId.get(m.id);
    if (!doc) return m;
    return overlayMessageDocMetadata(m, doc, sessionAppUid, uidToFriendId);
  });
}

export function overlayMessageDocMetadata<T extends { reactions?: Record<string, string>; editedAt?: number; unsentAt?: number }>(
  message: T,
  doc: MessageDocMetadata,
  sessionAppUid: string,
  uidToFriendId: Record<string, string>
): T {
  const reactions = mapServerReactionsToLocal(doc.reactions, sessionAppUid, uidToFriendId);
  const editedAt =
    doc.editedAt != null && Number.isFinite(Number(doc.editedAt)) ? Number(doc.editedAt) : undefined;
  const unsentAt =
    doc.unsentAt != null && Number.isFinite(Number(doc.unsentAt)) ? Number(doc.unsentAt) : undefined;
  return {
    ...message,
    ...(reactions !== undefined ? { reactions } : {}),
    ...(editedAt !== undefined ? { editedAt } : {}),
    ...(unsentAt !== undefined
      ? { unsentAt, text: "", mediaUri: undefined, durationSec: undefined }
      : {}),
  };
}
