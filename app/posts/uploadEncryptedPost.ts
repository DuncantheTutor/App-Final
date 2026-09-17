import { callEmulatorFunction } from "../../backendBridge";
import { encryptPayloadForRecipients } from "../../e2eeCrypto";
import { firebaseAuth } from "../../firebaseAuthClient";
import type { Friend, Post } from "../domain/types";
import { resolvePostMediaForEncrypt } from "../lib/tierBMedia/postMedia";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID } from "../theme/preludeConstants";
import { postPublishRecipientUids } from "./postPublishRecipientUids";

export type UploadEncryptedPostParams = {
  session: BackendSession;
  post: Post;
  visibleFriendIds: string[];
  allFriends: Friend[];
  /** Server-accepted `u_*` friends. Preferred over local roster extras that can fail publish. */
  acceptedFriendBackendUids?: ReadonlySet<string>;
  resolveRecipientEncryptionKeys: (recipientUids: string[]) => Promise<Record<string, string>>;
  notificationAuthorName: string;
};

export { postPublishRecipientUids } from "./postPublishRecipientUids";

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
    acceptedFriendBackendUids,
    resolveRecipientEncryptionKeys,
    notificationAuthorName,
  } = params;

  const recipientUids = postPublishRecipientUids({
    sessionUid: session.uid,
    visibleFriendIds,
    allFriends,
    acceptedFriendBackendUids,
  });
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
      imageCaptions: post.imageCaptions ?? null,
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
