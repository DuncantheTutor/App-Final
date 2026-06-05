import { postsStorageKeyForEmail, socialMessagingStorageKeyForEmail } from "../theme/preludeConstants";
import { clearSyncCacheForEmail } from "./clientSyncCache";
import { clearEncryptedMediaCaches } from "./encryptedMediaCache";
import { storageRemoveItem } from "./encryptedLocalStorage";
import { feedMutesStorageKeyForEmail } from "./feedMutePersistence";
import { feedReactionSeenStorageKeyForEmail } from "./feedReactionUnread";
import { postsSharedWithFriendsStorageKeyForEmail } from "./postsSharedWithFriendsPersistence";
import { clearProfileCardCacheForEmail } from "./profileCardCache";

/** Wipes on-device friends/chats/messages/posts cache for one account (Firebase delete does not). */
export async function clearLocalSocialCacheForEmail(email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  if (!key) return;
  await clearSyncCacheForEmail(key);
  await clearProfileCardCacheForEmail(key);
  await clearEncryptedMediaCaches({ includeEncryptedAtRest: true });
  try {
    await Promise.all([
      storageRemoveItem(socialMessagingStorageKeyForEmail(key)),
      storageRemoveItem(postsStorageKeyForEmail(key)),
      storageRemoveItem(feedMutesStorageKeyForEmail(key)),
      storageRemoveItem(feedReactionSeenStorageKeyForEmail(key)),
      storageRemoveItem(postsSharedWithFriendsStorageKeyForEmail(key)),
    ]);
  } catch {
    /* best-effort */
  }
}
