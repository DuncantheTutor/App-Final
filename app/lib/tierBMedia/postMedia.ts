import { mediaUriNeedsFirebaseUpload } from "../../../mediaStorageUpload";
import type { EncryptedMediaRef } from "./types";
import { tierBBlobFromPlain, tierBPlainFromRef } from "./types";
import { uploadTierBEncryptedMediaFromDevice } from "./storage";

export type PostMediaEncryptResult = {
  /** Legacy Tier A HTTPS URLs — omitted for new Tier B publishes. */
  imageUris?: string[];
  videoUri?: string;
  videoPosterUri?: string;
  storageObjectPaths: string[];
  imagesMedia?: ReturnType<typeof tierBPlainFromRef>[];
  videoMedia?: ReturnType<typeof tierBPlainFromRef>;
  videoPosterMedia?: ReturnType<typeof tierBPlainFromRef>;
};

export async function resolvePostMediaForEncrypt(
  imageUris: string[] | undefined,
  videoUri: string | undefined | null,
  videoPosterUri: string | undefined | null,
  firebaseAuthUid: string
): Promise<PostMediaEncryptResult> {
  const storageObjectPaths: string[] = [];
  const imagesMedia: ReturnType<typeof tierBPlainFromRef>[] = [];

  const uploadOne = async (uri: string | undefined | null): Promise<EncryptedMediaRef | undefined> => {
    if (!uri?.trim()) return undefined;
    const trimmed = uri.trim();
    if (!mediaUriNeedsFirebaseUpload(trimmed)) return undefined;
    const ref = await uploadTierBEncryptedMediaFromDevice(trimmed, firebaseAuthUid);
    storageObjectPaths.push(ref.objectPath);
    return ref;
  };

  for (const uri of imageUris ?? []) {
    const ref = await uploadOne(uri);
    if (ref) imagesMedia.push(tierBPlainFromRef(ref));
  }

  const videoRef = await uploadOne(videoUri);
  const posterRef = await uploadOne(videoPosterUri);

  return {
    storageObjectPaths,
    ...(imagesMedia.length > 0 ? { imagesMedia } : {}),
    ...(videoRef ? { videoMedia: tierBPlainFromRef(videoRef) } : {}),
    ...(posterRef ? { videoPosterMedia: tierBPlainFromRef(posterRef) } : {}),
  };
}

export type PostMediaPlainPayload = {
  imageUris?: string[] | null;
  videoUri?: string | null;
  videoPosterUri?: string | null;
  imagesMedia?: Array<{
    objectPath: string;
    mediaKeyB64: string;
    mediaNonceB64: string;
    mediaContentType: string;
  }> | null;
  videoMedia?: {
    objectPath: string;
    mediaKeyB64: string;
    mediaNonceB64: string;
    mediaContentType: string;
  } | null;
  videoPosterMedia?: {
    objectPath: string;
    mediaKeyB64: string;
    mediaNonceB64: string;
    mediaContentType: string;
  } | null;
};

export type ParsedPostMediaFields = {
  imageUris?: string[];
  videoUri?: string;
  videoPosterUri?: string;
  imageEncrypted?: EncryptedMediaRef[];
  videoEncrypted?: EncryptedMediaRef;
  videoPosterEncrypted?: EncryptedMediaRef;
};

export function parsePostMediaFromPlain(plain: PostMediaPlainPayload): ParsedPostMediaFields {
  const imageEncrypted = (plain.imagesMedia ?? [])
    .map((x) => tierBBlobFromPlain(x))
    .filter((x): x is EncryptedMediaRef => !!x);
  const videoEncrypted = tierBBlobFromPlain(plain.videoMedia ?? undefined) ?? undefined;
  const videoPosterEncrypted = tierBBlobFromPlain(plain.videoPosterMedia ?? undefined) ?? undefined;

  const legacyImages = (plain.imageUris ?? []).filter((u) => typeof u === "string" && u.trim());
  const legacyVideo = plain.videoUri?.trim() || undefined;
  const legacyPoster = plain.videoPosterUri?.trim() || undefined;

  return {
    imageUris: legacyImages.length > 0 ? legacyImages : undefined,
    videoUri: legacyVideo,
    videoPosterUri: legacyPoster,
    imageEncrypted: imageEncrypted.length > 0 ? imageEncrypted : undefined,
    videoEncrypted,
    videoPosterEncrypted,
  };
}
