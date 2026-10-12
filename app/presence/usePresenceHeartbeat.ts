import { useEffect, useRef } from "react";



import { logAppError } from "../../telemetry";

import {

  pollFriendPresence,

  PRESENCE_HEARTBEAT_MS,

  publishActivePresence,

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

  /** Accepted friend app uids. Polled so a missing presence mirror does not leave everyone offline. */

  getFriendUids: () => string[];

  setPresenceOnlineByBackendUid: (

    updater: (current: Record<string, boolean>) => Record<string, boolean>

  ) => void;

  /** Kept for API stability; online state comes from the listener and the presence poll. */

  presenceRosterKey: string;

}): void {

  const {

    demoOfflineMode,

    signedIn,

    backendSessionReady,

    initialServerSyncDone,

    appLifecycleState,

    getBackendSession,

    getFriendUids,

    setPresenceOnlineByBackendUid,

    presenceRosterKey,

  } = params;

  const getFriendUidsRef = useRef(getFriendUids);

  getFriendUidsRef.current = getFriendUids;



  /** Publish own presence while foreground, and pull friend online flags from the server. */

  useEffect(() => {

    if (!signedIn || !backendSessionReady || demoOfflineMode) return;



    let cancelled = false;

    const tick = async () => {

      if (cancelled || appLifecycleState !== "active") return;

      const session = getBackendSession();

      if (!session) return;

      try {

        await publishActivePresence(session, Date.now());

      } catch (err) {

        logAppError("presence.publish", err, { uid: session.uid });

      }

      if (cancelled) return;

      const friendUids = getFriendUidsRef.current();

      if (friendUids.length === 0) return;

      try {

        const nextOnline = await pollFriendPresence({ session, friendUids, now: Date.now() });

        if (cancelled) return;

        setPresenceOnlineByBackendUid((current) => {

          let changed = false;

          const merged = { ...current };

          for (const [uid, value] of Object.entries(nextOnline)) {

            if (merged[uid] === value) continue;

            merged[uid] = value;

            changed = true;

          }

          return changed ? merged : current;

        });

      } catch (err) {

        logAppError("presence.poll", err, { uid: session.uid });

      }

    };



    void tick();

    const id = setInterval(() => void tick(), PRESENCE_HEARTBEAT_MS);

    return () => {

      cancelled = true;

      clearInterval(id);

    };

  }, [signedIn, backendSessionReady, demoOfflineMode, getBackendSession, appLifecycleState, presenceRosterKey, setPresenceOnlineByBackendUid]);



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


