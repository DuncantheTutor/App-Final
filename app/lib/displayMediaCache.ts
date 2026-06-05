import type { EncryptedMediaRef } from "./tierBMedia/types";

/** In-memory map so feed, fullscreen, and profile reuse the same resolved `file://` URI. */
const memoryByKey = new Map<string, string>();

export function tierBDisplayCacheKey(mediaRef: EncryptedMediaRef): string {
  return `tierb:${mediaRef.objectPath}`;
}

export function httpsDisplayCacheKey(uri: string): string {
  return `https:${uri.trim()}`;
}

export function rememberDisplayMediaUri(key: string, uri: string): void {
  const k = key.trim();
  const u = uri.trim();
  if (!k || !u) return;
  memoryByKey.set(k, u);
}

export function peekDisplayMediaUri(key: string): string | undefined {
  return memoryByKey.get(key.trim());
}

export function peekTierBDisplayUri(mediaRef: EncryptedMediaRef): string | undefined {
  return peekDisplayMediaUri(tierBDisplayCacheKey(mediaRef));
}
