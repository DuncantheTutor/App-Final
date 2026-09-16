import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { EncryptedSyncChannelState } from "../domain/types";
import { APP_BOOT_SPLASH_MIN_MS } from "../lib/viewPersistence";

export type AuthMode = "login" | "loginOtp" | "signup" | "signupOtp";

export type EncryptedSyncState = {
  profile: EncryptedSyncChannelState;
  posts: EncryptedSyncChannelState;
  messages: EncryptedSyncChannelState;
  lastSuccessAt: number | null;
};

const IDLE_ENCRYPTED_SYNC: EncryptedSyncState = {
  profile: "idle",
  posts: "idle",
  messages: "idle",
  lastSuccessAt: null,
};

export type SignedInSessionController = {
  signedIn: boolean;
  setSignedIn: Dispatch<SetStateAction<boolean>>;
  signedInRef: MutableRefObject<boolean>;
  sessionEmailRef: MutableRefObject<string | null>;
  sessionTokenRef: MutableRefObject<string | null>;
  backendInitGenerationRef: MutableRefObject<number>;
  authMode: AuthMode;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;
  authModeRef: MutableRefObject<AuthMode>;
  isRestoringAuthRef: MutableRefObject<boolean>;
  appBootAuthResolved: boolean;
  appBootAuthResolvedRef: MutableRefObject<boolean>;
  markAppBootAuthResolved: () => void;
  appBootMinMsElapsed: boolean;
  showBootSplash: boolean;
  encryptedSyncState: EncryptedSyncState;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncState>>;
  initialServerSyncDone: boolean;
  setInitialServerSyncDone: Dispatch<SetStateAction<boolean>>;
  initialServerSyncCompletedAtRef: MutableRefObject<number>;
  markSignedIn: () => void;
  resetSyncChannelsIdle: () => void;
};

/**
 * Sole owner of signed-in / splash / encrypted-sync channel flags.
 * Auth restore, logout, and cache hydrate still live in MainApp.
 */
export function useSignedInSession(): SignedInSessionController {
  const [signedIn, setSignedIn] = useState(false);
  const signedInRef = useRef(false);
  signedInRef.current = signedIn;

  const sessionEmailRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const backendInitGenerationRef = useRef(0);
  const isRestoringAuthRef = useRef(false);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const authModeRef = useRef(authMode);
  authModeRef.current = authMode;

  const appBootAuthResolvedRef = useRef(false);
  const [appBootAuthResolved, setAppBootAuthResolved] = useState(false);
  const markAppBootAuthResolved = useCallback(() => {
    if (appBootAuthResolvedRef.current) return;
    appBootAuthResolvedRef.current = true;
    setAppBootAuthResolved(true);
  }, []);

  const [appBootMinMsElapsed, setAppBootMinMsElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAppBootMinMsElapsed(true), APP_BOOT_SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  /**
   * Splash only waits on local signals: Firebase Auth state resolution and a
   * 500 ms minimum so we don't flash empty UI between cache hydration and the
   * first paint. No server pull blocks the splash.
   */
  const showBootSplash = !appBootAuthResolved || !appBootMinMsElapsed;

  /**
   * Tracks whether the one-shot boot-time server pull has been kicked off
   * for this signed-in session. The splash no longer waits for it.
   */
  const [initialServerSyncDone, setInitialServerSyncDone] = useState(false);
  const initialServerSyncCompletedAtRef = useRef(0);
  useEffect(() => {
    if (initialServerSyncDone) {
      initialServerSyncCompletedAtRef.current = Date.now();
    }
  }, [initialServerSyncDone]);

  const [encryptedSyncState, setEncryptedSyncState] = useState<EncryptedSyncState>(IDLE_ENCRYPTED_SYNC);

  const markSignedIn = useCallback(() => {
    signedInRef.current = true;
    setSignedIn(true);
  }, []);

  const resetSyncChannelsIdle = useCallback(() => {
    setEncryptedSyncState(IDLE_ENCRYPTED_SYNC);
    setInitialServerSyncDone(false);
  }, []);

  return {
    signedIn,
    setSignedIn,
    signedInRef,
    sessionEmailRef,
    sessionTokenRef,
    backendInitGenerationRef,
    authMode,
    setAuthMode,
    authModeRef,
    isRestoringAuthRef,
    appBootAuthResolved,
    appBootAuthResolvedRef,
    markAppBootAuthResolved,
    appBootMinMsElapsed,
    showBootSplash,
    encryptedSyncState,
    setEncryptedSyncState,
    initialServerSyncDone,
    setInitialServerSyncDone,
    initialServerSyncCompletedAtRef,
    markSignedIn,
    resetSyncChannelsIdle,
  };
}
