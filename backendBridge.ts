import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { firebaseAuth } from "./firebaseAuthClient";

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

function hashInput(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

export function backendUidForEmail(email: string): string {
  return `u_${hashInput(email.trim().toLowerCase())}`;
}

export function backendUidForFriendId(friendId: string): string {
  return `f_${hashInput(friendId)}`;
}

export async function getOrCreateBackendDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(BACKEND_DEVICE_ID_KEY);
  if (existing?.trim()) return existing;
  const next = `d_${randomToken(20)}`;
  await AsyncStorage.setItem(BACKEND_DEVICE_ID_KEY, next);
  return next;
}

export async function callEmulatorFunction<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const url = USE_FIREBASE_EMULATORS
    ? `http://${emulatorHost()}:5001/${PROJECT_ID}/${REGION}/${name}`
    : `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
  /**
   * Wire-protocol back-compat for the `demoUid → uid` rename (May 2026).
   *
   * The backend resolves identity as `req.auth?.uid ?? req.data?.uid ?? req.data?.demoUid`,
   * so it already accepts the new name. We mirror the value back to the old
   * key here so an *old* deployed backend (one that only reads `req.data?.demoUid`)
   * still recognises the caller, eliminating the client-deploy / backend-deploy
   * ordering hazard. Inert against any backend version. Once all backends in
   * the wild are on the new code, drop this block and the mirror.
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
    /* Auth token optional for emulator / legacy; server still checks device session. */
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
