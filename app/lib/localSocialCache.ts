import AsyncStorage from "@react-native-async-storage/async-storage";

import { postsStorageKeyForEmail, socialMessagingStorageKeyForEmail } from "../theme/preludeConstants";
import { clearSyncCacheForEmail } from "./clientSyncCache";

/** Wipes on-device friends/chats/messages/posts cache for one account (Firebase delete does not). */
export async function clearLocalSocialCacheForEmail(email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  if (!key) return;
  await clearSyncCacheForEmail(key);
  try {
    await Promise.all([
      AsyncStorage.removeItem(socialMessagingStorageKeyForEmail(key)),
      AsyncStorage.removeItem(postsStorageKeyForEmail(key)),
    ]);
  } catch {
    /* best-effort */
  }
}
