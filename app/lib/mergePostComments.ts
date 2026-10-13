import type { PostComment, PostCommentThreadMessage } from "../domain/types";

/** Shown when a sealed comment cannot be opened on this phone. */
export const PRIVATE_THREAD_UNREADABLE = "Couldn't open this comment.";

function commentFingerprint(authorId: string, text: string): string {
  return `${authorId}:${text.trim().toLowerCase()}`;
}

function takeMatchingText(
  pending: Array<{ id: string; authorId: string; text: string }>,
  authorId: string,
  text: string
): string {
  if (text.trim() !== PRIVATE_THREAD_UNREADABLE) return text;
  const idx = pending.findIndex((row) => row.authorId === authorId);
  if (idx < 0) return text;
  const [kept] = pending.splice(idx, 1);
  return kept.text;
}

/** Keep optimistic rows until the server thread includes the same author/text. */
export function mergeHydratedPostComments(
  existing: PostComment[] | undefined,
  fromServer: PostComment[]
): PostComment[] {
  const pendingTop = (existing ?? []).filter((comment) => comment.id.startsWith("opt_"));
  const pendingReplies = new Map<string, PostCommentThreadMessage[]>();
  for (const comment of existing ?? []) {
    const replies = (comment.thread ?? []).filter((entry) => entry.id.startsWith("opt_"));
    if (replies.length > 0) pendingReplies.set(comment.id, [...replies]);
  }

  const server = fromServer.map((comment) => {
    const text = takeMatchingText(pendingTop, comment.authorId, comment.text);
    const replies = pendingReplies.get(comment.id) ?? [];
    const thread = (comment.thread ?? []).map((entry) => ({
      ...entry,
      text: takeMatchingText(replies, entry.authorId, entry.text),
    }));
    const serverKeys = new Set(
      thread.map((entry) => commentFingerprint(entry.authorId, entry.text))
    );
    const stillPending = replies.filter(
      (entry) => !serverKeys.has(commentFingerprint(entry.authorId, entry.text))
    );
    return {
      ...comment,
      text,
      thread: [...thread, ...stillPending],
    };
  });

  const serverKeys = new Set(
    server.flatMap((comment) => [
      commentFingerprint(comment.authorId, comment.text),
      ...(comment.thread ?? []).map((entry) => commentFingerprint(entry.authorId, entry.text)),
    ])
  );
  const keptPending = pendingTop.filter(
    (comment) => !serverKeys.has(commentFingerprint(comment.authorId, comment.text))
  );
  return [...server, ...keptPending];
}
