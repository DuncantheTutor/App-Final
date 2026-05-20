import type { PostComment } from "../domain/types";

function commentFingerprint(comment: PostComment): string {
  return `${comment.authorId}:${comment.text.trim().toLowerCase()}`;
}

/** Keep optimistic rows until the server thread includes the same author/text. */
export function mergeHydratedPostComments(
  existing: PostComment[] | undefined,
  fromServer: PostComment[]
): PostComment[] {
  const pending = (existing ?? []).filter((c) => c.id.startsWith("opt_"));
  if (pending.length === 0) return fromServer;
  const serverKeys = new Set(
    fromServer.flatMap((c) => [
      commentFingerprint(c),
      ...(c.thread ?? []).map((entry) => `${entry.authorId}:${entry.text.trim().toLowerCase()}`),
    ])
  );
  const keptPending = pending.filter((c) => !serverKeys.has(commentFingerprint(c)));
  return [...fromServer, ...keptPending];
}
