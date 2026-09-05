import { useCallback, useRef, useState, type MutableRefObject } from "react";

import type { BackendSession } from "../messaging/types";

export type BackendSessionController = {
  backendSessionReady: boolean;
  backendAuthUidRef: MutableRefObject<string | null>;
  backendDeviceIdRef: MutableRefObject<string | null>;
  backendSessionReadyRef: MutableRefObject<boolean>;
  readBackendSessionFromRefs: () => BackendSession | null;
  getBackendSession: () => BackendSession | null;
  waitForBackendSession: (maxMs?: number) => Promise<BackendSession | null>;
  markSessionReady: (session: BackendSession) => void;
  clearSession: () => void;
};

export function useBackendSession(): BackendSessionController {
  const backendAuthUidRef = useRef<string | null>(null);
  const backendDeviceIdRef = useRef<string | null>(null);
  const [backendSessionReady, setBackendSessionReady] = useState(false);
  const backendSessionReadyRef = useRef(false);

  const readBackendSessionFromRefs = useCallback((): BackendSession | null => {
    const uid = backendAuthUidRef.current;
    const deviceId = backendDeviceIdRef.current;
    if (!backendSessionReadyRef.current || !uid || !deviceId) return null;
    return { uid, deviceId };
  }, []);

  const getBackendSession = useCallback(
    () => readBackendSessionFromRefs(),
    [backendSessionReady, readBackendSessionFromRefs]
  );

  const markSessionReady = useCallback((session: BackendSession) => {
    backendAuthUidRef.current = session.uid;
    backendDeviceIdRef.current = session.deviceId;
    backendSessionReadyRef.current = true;
    setBackendSessionReady(true);
  }, []);

  const clearSession = useCallback(() => {
    backendAuthUidRef.current = null;
    backendDeviceIdRef.current = null;
    backendSessionReadyRef.current = false;
    setBackendSessionReady(false);
  }, []);

  const waitForBackendSession = useCallback(
    async (maxMs = 10_000): Promise<BackendSession | null> => {
      const deadline = Date.now() + maxMs;
      while (Date.now() < deadline) {
        const session = readBackendSessionFromRefs();
        if (session) return session;
        await new Promise<void>((r) => setTimeout(r, 200));
      }
      return null;
    },
    [readBackendSessionFromRefs]
  );

  return {
    backendSessionReady,
    backendAuthUidRef,
    backendDeviceIdRef,
    backendSessionReadyRef,
    readBackendSessionFromRefs,
    getBackendSession,
    waitForBackendSession,
    markSessionReady,
    clearSession,
  };
}
