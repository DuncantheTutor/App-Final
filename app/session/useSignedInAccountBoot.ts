import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Alert } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { debugSessionLog, firebaseAuth } from "../../firebaseAuthClient";
import { logAppEvent } from "../../telemetry";
import type { MockAuthAccount } from "../domain/types";
import { storageGetItem } from "../lib/encryptedLocalStorage";
import { readDeviceSignedInEmail, readFirebasePersistedAuthEmail } from "./deviceSignedInEmail";
import { isIntentionalSignOut } from "./firebaseAuthPersistence";
import {
  initializeBackendSessionForAccount as initializeBackendSessionForAccountImpl,
  retryInitializeBackendSession,
  type InitializeBackendSessionDeps,
} from "./initializeBackendSession";
import { restoreSignedInAccount, type RestoreSignedInAccountDeps } from "./restoreSignedInAccount";
import {
  clearSignedOutSocialState,
  resetCurrentUserLocalState,
  type ClearSignedOutSocialStateDeps,
} from "./signedOutReset";
import { MOCK_SESSION_POLL_MS, DEMO_OFFLINE_MODE, profileUsernameStorageKey, readLedgerSessionToken, shouldPollMockSession } from "../theme/preludeConstants";

type BootParams = ClearSignedOutSocialStateDeps &
  InitializeBackendSessionDeps &
  Omit<RestoreSignedInAccountDeps, "initializeBackendSessionForAccount" | "retryInitializeBackendForAccount"> & {
    signedIn: boolean;
    signedInRef: MutableRefObject<boolean>;
    isRestoringAuthRef: MutableRefObject<boolean>;
    appBootAuthResolvedRef: MutableRefObject<boolean>;
    sessionTokenRef: MutableRefObject<string | null>;
    markAppBootAuthResolved: () => void;
    setSignedIn: Dispatch<SetStateAction<boolean>>;
    resetSyncChannelsIdle: () => void;
    sessionConflictNoticeAtRef: MutableRefObject<number>;
  };

