import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { callEmulatorFunction, getOrCreateBackendDeviceId } from "../../backendBridge";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerOsPushToken(session: {
  uid: string;
  deviceId: string;
}): Promise<void> {
  if (Platform.OS === "web") return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data?.trim();
  if (!token) return;

  const deviceId = session.deviceId || (await getOrCreateBackendDeviceId());
  await callEmulatorFunction("registerPushToken", {
    uid: session.uid,
    deviceId,
    token,
    platform: Platform.OS,
  });
}

export function addNotificationResponseListener(
  onOpenChat: (conversationId: string) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
    const conversationId = String(
      response.notification.request.content.data?.conversationId ?? ""
    ).trim();
    if (conversationId) onOpenChat(conversationId);
  });
  return () => sub.remove();
}
