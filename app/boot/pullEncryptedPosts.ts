import { callEmulatorFunction, backendUidForFriendId } from "../../backendBridge";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import { mergeSyncedPosts, maxCreatedAtMs } from "../lib/mergeEncryptedSync";
import { yieldToUi } from "../lib/yieldToUi";
import {
  canonicalEncryptedPostId,
  mapDecryptedPostPlainToPost,
} from "../lib/tierBMedia/mapPostFromPlain";
import type { PostMediaPlainPayload } from "../lib/tierBMedia/postMedia";
import {
  ENCRYPTED_POSTS_FULL_SYNC_MS,
  ENCRYPTED_POSTS_HOME_FEED_LIMIT,
} from "../theme/preludeConstants";
import type { Post } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export type PullEncryptedPostsParams = {
  session: BackendSession;
  backendUidToFriendId: Record<string, string>;
  currentUserLocalId: string;
  postsWatermarkMsRef: { current: number };
  postsLastFullSyncAtRef: { current: number };
  suppressedPostIdsRef?: { current: ReadonlySet<string> };
  forceFull?: boolean;
  /** Page size for this pull (home feed default 10). */
  limit?: number;
};

export async function pullEncryptedPostsIncremental(
  params: PullEncryptedPostsParams,
  setPosts: (updater: (current: Post[]) => Post[]) => void
): Promise<{ decodedCount: number; hasMore: boolean }> {
  const { session, backendUidToFriendId, currentUserLocalId, postsWatermarkMsRef, postsLastFullSyncAtRef } =
    params;
  const now = Date.now();
  const pageLimit = params.limit ?? ENCRYPTED_POSTS_HOME_FEED_LIMIT;
  const fullSync =
    Boolean(params.forceFull) ||
    postsWatermarkMsRef.current <= 0 ||
    now - postsLastFullSyncAtRef.current > ENCRYPTED_POSTS_FULL_SYNC_MS;

  const request: {
    uid: string;
    deviceId: string;
    limit: number;
    sinceMs?: number;
  } = {
    uid: session.uid,
    deviceId: session.deviceId,
    limit: pageLimit,
  };
  if (!fullSync && postsWatermarkMsRef.current > 0) {
    request.sinceMs = Math.max(0, postsWatermarkMsRef.current - 5_000);
  }

  const res = await callEmulatorFunction<{
    items: Array<{
      postId: string;
      ownerUid: string;
      ciphertext: string;
      nonce: string;
      envelope: string;
      createdAtMs?: number;
    }>;
    reactionsByPostId?: Record<string, Record<string, string>>;
    incremental?: boolean;
    hasMore?: boolean;
  }>("listEncryptedPosts", request);

  if (!Array.isArray(res.items)) return { decodedCount: 0, hasMore: false };

  const decoded: Post[] = [];
  let decodeFailures = 0;
  let earliestFailureMs: number | null = null;
  for (const item of res.items) {
    try {
      const plain = await decryptPayloadForRecipient<
        PostMediaPlainPayload & {
          postId: string;
          authorUid?: string;
          createdAt?: number;
          text?: string | null;
        }
      >(session.uid, item.ciphertext, item.nonce, item.envelope);
      const authorUid =
        typeof plain.authorUid === "string" && plain.authorUid.trim()
          ? plain.authorUid.trim()
          : item.ownerUid;
      const friendAuthorId =
        authorUid === session.uid
          ? currentUserLocalId
          : backendUidToFriendId[authorUid] ?? backendUidForFriendId(authorUid);
      const serverReactions = res.reactionsByPostId?.[item.postId];
      const mappedReactions: Record<string, string> | undefined = serverReactions
        ? Object.fromEntries(
            Object.entries(serverReactions).map(([uid, emoji]) => [
              uid === session.uid ? currentUserLocalId : backendUidToFriendId[uid] ?? backendUidForFriendId(uid),
              emoji,
            ])
          )
        : undefined;
      const canonicalPostId = canonicalEncryptedPostId(item.postId, plain.postId);
      if (!canonicalPostId) continue;
      decoded.push(
        mapDecryptedPostPlainToPost({
          plain,
          postId: canonicalPostId,
          authorId: friendAuthorId,
          createdAtMs: item.createdAtMs ?? plain.createdAt ?? Date.now(),
          feedReactions: mappedReactions,
        })
      );
      await yieldToUi();
    } catch {
      decodeFailures += 1;
      const failMs = item.createdAtMs ?? 0;
      if (failMs > 0 && (earliestFailureMs == null || failMs < earliestFailureMs)) {
        earliestFailureMs = failMs;
      }
      /* decrypt failed — wrong/missing key */
    }
  }

  const incremental = Boolean(res.incremental);
  setPosts((current) =>
    mergeSyncedPosts(current, decoded, {
      incremental,
      optimisticWindowMs: 90_000,
      suppressedPostIds: params.suppressedPostIdsRef?.current,
    })
  );
  if (decoded.length > 0) {
    // Never advance the watermark past a post that failed to decrypt, or the
    // next pull would skip it permanently. Cap just below the earliest failure
    // so it is retried; otherwise advance to the newest decoded post.
    let candidate = maxCreatedAtMs(decoded);
    if (earliestFailureMs != null) {
      candidate = Math.min(candidate, earliestFailureMs - 1);
    }
    postsWatermarkMsRef.current = Math.max(postsWatermarkMsRef.current, candidate);
  }
  if (fullSync) {
    postsLastFullSyncAtRef.current = now;
  }
  return {
    decodedCount: decoded.length,
    hasMore: res.hasMore ?? decoded.length >= pageLimit,
  };
}
