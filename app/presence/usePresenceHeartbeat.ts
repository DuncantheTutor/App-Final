import { useEffect, useRef } from "react";



import { logAppError } from "../../telemetry";

import {
  collectFriendPresenceUids,
  PRESENCE_HEARTBEAT_MS,
  pollFriendPresence,
  publishActivePresence,
  repairPresenceAuthAndHeartbeat,
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

  /** Changes when boot roster or Firestore friendships listener updates. */
  presenceRosterKey: string;

  acceptedFriendBackendUidsRef: { current: Set<string> };

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

    presenceRosterKey,

    acceptedFriendBackendUidsRef,

    setPresenceOnlineByBackendUid,

  } = params;

  const allFriendsRef = useRef(allFriends);

  const friendIdToBackendUidRef = useRef(friendIdToBackendUid);

  allFriendsRef.current = allFriends;

  friendIdToBackendUidRef.current = friendIdToBackendUid;

  const mergePresencePoll = (friendUids: string[], nextOnline: Record<string, boolean>) => {
    if (friendUids.length === 0) return;
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
  };



  /** Publish own presence as soon as the device session is ready (friends not required). */

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
        acceptedFriendBackendUids: acceptedFriendBackendUidsRef.current,
      });

      if (friendUids.length === 0) return;

      try {
        const nextOnline = await pollFriendPresence({ session, friendUids, now });
        if (cancelled) return;
        mergePresencePoll(friendUids, nextOnline);
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

  /** After boot friends load, publish + poll once immediately (don't wait 8s). */
  useEffect(() => {
    if (!signedIn || !backendSessionReady || !initialServerSyncDone || demoOfflineMode) return;
    if (appLifecycleState !== "active") return;

    let cancelled = false;
    const run = async () => {
      const session = getBackendSession();
      if (!session || cancelled) return;
      const now = Date.now();
      try {
        await publishActivePresence(session, now);
      } catch (err) {
        logAppError("presence.publish.boot", err, { uid: session.uid });
      }
      const friendUids = collectFriendPresenceUids({
        allFriends: allFriendsRef.current,
        friendIdToBackendUid: friendIdToBackendUidRef.current,
        sessionUid: session.uid,
        acceptedFriendBackendUids: acceptedFriendBackendUidsRef.current,
      });
      if (friendUids.length === 0 || cancelled) return;
      try {
        const nextOnline = await pollFriendPresence({ session, friendUids, now });
        if (cancelled) return;
        mergePresencePoll(friendUids, nextOnline);
      } catch (err) {
        logAppError("presence.poll.boot", err, { uid: session.uid });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    demoOfflineMode,
    getBackendSession,
    appLifecycleState,
    setPresenceOnlineByBackendUid,
    presenceRosterKey,
  ]);

  /** Roster loaded/changed: repair viewer mirrors and poll (boot poll often ran with 0 friends). */
  useEffect(() => {
    if (!signedIn || !backendSessionReady || !initialServerSyncDone || demoOfflineMode) return;
    if (appLifecycleState !== "active") return;
    if (!presenceRosterKey.trim()) return;

    let cancelled = false;
    const run = async () => {
      const session = getBackendSession();
      if (!session || cancelled) return;
      const now = Date.now();
      try {
        await repairPresenceAuthAndHeartbeat(session);
      } catch (err) {
        logAppError("presence.repair.roster", err, { uid: session.uid });
      }
      const friendUids = collectFriendPresenceUids({
        allFriends: allFriendsRef.current,
        friendIdToBackendUid: friendIdToBackendUidRef.current,
        sessionUid: session.uid,
        acceptedFriendBackendUids: acceptedFriendBackendUidsRef.current,
      });
      if (friendUids.length === 0 || cancelled) return;
      try {
        const nextOnline = await pollFriendPresence({ session, friendUids, now });
        if (cancelled) return;
        mergePresencePoll(friendUids, nextOnline);
      } catch (err) {
        logAppError("presence.poll.roster", err, {
          uid: session.uid,
          friendCount: friendUids.length,
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    demoOfflineMode,
    getBackendSession,
    appLifecycleState,
    presenceRosterKey,
    setPresenceOnlineByBackendUid,
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


