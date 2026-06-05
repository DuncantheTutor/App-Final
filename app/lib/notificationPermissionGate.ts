import { storageGetItem, storageSetItem } from "./encryptedLocalStorage";

const STORAGE_PREFIX = "mvpplus.notificationPrePrompt.v1";

export function notificationPrePromptStorageKey(email: string): string {
  return `${STORAGE_PREFIX}:${email.trim().toLowerCase()}`;
}

/** User tapped Allow or Not now on the in-app pre-prompt (per signed-in email). */
export async function readNotificationPrePromptAnswered(email: string): Promise<boolean> {
  try {
    const raw = await storageGetItem(notificationPrePromptStorageKey(email));
    return raw === "1";
  } catch {
    return false;
  }
}

export async function markNotificationPrePromptAnswered(email: string): Promise<void> {
  try {
    await storageSetItem(notificationPrePromptStorageKey(email), "1");
  } catch {
    /* best-effort */
  }
}
