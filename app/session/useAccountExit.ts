import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Alert } from "react-native";
import { logAppEvent, setTelemetryContext } from "../../telemetry";
import type { ViewState } from "../domain/types";
import { storageRemoveItem } from "../lib/encryptedLocalStorage";
import { lastHomeTabStorageKey, lastViewStorageKey } from "../lib/viewPersistence";
import { logoutSignedInAccount } from "./signedOutReset";

type AuthMode = "login" | "signup" | "loginOtp" | "signupOtp";

/** Logout confirm, session-replaced logout, and the delete-account warning. */
export function useAccountExit(params: {
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
  logoutRef: MutableRefObject<() => void>;
}) {
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
    logoutRef,
  } = params;

  const logout = () => {
    logoutSignedInAccount({
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
    });
  };

  const confirmLogout = useCallback(() => {
    Alert.alert("Logout?", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: logout },
    ]);
  }, [logout]);

  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete account?",
      "This is permanent and cannot be undone.\n\nWhat will be deleted:\n- Your account access and profile.\n- Your posts across the app.\n\nWhat may remain for other people:\n- Messages you already sent in chats may remain visible to recipients as \"User\".\n- Your comments/reactions on other users' posts may remain but are attributed as \"User\".\n\nProceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete account not enabled yet",
              "This button now shows the final deletion policy. Backend deletion rollout is next so delete can run safely end-to-end."
            );
          },
        },
      ]
    );
  }, []);

  logoutRef.current = logout;

  const logoutFromSessionReplaced = () => {
    const navEmail = sessionEmailRef.current;
    if (navEmail) {
      void storageRemoveItem(lastViewStorageKey(navEmail)).catch(() => {
        /* ignore */
      });
      void storageRemoveItem(lastHomeTabStorageKey(navEmail)).catch(() => {
        /* ignore */
      });
    }
    sessionTokenRef.current = null;
    sessionEmailRef.current = null;
    resetLocalSocialStateForSignedOut();
    logAppEvent("auth.session_replaced", {});
    clearSession();
    setTelemetryContext({ uid: null, deviceId: null });
    resetSyncChannelsIdle();
    signedInRef.current = false;
    setSignedIn(false);
    setView({ screen: "home" });
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setAuthMode("login");
    setIssuedOtpCode(null);
    setIssuedOtpForEmail(null);
    setSignupOtp("");
    setLoginOtp("");
  };

  return { logout, confirmLogout, confirmDeleteAccount, logoutFromSessionReplaced };
}