/** Signed-in restore, backend session claim, and the auth listener that brings a session back. */
export function useSignedInAccountBoot(params: BootParams) {
  const {
    signedIn,
    signedInRef,
    isRestoringAuthRef,
    sessionEmailRef,
    sessionTokenRef,
    markAppBootAuthResolved,
    sessionConflictNoticeAtRef,
    setView,
    setHomeTab,
  } = params;

  const resetLocalSocialStateForSignedOut = useCallback(() => {
    clearSignedOutSocialState(params);
  }, [
    params.resetMessagingState,
    params.resetPosts,
    params.resetFriendsState,
    params.resetMyProfile,
    params.resetFeedPrefs,
  ]);

  const resetLocalStateForCurrentUser = useCallback(() => {
    resetCurrentUserLocalState({
      sessionEmailRef,
      resetLocalSocialStateForSignedOut,
      setView,
      setHomeTab,
    });
  }, [resetLocalSocialStateForSignedOut, sessionEmailRef, setView, setHomeTab]);

  const initializeBackendSessionForAccount = useCallback(
    async (account: MockAuthAccount) => {
      await initializeBackendSessionForAccountImpl(account, params);
    },
    [params.markSessionReady, params.hydrateMyProfile, params.refreshHiddenConversationIdsFromServer]
  );

  const retryInitializeBackendForAccount = useCallback(
    (account: MockAuthAccount) =>
      retryInitializeBackendSession(account, {
        initializeBackendSessionForAccount,
        setEncryptedSyncState: params.setEncryptedSyncState,
      }),
    [initializeBackendSessionForAccount, params.setEncryptedSyncState]
  );

  const applySignedInAccount = useCallback(
    (account: MockAuthAccount) =>
      restoreSignedInAccount(account, {
        ...params,
        initializeBackendSessionForAccount,
        retryInitializeBackendForAccount,
      }),
    [
      initializeBackendSessionForAccount,
      retryInitializeBackendForAccount,
      params.markSessionReady,
      params.clearSession,
      params.hydrateFriends,
      params.hydrateMyProfile,
      params.markSignedIn,
    ]
  );

  const applySignedInAccountRef = useRef(applySignedInAccount);
  applySignedInAccountRef.current = applySignedInAccount;

  useEffect(() => {
    if (DEMO_OFFLINE_MODE) {
      markAppBootAuthResolved();
      return () => {};
    }
    let cancelled = false;

    const restoreEmail = async (rawEmail: string) => {
      if (cancelled || isIntentionalSignOut()) return;
      if (signedInRef.current || isRestoringAuthRef.current) {
        markAppBootAuthResolved();
        return;
      }
      const email = rawEmail.trim().toLowerCase();
      if (!email) return;
      isRestoringAuthRef.current = true;
      sessionEmailRef.current = email;
      try {
        const persistedUsername = (await storageGetItem(profileUsernameStorageKey(email)))?.trim() ?? '';
        if (cancelled || isIntentionalSignOut()) return;
        const account: MockAuthAccount = {
          email,
          password: '',
          username: persistedUsername,
          phoneNumber: '',
          bio: '',
          profilePictureUrl: null,
        };
        logAppEvent('auth.restore_session', { email });
        await applySignedInAccountRef.current(account);
      } catch {
        if (!cancelled && !isIntentionalSignOut()) {
          Alert.alert('Session error', 'Could not restore your signed-in session. Please try again.');
        }
      } finally {
        isRestoringAuthRef.current = false;
        if (!cancelled) markAppBootAuthResolved();
      }
    };

    const boot = async () => {
      const ready = (firebaseAuth as { authStateReady?: () => Promise<void> }).authStateReady;
      if (typeof ready === 'function') {
        try {
          await ready.call(firebaseAuth);
        } catch {
          /* persistence can still be read below */
        }
      }
      if (cancelled || isIntentionalSignOut()) {
        if (!cancelled) markAppBootAuthResolved();
        return;
      }
      const live = firebaseAuth.currentUser?.email?.trim().toLowerCase() ?? '';
      if (live) {
        await restoreEmail(live);
        return;
      }
      const stored = (await readFirebasePersistedAuthEmail()) || (await readDeviceSignedInEmail());
      if (cancelled || isIntentionalSignOut()) {
        if (!cancelled) markAppBootAuthResolved();
        return;
      }
      if (stored) {
        debugSessionLog('useSignedInAccountBoot.ts:boot', 'restoring device session', 'H1', {
          hasFirebaseUser: Boolean(firebaseAuth.currentUser),
        });
        await restoreEmail(stored);
        return;
      }
      markAppBootAuthResolved();
    };
    void boot();

    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      const email = user?.email?.trim().toLowerCase() ?? '';
      if (!email || isIntentionalSignOut()) return;
      void restoreEmail(email);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [markAppBootAuthResolved]);


  useEffect(() => {
    if (!signedIn || !shouldPollMockSession()) return;
    const tick = async () => {
      const email = sessionEmailRef.current;
      const mine = sessionTokenRef.current;
      if (!email || !mine) return;
      const remote = await readLedgerSessionToken(email, mine);
      if (remote !== mine) {
        const now = Date.now();
        if (now - sessionConflictNoticeAtRef.current > 60_000) {
          sessionConflictNoticeAtRef.current = now;
          Alert.alert(
            "Session notice",
            "Another device appears to have signed in, but you remain signed in on this phone until you press Logout."
          );
        }
      }
    };
    const id = setInterval(() => void tick(), MOCK_SESSION_POLL_MS);
    void tick();
    return () => clearInterval(id);
  }, [signedIn, sessionEmailRef, sessionTokenRef, sessionConflictNoticeAtRef]);

  return {
    resetLocalSocialStateForSignedOut,
    resetLocalStateForCurrentUser,
    initializeBackendSessionForAccount,
    retryInitializeBackendForAccount,
    applySignedInAccount,
  };
}
