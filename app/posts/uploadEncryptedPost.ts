import { callEmulatorFunction } from "../../backendBridge";
import { encryptPayloadForRecipients } from "../../e2eeCrypto";
import { firebaseAuth } from "../../firebaseAuthClient";
import type { Friend, Post } from "../domain/types";
import { resolvePostMediaForEncrypt } from "../lib/tierBMedia/postMedia";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID } from "../theme/preludeConstants";

export type UploadEncryptedPostParams = {
  session: BackendSession;
  post: Post;
  visibleFriendIds: string[];
  allFriends: Friend[];
  resolveRecipientEncryptionKeys: (recipientUids: string[]) => Promise<Record<string, string>>;
  notificationAuthorName: string;
};

/**
 * Encrypts an optimistic local post and creates it on the server.
 * Returns a server post id when it differs from the local optimistic id.
 */
export async function uploadEncryptedPost(params: UploadEncryptedPostParams): Promise<string | null> {
  const {
    session,
    post,
    visibleFriendIds,
    allFriends,
    resolveRecipientEncryptionKeys,
    notificationAuthorName,
  } = params;

  const recipientUids = [
    session.uid,
    ...visibleFriendIds
      .map((id) => allFriends.find((friend) => friend.id === id)?.backendUid)
      .filter((uid): uid is string => !!uid && uid.trim().length > 0),
  ];
  const keyMap = await resolveRecipientEncryptionKeys(recipientUids);
  const authUid = firebaseAuth.currentUser?.uid;
  if (!authUid) throw new Error("Firebase Auth is not ready. Please wait a moment and try again.");
  const remoteMedia = await resolvePostMediaForEncrypt(
    post.imageUris,
    post.videoUri,
    post.videoPosterUri,
    authUid
  );
  const encrypted = await encryptPayloadForRecipients(
    session.uid,
    {
      postId: post.id,
      authorId: CURRENT_USER_ID,
      authorUid: session.uid,
      createdAt: post.createdAt,
      text: post.text ?? null,
      imageUris: remoteMedia.imageUris ?? null,
      videoUri: remoteMedia.videoUri ?? null,
      videoPosterUri: remoteMedia.videoPosterUri ?? null,
      imagesMedia: remoteMedia.imagesMedia ?? null,
      videoMedia: remoteMedia.videoMedia ?? null,
      videoPosterMedia: remoteMedia.videoPosterMedia ?? null,
    },
    keyMap
  );
  const created = await callEmulatorFunction<{ ok?: boolean; postId?: string }>("createEncryptedPost", {
    uid: session.uid,
    deviceId: session.deviceId,
    storageObjectPaths: remoteMedia.storageObjectPaths,
    notificationAuthorName,
    ...encrypted,
  });
  if (created.postId && created.postId !== post.id) return created.postId;
  return null;
}
