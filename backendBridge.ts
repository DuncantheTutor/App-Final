import Constants from "expo-constants";
import { Platform } from "react-native";

import { storageGetItem, storageSetItem } from "./app/lib/encryptedLocalStorage";
import { firebaseAuth } from "./firebaseAuthClient";

export { canonicalizeEmail, backendUidForEmail, backendUidForFriendId } from "./app/lib/accountIdentity";

const BACKEND_DEVICE_ID_KEY = "app.backend.deviceId.v1";
const PROJECT_ID =
  ((Constants.expoConfig?.extra as { firebase?: { projectId?: string } } | undefined)?.firebase?.projectId ??
    "nfc-app-7095e");
const REGION = "us-central1";
const USE_FIREBASE_EMULATORS = Boolean(
  (Constants.expoConfig?.extra as { useFirebaseEmulators?: boolean } | undefined)?.useFirebaseEmulators
);

function emulatorHost(): string {
  const configured = (
    Constants.expoConfig?.extra as { functionsEmulatorHost?: string } | undefined
  )?.functionsEmulatorHost;
  if (configured?.trim()) return configured.trim();
  if (Platform.OS === "android") return "10.0.2.2";
  return "127.0.0.1";
}

function randomToken(len: number): string {
  let out = "";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)] ?? "a";
  return out;
}

export async function getOrCreateBackendDeviceId(): Promise<string> {
  const existing = await storageGetItem(BACKEND_DEVICE_ID_KEY);
  if (existing?.trim()) return existing;
  const next = `d_${randomToken(20)}`;
  await storageSetItem(BACKEND_DEVICE_ID_KEY, next);
  return next;
}

export async function callEmulatorFunction<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const url = USE_FIREBASE_EMULATORS
    ? `http://${emulatorHost()}:5001/${PROJECT_ID}/${REGION}/${name}`
    : `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
  /**
   * The server decides the account from the Firebase ID token. `uid` in the
   * body is only a hint and must match that account. `demoUid` is mirrored for
   * an older deployed backend that still reads that field name.
   */
  const wirePayload =
    typeof data.uid === "string" && data.uid && data.demoUid === undefined
      ? { ...data, demoUid: data.uid }
      : data;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const user = firebaseAuth.currentUser;
    if (user) {
      const idToken = await user.getIdToken();
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
    }
  } catch {
    /* Call still goes out. Account callables reject it when the token is missing. */
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ data: wirePayload }),
  });
  const text = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  let parsed: { result?: T; error?: { message?: string } } = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as { result?: T; error?: { message?: string } };
    } catch {
      const sample = text.replace(/\s+/g, " ").slice(0, 120);
      const contentTypeLabel = contentType || "unknown";
      throw new Error(
        `Function ${name} returned non-JSON (${res.status}, content-type: ${contentTypeLabel}). ` +
          `This usually means the function URL is wrong, function is undeployed, or network returned HTML. ` +
          `URL: ${url}. Response starts with: ${sample}`
      );
    }
  }
  if (!res.ok || parsed.error) {
    throw new Error(parsed.error?.message || `Function ${name} failed (${res.status})`);
  }
  return parsed.result as T;
}
