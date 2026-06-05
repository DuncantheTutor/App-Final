import { callEmulatorFunction, backendUidForFriendId } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import { collection, onSnapshot, query as firestoreQuery, where } from "firebase/firestore";
import { firebaseAuth, getFirestoreDb } from "../../firebaseAuthClient";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import { dedupeFriendsByBackendUid } from "../lib/mergeFriendsCatalog";
import { resolveParticipantToAppUid } from "../lib/resolveParticipantAppUid";
import { mergeProfileBio } from "../lib/mergeProfileBio";
import { mergeProfilePictureUrl } from "../lib/profilePictureUrl";
import type { Friend } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export const CURRENT_USER_LOCAL_ID = "me";

export function attachFriendRosterListener(params: {
  session: BackendSession;
  acceptedFriendBackendUidsRef: { current: Set<string> };
  onServerFriendBackendUidsChanged?: (uids: Set<string>) => void;
  addedFriendsFromRitualRef: { current: Friend[] };
  setAddedFriendsFromRitual: (updater: (current: Friend[]) => Friend[]) => void;
  setUnfriendedIds: (updater: (current: string[]) => string[]) => void;
  setFriendLinksState: (
    updater: (current: Record<string, string[]>) => Record<string, string[]>
  ) => void;
  addUndirectedEdge: (
    links: Record<string, string[]>,
    a: string,
    b: string
  ) => Record<string, string[]>;
  removeUndirectedEdge: (
    links: Record<string, string[]>,
    a: string,
    b: string
  ) => Record<string, string[]>;
  /** Local unfriend intent — roster must not re-accept until server drops the edge. */
  stickyUnfriendedFriendIdsRef?: { current: Set<string> };
}): () => void {
  const {
    session,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged,
    addedFriendsFromRitualRef,
    setAddedFriendsFromRitual,
    setUnfriendedIds,
    setFriendLinksState,
    addUndirectedEdge,
    removeUndirectedEdge,
    stickyUnfriendedFriendIdsRef,
  } = params;

  const firebaseAuthUid = firebaseAuth.currentUser?.uid;
  if (!firebaseAuthUid) return () => {};

  let cancelled = false;
  const db = getFirestoreDb();
  const q = firestoreQuery(
    collection(db, "friendships"),
    where("participantAuthUids", "array-contains", firebaseAuthUid)
  );

  const profileFetchAttemptedRef = new Set<string>();
  const liveFriendBackendUidsRef = { current: new Set<string>() };
  const lastProfileBatchRefreshMsRef = { current: 0 };
  let snapshotGeneration = 0;

  const unsubscribe = onSnapshot(
    q,
    async (snap) => {
      if (cancelled) return;
      const generation = ++snapshotGeneration;

      const publishServerFriendUids = (uids: Set<string>) => {
        acceptedFriendBackendUidsRef.current = uids;
        onServerFriendBackendUidsChanged?.(uids);
      };

      if (snap.docs.length === 0) {
        // Do not publish an empty uid set on cache/startup races — that forces every
        // chat title to "User" until the next non-empty snapshot. Only clear when
        // we previously had live friendship docs and the server snapshot is empty.
        if (snap.metadata.fromCache) return;
        if (liveFriendBackendUidsRef.current.size > 0) {
          publishServerFriendUids(new Set());
          liveFriendBackendUidsRef.current = new Set();
        }
        return;
      }

      const incomingByBackendUid = new Map<
        string,
        { backendUid: string; friendId: string; status: string }
      >();
      for (const doc of snap.docs) {
        const data = doc.data() as { participants?: unknown; status?: unknown };
        if (data.status !== "accepted") continue;
        const participants = Array.isArray(data.participants)
          ? (data.participants as unknown[])
              .map((x) => String(x ?? "").trim())
              .filter((x) => x.length > 0)
          : [];
        let friendUid = participants.find((p) => p !== session.uid) ?? "";
        if (!friendUid.startsWith("u_")) {
          const resolved = await resolveParticipantToAppUid(friendUid);
          if (resolved) friendUid = resolved;
        }
        if (!friendUid.startsWith("u_")) continue;
        if (friendUid.startsWith("f_")) continue;
        const friendId = backendUidForFriendId(friendUid);
        incomingByBackendUid.set(friendUid, {
          backendUid: friendUid,
          friendId,
          status: String(data.status),
        });
      }

      const liveBackendUids = new Set(incomingByBackendUid.keys());
      publishServerFriendUids(liveBackendUids);
      const removedBackendUids = [...liveFriendBackendUidsRef.current].filter(
        (uid) => !liveBackendUids.has(uid)
      );
      liveFriendBackendUidsRef.current = liveBackendUids;

      setUnfriendedIds((cur) => {
        const reacceptedFriendIds = [...liveBackendUids].map((uid) => backendUidForFriendId(uid));
        const next = cur.filter((id) => {
          if (stickyUnfriendedFriendIdsRef?.current.has(id)) return true;
          return !reacceptedFriendIds.includes(id);
        });
        return next.length === cur.length ? cur : next;
      });

      if (removedBackendUids.length > 0) {
        for (const uid of removedBackendUids) {
          stickyUnfriendedFriendIdsRef?.current.delete(backendUidForFriendId(uid));
        }
        setUnfriendedIds((cur) => {
          const next = new Set(cur);
          let changed = false;
          for (const uid of removedBackendUids) {
            const friendId = backendUidForFriendId(uid);
            if (!next.has(friendId)) {
              next.add(friendId);
              changed = true;
            }
          }
          return changed ? [...next] : cur;
        });
      }

      const knownByBackendUid = new Map<string, Friend>();
      for (const f of addedFriendsFromRitualRef.current) {
        if (f.backendUid) knownByBackendUid.set(f.backendUid, f);
      }
      const uidsNeedingProfile = [...liveBackendUids].filter(
        (uid) => !knownByBackendUid.has(uid) && !profileFetchAttemptedRef.has(uid)
      );
      const shouldBatchRefreshProfiles =
        uidsNeedingProfile.length > 0 ||
        Date.now() - lastProfileBatchRefreshMsRef.current > 45_000;
      const profileTargetUids = shouldBatchRefreshProfiles
        ? [...liveBackendUids].slice(0, 200)
        : uidsNeedingProfile;
      let fetchedProfiles: Record<
        string,
        { username?: string; bio?: string; profilePictureUrl?: string | null } | null
      > = {};
      if (profileTargetUids.length > 0) {
        try {
          const profilesRes = await callEmulatorFunction<{
            profiles?: Record<
              string,
              { username?: string; bio?: string; profilePictureUrl?: string | null } | null
            >;
          }>("getUserProfiles", {
            uid: session.uid,
            deviceId: session.deviceId,
            targetUids: profileTargetUids,
          });
          fetchedProfiles = profilesRes.profiles ?? {};
          if (shouldBatchRefreshProfiles) {
            lastProfileBatchRefreshMsRef.current = Date.now();
          }
          for (const uid of profileTargetUids) {
            profileFetchAttemptedRef.add(uid);
          }
        } catch (err) {
          logAppError("friendships.listener.profiles", err, {
            uid: session.uid,
            count: profileTargetUids.length,
          });
        }
      }
      if (cancelled || generation !== snapshotGeneration) return;

      const priorByBackendUid = new Map<string, Friend>();
      for (const f of addedFriendsFromRitualRef.current) {
        const bu = f.backendUid?.trim();
        if (bu?.startsWith("u_")) priorByBackendUid.set(bu, f);
      }

      const nextFriends: Friend[] = [];
      for (const uid of liveBackendUids) {
        const friendId = backendUidForFriendId(uid);
        const prior = priorByBackendUid.get(uid);
        const profile = fetchedProfiles[uid] ?? {};
        nextFriends.push({
          id: friendId,
          backendUid: uid,
          displayName: friendDisplayNameFromProfile(
            profile?.username ?? prior?.displayName,
            uid
          ),
          online: prior?.online ?? false,
          profilePictureUrl: mergeProfilePictureUrl(
            profile?.profilePictureUrl,
            prior?.profilePictureUrl
          ),
          bio: mergeProfileBio(profile?.bio, prior?.bio),
          messageCount: prior?.messageCount ?? 0,
        });
      }

      setAddedFriendsFromRitual((current) => {
        const merged = dedupeFriendsByBackendUid([
          ...nextFriends,
          ...current.filter((f) => {
            const bu = f.backendUid?.trim();
            return bu?.startsWith("u_") && !liveBackendUids.has(bu);
          }),
        ]);
        if (merged.length === current.length && merged.every((f, i) => f === current[i])) {
          return current;
        }
        return merged;
      });

      setFriendLinksState((current) => {
        let next = current;
        const prevFriendIds = addedFriendsFromRitualRef.current
          .map((f) => ({ id: f.id, bu: f.backendUid?.trim() }))
          .filter((x): x is { id: string; bu: string } => Boolean(x.bu));
        for (const { id, bu } of prevFriendIds) {
          if (!liveBackendUids.has(bu)) {
            next = removeUndirectedEdge(next, CURRENT_USER_LOCAL_ID, id);
          }
        }
        for (const uid of liveBackendUids) {
          next = addUndirectedEdge(next, CURRENT_USER_LOCAL_ID, backendUidForFriendId(uid));
        }
        return next;
      });
    },
    (err) => {
      logAppError("friendships.listener", err, {});
    }
  );

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
