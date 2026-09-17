import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { collection, onSnapshot, query as firestoreQuery, where } from "firebase/firestore";

import { callEmulatorFunction } from "../../backendBridge";
import { decryptPayloadForRecipient } from "../../e2eeCrypto";
import { firebaseAuth, getFirestoreDb } from "../../firebaseAuthClient";
import { storageSetItem } from "../lib/encryptedLocalStorage";
import { mergeProfilePictureUrl } from "../lib/profilePictureUrl";
import { refreshFriendProfilesFromServer } from "../friends/refreshFriendProfiles";
import type { Friend } from "../domain/types";
import type { BackendSession, EncryptedSyncStateBundle } from "../messaging/types";
import { profilePictureStorageKey } from "../theme/preludeConstants";

/**
 * Push-based encrypted-profile delivery via Firestore `onSnapshot`.
 * Filters on the `recipientAuthUids` mirror that `putEncryptedProfile`
 * populates from the envelope keys, so a single listener delivers:
 *
 * - **self** picture updates pushed from another signed-in device (bio is read
 *   from `users.bio` via `getUserProfiles`, not this listener), and
 * - **friend** profile picture updates when ciphertext includes an HTTPS URL.
 */
export function useEncryptedProfileSync(params: {
  demoOfflineMode: boolean;
  signedIn: boolean;
  getBackendSession: () => BackendSession | null;
  sessionEmailRef: MutableRefObject<string | null>;
  myProfilePictureUrlRef: MutableRefObject<string | null>;
  setMyProfilePictureUrl: Dispatch<SetStateAction<string | null>>;
  addedFriendsFromRitualRef: MutableRefObject<Friend[]>;
  setAddedFriendsFromRitual: Dispatch<SetStateAction<Friend[]>>;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncStateBundle>>;
}): void {
  const {
    demoOfflineMode,
    signedIn,
    getBackendSession,
    sessionEmailRef,
    myProfilePictureUrlRef,
    setMyProfilePictureUrl,
    addedFriendsFromRitualRef,
    setAddedFriendsFromRitual,
    setEncryptedSyncState,
  } = params;

  useEffect(() => {
    if (demoOfflineMode) return;
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const firebaseAuthUid = firebaseAuth.currentUser?.uid;
    if (!firebaseAuthUid) return;

    let cancelled = false;
    const db = getFirestoreDb();
    const q = firestoreQuery(
      collection(db, "encryptedProfiles"),
      where("recipientAuthUids", "array-contains", firebaseAuthUid)
    );

    setEncryptedSyncState((current) => ({ ...current, profile: "syncing" }));

    const unsubscribe = onSnapshot(
      q,
      async (snap) => {
        if (cancelled) return;
        for (const doc of snap.docs) {
          const data = doc.data() as {
            ownerUid?: string;
            ciphertext?: string;
            nonce?: string;
            envelopes?: Record<string, string>;
          };
          const envelope = data.envelopes?.[session.uid];
          if (!envelope || !data.ciphertext || !data.nonce || !data.ownerUid) continue;
          try {
            const plain = await decryptPayloadForRecipient<{
              profilePictureUrl?: string | null;
            }>(session.uid, data.ciphertext, data.nonce, envelope);
            const rawPic = plain.profilePictureUrl;
            const safePic =
              typeof rawPic === "string" && /^https?:\/\//i.test(rawPic) ? rawPic : null;
            if (data.ownerUid === session.uid) {
              if (safePic) {
                setMyProfilePictureUrl(safePic);
                const email = sessionEmailRef.current?.trim().toLowerCase();
                if (email) {
                  void storageSetItem(profilePictureStorageKey(email), safePic).catch(
                    () => {}
                  );
                }
              } else {
                const ownerUid = session.uid;
                void callEmulatorFunction<{
                  profiles?: Record<
                    string,
                    { profilePictureUrl?: string | null } | null
                  >;
                }>("getUserProfiles", {
                  uid: session.uid,
                  deviceId: session.deviceId,
                  targetUids: [ownerUid],
                })
                  .then((res) => {
                    if (cancelled) return;
                    const fromUsers = res.profiles?.[ownerUid]?.profilePictureUrl;
                    const merged = mergeProfilePictureUrl(
                      fromUsers,
                      myProfilePictureUrlRef.current
                    );
                    if (!merged) return;
                    setMyProfilePictureUrl(merged);
                    const email = sessionEmailRef.current?.trim().toLowerCase();
                    if (email) {
                      void storageSetItem(profilePictureStorageKey(email), merged).catch(
                        () => {}
                      );
                    }
                  })
                  .catch(() => {
                    /* keep local HTTPS preview / AsyncStorage cache */
                  });
              }
            } else if (data.ownerUid?.startsWith("u_")) {
              if (safePic !== null) {
                setAddedFriendsFromRitual((current) =>
                  current.map((f) =>
                    f.backendUid === data.ownerUid
                      ? {
                          ...f,
                          profilePictureUrl: safePic ?? "",
                        }
                      : f
                  )
                );
              } else {
                const ownerUid = data.ownerUid;
                void refreshFriendProfilesFromServer(session, addedFriendsFromRitualRef.current).then(
                  (refreshed) => {
                    if (cancelled) return;
                    setAddedFriendsFromRitual((current) => {
                      const row = refreshed.find((f) => f.backendUid === ownerUid);
                      if (!row?.profilePictureUrl) return current;
                      return current.map((f) =>
                        f.backendUid === ownerUid
                          ? {
                              ...f,
                              profilePictureUrl: row.profilePictureUrl,
                            }
                          : f
                      );
                    });
                  }
                );
              }
            }
          } catch {
            /* Skip un-decodable profile doc (key mismatch, malformed envelope). */
          }
        }
        if (cancelled) return;
        setEncryptedSyncState((current) => ({
          ...current,
          profile: "ok",
          lastSuccessAt: Date.now(),
        }));
      },
      () => {
        if (cancelled) return;
        setEncryptedSyncState((current) => ({ ...current, profile: "error" }));
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    demoOfflineMode,
    signedIn,
    getBackendSession,
    sessionEmailRef,
    myProfilePictureUrlRef,
    setMyProfilePictureUrl,
    addedFriendsFromRitualRef,
    setAddedFriendsFromRitual,
    setEncryptedSyncState,
  ]);
}
