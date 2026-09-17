import { backendUidForFriendId } from "../../backendBridge";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import type { Post } from "../domain/types";
import { yieldToUi } from "../lib/yieldToUi";
import {
  canonicalEncryptedPostId,
  mapDecryptedPostPlainToPost,
} from "../lib/tierBMedia/mapPostFromPlain";
import type { PostMediaPlainPayload } from "../lib/tierBMedia/postMedia";

export type EncryptedPostPullItem = {
  postId: string;
  ownerUid: string;
  ciphertext: string;
  nonce: string;
  envelope: string;
  createdAtMs?: number;
};

export type DecodeEncryptedPostsResult = {
  decoded: Post[];
  decodeFailures: number;
  earliestFailureMs: number | null;
};

export async function decodeEncryptedPostPullItems(params: {
  sessionUid: string;
  items: EncryptedPostPullItem[];
  backendUidToFriendId: Record<string, string>;
  currentUserLocalId: string;
  reactionsByPostId?: Record<string, Record<string, string>>;
  yieldEach?: boolean;
}): Promise<DecodeEncryptedPostsResult> {
  const decoded: Post[] = [];
  let decodeFailures = 0;
  let earliestFailureMs: number | null = null;

  for (const item of params.items) {
    try {
      const plain = await decryptPayloadForRecipient<
        PostMediaPlainPayload & {
          postId: string;
          authorUid?: string;
          createdAt?: number;
          text?: string | null;
        }
      >(params.sessionUid, item.ciphertext, item.nonce, item.envelope);
      const authorUid =
        typeof plain.authorUid === "string" && plain.authorUid.trim()
          ? plain.authorUid.trim()
          : item.ownerUid;
      const friendAuthorId =
        authorUid === params.sessionUid
          ? params.currentUserLocalId
          : params.backendUidToFriendId[authorUid] ?? backendUidForFriendId(authorUid);
      const serverReactions = params.reactionsByPostId?.[item.postId];
      const mappedReactions: Record<string, string> | undefined = serverReactions
        ? Object.fromEntries(
            Object.entries(serverReactions).map(([uid, emoji]) => [
              uid === params.sessionUid
                ? params.currentUserLocalId
                : params.backendUidToFriendId[uid] ?? backendUidForFriendId(uid),
              emoji,
            ])
          )
        : undefined;
      const canonicalPostId = canonicalEncryptedPostId(item.postId, plain.postId);
      if (!canonicalPostId) continue;
      decoded.push(
        mapDecryptedPostPlainToPost({
          plain: { ...plain, postId: canonicalPostId },
          postId: canonicalPostId,
          authorId: friendAuthorId,
          createdAtMs: item.createdAtMs ?? plain.createdAt ?? Date.now(),
          feedReactions: mappedReactions,
        })
      );
      if (params.yieldEach) await yieldToUi();
    } catch {
      decodeFailures += 1;
      const failMs = item.createdAtMs ?? 0;
      if (failMs > 0 && (earliestFailureMs == null || failMs < earliestFailureMs)) {
        earliestFailureMs = failMs;
      }
    }
  }

  return { decoded, decodeFailures, earliestFailureMs };
}
