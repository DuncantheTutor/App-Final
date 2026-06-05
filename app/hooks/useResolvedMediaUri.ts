import { useEffect, useState } from "react";

import type { EncryptedMediaRef } from "../lib/tierBMedia/types";
import { isLegacyHttpsMediaUri } from "../lib/tierBMedia/types";
import { resolveTierBMediaToFileUri, type TierBResolvePriority } from "../lib/tierBMedia/storage";
import { rememberDisplayMediaUri, peekDisplayMediaUri, tierBDisplayCacheKey } from "../lib/displayMediaCache";

export type ResolvedMediaUriResult = {
  uri: string | undefined;
  resolving: boolean;
};

function legacyDisplayUri(legacyUri: string | undefined): string | undefined {
  const leg = legacyUri?.trim();
  if (leg && (isLegacyHttpsMediaUri(leg) || leg.startsWith("file:") || leg.startsWith("content:"))) {
    return leg;
  }
  return undefined;
}

/**
 * Resolves display URI for chat/feed media: legacy HTTPS URL or Tier B decrypt-to-cache.
 * Set `enabled: false` to defer Tier B download/decrypt (e.g. chat video until tap-to-play).
 */
export function useResolvedMediaUri(
  legacyUri: string | undefined,
  encrypted: EncryptedMediaRef | undefined,
  options?: { enabled?: boolean; priority?: TierBResolvePriority }
): ResolvedMediaUriResult {
  const enabled = options?.enabled !== false;
  const priority = options?.priority ?? "normal";
  const [resolved, setResolved] = useState<string | undefined>(() => {
    const leg = legacyDisplayUri(legacyUri);
    if (leg) return leg;
    if (encrypted) {
      const peek = peekDisplayMediaUri(tierBDisplayCacheKey(encrypted));
      if (peek) return peek;
    }
    return undefined;
  });
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const leg = legacyDisplayUri(legacyUri);
    if (leg) {
      setResolved((cur) => (cur === leg ? cur : leg));
      setResolving((cur) => (cur ? false : cur));
      return;
    }
    if (!encrypted || !enabled) {
      setResolving((cur) => (cur ? false : cur));
      return;
    }
    let cancelled = false;
    setResolving(true);
    void resolveTierBMediaToFileUri(encrypted, { priority })
      .then((uri) => {
        if (!cancelled) {
          rememberDisplayMediaUri(tierBDisplayCacheKey(encrypted), uri);
          setResolved((cur) => (cur === uri ? cur : uri));
        }
      })
      .catch(() => {
        if (!cancelled) setResolved((cur) => (cur === undefined ? cur : undefined));
      })
      .finally(() => {
        if (!cancelled) setResolving((cur) => (cur ? false : cur));
      });
    return () => {
      cancelled = true;
    };
  }, [
    legacyUri,
    encrypted?.objectPath,
    encrypted?.keyB64,
    encrypted?.nonceB64,
    encrypted?.contentType,
    enabled,
    priority,
  ]);

  return { uri: resolved, resolving };
}
