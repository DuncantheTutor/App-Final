import * as FileSystem from "expo-file-system/legacy";

import type { Message } from "../domain/types";
import { cacheExtensionForContentType } from "./mediaKind";
import { resolveTierBMediaToFileUri } from "./tierBMedia/storage";

function isPlayableDeviceUri(uri: string): boolean {
  return (
    uri.startsWith("file:") ||
    uri.startsWith("content:") ||
    uri.startsWith("/") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  );
}

async function localUriExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists && (info.size ?? 0) > 0);
  } catch {
    return false;
  }
}

/** Prefer Tier B decrypt; fall back to a local recording URI only when it still exists on disk. */
export async function resolveVoicePlayUri(
  message: Pick<Message, "mediaUri" | "mediaEncrypted">
): Promise<string | undefined> {
  if (message.mediaEncrypted) {
    try {
      return await resolveTierBMediaToFileUri(message.mediaEncrypted);
    } catch {
      /* try legacy/local below */
    }
  }

  const legacy = message.mediaUri?.trim();
  if (!legacy || !isPlayableDeviceUri(legacy)) return undefined;
  if (legacy.startsWith("http://") || legacy.startsWith("https://")) {
    return legacy;
  }
  return (await localUriExists(legacy)) ? legacy : undefined;
}

export function voiceSoundSource(
  uri: string,
  contentType?: string
): { uri: string; overrideFileExtensionAndroid?: string } {
  const ct = (contentType ?? "").toLowerCase();
  const ext = cacheExtensionForContentType(
    ct.includes("audio") || ct.includes("3gp") || ct.includes("amr") ? ct : "audio/mp4"
  );
  return {
    uri,
    overrideFileExtensionAndroid: ext === "3gp" ? "3gp" : "m4a",
  };
}
