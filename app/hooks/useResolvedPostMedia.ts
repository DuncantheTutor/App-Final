import { useEffect, useMemo, useState } from "react";

import type { Post } from "../domain/types";
import {
  httpsDisplayCacheKey,
  peekDisplayMediaUri,
  peekTierBDisplayUri,
  rememberDisplayMediaUri,
} from "../lib/displayMediaCache";
import type { EncryptedMediaRef } from "../lib/tierBMedia/types";
import { peekTierBMediaFileUri, resolveTierBMediaToFileUri } from "../lib/tierBMedia/storage";
import { yieldToUi } from "../lib/yieldToUi";

export type ResolvedPostMedia = {
  imageUris: string[];
  videoUri?: string;
  videoPosterUri?: string;
};

export function postHasGridMedia(post: Post): boolean {
  return !!(
    post.imageUris?.length ||
    post.imageEncryptedMedia?.length ||
    post.videoUri ||
    post.videoEncryptedMedia
  );
}

export function postHasVideo(post: Post): boolean {
  return !!(post.videoUri?.trim() || post.videoEncryptedMedia);
}

/** First image, video poster, or generated first-frame still for profile grids. */
export function thumbnailFromResolvedMedia(
  resolved: ResolvedPostMedia,
  videoFrameUri?: string
): string | undefined {
  const firstImage = resolved.imageUris.find((uri) => uri.trim().length > 0);
  if (firstImage) return firstImage;
  if (resolved.videoPosterUri?.trim()) return resolved.videoPosterUri.trim();
  if (videoFrameUri?.trim()) return videoFrameUri.trim();
  return undefined;
}

function initialResolvedFromPost(post: Post): ResolvedPostMedia {
  const legacyImages = (post.imageUris ?? []).filter((u) => u.trim().length > 0);
  const encImages = (post.imageEncryptedMedia ?? [])
    .map((ref) => peekTierBDisplayUri(ref))
    .filter((uri): uri is string => !!uri?.trim());

  let videoUri = post.videoUri?.trim();
  if (post.videoEncryptedMedia) {
    videoUri = peekTierBDisplayUri(post.videoEncryptedMedia) ?? videoUri;
  }
  let videoPosterUri = post.videoPosterUri?.trim();
  if (post.videoPosterEncryptedMedia) {
    videoPosterUri =
      peekTierBDisplayUri(post.videoPosterEncryptedMedia) ?? videoPosterUri;
  }

  for (const uri of legacyImages) {
    rememberDisplayMediaUri(httpsDisplayCacheKey(uri), uri);
  }

  return {
    imageUris: encImages.length > 0 ? [...legacyImages, ...encImages] : legacyImages,
    videoUri: videoUri || undefined,
    videoPosterUri: videoPosterUri || undefined,
  };
}

async function resolveRefs(refs: EncryptedMediaRef[]): Promise<string[]> {
  const out: string[] = [];
  for (const ref of refs) {
    try {
      const cached = await peekTierBMediaFileUri(ref);
      if (cached) {
        out.push(cached);
        continue;
      }
      out.push(await resolveTierBMediaToFileUri(ref));
      await yieldToUi();
    } catch {
      /* skip failed blob */
    }
  }
  return out;
}

/**
 * Merges legacy HTTPS post media with Tier B decrypted cache file URIs.
 * Reuses in-memory and on-disk cache so feed → fullscreen → profile do not re-decrypt.
 */
export function useResolvedPostMedia(
  post: Post,
  options?: { enabled?: boolean; resolveVideo?: boolean }
): ResolvedPostMedia {
  const enabled = options?.enabled !== false;
  const resolveVideo = options?.resolveVideo !== false;
  const encryptedKey = useMemo(
    () =>
      JSON.stringify({
        images: post.imageEncryptedMedia,
        video: post.videoEncryptedMedia,
        poster: post.videoPosterEncryptedMedia,
      }),
    [post.imageEncryptedMedia, post.videoEncryptedMedia, post.videoPosterEncryptedMedia]
  );

  const [resolved, setResolved] = useState<ResolvedPostMedia>(() => initialResolvedFromPost(post));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      await yieldToUi();
      if (cancelled) return;
      const legacyImages = (post.imageUris ?? []).filter((u) => u.trim().length > 0);
      for (const uri of legacyImages) {
        rememberDisplayMediaUri(httpsDisplayCacheKey(uri), uri);
      }

      const encImages = post.imageEncryptedMedia ?? [];
      const mergedImages =
        encImages.length > 0
          ? [...legacyImages, ...(await resolveRefs(encImages))]
          : legacyImages;

      let videoUri = post.videoUri?.trim();
      if (resolveVideo && post.videoEncryptedMedia) {
        try {
          videoUri =
            (await peekTierBMediaFileUri(post.videoEncryptedMedia)) ??
            (await resolveTierBMediaToFileUri(post.videoEncryptedMedia));
        } catch {
          /* keep legacy */
        }
      }

      let videoPosterUri = post.videoPosterUri?.trim();
      if (post.videoPosterEncryptedMedia) {
        try {
          videoPosterUri =
            (await peekTierBMediaFileUri(post.videoPosterEncryptedMedia)) ??
            (await resolveTierBMediaToFileUri(post.videoPosterEncryptedMedia));
        } catch {
          /* keep legacy */
        }
      }

      if (!cancelled) {
        const next: ResolvedPostMedia = {
          imageUris: mergedImages,
          videoUri: videoUri || undefined,
          videoPosterUri: videoPosterUri || undefined,
        };
        setResolved((cur) => {
          if (
            cur.imageUris.join("|") === next.imageUris.join("|") &&
            cur.videoUri === next.videoUri &&
            cur.videoPosterUri === next.videoPosterUri
          ) {
            return cur;
          }
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    post.id,
    post.imageUris,
    post.videoUri,
    post.videoPosterUri,
    encryptedKey,
    enabled,
    resolveVideo,
  ]);

  return resolved;
}
