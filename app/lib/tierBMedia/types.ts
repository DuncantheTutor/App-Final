/** Tier B (Phase 1): ciphertext blobs in Storage; keys live inside E2EE JSON payloads. */
export const TIER_B_MEDIA_VERSION = 2;

export type EncryptedMediaRef = {
  objectPath: string;
  keyB64: string;
  nonceB64: string;
  contentType: string;
};

/** Fields embedded in encrypted message/post JSON (plaintext before envelope encrypt). */
export type TierBMediaPayloadFields = {
  mediaTier?: number | null;
  mediaObjectPath?: string | null;
  mediaKeyB64?: string | null;
  mediaNonceB64?: string | null;
  mediaContentType?: string | null;
};

export type TierBMediaBlobPayload = {
  objectPath: string;
  mediaKeyB64: string;
  mediaNonceB64: string;
  mediaContentType: string;
};

export function tierBRefFromPayloadFields(
  fields: TierBMediaPayloadFields | null | undefined
): EncryptedMediaRef | null {
  if (!fields || fields.mediaTier !== TIER_B_MEDIA_VERSION) return null;
  const objectPath = String(fields.mediaObjectPath ?? "").trim();
  const keyB64 = String(fields.mediaKeyB64 ?? "").trim();
  const nonceB64 = String(fields.mediaNonceB64 ?? "").trim();
  const contentType = String(fields.mediaContentType ?? "").trim() || "application/octet-stream";
  if (!objectPath || !keyB64 || !nonceB64) return null;
  return { objectPath, keyB64, nonceB64, contentType };
}

export function tierBPayloadFieldsFromRef(ref: EncryptedMediaRef): TierBMediaPayloadFields {
  return {
    mediaTier: TIER_B_MEDIA_VERSION,
    mediaObjectPath: ref.objectPath,
    mediaKeyB64: ref.keyB64,
    mediaNonceB64: ref.nonceB64,
    mediaContentType: ref.contentType,
  };
}

export function tierBBlobFromPlain(
  raw: TierBMediaBlobPayload | null | undefined
): EncryptedMediaRef | null {
  if (!raw) return null;
  const objectPath = String(raw.objectPath ?? "").trim();
  const keyB64 = String(raw.mediaKeyB64 ?? "").trim();
  const nonceB64 = String(raw.mediaNonceB64 ?? "").trim();
  const contentType = String(raw.mediaContentType ?? "").trim() || "application/octet-stream";
  if (!objectPath || !keyB64 || !nonceB64) return null;
  return { objectPath, keyB64, nonceB64, contentType };
}

export function tierBPlainFromRef(ref: EncryptedMediaRef): TierBMediaBlobPayload {
  return {
    objectPath: ref.objectPath,
    mediaKeyB64: ref.keyB64,
    mediaNonceB64: ref.nonceB64,
    mediaContentType: ref.contentType,
  };
}

export function isLegacyHttpsMediaUri(uri: string | null | undefined): boolean {
  const u = String(uri ?? "").trim().toLowerCase();
  return u.startsWith("https://") || u.startsWith("http://");
}
