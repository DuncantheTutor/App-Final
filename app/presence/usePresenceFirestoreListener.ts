import { useEffect, useRef, useState } from "react";

import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query as firestoreQuery, where } from "firebase/firestore";
import { firebaseAuth, getFirestoreDb } from "../../firebaseAuthClient";
import { logAppError } from "../../telemetry";
import { normalizePresenceHeartbeatMs } from "../lib/presenceNormalize";
import { PRESENCE_ONLINE_WINDOW_MS } from "../theme/preludeConstants";
import type { BackendSession } from "../messaging/types";

function presenceDocIsOnline(data: {
  state?: string;
  heartbeatAtMs?: unknown;
  online?: boolean;
}): boolean {
  const heartbeatAtMs = normalizePresenceHeartbeatMs(data.heartbeatAtMs);
  const fresh =
    Number.isFinite(heartbeatAtMs) &&
    heartbeatAtMs > 0 &&
    Date.now() - heartbeatAtMs <= PRESENCE_ONLINE_WINDOW_MS;
  if (!fresh) return false;
  if (data.online === true) return true;
  return data.state === "active";
}

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
        if (cancelled) return;
        const session = getBackendSessionRef.current();
        if (!session) return;
        const nextOnline: Record<string, boolean> = {};
        for (const doc of snap.docs) {
          const data = doc.data() as {
            uid?: string;
            state?: string;
            heartbeatAtMs?: number;
            online?: boolean;
          };
          const ownerUid = String(data.uid ?? doc.id).trim();
          if (!ownerUid.startsWith("u_") || ownerUid === session.uid) continue;
          nextOnline[ownerUid] = presenceDocIsOnline(data);
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

    return () => {
      cancelled = true;
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
