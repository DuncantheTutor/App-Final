import * as Notifications from "expo-notifications";

import Constants from "expo-constants";

import { Platform } from "react-native";

import { callEmulatorFunction, getOrCreateBackendDeviceId } from "../../backendBridge";

import { firebaseAuth } from "../../firebaseAuthClient";

import { logAppError, logAppEvent } from "../../telemetry";

export type OsNotificationPermissionStatus = "granted" | "denied" | "undetermined";

export type PushTokenKind = "fcm" | "expo";

export type AcquiredPushToken = {
  token: string;
  kind: PushTokenKind;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Android requires a high-importance channel for heads-up alerts with sound + vibration. */
async function ensureAndroidMessagesChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
  } catch {
    /* channel setup is best-effort */
  }
}

/** EAS project id is required for Expo push tokens in standalone builds. */
function resolveExpoProjectId(): string | undefined {
  const fromEas = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId;
  const id = (fromEas ?? fromExtra ?? "").trim();
  return id || undefined;
}

function normalizePermissionStatus(status: string): OsNotificationPermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export function isOsNotificationPermissionGranted(status: OsNotificationPermissionStatus): boolean {
  return status === "granted";
}

export async function getOsNotificationPermissionStatus(): Promise<OsNotificationPermissionStatus> {
  if (Platform.OS === "web") return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  return normalizePermissionStatus(status);
}

/** Shows the OS permission sheet (call only after the in-app pre-prompt Allow tap). */
export async function requestOsNotificationPermission(): Promise<OsNotificationPermissionStatus> {
  if (Platform.OS === "web") return "denied";
  await ensureAndroidMessagesChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return "granted";
  const { status } = await Notifications.requestPermissionsAsync();
  return normalizePermissionStatus(status);
}

async function acquireDevicePushToken(): Promise<string | null> {
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    const token = typeof device.data === "string" ? device.data.trim() : "";
    return token || null;
  } catch (err) {
    logAppError("push.device_token", err, {});
    return null;
  }
}

async function acquireExpoPushToken(): Promise<string | null> {
  try {
    const projectId = resolveExpoProjectId();
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data?.trim();
    return token || null;
  } catch (err) {
    logAppError("push.expo_token", err, { hasProjectId: Boolean(resolveExpoProjectId()) });
    return null;
  }
}

/** Collects every token the device can mint (FCM/APNs + Expo when configured). */
export async function acquireAllPushTokens(): Promise<AcquiredPushToken[]> {
  const out: AcquiredPushToken[] = [];
  const seen = new Set<string>();

  const pushUnique = (token: string, kind: PushTokenKind) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    out.push({ token, kind });
  };

  if (Platform.OS === "android") {
    const fcm = await acquireDevicePushToken();
    if (fcm) pushUnique(fcm, "fcm");
    const expo = await acquireExpoPushToken();
    if (expo) pushUnique(expo, "expo");
  } else if (Platform.OS === "ios") {
    const expo = await acquireExpoPushToken();
    if (expo) pushUnique(expo, "expo");
    const apns = await acquireDevicePushToken();
    if (apns) pushUnique(apns, "fcm");
  }

  return out;
}

/** Keeps `userFirebaseAuthMap` aligned before strict push registration callables run. */
async function ensureFirebaseAuthMapRegistered(session: {
  uid: string;
  deviceId: string;
}): Promise<void> {
  const firebaseAuthUid = firebaseAuth.currentUser?.uid?.trim();
  if (!firebaseAuthUid) return;
  try {
    await callEmulatorFunction("registerFirebaseAuthUid", {
      uid: session.uid,
      deviceId: session.deviceId,
      firebaseAuthUid,
    });
  } catch (err) {
    logAppError("push.auth_map", err, { uid: session.uid });
  }
}

/** Registers every available FCM/APNs + Expo token with backend — assumes OS permission is granted. */
export async function registerPushTokenWithBackend(session: {
  uid: string;
  deviceId: string;
}): Promise<void> {
  if (Platform.OS === "web") return;
  const status = await getOsNotificationPermissionStatus();
  if (!isOsNotificationPermissionGranted(status)) return;
  await ensureAndroidMessagesChannel();
  await ensureFirebaseAuthMapRegistered(session);

  const tokens = await acquireAllPushTokens();
  if (tokens.length === 0) {
    logAppEvent("push.token_unavailable", {
      platform: Platform.OS,
      hasEasProjectId: Boolean(resolveExpoProjectId()),
    });
    return;
  }

  const deviceId = session.deviceId || (await getOrCreateBackendDeviceId());
  for (const entry of tokens) {
    try {
      await callEmulatorFunction("registerPushToken", {
        uid: session.uid,
        deviceId,
        token: entry.token,
        platform: Platform.OS,
        tokenKind: entry.kind,
      });
      logAppEvent("push.token_registered", {
        platform: Platform.OS,
        kind: entry.kind,
      });
    } catch (err) {
      logAppError("push.register", err, { kind: entry.kind });
    }
  }
}

/** Legacy helper — requests permission immediately (prefer pre-prompt + registerPushTokenWithBackend). */
export async function registerOsPushToken(session: {
  uid: string;
  deviceId: string;
}): Promise<void> {
  const status = await requestOsNotificationPermission();
  if (!isOsNotificationPermissionGranted(status)) return;
  await registerPushTokenWithBackend(session);
}

export type PushNotificationData = Record<string, unknown>;

export function parsePushNotificationData(
  data: Record<string, unknown> | undefined
): PushNotificationData {
  return data ?? {};
}

export function conversationIdFromNotificationData(
  data: Record<string, unknown> | undefined
): string {
  return String(data?.conversationId ?? "").trim();
}

export function pushNotificationType(data: PushNotificationData): string {
  return String(data.type ?? "").trim();
}

/** Foreground delivery — FCM can arrive before Firestore listeners catch up. */
export function addNotificationReceivedListener(
  onPush: (data: PushNotificationData) => void
): () => void {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    onPush(parsePushNotificationData(notification.request.content.data));
  });
  return () => sub.remove();
}

export function addNotificationResponseListener(
  onPush: (data: PushNotificationData) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
    onPush(parsePushNotificationData(response.notification.request.content.data));
  });
  return () => sub.remove();
}
