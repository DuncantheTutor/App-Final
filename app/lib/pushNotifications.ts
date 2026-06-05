import * as Notifications from "expo-notifications";

import Constants from "expo-constants";

import { Platform } from "react-native";

import { callEmulatorFunction, getOrCreateBackendDeviceId } from "../../backendBridge";

import { logAppError, logAppEvent } from "../../telemetry";

export type OsNotificationPermissionStatus = "granted" | "denied" | "undetermined";

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

async function acquirePushToken(): Promise<string | null> {
  if (Platform.OS === "android") {
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      const token = typeof device.data === "string" ? device.data.trim() : "";
      if (token) return token;
    } catch (err) {
      logAppError("push.device_token", err, {});
    }
  }
  try {
    const projectId = resolveExpoProjectId();
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data?.trim();
    if (token) return token;
  } catch (err) {
    logAppError("push.expo_token", err, {});
  }
  if (Platform.OS !== "android") {
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      const token = typeof device.data === "string" ? device.data.trim() : "";
      if (token) return token;
    } catch (err) {
      logAppError("push.device_token", err, {});
    }
  }
  return null;
}

/** Registers FCM/APNs token with backend — assumes OS permission is already granted. */
export async function registerPushTokenWithBackend(session: {
  uid: string;
  deviceId: string;
}): Promise<void> {
  if (Platform.OS === "web") return;
  const status = await getOsNotificationPermissionStatus();
  if (!isOsNotificationPermissionGranted(status)) return;
  await ensureAndroidMessagesChannel();
  const token = await acquirePushToken();
  if (!token) {
    logAppEvent("push.token_unavailable", { platform: Platform.OS });
    return;
  }
  const deviceId = session.deviceId || (await getOrCreateBackendDeviceId());
  await callEmulatorFunction("registerPushToken", {
    uid: session.uid,
    deviceId,
    token,
    platform: Platform.OS,
  });
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
