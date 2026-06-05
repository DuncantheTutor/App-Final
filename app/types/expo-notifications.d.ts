declare module "expo-notifications" {
  export type NotificationPermissionsStatus = { status: string };

  export function setNotificationHandler(handler: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
      shouldShowBanner: boolean;
      shouldShowList: boolean;
    }>;
  }): void;

  export function getPermissionsAsync(): Promise<NotificationPermissionsStatus>;
  export function requestPermissionsAsync(): Promise<NotificationPermissionsStatus>;
  export function getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string }>;
  export function getDevicePushTokenAsync(): Promise<{ type: string; data: string }>;

  export enum AndroidImportance {
    MIN = 1,
    LOW = 2,
    DEFAULT = 3,
    HIGH = 4,
    MAX = 5,
  }

  export function setNotificationChannelAsync(
    channelId: string,
    channel: {
      name: string;
      importance: AndroidImportance;
      sound?: string | null;
      vibrationPattern?: number[];
      enableVibrate?: boolean;
      lightColor?: string;
    }
  ): Promise<unknown>;

  export type NotificationResponse = {
    notification: {
      request: { content: { data?: Record<string, unknown> } };
    };
  };

  export type Notification = {
    request: { content: { data?: Record<string, unknown> } };
  };

  export function addNotificationReceivedListener(
    listener: (notification: Notification) => void
  ): { remove: () => void };

  export function addNotificationResponseReceivedListener(
    listener: (response: NotificationResponse) => void
  ): { remove: () => void };
}
