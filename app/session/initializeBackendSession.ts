import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert } from "react-native";

import { callEmulatorFunction, getOrCreateBackendDeviceId } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { logAppError, setTelemetryContext } from "../../telemetry";
import { ensureLocalKeyBundle, signLocalPublicBundle } from "../../e2eeCrypto";
import { storageGetItem, storageSetItem } from "../lib/encryptedLocalStorage";
import { restoreKeyBundleFromCloudIfMissing } from "../lib/e2eeKeyBackup";
import { mergeProfilePictureUrl, normalizeHttpsProfilePictureUrl } from "../lib/profilePictureUrl";
import { publishActivePresence } from "../presence/heartbeat";
import { registerFirebaseAuthUidOnce } from "./registerFirebaseAuthUidOnce";
import type { Chat, Message, MockAuthAccount, Post } from "../domain/types";
import type { BackendSession } from "../messaging/types";
import type { EncryptedSyncState } from "./useSignedInSession";
import {
  isEmailDerivedUsername,
  isPlaceholderProfileUsername,
  profileBioStorageKey,
  profilePictureStorageKey,
  profileUsernameStorageKey,
  resolveProfileUsername,
  usernameForProfileUpsert,
} from "../theme/preludeConstants";

export type InitializeBackendSessionDeps = {
  markSessionReady: (session: BackendSession) => void;
  recipientKeyCacheRef: MutableRefObject<Record<string, string>>;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncState>>;
  localSocialCacheSavedAtMsRef: MutableRefObject<number>;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
  applyChats: Dispatch<SetStateAction<Chat[]>>;
  applyMessages: Dispatch<SetStateAction<Message[]>>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  messagesWatermarkMsRef: MutableRefObject<number>;
  postsWatermarkMsRef: MutableRefObject<number>;
  messagesLastFullSyncAtRef: MutableRefObject<number>;
  postsLastFullSyncAtRef: MutableRefObject<number>;
  myDisplayNameRef: MutableRefObject<string>;
  hydrateMyProfile: (next: { bio?: string; profilePictureUrl?: string | null }) => void;
  refreshHiddenConversationIdsFromServer: () => Promise<void>;
};

