import { callEmulatorFunction } from "../../backendBridge";
import { decryptPayloadForRecipient, encryptPayloadForRecipients } from "../../e2eeCrypto";
import { logAppError } from "../../telemetry";
import { ENCRYPTED_POSTS_PROFILE_SYNC_LIMIT } from "../theme/preludeConstants";
import type { Friend } from "../domain/types";
import type { BackendSession } from "../messaging/types";

type OwnedPostItem = {
  postId: string;
  ownerUid: string;
  ciphertext: string;
  nonce: string;
  envelope: string;
  recipientUids: string[];
  createdAtMs?: number;
};

/**
 * Re-encrypts the caller's historical posts so a newly accepted friend can
 * decrypt them. Each device shares only posts it authored; the new friend's
 * device runs the same for their side.
 */
export async function shareOwnedPostsWithNewFriend(params: {
  session: BackendSession;
  newFriendUid: string;
  allFriends: Friend[];
  visibleFriendIds: string[];
  /** Server roster uids — used when manual Firebase friendship precedes local roster hydration. */
  serverFriendBackendUids?: string[];
  resolveRecipientEncryptionKeys: (recipientUids: string[]) => Promise<Record<string, string>>;
}): Promise<{ sharedCount: number; completedScan: boolean }> {
  const {
    session,
    newFriendUid,
    allFriends,
    visibleFriendIds,
    serverFriendBackendUids = [],
    resolveRecipientEncryptionKeys,
  } = params;

  if (!newFriendUid.startsWith("u_") || newFriendUid === session.uid) {
    return { sharedCount: 0, completedScan: true };
  }

  const recipientUidsForPublish = [
    ...new Set([
      session.uid,
      ...serverFriendBackendUids.filter((uid) => uid.startsWith("u_")),
      ...visibleFriendIds
        .map((id) => allFriends.find((friend) => friend.id === id)?.backendUid?.trim())
        .filter((uid): uid is string => !!uid && uid.startsWith("u_")),
      newFriendUid,
    ]),
  ];

  let cursorBeforeMs: number | undefined;
  let sharedCount = 0;
  let updateFailures = 0;
  const maxPages = 6;

  for (let page = 0; page < maxPages; page++) {
    let res: { items?: OwnedPostItem[]; hasMore?: boolean };
    try {
      res = await callEmulatorFunction<{ items?: OwnedPostItem[]; hasMore?: boolean }>(
        "listMyOwnedEncryptedPosts",
        {
          uid: session.uid,
          deviceId: session.deviceId,
          limit: ENCRYPTED_POSTS_PROFILE_SYNC_LIMIT,
          excludeRecipientUid: newFriendUid,
          ...(cursorBeforeMs != null ? { beforeMs: cursorBeforeMs } : {}),
        }
      );
    } catch (err) {
      logAppError("posts.share_with_new_friend.list", err, { newFriendUid });
      return { sharedCount, completedScan: false };
    }

    const items = res.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      try {
        const plain = await decryptPayloadForRecipient<Record<string, unknown>>(
          session.uid,
          item.ciphertext,
          item.nonce,
          item.envelope
        );
        const keyMap = await resolveRecipientEncryptionKeys(recipientUidsForPublish);
        const encrypted = await encryptPayloadForRecipients(session.uid, plain, keyMap);
        await callEmulatorFunction("updateEncryptedPost", {
          postId: item.postId,
          recipientUids: recipientUidsForPublish,
          ...encrypted,
        });
        sharedCount += 1;
      } catch (err) {
        updateFailures += 1;
        logAppError("posts.share_with_new_friend.post", err, {
          postId: item.postId,
          newFriendUid,
        });
      }
    }

    if (!res.hasMore) break;
    const oldest = items[items.length - 1];
    if (oldest?.createdAtMs && oldest.createdAtMs > 0) {
      cursorBeforeMs = oldest.createdAtMs - 1;
    } else {
      break;
    }
  }

  return { sharedCount, completedScan: updateFailures === 0 };
}
