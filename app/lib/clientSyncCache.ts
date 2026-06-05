/**
 * Persisted client-side sync cache. Lets cold starts render from disk before
 * the network finishes, and lets incremental server pulls resume from where
 * the previous session left off instead of re-fetching the full backlog.
 *
 * Two blobs are stored per signed-in email:
 *
 * - **Sync watermarks**: the highest `createdAtMs` seen for messages and
 *   posts, plus the wall-clock time of the last *full* sync. On cold start
 *   we seed the in-memory refs from this blob so the first
 *   `listEncryptedMessages` / `listEncryptedPosts` call asks for
 *   `sinceMs = watermark - 5_000` instead of pulling the full 200-row backlog.
 *
 * - **Friend public-key cache** (`uid → encryptionPublicKey`): so the
 *   first outgoing message after a cold start doesn't have to round-trip
 *   through `getFriendKeyBundles` before encryption. The user's own public
 *   key is recomputed locally from `SecureStore` on every boot, so we don't
 *   need to persist that one here.
 *
 * Both blobs are keyed by signed-in email, encrypted at rest on device
 * (`encryptedLocalStorage` — plaintext AsyncStorage wrapper), and cleared via `clearLocalSocialCacheForEmail`
 * on signup, logout, and Settings → reset local data. Re-sign-in with the same
 * email restores cache on purpose for returning users; a **new** signup clears
 * cache first so deleted-server accounts do not resurrect old friends/chats from disk.
 */
import { storageGetItem, storageRemoveItem, storageSetItem } from "./encryptedLocalStorage";

export type PersistedSyncWatermarks = {
  messagesWatermarkMs: number;
  messagesLastFullSyncAt: number;
  postsWatermarkMs: number;
  postsLastFullSyncAt: number;
  /** Post ids the user deleted locally; survives cold start so sync cannot resurrect them. */
  deletedPostIds?: string[];
};

export const ZERO_WATERMARKS: PersistedSyncWatermarks = {
  messagesWatermarkMs: 0,
  messagesLastFullSyncAt: 0,
  postsWatermarkMs: 0,
  postsLastFullSyncAt: 0,
};

export function syncWatermarksStorageKey(email: string): string {
  return `mvpplus.syncWatermarks.v1:${email.trim().toLowerCase()}`;
}

export function friendKeyBundleStorageKey(email: string): string {
  return `mvpplus.friendKeyBundles.v1:${email.trim().toLowerCase()}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function readSyncWatermarks(email: string): Promise<PersistedSyncWatermarks> {
  try {
    const raw = await storageGetItem(syncWatermarksStorageKey(email));
    if (!raw) return { ...ZERO_WATERMARKS };
    const parsed = JSON.parse(raw) as Partial<PersistedSyncWatermarks> | null;
    if (!parsed || typeof parsed !== "object") return { ...ZERO_WATERMARKS };
    const deletedPostIds = Array.isArray(parsed.deletedPostIds)
      ? parsed.deletedPostIds
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter((id) => id.length > 0)
      : [];
    return {
      messagesWatermarkMs: isFiniteNumber(parsed.messagesWatermarkMs)
        ? Math.max(0, parsed.messagesWatermarkMs)
        : 0,
      messagesLastFullSyncAt: isFiniteNumber(parsed.messagesLastFullSyncAt)
        ? Math.max(0, parsed.messagesLastFullSyncAt)
        : 0,
      postsWatermarkMs: isFiniteNumber(parsed.postsWatermarkMs)
        ? Math.max(0, parsed.postsWatermarkMs)
        : 0,
      postsLastFullSyncAt: isFiniteNumber(parsed.postsLastFullSyncAt)
        ? Math.max(0, parsed.postsLastFullSyncAt)
        : 0,
      deletedPostIds,
    };
  } catch {
    return { ...ZERO_WATERMARKS };
  }
}

export async function writeSyncWatermarks(
  email: string,
  watermarks: PersistedSyncWatermarks
): Promise<void> {
  try {
    await storageSetItem(syncWatermarksStorageKey(email), JSON.stringify(watermarks));
  } catch {
    /* best-effort; the in-memory refs are still authoritative for this session */
  }
}

export async function readFriendKeyBundleCache(email: string): Promise<Record<string, string>> {
  try {
    const raw = await storageGetItem(friendKeyBundleStorageKey(email));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [uid, key] of Object.entries(parsed)) {
      if (typeof key === "string" && key.length > 0 && uid.length > 0) {
        out[uid] = key;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeFriendKeyBundleCache(
  email: string,
  cache: Record<string, string>
): Promise<void> {
  try {
    await storageSetItem(friendKeyBundleStorageKey(email), JSON.stringify(cache));
  } catch {
    /* best-effort */
  }
}

export async function clearSyncCacheForEmail(email: string): Promise<void> {
  try {
    await Promise.all([
      storageRemoveItem(syncWatermarksStorageKey(email)),
      storageRemoveItem(friendKeyBundleStorageKey(email)),
    ]);
  } catch {
    /* ignore */
  }
}
