import type { Post } from "../../domain/types";
import { parsePostMediaFromPlain, type PostMediaPlainPayload } from "./postMedia";

/** Prefer Firestore doc id from the server row; fall back to ciphertext postId. */
export function canonicalEncryptedPostId(
  serverPostId: string | undefined,
  plainPostId: string | undefined
): string {
  const fromServer = String(serverPostId ?? "").trim();
  if (fromServer) return fromServer;
  return String(plainPostId ?? "").trim();
}

export function mapDecryptedPostPlainToPost(params: {
  plain: PostMediaPlainPayload & {
    postId: string;
    authorId?: string;
    authorUid?: string;
    createdAt?: number;
    text?: string | null;
  };
  postId: string;
  authorId: string;
  createdAtMs: number;
  feedReactions?: Record<string, string>;
}): Post {
  const { plain, postId, authorId, createdAtMs, feedReactions } = params;
  const media = parsePostMediaFromPlain(plain);
  return {
    id: postId,
    authorId,
    createdAt: createdAtMs ?? plain.createdAt ?? Date.now(),
    text: plain.text ?? undefined,
    imageUris: media.imageUris,
    videoUri: media.videoUri,
    videoPosterUri: media.videoPosterUri,
    imageEncryptedMedia: media.imageEncrypted,
    videoEncryptedMedia: media.videoEncrypted,
    videoPosterEncryptedMedia: media.videoPosterEncrypted,
    feedReactions,
  };
}
