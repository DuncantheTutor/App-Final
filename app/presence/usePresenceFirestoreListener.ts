import { useEffect, useRef, useState } from "react";

import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query as firestoreQuery, where } from "firebase/firestore";
import { firebaseAuth, getFirestoreDb } from "../../firebaseAuthClient";
import { logAppError } from "../../telemetry";
import { normalizePresenceHeartbeatMs } from "../lib/presenceNormalize";
import { PRESENCE_ONLINE_WINDOW_MS } from "../theme/preludeConstants";
import type { BackendSession } from "../messaging/types";
import { presenceSnapshotSaysActive } from "./presenceSnapshot";

/**
 * Real-time presence via Firestore `presence` docs (`viewerAuthUids` mirror).
 * Complements callable heartbeat + `getFriendPresence` polling.
 */
export function usePresenceFirestoreListener(params: {
  demoOfflineMode: boolean;
  signedIn: boolean;
  backendSessionReady: boolean;
  initialServerSyncDone: boolean;
  getBackendSession: () => BackendSession | null;
  setPresenceOnlineByBackendUid: (
    updater: (current: Record<string, boolean>) => Record<string, boolean>
  ) => void;
}): void {
  const {
    demoOfflineMode,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    getBackendSession,
    setPresenceOnlineByBackendUid,
  } = params;

  const getBackendSessionRef = useRef(getBackendSession);
  getBackendSessionRef.current = getBackendSession;
  /** Heartbeat time from the last foreground snapshot. Aged from that timestamp, not from when the snapshot arrived. */
  const heartbeatAtRef = useRef<Record<string, number>>({});

  const [viewerFirebaseAuthUid, setViewerFirebaseAuthUid] = useState(
    () => firebaseAuth.currentUser?.uid ?? null
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      setViewerFirebaseAuthUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (demoOfflineMode || !signedIn || !backendSessionReady || !initialServerSyncDone) return;

    const firebaseAuthUid = viewerFirebaseAuthUid;
    if (!firebaseAuthUid) return;

    let cancelled = false;
    const db = getFirestoreDb();
    const q = firestoreQuery(
      collection(db, "presence"),
      where("viewerAuthUids", "array-contains", firebaseAuthUid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (cancelled || snap.metadata.fromCache) return;
        const session = getBackendSessionRef.current();
        if (!session) return;
        const now = Date.now();
        const nextOnline: Record<string, boolean> = {};
        for (const doc of snap.docs) {
          const data = doc.data() as {
            uid?: string;
            state?: string;
            online?: boolean;
            heartbeatAtMs?: unknown;
          };
          const ownerUid = String(data.uid ?? doc.id).trim();
          if (!ownerUid.startsWith("u_") || ownerUid === session.uid) continue;
          const heartbeatAtMs = normalizePresenceHeartbeatMs(data.heartbeatAtMs);
          const active = presenceSnapshotSaysActive(
            { state: data.state, online: data.online, heartbeatAtMs },
            now,
            PRESENCE_ONLINE_WINDOW_MS
          );
          if (active) heartbeatAtRef.current[ownerUid] = heartbeatAtMs;
          else delete heartbeatAtRef.current[ownerUid];
          nextOnline[ownerUid] = active;
        }
        // Only merge uids present in this snapshot — never mark friends offline
        // because their doc is missing from the query (stale viewerAuthUids, rules, or race).
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
      },
      (err) => {
        if (cancelled) return;
        logAppError(
          "presence.listener",
          err instanceof Error ? err : new Error(String(err)),
          { firebaseAuthUid }
        );
      }
    );

    const expireId = setInterval(() => {
      if (cancelled) return;
      const now = Date.now();
      const expired: string[] = [];
      for (const [uid, at] of Object.entries(heartbeatAtRef.current)) {
        const age = now - at;
        if (age > PRESENCE_ONLINE_WINDOW_MS || age < -PRESENCE_ONLINE_WINDOW_MS) expired.push(uid);
      }
      if (expired.length === 0) return;
      for (const uid of expired) delete heartbeatAtRef.current[uid];
      setPresenceOnlineByBackendUid((current) => {
        let changed = false;
        const merged = { ...current };
        for (const uid of expired) {
          if (merged[uid] === false) continue;
          merged[uid] = false;
          changed = true;
        }
        return changed ? merged : current;
      });
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(expireId);
      unsubscribe();
    };
  }, [
    demoOfflineMode,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    viewerFirebaseAuthUid,
    setPresenceOnlineByBackendUid,
  ]);
}
