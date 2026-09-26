import { useEffect } from "react";

import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { logAppError } from "../../telemetry";
import {
  getOsNotificationPermissionStatus,
  isOsNotificationPermissionGranted,
  registerPushTokenWithBackend,
} from "../lib/pushNotifications";
import type { BackendSession } from "../messaging/types";

/** Register the device push token after sign-in, and again when the app returns to the foreground. */
export function usePushRegistration(params: {
  signedIn: boolean;
  demoOfflineMode: boolean;
  osNotificationGranted: boolean;
  getBackendSession: () => BackendSession | null;
  backendSessionReady: boolean;
  appLifecycleState: string;
  setOsNotificationGranted: (granted: boolean) => void;
}): void {
  const {
    signedIn,
    demoOfflineMode,
    osNotificationGranted,
    getBackendSession,
    backendSessionReady,
    appLifecycleState,
    setOsNotificationGranted,
  } = params;

  useEffect(() => {
    if (!signedIn || demoOfflineMode || !osNotificationGranted) return;
    const session = getBackendSession();
    if (!session) return;
    void registerPushTokenWithBackend(session).catch((err) => {
      logAppError("push.register", err, {});
    });
  }, [signedIn, demoOfflineMode, osNotificationGranted, getBackendSession, backendSessionReady]);

  useEffect(() => {
    if (!signedIn || demoOfflineMode) return;
    if (appLifecycleState !== "active") return;
    const session = getBackendSession();
    if (!session) return;
    void (async () => {
      const osStatus = await getOsNotificationPermissionStatus();
      const granted = isOsNotificationPermissionGranted(osStatus);
      setOsNotificationGranted(granted);
      if (!granted) return;
      const authUid = firebaseAuth.currentUser?.uid;
      if (authUid) {
        try {
          await callEmulatorFunction("registerFirebaseAuthUid", {
            uid: session.uid,
            deviceId: session.deviceId,
            firebaseAuthUid: authUid,
          });
        } catch (err) {
          logAppError("push.foreground.auth_map", err, { uid: session.uid });
        }
      }
      await registerPushTokenWithBackend(session);
    })().catch((err) => {
      logAppError("push.foreground.register", err, {});
    });
  }, [signedIn, demoOfflineMode, appLifecycleState, getBackendSession, backendSessionReady, setOsNotificationGranted]);
}
