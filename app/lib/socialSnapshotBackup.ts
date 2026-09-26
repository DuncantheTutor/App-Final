import type { Chat, Message, Post } from "../domain/types";

export type SocialSnapshotPayload = {
  v: 1;
  chats: Chat[];
  messages: Message[];
  posts: Post[];
  messagesWatermarkMs: number;
  postsWatermarkMs: number;
  savedAtMs: number;
};

/**
 * Cloud snapshots used the same public-id wrapping key as key backup, so they are not restored.
 * Chats and posts come back from encrypted server sync plus the on-device cache.
 * Sign-in deletes any leftover server snapshot.
 */
export async function restoreSocialSnapshotFromCloud(
  _appUid: string,
  _deviceId: string
): Promise<SocialSnapshotPayload | null> {
  return null;
}

/** Decrypted history is not uploaded. */
export async function uploadSocialSnapshotToCloud(
  _appUid: string,
  _deviceId: string,
  _snapshot: Omit<SocialSnapshotPayload, "v" | "savedAtMs">
): Promise<void> {
  return;
}
