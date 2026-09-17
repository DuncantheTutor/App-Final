import { callEmulatorFunction } from "../../backendBridge";
import { mergeSyncedPosts, maxCreatedAtMs } from "../lib/mergeEncryptedSync";
import {
  ENCRYPTED_POSTS_FULL_SYNC_MS,
  ENCRYPTED_POSTS_HOME_FEED_LIMIT,
} from "../theme/preludeConstants";
import type { Post } from "../domain/types";
import type { BackendSession } from "../messaging/types";
import { decodeEncryptedPostPullItems } from "../feed/decodePostBatch";

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

  const { decoded, earliestFailureMs } = await decodeEncryptedPostPullItems({
    sessionUid: session.uid,
    items: res.items,
    backendUidToFriendId,
    currentUserLocalId,
    reactionsByPostId: res.reactionsByPostId,
    yieldEach: true,
  });

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
