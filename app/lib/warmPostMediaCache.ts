import type { Post } from "../domain/types";
import { yieldToUi } from "./yieldToUi";
import { peekTierBMediaFileUri, resolveTierBMediaToFileUri, type TierBResolvePriority } from "./tierBMedia/storage";
import type { EncryptedMediaRef } from "./tierBMedia/types";

/** First Tier B ref needed for a profile grid tile (image, video poster, or video). */
export function firstGridEncryptedMediaRef(post: Post): EncryptedMediaRef | undefined {
  const images = post.imageEncryptedMedia ?? [];
  if (images[0]) return images[0];
  if (post.videoPosterEncryptedMedia) return post.videoPosterEncryptedMedia;
  if (post.videoEncryptedMedia) return post.videoEncryptedMedia;
  return undefined;
}

function dedupeRefs(refs: EncryptedMediaRef[]): EncryptedMediaRef[] {
  const seen = new Set<string>();
  const out: EncryptedMediaRef[] = [];
  for (const ref of refs) {
    const key = ref.objectPath;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * Pre-resolve profile/feed grid thumbnails into memory + on-disk cache so cold
 * opens do not show spinners for every tile. Safe to call repeatedly.
 */
export async function warmPostGridMediaCache(
  posts: Post[],
  options?: { maxPosts?: number; priority?: TierBResolvePriority }
): Promise<void> {
  const maxPosts = Math.max(1, options?.maxPosts ?? 24);
  const priority = options?.priority ?? "normal";
  const refs = dedupeRefs(
    posts
      .slice(0, maxPosts)
      .map(firstGridEncryptedMediaRef)
      .filter((ref): ref is EncryptedMediaRef => !!ref)
  );
  for (const ref of refs) {
    try {
      const cached = await peekTierBMediaFileUri(ref);
      if (!cached?.trim()) {
        await resolveTierBMediaToFileUri(ref, { priority });
      }
    } catch {
      /* best-effort warm */
    }
    await yieldToUi();
  }
}
