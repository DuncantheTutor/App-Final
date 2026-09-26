import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { signOut } from "firebase/auth";

import { callEmulatorFunction } from "../../backendBridge";
import { debugSessionLog, firebaseAuth } from "../../firebaseAuthClient";
import { logAppEvent, setTelemetryContext } from "../../telemetry";
import { storageRemoveItem } from "../lib/encryptedLocalStorage";
import { clearEncryptedMediaCaches } from "../lib/encryptedMediaCache";
import { clearLocalSocialCacheForEmail } from "../lib/localSocialCache";
import { lastHomeTabStorageKey, lastViewStorageKey } from "../lib/viewPersistence";
import type { ViewState } from "../domain/types";
import type { HomeTab } from "../shell/types";
import { DEMO_OFFLINE_MODE, POSTS_STORAGE_KEY } from "../theme/preludeConstants";
import { clearDeviceSignedInEmail } from "./deviceSignedInEmail";
import { beginIntentionalSignOut, endIntentionalSignOut } from "./firebaseAuthPersistence";
import type { AuthMode } from "./useSignedInSession";

export type ClearSignedOutSocialStateDeps = {
  resetMessagingState: () => void;
  resetPosts: () => void;
  resetFriendsState: () => void;
  resetMyProfile: () => void;
  resetFeedPrefs: () => void;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
  recipientKeyCacheRef: MutableRefObject<Record<string, string>>;
  messagesWatermarkMsRef: MutableRefObject<number>;
  messagesLastFullSyncAtRef: MutableRefObject<number>;
  postsWatermarkMsRef: MutableRefObject<number>;
  postsLastFullSyncAtRef: MutableRefObject<number>;
  sharePostsBackfillStartedRef: MutableRefObject<Set<string>>;
  pendingPostsShareFriendUidsRef: MutableRefObject<Set<string>>;
  postsSharedWithFriendsRef: MutableRefObject<Set<string>>;
};

export function clearSignedOutSocialState(deps: ClearSignedOutSocialStateDeps): void {
  const {
    resetMessagingState,
    resetPosts,
    resetFriendsState,
    resetMyProfile,
    resetFeedPrefs,
    deletedPostIdsRef,
    recipientKeyCacheRef,
    messagesWatermarkMsRef,
    messagesLastFullSyncAtRef,
    postsWatermarkMsRef,
    postsLastFullSyncAtRef,
    sharePostsBackfillStartedRef,
    pendingPostsShareFriendUidsRef,
    postsSharedWithFriendsRef,
  } = deps;
  resetMessagingState();
  resetPosts();
  resetFriendsState();
  resetMyProfile();
  resetFeedPrefs();
  deletedPostIdsRef.current = new Set();
  recipientKeyCacheRef.current = {};
  messagesWatermarkMsRef.current = 0;
  messagesLastFullSyncAtRef.current = 0;
  postsWatermarkMsRef.current = 0;
  postsLastFullSyncAtRef.current = 0;
  sharePostsBackfillStartedRef.current = new Set();
  pendingPostsShareFriendUidsRef.current = new Set();
  postsSharedWithFriendsRef.current = new Set();
  void storageRemoveItem(POSTS_STORAGE_KEY);
  void clearEncryptedMediaCaches();
}

export type ResetCurrentUserLocalStateDeps = {
  sessionEmailRef: MutableRefObject<string | null>;
  resetLocalSocialStateForSignedOut: () => void;
  setView: Dispatch<SetStateAction<ViewState>>;
  setHomeTab: Dispatch<SetStateAction<HomeTab>>;
};

export function resetCurrentUserLocalState(deps: ResetCurrentUserLocalStateDeps): void {
  const { sessionEmailRef, resetLocalSocialStateForSignedOut, setView, setHomeTab } = deps;
  const email = sessionEmailRef.current?.trim().toLowerCase();
  resetLocalSocialStateForSignedOut();
  setView({ screen: "home" });
  setHomeTab("feed");
  if (email) {
    void clearLocalSocialCacheForEmail(email);
  }
  logAppEvent("local_state.reset_current_user", { email: email ?? "" });
}

