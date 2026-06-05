import type { EncryptedMediaRef } from "./types";
import { tierBRefFromPayloadFields, tierBPayloadFieldsFromRef, isLegacyHttpsMediaUri } from "./types";
import { uploadTierBEncryptedMediaIfNeeded } from "./storage";
import type { OutgoingMediaKindHint } from "../mediaKind";
export type MessageMediaPlainPayload = {
  mediaUri?: string | null;
  mediaTier?: number | null;
  mediaObjectPath?: string | null;
  mediaKeyB64?: string | null;
  mediaNonceB64?: string | null;
  mediaContentType?: string | null;
};

export type ParsedMessageMediaFields = {
  mediaUri?: string;
  mediaEncrypted?: EncryptedMediaRef;
};

export function parseMessageMediaFromPlain(plain: MessageMediaPlainPayload): ParsedMessageMediaFields {
  const tierB = tierBRefFromPayloadFields(plain);
  if (tierB) {
    return { mediaEncrypted: tierB };
  }
  const legacy = plain.mediaUri?.trim();
  if (legacy && isLegacyHttpsMediaUri(legacy)) {
    return { mediaUri: legacy };
  }
  return {};
}

export async function prepareMessageMediaForEncrypt(
  localMediaUri: string | undefined,
  firebaseAuthUid: string,
  options?: { mediaKind?: OutgoingMediaKindHint | null }
): Promise<MessageMediaPlainPayload> {
  if (!localMediaUri?.trim()) {
    return { mediaUri: null };
  }
  const trimmed = localMediaUri.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    const ref = await uploadTierBEncryptedMediaIfNeeded(
      trimmed,
      firebaseAuthUid,
      options?.mediaKind ?? undefined
    );
    if (ref) {
      return {
        mediaUri: null,
        ...tierBPayloadFieldsFromRef(ref),
      };
    }
  }
  return { mediaUri: trimmed };
}