export async function initializeBackendSessionForAccount(
  account: MockAuthAccount,
  deps: InitializeBackendSessionDeps
): Promise<void> {
  const {
    markSessionReady,
    recipientKeyCacheRef,
    setEncryptedSyncState,
    myDisplayNameRef,
    hydrateMyProfile,
    refreshHiddenConversationIdsFromServer,
  } = deps;
  const deviceId = await getOrCreateBackendDeviceId();
  const persistedUsername =
    (await storageGetItem(profileUsernameStorageKey(account.email)))?.trim() ?? "";
  const persistedBio =
    (await storageGetItem(profileBioStorageKey(account.email)))?.trim() ?? "";
  const persistedProfilePic =
    (await storageGetItem(profilePictureStorageKey(account.email)))?.trim() ?? "";
  const claimUsername = resolveProfileUsername({
    email: account.email,
    persistedUsername,
    accountUsername: account.username,
  });
  const usernameForClaim =
    persistedUsername ||
    (claimUsername !== "User" && !isEmailDerivedUsername(claimUsername, account.email)
      ? claimUsername
      : "");
  const claimed = await callEmulatorFunction<{ uid?: string }>("claimDeviceSession", {
    deviceId,
    ...(usernameForClaim ? { username: usernameForClaim } : {}),
  });
  const uid = String(claimed.uid ?? "").trim();
  if (!uid.startsWith("u_")) {
    throw new Error("Could not start the signed-in session.");
  }

  await restoreKeyBundleFromCloudIfMissing(uid, deviceId);
  try {
    await callEmulatorFunction("getUserSocialSnapshot", { uid, deviceId });
  } catch (err) {
    logAppError("e2ee.social_snapshot.purge", err, { uid });
  }
  const ownBundle = await ensureLocalKeyBundle(uid);
  const signedBundle = await signLocalPublicBundle(uid);

  markSessionReady({ uid, deviceId });
  setTelemetryContext({ uid, deviceId });
  recipientKeyCacheRef.current = {
    ...recipientKeyCacheRef.current,
    [uid]: ownBundle.encryptionPublicKey,
  };
  setEncryptedSyncState({ profile: "syncing", posts: "syncing", messages: "syncing", lastSuccessAt: null });

  void (async () => {
    try {
      const firebaseAuthUid = firebaseAuth.currentUser?.uid;
      if (firebaseAuthUid) {
        try {
          await registerFirebaseAuthUidOnce({ uid, deviceId });
        } catch (err) {
          logAppError("auth.register_firebase_uid", err, { uid });
        }
        void publishActivePresence({ uid, deviceId }, Date.now()).catch(() => undefined);
      }

      let resolvedBio = (account.bio || "").trim() || persistedBio;
      let resolvedPicture = mergeProfilePictureUrl(
        persistedProfilePic,
        account.profilePictureUrl
      );
      let self:
        | { username?: string; bio?: string; profilePictureUrl?: string | null }
        | null
        | undefined = null;
      try {
        try {
          const profilesRes = await callEmulatorFunction<{
            profiles?: Record<
              string,
              { username?: string; bio?: string; profilePictureUrl?: string | null } | null
            >;
          }>("getUserProfiles", {
            uid,
            deviceId,
            targetUids: [uid],
          });
          self = profilesRes.profiles?.[uid] ?? null;
        } catch {
          /* no server profile yet — first device claim */
        }
        if (self) {
          const sb = (self.bio ?? "").trim();
          if (sb) resolvedBio = sb;
          if (typeof self.profilePictureUrl === "string" && self.profilePictureUrl.trim()) {
            resolvedPicture = mergeProfilePictureUrl(self.profilePictureUrl, resolvedPicture);
          }
        }
      } catch {
        /* keep account defaults */
      }
      const resolvedUsername = resolveProfileUsername({
        email: account.email,
        persistedUsername,
        accountUsername: account.username,
        serverUsername: self?.username,
      });
      if (!isPlaceholderProfileUsername(resolvedUsername, account.email)) {
        void storageSetItem(profileUsernameStorageKey(account.email), resolvedUsername).catch(
          () => {}
        );
        myDisplayNameRef.current = resolvedUsername;
      }

      await callEmulatorFunction("publishUserKeyBundle", {
        uid,
        deviceId,
        keyVersion: signedBundle.bundle.keyVersion,
        encryptionPublicKey: signedBundle.bundle.encryptionPublicKey,
        identitySigningPublicKey: signedBundle.bundle.identitySigningPublicKey,
        bundleSignature: signedBundle.signature,
      });
      const usernameForUpsert = usernameForProfileUpsert({
        email: account.email,
        persistedUsername,
        accountUsername: account.username,
        serverUsername: self?.username,
      });
      await callEmulatorFunction("upsertUserProfile", {
        uid,
        deviceId,
        ...(usernameForUpsert ? { username: usernameForUpsert } : {}),
        bio: resolvedBio,
        ...(resolvedPicture ? { profilePictureUrl: resolvedPicture } : {}),
      });
      const safeProfilePic = normalizeHttpsProfilePictureUrl(resolvedPicture);
      hydrateMyProfile({ bio: resolvedBio, profilePictureUrl: safeProfilePic });
      if (safeProfilePic) {
        void storageSetItem(profilePictureStorageKey(account.email), safeProfilePic).catch(
          () => {}
        );
      }
      void storageSetItem(profileBioStorageKey(account.email), resolvedBio).catch(() => {});

      await refreshHiddenConversationIdsFromServer();
      setEncryptedSyncState((current) => ({
        ...current,
        profile: "ok",
        lastSuccessAt: Date.now(),
      }));
    } catch (err) {
      logAppError("session.background_init", err, { uid });
      setEncryptedSyncState((current) => ({ ...current, profile: "error" }));
    }
  })();
}

export async function retryInitializeBackendSession(
  account: MockAuthAccount,
  deps: {
    initializeBackendSessionForAccount: (account: MockAuthAccount) => Promise<void>;
    setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncState>>;
  }
): Promise<void> {
  const { initializeBackendSessionForAccount, setEncryptedSyncState } = deps;
  try {
    await initializeBackendSessionForAccount(account);
    setEncryptedSyncState({ profile: "syncing", posts: "syncing", messages: "syncing", lastSuccessAt: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    Alert.alert(
      "Still offline",
      msg.length > 0 && msg.length < 160 ? msg : "Could not reach the server yet. Try again when you have a connection."
    );
  }
}
