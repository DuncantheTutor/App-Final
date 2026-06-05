import { storageGetItem, storageSetItem } from "./encryptedLocalStorage";

const STORAGE_PREFIX = "mvpplus.notificationPrePrompt.v1";

export function notificationPrePromptStorageKey(email: string): string {
  return `${STORAGE_PREFIX}:${email.trim().toLowerCase()}`;
}

/** User completed the Allow flow (OS sheet was shown at least once). */
export async function readNotificationPrePromptOsRequested(email: string): Promise<boolean> {
  try {
    const raw = await storageGetItem(notificationPrePromptStorageKey(email));
    return raw === "1";
  } catch {
    return false;
  }
}

export async function markNotificationPrePromptOsRequested(email: string): Promise<void> {
  try {
    await storageSetItem(notificationPrePromptStorageKey(email), "1");
  } catch {
    /* best-effort */
  }
}

/** @deprecated Use readNotificationPrePromptOsRequested — kept for imports during migration. */
export async function readNotificationPrePromptAnswered(email: string): Promise<boolean> {
  return readNotificationPrePromptOsRequested(email);
}

/** @deprecated Use markNotificationPrePromptOsRequested — kept for imports during migration. */
export async function markNotificationPrePromptAnswered(email: string): Promise<void> {
  await markNotificationPrePromptOsRequested(email);
}
