import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { startAndroidOtpAssist } from "../../otpSmsAssist";
import { EMAIL_OTP_ENABLED } from "../theme/preludeConstants";
import type { AuthMode } from "./useSignedInSession";

/**
 * Login and signup field drafts, including the Android SMS OTP fill that
 * only runs when email OTP is switched on.
 */
export function useAuthFormDrafts(authMode: AuthMode, authModeRef: { current: AuthMode }) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupPasswordVisible, setSignupPasswordVisible] = useState(false);
  const [signupPasswordConfirmVisible, setSignupPasswordConfirmVisible] = useState(false);
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPhoneNumber, setSignupPhoneNumber] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const loginOtpRef = useRef("");
  const signupOtpRef = useRef("");
  loginOtpRef.current = loginOtp;
  signupOtpRef.current = signupOtp;
  const [issuedOtpCode, setIssuedOtpCode] = useState<string | null>(null);
  const [issuedOtpForEmail, setIssuedOtpForEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!EMAIL_OTP_ENABLED) return;
    if (Platform.OS !== "android") return;
    if (authMode !== "loginOtp" && authMode !== "signupOtp") return;

    const emailLocalHint =
      authMode === "loginOtp"
        ? loginEmail.trim().toLowerCase().split("@")[0] ?? ""
        : signupEmail.trim().toLowerCase().split("@")[0] ?? "";

    const stop = startAndroidOtpAssist(
      (code) => {
        const clipped = code.replace(/\D/g, "").slice(0, 6);
        if (clipped.length !== 6) return;
        if (authModeRef.current === "loginOtp") setLoginOtp(clipped);
        else if (authModeRef.current === "signupOtp") setSignupOtp(clipped);
      },
      {
        emailLocalPartHint: emailLocalHint,
        shouldApplyCode: () => {
          if (authModeRef.current === "loginOtp") return loginOtpRef.current.trim().length < 6;
          if (authModeRef.current === "signupOtp") return signupOtpRef.current.trim().length < 6;
          return false;
        },
      }
    );

    return () => {
      stop();
    };
  }, [authMode, authModeRef, loginEmail, signupEmail]);

  return {
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginPasswordVisible,
    setLoginPasswordVisible,
    signupEmail,
    setSignupEmail,
    signupPassword,
    setSignupPassword,
    signupPasswordConfirm,
    setSignupPasswordConfirm,
    signupPasswordVisible,
    setSignupPasswordVisible,
    signupPasswordConfirmVisible,
    setSignupPasswordConfirmVisible,
    signupUsername,
    setSignupUsername,
    signupPhoneNumber,
    setSignupPhoneNumber,
    signupOtp,
    setSignupOtp,
    loginOtp,
    setLoginOtp,
    issuedOtpCode,
    setIssuedOtpCode,
    issuedOtpForEmail,
    setIssuedOtpForEmail,
  };
}
