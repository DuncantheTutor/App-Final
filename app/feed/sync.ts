import {
  collection,
  doc as firestoreDoc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  where,
} from "firebase/firestore";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { backendUidForFriendId } from "../../backendBridge";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import { firebaseAuth, getFirestoreDb } from "../../firebaseAuthClient";
import type { Post } from "../domain/types";
import { mapServerPostReactionsToFeed } from "../lib/mapPostFeedReactions";
import { maxCreatedAtMs, mergeSyncedPosts } from "../lib/mergeEncryptedSync";
import { mapDecryptedPostPlainToPost } from "../lib/tierBMedia/mapPostFromPlain";
import type { PostMediaPlainPayload } from "../lib/tierBMedia/postMedia";
import { yieldToUi } from "../lib/yieldToUi";
import type { BackendSession, EncryptedSyncStateBundle } from "../messaging/types";
import { CURRENT_USER_ID, ENCRYPTED_POSTS_LISTENER_LIMIT } from "../theme/preludeConstants";

export function attachEncryptedPostsListener(params: {
  session: BackendSession;
  backendUidToFriendId: Record<string, string>;
  postsWatermarkMsRef: MutableRefObject<number>;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
  persistWatermarksNow: () => void;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncStateBundle>>;
}): () => void {
  const {
    session,
    backendUidToFriendId,
    postsWatermarkMsRef,
    deletedPostIdsRef,
    persistWatermarksNow,
    setPosts,
    setEncryptedSyncState,
  } = params;

  const firebaseAuthUid = firebaseAuth.currentUser?.uid;
  if (!firebaseAuthUid) return () => {};

  let cancelled = false;
  const db = getFirestoreDb();
  const q = firestoreQuery(
    collection(db, "encryptedPosts"),
    where("recipientAuthUids", "array-contains", firebaseAuthUid),
    orderBy("createdAt", "desc"),
    firestoreLimit(ENCRYPTED_POSTS_LISTENER_LIMIT)
  );

  const unsubscribe = onSnapshot(
    q,
    async (snap) => {
      if (cancelled) return;

      const removedIds: string[] = [];
      for (const change of snap.docChanges()) {
        if (change.type === "removed") {
          const removedId = change.doc.id;
          const data = change.doc.data() as { postId?: string };
          removedIds.push(data.postId || removedId);
        }
      }
      if (removedIds.length > 0) {
        const removedSet = new Set(removedIds);
        setPosts((current) => {
          const next = current.filter((p) => !removedSet.has(p.id));
          return next.length === current.length ? current : next;
        });
      }

      const decoded: Post[] = [];
      let postDecodeFailures = 0;
      for (const doc of snap.docs) {
        const data = doc.data() as {
          postId?: string;
          ownerUid?: string;
          envelopes?: Record<string, string>;
          ciphertext?: string;
          nonce?: string;
          createdAt?: { toMillis?: () => number } | number | null;
        };
        const envelope = data.envelopes?.[session.uid];
        if (!envelope || !data.ciphertext || !data.nonce || !data.ownerUid) continue;
        const createdAtMs =
          typeof data.createdAt === "number"
            ? data.createdAt
            : typeof data.createdAt === "object" &&
                data.createdAt &&
                typeof (data.createdAt as { toMillis?: () => number }).toMillis === "function"
              ? (data.createdAt as { toMillis: () => number }).toMillis()
              : Date.now();
        if (createdAtMs > 0 && createdAtMs <= postsWatermarkMsRef.current - 5_000) {
          continue;
        }
        try {
          const plain = await decryptPayloadForRecipient<
            PostMediaPlainPayload & {
              postId: string;
              authorId?: string;
              authorUid?: string;
              createdAt?: number;
              text?: string | null;
            }
          >(session.uid, data.ciphertext, data.nonce, envelope);
          const authorUid =
            typeof plain.authorUid === "string" && plain.authorUid.trim()
              ? plain.authorUid.trim()
              : data.ownerUid;
          decoded.push(
            mapDecryptedPostPlainToPost({
              plain: { ...plain, postId: data.postId || doc.id },
              postId: data.postId || doc.id,
              authorId:
                authorUid === session.uid
                  ? CURRENT_USER_ID
                  : backendUidToFriendId[authorUid] ?? backendUidForFriendId(authorUid),
              createdAtMs: createdAtMs || plain.createdAt || Date.now(),
            })
          );
          await yieldToUi();
        } catch {
          postDecodeFailures += 1;
        }
      }

      if (cancelled) return;
      if (decoded.length > 0) {
        setPosts((current) =>
          mergeSyncedPosts(current, decoded, {
            incremental: true,
            optimisticWindowMs: 90_000,
            suppressedPostIds: deletedPostIdsRef.current,
          })
        );
        if (postDecodeFailures === 0) {
          postsWatermarkMsRef.current = Math.max(
            postsWatermarkMsRef.current,
            maxCreatedAtMs(decoded)
          );
          persistWatermarksNow();
        }
      }
      setEncryptedSyncState((current) => ({
        ...current,
        posts: "ok",
        lastSuccessAt: Date.now(),
      }));
    },
    () => {
      if (cancelled) return;
      setEncryptedSyncState((current) => ({ ...current, posts: "error" }));
    }
  );

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

/** Realtime reaction pills; post ciphertext snapshots do not include these docs. */
export function attachEncryptedPostReactionsListeners(params: {
  sessionUid: string;
  postIds: string[];
  backendUidToFriendId: Record<string, string>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
}): () => void {
  const { sessionUid, postIds, backendUidToFriendId, setPosts } = params;
  if (postIds.length === 0) return () => {};

  const db = getFirestoreDb();
  const friendMapSnapshot = { ...backendUidToFriendId };
  const unsubs = postIds.map((postId) =>
    onSnapshot(firestoreDoc(db, "encryptedPostReactions", postId), (snap) => {
      const serverReactions = snap.exists()
        ? ((snap.data()?.reactions ?? {}) as Record<string, string>)
        : {};
      const feedReactions = mapServerPostReactionsToFeed(
        serverReactions,
        sessionUid,
        friendMapSnapshot
      );
      setPosts((current) => {
        const idx = current.findIndex((p) => p.id === postId);
        if (idx < 0) return current;
        const existing = current[idx]!;
        const prevRx = existing.feedReactions ?? {};
        const same =
          Object.keys(prevRx).length === Object.keys(feedReactions).length &&
          Object.entries(feedReactions).every(([k, v]) => prevRx[k] === v);
        if (same) return current;
        const next = [...current];
        next[idx] = { ...existing, feedReactions };
        return next;
      });
    })
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
