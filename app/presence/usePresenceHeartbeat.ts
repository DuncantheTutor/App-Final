import { useEffect } from "react";



import { logAppError } from "../../telemetry";

import {

  PRESENCE_HEARTBEAT_MS,

  publishActivePresence,

  repairPresenceAuthAndHeartbeat,

  setBackgroundPresence,

} from "./heartbeat";

import type { BackendSession } from "../messaging/types";



export function usePresenceHeartbeat(params: {

  demoOfflineMode: boolean;

  signedIn: boolean;

  backendSessionReady: boolean;

  initialServerSyncDone: boolean;

  appLifecycleState: string;

  getBackendSession: () => BackendSession | null;

  /** Kept for API stability; online state comes from the Firestore presence listener. */

  presenceRosterKey: string;

}): void {

  const {

    demoOfflineMode,

    signedIn,

    backendSessionReady,

    initialServerSyncDone,

    appLifecycleState,

    getBackendSession,

  } = params;



  /** Publish own presence while foreground; friends read via Firestore listener (no callable poll loop). */

  useEffect(() => {

    if (!signedIn || !backendSessionReady || demoOfflineMode) return;



    let cancelled = false;

    const tick = async () => {

      if (cancelled || appLifecycleState !== "active") return;

      const session = getBackendSession();

      if (!session) return;

      try {

        await repairPresenceAuthAndHeartbeat(session);

      } catch (err) {

        logAppError("presence.publish", err, { uid: session.uid });

      }

    };



    void tick();

    const id = setInterval(() => void tick(), PRESENCE_HEARTBEAT_MS);

    return () => {

      cancelled = true;

      clearInterval(id);

    };

  }, [signedIn, backendSessionReady, demoOfflineMode, getBackendSession, appLifecycleState]);



  /** One-shot publish after boot so friends see us online without waiting for the interval. */

  useEffect(() => {

    if (!signedIn || !backendSessionReady || !initialServerSyncDone || demoOfflineMode) return;

    if (appLifecycleState !== "active") return;

    const session = getBackendSession();

    if (!session) return;

    void publishActivePresence(session, Date.now()).catch((err) => {

      logAppError("presence.publish.boot", err, { uid: session.uid });

    });

  }, [

    signedIn,

    backendSessionReady,

    initialServerSyncDone,

    demoOfflineMode,

    getBackendSession,

    appLifecycleState,

  ]);



  useEffect(() => {

    const session = getBackendSession();

    if (!session || !signedIn || demoOfflineMode) return;

    if (appLifecycleState === "active") return;

    void setBackgroundPresence(session).catch(() => undefined);

  }, [appLifecycleState, signedIn, demoOfflineMode, getBackendSession]);

}


