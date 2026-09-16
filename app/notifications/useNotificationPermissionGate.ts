import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { AppStateStatus } from "react-native";

import { DEMO_OFFLINE_MODE } from "../theme/preludeConstants";
import type { BackendSession } from "../messaging/types";
import { logAppError } from "../../telemetry";
import {
  markNotificationPrePromptOsRequested,
  readNotificationPrePromptOsRequested,
} from "../lib/notificationPermissionGate";
import {
  getOsNotificationPermissionStatus,
  isOsNotificationPermissionGranted,
  registerPushTokenWithBackend,
  requestOsNotificationPermission,
} from "../lib/pushNotifications";

export type NotificationPermissionGate = {
  notificationGateReady: boolean;
  showNotificationPrePrompt: boolean;
  notificationPrePromptBusy: boolean;
  osNotificationGranted: boolean;
  setOsNotificationGranted: (granted: boolean) => void;
  refreshNotificationPermissionGate: () => Promise<void>;
  onAllowNotificationsPrePrompt: () => Promise<void>;
  onDeclineNotificationsPrePrompt: () => Promise<void>;
};

/**
 * Owns the in-app notification pre-prompt and OS permission snapshot.
 * Push token listeners still live in MainApp.
 */
export function useNotificationPermissionGate(params: {
  signedIn: boolean;
  sessionEmailRef: MutableRefObject<string | null>;
  appLifecycleState: AppStateStatus;
  getBackendSession: () => BackendSession | null;
  waitForBackendSession: (maxMs?: number) => Promise<BackendSession | null>;
}): NotificationPermissionGate {
  const {
    signedIn,
    sessionEmailRef,
    appLifecycleState,
    getBackendSession,
    waitForBackendSession,
  } = params;

  const [notificationGateReady, setNotificationGateReady] = useState(false);
  const [showNotificationPrePrompt, setShowNotificationPrePrompt] = useState(false);
  const [notificationPrePromptBusy, setNotificationPrePromptBusy] = useState(false);
  const [osNotificationGranted, setOsNotificationGranted] = useState(false);
  const notificationPrePromptDismissedSessionRef = useRef(false);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  const refreshNotificationPermissionGate = useCallback(async () => {
    if (!signedInRef.current || DEMO_OFFLINE_MODE) {
      setNotificationGateReady(false);
      setShowNotificationPrePrompt(false);
      setOsNotificationGranted(false);
      return;
    }
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) {
      setNotificationGateReady(true);
      setShowNotificationPrePrompt(false);
      return;
    }
    const osStatus = await getOsNotificationPermissionStatus();
    if (!signedInRef.current) return;
    const osRequested = await readNotificationPrePromptOsRequested(email);
    if (!signedInRef.current) return;
    setOsNotificationGranted(isOsNotificationPermissionGranted(osStatus));
    setShowNotificationPrePrompt(
      !notificationPrePromptDismissedSessionRef.current &&
        !osRequested &&
        (osStatus === "undetermined" || osStatus === "denied")
    );
    setNotificationGateReady(true);
  }, [sessionEmailRef]);

  useEffect(() => {
    if (!signedIn) {
      notificationPrePromptDismissedSessionRef.current = false;
      setNotificationGateReady(false);
      setShowNotificationPrePrompt(false);
      setOsNotificationGranted(false);
      return;
    }
    if (DEMO_OFFLINE_MODE) {
      setNotificationGateReady(true);
      setShowNotificationPrePrompt(false);
      setOsNotificationGranted(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      await refreshNotificationPermissionGate();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, refreshNotificationPermissionGate]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || appLifecycleState !== "active") return;
    void refreshNotificationPermissionGate();
  }, [signedIn, appLifecycleState, refreshNotificationPermissionGate]);

  const onAllowNotificationsPrePrompt = useCallback(async () => {
    setNotificationPrePromptBusy(true);
    notificationPrePromptDismissedSessionRef.current = true;
    setShowNotificationPrePrompt(false);
    try {
      const status = await requestOsNotificationPermission();
      if (!signedInRef.current) return;
      const granted = isOsNotificationPermissionGranted(status);
      setOsNotificationGranted(granted);
      const email = sessionEmailRef.current?.trim().toLowerCase();
      if (email) await markNotificationPrePromptOsRequested(email);
      if (!signedInRef.current) return;
      if (granted) {
        const session = (await waitForBackendSession()) ?? getBackendSession();
        if (!signedInRef.current) return;
        if (session) {
          await registerPushTokenWithBackend(session);
        }
      }
    } catch (err) {
      logAppError("push.pre_prompt_allow", err, {});
    } finally {
      setNotificationPrePromptBusy(false);
    }
  }, [getBackendSession, sessionEmailRef, waitForBackendSession]);

  const onDeclineNotificationsPrePrompt = useCallback(async () => {
    notificationPrePromptDismissedSessionRef.current = true;
    setShowNotificationPrePrompt(false);
  }, []);

  return {
    notificationGateReady,
    showNotificationPrePrompt,
    notificationPrePromptBusy,
    osNotificationGranted,
    setOsNotificationGranted,
    refreshNotificationPermissionGate,
    onAllowNotificationsPrePrompt,
    onDeclineNotificationsPrePrompt,
  };
}
