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
  export function getExpoPushTokenAsync(): Promise<{ data: string }>;

  export type NotificationResponse = {
    notification: {
      request: { content: { data?: Record<string, unknown> } };
    };
  };

  export function addNotificationResponseReceivedListener(
    listener: (response: NotificationResponse) => void
  ): { remove: () => void };
}