export type LogoutSignedInAccountDeps = {
  sessionEmailRef: MutableRefObject<string | null>;
  backendInitGenerationRef: MutableRefObject<number>;
  sessionTokenRef: MutableRefObject<string | null>;
  resetLocalSocialStateForSignedOut: () => void;
  signedInRef: MutableRefObject<boolean>;
  backendAuthUidRef: MutableRefObject<string | null>;
  backendDeviceIdRef: MutableRefObject<string | null>;
  clearSession: () => void;
  resetSyncChannelsIdle: () => void;
  setSignedIn: Dispatch<SetStateAction<boolean>>;
  setView: Dispatch<SetStateAction<ViewState>>;
  setChatOverflowOpen: Dispatch<SetStateAction<boolean>>;
  setMembersModalOpen: Dispatch<SetStateAction<boolean>>;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;
  setIssuedOtpCode: Dispatch<SetStateAction<string | null>>;
  setIssuedOtpForEmail: Dispatch<SetStateAction<string | null>>;
  setSignupOtp: Dispatch<SetStateAction<string>>;
  setLoginOtp: Dispatch<SetStateAction<string>>;
};

export function logoutSignedInAccount(deps: LogoutSignedInAccountDeps): void {
  const {
    sessionEmailRef,
    backendInitGenerationRef,
    sessionTokenRef,
    resetLocalSocialStateForSignedOut,
    signedInRef,
    backendAuthUidRef,
    backendDeviceIdRef,
    clearSession,
    resetSyncChannelsIdle,
    setSignedIn,
    setView,
    setChatOverflowOpen,
    setMembersModalOpen,
    setAuthMode,
    setIssuedOtpCode,
    setIssuedOtpForEmail,
    setSignupOtp,
    setLoginOtp,
  } = deps;
  // #region agent log
  debugSessionLog("MainApp.tsx:logout", "logout invoked", "H3", {
    hasEmail: Boolean(sessionEmailRef.current),
    hasFirebaseUser: Boolean(firebaseAuth.currentUser),
  });
  beginIntentionalSignOut();
  void clearDeviceSignedInEmail().catch(() => undefined);
  // #endregion
  const email = sessionEmailRef.current;
  if (email) {
    void storageRemoveItem(lastViewStorageKey(email)).catch(() => {
      /* ignore */
    });
    void storageRemoveItem(lastHomeTabStorageKey(email)).catch(() => {
      /* ignore */
    });
    void clearLocalSocialCacheForEmail(email);
  }
  backendInitGenerationRef.current += 1;
  sessionTokenRef.current = null;
  sessionEmailRef.current = null;
  resetLocalSocialStateForSignedOut();
  logAppEvent("auth.logout", { email: email ?? "" });
  signedInRef.current = false;
  const releaseUid = backendAuthUidRef.current;
  const releaseDeviceId = backendDeviceIdRef.current;
  if (releaseUid && releaseDeviceId) {
    void callEmulatorFunction("releaseDeviceSession", {
      uid: releaseUid,
      deviceId: releaseDeviceId,
    }).catch(() => {
      /* ignore */
    });
  }
  clearSession();
  setTelemetryContext({ uid: null, deviceId: null });
  resetSyncChannelsIdle();
  setSignedIn(false);
  setView({ screen: "home" });
  setChatOverflowOpen(false);
  setMembersModalOpen(false);
  setAuthMode("login");
  setIssuedOtpCode(null);
  setIssuedOtpForEmail(null);
  setSignupOtp("");
  setLoginOtp("");
  if (!DEMO_OFFLINE_MODE) {
    void signOut(firebaseAuth)
      .catch(() => {
        // Ignore sign-out errors in prototype mode.
      })
      .finally(() => {
        endIntentionalSignOut();
      });
  } else {
    endIntentionalSignOut();
  }
}
