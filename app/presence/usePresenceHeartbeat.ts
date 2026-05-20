import { useEffect, useRef } from "react";



import { logAppError } from "../../telemetry";

import {

  collectFriendPresenceUids,

  PRESENCE_HEARTBEAT_MS,

  pollFriendPresence,

  publishActivePresence,

  setBackgroundPresence,

} from "./heartbeat";

import type { Friend } from "../domain/types";

import type { BackendSession } from "../messaging/types";



export function usePresenceHeartbeat(params: {

  demoOfflineMode: boolean;

  signedIn: boolean;

  backendSessionReady: boolean;

  initialServerSyncDone: boolean;

  appLifecycleState: string;

  getBackendSession: () => BackendSession | null;

  allFriends: Friend[];

  friendIdToBackendUid: Record<string, string>;

  setPresenceOnlineByBackendUid: (

    updater: (current: Record<string, boolean>) => Record<string, boolean>

  ) => void;

}): void {

  const {

    demoOfflineMode,

    signedIn,

    backendSessionReady,

    initialServerSyncDone,

    appLifecycleState,

    getBackendSession,

    allFriends,

    friendIdToBackendUid,

    setPresenceOnlineByBackendUid,

  } = params;



  const allFriendsRef = useRef(allFriends);

  const friendIdToBackendUidRef = useRef(friendIdToBackendUid);

  allFriendsRef.current = allFriends;

  friendIdToBackendUidRef.current = friendIdToBackendUid;



  /** Publish own presence as soon as the device session is ready (friends not required). */

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

    };

    void tick();

    const id = setInterval(() => void tick(), PRESENCE_HEARTBEAT_MS);

    return () => {

      cancelled = true;

      clearInterval(id);

    };

  }, [

    signedIn,

    backendSessionReady,

    demoOfflineMode,

    getBackendSession,

    appLifecycleState,

  ]);



  /** Poll accepted friends' presence after boot roster is available. */

  useEffect(() => {

    if (!signedIn || !backendSessionReady || !initialServerSyncDone || demoOfflineMode) return;



    let cancelled = false;

    const tick = async () => {

      if (cancelled || appLifecycleState !== "active") return;

      const session = getBackendSession();

      if (!session) return;

      const now = Date.now();

      const friendUids = collectFriendPresenceUids({

        allFriends: allFriendsRef.current,

        friendIdToBackendUid: friendIdToBackendUidRef.current,

        sessionUid: session.uid,

      });

      if (friendUids.length === 0) return;

      try {

        const nextOnline = await pollFriendPresence({ session, friendUids, now });

        if (cancelled) return;

        setPresenceOnlineByBackendUid((current) => {

          let changed = false;

          const merged = { ...current };

          for (const uid of friendUids) {

            if (merged[uid] === nextOnline[uid]) continue;

            merged[uid] = nextOnline[uid];

            changed = true;

          }

          return changed ? merged : current;

        });

      } catch (err) {

        logAppError("presence.poll", err, { uid: session.uid, friendCount: friendUids.length });

      }

    };

    void tick();

    const id = setInterval(() => void tick(), PRESENCE_HEARTBEAT_MS);

    return () => {

      cancelled = true;

      clearInterval(id);

    };

  }, [

    signedIn,

    backendSessionReady,

    initialServerSyncDone,

    demoOfflineMode,

    getBackendSession,

    appLifecycleState,

    setPresenceOnlineByBackendUid,

    allFriends,

  ]);



  useEffect(() => {

    const session = getBackendSession();

    if (!session || !signedIn || demoOfflineMode) return;

    if (appLifecycleState === "active") return;

    void setBackgroundPresence(session).catch(() => {

      // Presence should never block app usage.

    });

  }, [appLifecycleState, signedIn, demoOfflineMode, getBackendSession]);

}


