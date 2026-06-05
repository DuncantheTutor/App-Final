import { useEffect, useMemo, useState } from "react";

import type { Post } from "../domain/types";
import {
  httpsDisplayCacheKey,
  peekTierBDisplayUri,
  rememberDisplayMediaUri,
} from "../lib/displayMediaCache";
import type { EncryptedMediaRef } from "../lib/tierBMedia/types";
import {
  peekTierBMediaFileUri,
  resolveTierBMediaToFileUri,
  type TierBResolvePriority,
} from "../lib/tierBMedia/storage";
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

/** One display URI per carousel slot — legacy HTTPS and Tier B refs align by index. */
export function mergePostImageUris(
  legacyImages: string[],
  encRefs: EncryptedMediaRef[],
  resolvedEncUris: string[]
): string[] {
  if (encRefs.length === 0) return legacyImages;

  const merged: string[] = [];
  for (let i = 0; i < encRefs.length; i++) {
    const resolved = resolvedEncUris[i]?.trim();
    const legacy = legacyImages[i]?.trim();
    const peek = peekTierBDisplayUri(encRefs[i])?.trim();
    const uri = resolved || legacy || peek || "";
    if (uri) merged.push(uri);
  }

  if (merged.length > 0) return merged;
  return legacyImages;
}

function syncImageUrisFromPost(post: Post): string[] {
  const legacyImages = (post.imageUris ?? []).filter((u) => u.trim().length > 0);
  const encRefs = post.imageEncryptedMedia ?? [];
  if (encRefs.length === 0) return legacyImages;

  const peekResolved = encRefs.map((ref, i) => peekTierBDisplayUri(ref) ?? legacyImages[i] ?? "");
  return mergePostImageUris(legacyImages, encRefs, peekResolved);
}

function initialResolvedFromPost(post: Post): ResolvedPostMedia {
  const legacyImages = (post.imageUris ?? []).filter((u) => u.trim().length > 0);
  for (const uri of legacyImages) {
    rememberDisplayMediaUri(httpsDisplayCacheKey(uri), uri);
  }

  let videoUri = post.videoUri?.trim();
  if (post.videoEncryptedMedia) {
    videoUri = peekTierBDisplayUri(post.videoEncryptedMedia) ?? videoUri;
  }
  let videoPosterUri = post.videoPosterUri?.trim();
  if (post.videoPosterEncryptedMedia) {
    videoPosterUri =
      peekTierBDisplayUri(post.videoPosterEncryptedMedia) ?? videoPosterUri;
  }

  return {
    imageUris: syncImageUrisFromPost(post),
    videoUri: videoUri || undefined,
    videoPosterUri: videoPosterUri || undefined,
  };
}

async function resolveRefsByIndex(
  refs: EncryptedMediaRef[],
  legacyByIndex: string[],
  previousUris: string[],
  priority: TierBResolvePriority
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const legacy = legacyByIndex[i]?.trim();
    const peek = peekTierBDisplayUri(ref)?.trim();
    const previous = previousUris[i]?.trim();
    let uri = legacy || peek || previous || "";
    try {
      const cached = await peekTierBMediaFileUri(ref);
      if (cached?.trim()) {
        uri = cached.trim();
      } else {
        uri = (await resolveTierBMediaToFileUri(ref, { priority })).trim();
      }
      await yieldToUi();
    } catch {
      /* keep best-known uri for this slot */
    }
    if (uri) out.push(uri);
  }
  return out;
}

/**
 * Merges legacy HTTPS post media with Tier B decrypted cache file URIs.
 * Reuses in-memory and on-disk cache so feed → fullscreen → profile do not re-decrypt.
 */
export function useResolvedPostMedia(
  post: Post,
  options?: {
    enabled?: boolean;
    resolveVideo?: boolean;
    /** User-initiated playback should jump ahead of feed thumbnail decrypt work. */
    resolvePriority?: TierBResolvePriority;
  }
): ResolvedPostMedia {
  const enabled = options?.enabled !== false;
  const resolveVideo = options?.resolveVideo !== false;
  const imagePriority = options?.resolvePriority ?? "low";
  const videoPriority = options?.resolvePriority ?? "high";
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

      const encRefs = post.imageEncryptedMedia ?? [];
      const syncUris = syncImageUrisFromPost(post);
      const resolvedEnc =
        encRefs.length > 0
          ? await resolveRefsByIndex(encRefs, legacyImages, syncUris, imagePriority)
          : [];
      const mergedImages = mergePostImageUris(legacyImages, encRefs, resolvedEnc);

      let videoUri = post.videoUri?.trim();
      if (resolveVideo && post.videoEncryptedMedia) {
        try {
          videoUri =
            (await peekTierBMediaFileUri(post.videoEncryptedMedia)) ??
            (await resolveTierBMediaToFileUri(post.videoEncryptedMedia, { priority: videoPriority }));
        } catch {
          videoUri = peekTierBDisplayUri(post.videoEncryptedMedia) ?? videoUri;
        }
      }

      let videoPosterUri = post.videoPosterUri?.trim();
      if (post.videoPosterEncryptedMedia) {
        try {
          videoPosterUri =
            (await peekTierBMediaFileUri(post.videoPosterEncryptedMedia)) ??
            (await resolveTierBMediaToFileUri(post.videoPosterEncryptedMedia));
        } catch {
          videoPosterUri =
            peekTierBDisplayUri(post.videoPosterEncryptedMedia) ?? videoPosterUri;
        }
      }

      if (!cancelled) {
        const next: ResolvedPostMedia = {
          imageUris: mergedImages.length > 0 ? mergedImages : syncUris,
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
    imagePriority,
    videoPriority,
  ]);

  return resolved;
}
