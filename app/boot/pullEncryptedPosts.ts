import { callEmulatorFunction, backendUidForFriendId } from "../../backendBridge";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import { mergeSyncedPosts, maxCreatedAtMs } from "../lib/mergeEncryptedSync";
import { ENCRYPTED_POSTS_SYNC_LIMIT } from "../theme/preludeConstants";
import type { Post } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export type PullEncryptedPostsParams = {
  session: BackendSession;
  backendUidToFriendId: Record<string, string>;
  currentUserLocalId: string;
  postsWatermarkMsRef: { current: number };
  postsLastFullSyncAtRef: { current: number };
  forceFull?: boolean;
};

export async function pullEncryptedPostsIncremental(
  params: PullEncryptedPostsParams,
  setPosts: (updater: (current: Post[]) => Post[]) => void
): Promise<{ decodedCount: number; hasMore: boolean }> {
  const { session, backendUidToFriendId, currentUserLocalId, postsWatermarkMsRef, postsLastFullSyncAtRef } =
    params;
  const now = Date.now();
  const fullSync =
    Boolean(params.forceFull) ||
    postsWatermarkMsRef.current <= 0 ||
    now - postsLastFullSyncAtRef.current > 6 * 60 * 60 * 1000;

  const request: {
    uid: string;
    deviceId: string;
    limit: number;
    sinceMs?: number;
  } = {
    uid: session.uid,
    deviceId: session.deviceId,
    limit: ENCRYPTED_POSTS_SYNC_LIMIT,
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
  for (const item of res.items) {
    try {
      const plain = await decryptPayloadForRecipient<{
        postId: string;
        authorUid?: string;
        createdAt?: number;
        text?: string | null;
        imageUris?: string[] | null;
        videoUri?: string | null;
        videoPosterUri?: string | null;
      }>(session.uid, item.ciphertext, item.nonce, item.envelope);
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
      decoded.push({
        id: item.postId,
        authorId: friendAuthorId,
        createdAt: item.createdAtMs ?? plain.createdAt ?? Date.now(),
        text: plain.text ?? undefined,
        imageUris: plain.imageUris ?? undefined,
        videoUri: plain.videoUri ?? undefined,
        videoPosterUri: plain.videoPosterUri ?? undefined,
        feedReactions: mappedReactions,
      });
    } catch {
      decodeFailures += 1;
      /* decrypt failed — wrong/missing key */
    }
  }

  const incremental = Boolean(res.incremental);
  setPosts((current) => mergeSyncedPosts(current, decoded, { incremental, optimisticWindowMs: 90_000 }));
  if (decoded.length > 0 && decodeFailures === 0) {
    postsWatermarkMsRef.current = Math.max(postsWatermarkMsRef.current, maxCreatedAtMs(decoded));
  }
  if (fullSync) {
    postsLastFullSyncAtRef.current = now;
  }
  return {
    decodedCount: decoded.length,
    hasMore: res.hasMore ?? decoded.length >= ENCRYPTED_POSTS_SYNC_LIMIT,
  };
}
