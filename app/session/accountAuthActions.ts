import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert, Platform } from "react-native";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { logAppError, logAppEvent } from "../../telemetry";
import { requestReadSmsPermissionIfNeeded } from "../../otpSmsAssist";
import type { MockAuthAccount } from "../domain/types";
import { storageGetItem, storageSetItem } from "../lib/encryptedLocalStorage";
import { clearLocalSocialCacheForEmail } from "../lib/localSocialCache";
import type { AuthMode } from "./useSignedInSession";
import {
  DEMO_OFFLINE_ACCOUNTS,
  DEMO_OFFLINE_MODE,
  EMAIL_OTP_ENABLED,
  profileUsernameStorageKey,
} from "../theme/preludeConstants";

type AccountAuthDeps = {
  loginEmail: string;
  loginPassword: string;
  signupEmail: string;
  signupPassword: string;
  signupPasswordConfirm: string;
  signupUsername: string;
  signupPhoneNumber: string;
  loginOtp: string;
  signupOtp: string;
  issuedOtpCode: string | null;
  issuedOtpForEmail: string | null;
  setLoginOtp: Dispatch<SetStateAction<string>>;
  setSignupOtp: Dispatch<SetStateAction<string>>;
  setIssuedOtpCode: Dispatch<SetStateAction<string | null>>;
  setIssuedOtpForEmail: Dispatch<SetStateAction<string | null>>;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;
  sessionEmailRef: MutableRefObject<string | null>;
  myDisplayNameRef: MutableRefObject<string>;
  applySignedInAccount: (account: MockAuthAccount) => Promise<void>;
};

/** Email/password sign-in and signup, including the dormant email-code steps. Recreated each render. */
export function createAccountAuthActions(deps: AccountAuthDeps) {
  const {
    loginEmail,
    loginPassword,
    signupEmail,
    signupPassword,
    signupPasswordConfirm,
    signupUsername,
    signupPhoneNumber,
    loginOtp,
    signupOtp,
    issuedOtpCode,
    issuedOtpForEmail,
    setLoginOtp,
    setSignupOtp,
    setIssuedOtpCode,
    setIssuedOtpForEmail,
    setAuthMode,
    sessionEmailRef,
    myDisplayNameRef,
    applySignedInAccount,
  } = deps;

  const completeLoginAfterPassword = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      logAppEvent("auth.login_ok", { email });
    } catch (e) {
      logAppError("auth.login", e, { email });
      const message = e instanceof Error ? e.message : "Could not sign in.";
      Alert.alert("Login failed", message);
      return;
    }
    const persistedUsername =
      (await storageGetItem(profileUsernameStorageKey(email)))?.trim() ?? "";
    const account: MockAuthAccount = {
      email,
      password,
      username: persistedUsername,
      phoneNumber: "",
      bio: "",
      profilePictureUrl: null,
    };
    sessionEmailRef.current = account.email;
    await applySignedInAccount(account);
  };

  const goToLoginOtpStep = () => {
    if (DEMO_OFFLINE_MODE) return;
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) {
      Alert.alert("Login", "Enter email and password.");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      Alert.alert("Login", "Use a valid email address.");
      return;
    }
    if (!EMAIL_OTP_ENABLED) {
      void completeLoginAfterPassword(email, password);
      return;
    }
    setLoginOtp("");
    setIssuedOtpCode(null);
    setIssuedOtpForEmail(null);
    setAuthMode("loginOtp");
  };

  const loginDemoOrSubmit = async () => {
    if (DEMO_OFFLINE_MODE) {
      const username = loginEmail.trim();
      const password = loginPassword;
      const account = DEMO_OFFLINE_ACCOUNTS.find(
        (a) => a.username.toLowerCase() === username.toLowerCase() && a.password === password
      );
      if (!account) {
        Alert.alert("Login failed", "Use User A / 1234 or User B / 5678 in demo mode.");
        return;
      }
      sessionEmailRef.current = account.email;
      await applySignedInAccount(account);
      return;
    }
    goToLoginOtpStep();
  };

  const requestLoginOtpCode = async () => {
    if (DEMO_OFFLINE_MODE || !EMAIL_OTP_ENABLED) return;
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) {
      Alert.alert("Missing details", "Enter email and password (use Back to edit).");
      return;
    }
    if (Platform.OS === "android") {
      await requestReadSmsPermissionIfNeeded();
    }
    try {
      const res = await callEmulatorFunction<{ debugCode?: string }>("requestEmailOtp", {
        email,
        purpose: "login",
      });
      setIssuedOtpCode(String(res.debugCode ?? ""));
      setIssuedOtpForEmail(email);
      setLoginOtp("");
      Alert.alert("OTP sent", res.debugCode ? `Test OTP for ${email}: ${res.debugCode}` : `OTP sent to ${email}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not request OTP.";
      logAppError("auth.request_login_otp", e, { email });
      if (/wait before requesting another otp|resource-exhausted/i.test(message)) {
        Alert.alert("Please wait", "You can request a new OTP in a few seconds.");
        return;
      }
      Alert.alert("OTP error", message);
    }
  };

  const completeLoginWithOtp = async () => {
    if (DEMO_OFFLINE_MODE || !EMAIL_OTP_ENABLED) return;
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    const otp = loginOtp.replace(/\D/g, "").slice(0, 6);
    if (!email || !password || !otp || otp.length !== 6) {
      Alert.alert("Missing fields", "Enter email, password, and a full 6-digit OTP.");
      return;
    }
    if (issuedOtpForEmail && issuedOtpForEmail !== email) {
      Alert.alert("OTP mismatch", "Request a new OTP for this email.");
      return;
    }
    try {
      await callEmulatorFunction("verifyEmailOtp", {
        email,
        purpose: "login",
        code: otp,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not verify OTP.";
      if (/OTP already used|OTP expired|Incorrect OTP/i.test(message)) {
        setLoginOtp("");
        setAuthMode("login");
        Alert.alert("OTP invalid", "Request a new OTP and try again.");
        return;
      }
      if (/too many otp attempts|resource-exhausted/i.test(message)) {
        setLoginOtp("");
        setAuthMode("login");
        Alert.alert("Too many attempts", "Request a new OTP and try again.");
        return;
      }
      Alert.alert("OTP error", message);
      return;
    }
    await completeLoginAfterPassword(email, password);
  };

  const requestSignupOtp = async () => {
    if (!EMAIL_OTP_ENABLED) return;
    const email = signupEmail.trim().toLowerCase();
    const phone = signupPhoneNumber.trim();
    if (!email || !phone) {
      Alert.alert("Missing details", "Enter your email and phone number before requesting OTP.");
      return;
    }
    let generated = "";
    try {
      const res = await callEmulatorFunction<{ debugCode?: string }>("requestEmailOtp", {
        email,
        purpose: "signup",
      });
      generated = String(res.debugCode ?? "");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not request OTP.";
      logAppError("auth.request_otp", e, { email });
      if (/wait before requesting another otp|resource-exhausted/i.test(message)) {
        Alert.alert("Please wait", "You can request a new OTP in a few seconds.");
        return;
      }
      Alert.alert("OTP error", message);
      return;
    }
    setIssuedOtpCode(generated);
    setIssuedOtpForEmail(email);
    setSignupOtp("");
    setAuthMode("signupOtp");
    Alert.alert("OTP sent", generated ? `Test OTP for ${email}: ${generated}` : `OTP sent to ${email}.`);
  };

  const finishSignupAccount = async (
    email: string,
    password: string,
    username: string,
    phone: string
  ) => {
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not complete signup.";
      logAppError("auth.signup_create", e, { email });
      Alert.alert("Signup failed", message);
      return;
    }
    const account: MockAuthAccount = {
      email,
      password,
      username,
      phoneNumber: phone,
      bio: "",
      profilePictureUrl: null,
    };
    sessionEmailRef.current = account.email;
    try {
      await storageSetItem(profileUsernameStorageKey(email), username.trim());
      myDisplayNameRef.current = username.trim();
    } catch {
      /* ignore */
    }
    await clearLocalSocialCacheForEmail(email);
    await applySignedInAccount(account);
  };

  const startSignup = () => {
    if (DEMO_OFFLINE_MODE) {
      Alert.alert("Demo mode", "Signup is disabled in demo mode. Use User A / 1234 or User B / 5678.");
      return;
    }
    const email = signupEmail.trim().toLowerCase();
    const password = signupPassword;
    const passwordConfirm = signupPasswordConfirm;
    const username = signupUsername.trim();
    const phone = signupPhoneNumber.trim();
    if (!email || !password || !passwordConfirm || !username || !phone) {
      Alert.alert(
        "Missing fields",
        "Complete email, username, phone number, password, and confirm password."
      );
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      Alert.alert("Invalid email", "Use a valid email format, for example name@example.com.");
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert("Passwords do not match", "Re-enter password must match your desired password.");
      return;
    }
    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      Alert.alert(
        "Weak password",
        "Use at least 8 characters, including upper and lower case letters, at least one number, and at least one special character."
      );
      return;
    }
    if (EMAIL_OTP_ENABLED) {
      void requestSignupOtp();
      return;
    }
    void finishSignupAccount(email, password, username, phone);
  };

  const completeSignupWithOtp = async () => {
    if (DEMO_OFFLINE_MODE || !EMAIL_OTP_ENABLED) return;
    const email = signupEmail.trim().toLowerCase();
    const password = signupPassword;
    const username = signupUsername.trim();
    const phone = signupPhoneNumber.trim();
    const otp = signupOtp.replace(/\D/g, "").slice(0, 6);
    if (!email || !password || !username || !phone || !otp || otp.length !== 6) {
      Alert.alert("Missing fields", "Complete email, password, username, phone, and a full 6-digit OTP.");
      return;
    }
    if (!issuedOtpCode || issuedOtpForEmail !== email) {
      Alert.alert("OTP required", "Request an OTP for this email before signing up.");
      return;
    }
    if (otp !== issuedOtpCode) {
      Alert.alert("Incorrect OTP", "The OTP code does not match.");
      return;
    }
    try {
      await callEmulatorFunction("verifyEmailOtp", {
        email,
        purpose: "signup",
        code: otp,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not complete signup.";
      logAppError("auth.signup_verify", e, { email });
      if (
        /OTP already used/i.test(message) ||
        /OTP expired/i.test(message) ||
        /Incorrect OTP/i.test(message)
      ) {
        setSignupOtp("");
        setIssuedOtpCode("");
        setIssuedOtpForEmail("");
        setAuthMode("signup");
        Alert.alert("OTP expired", "Your OTP can only be used once. Request a new OTP and try again.");
        return;
      }
      if (/too many otp attempts|resource-exhausted/i.test(message)) {
        setSignupOtp("");
        Alert.alert("Too many attempts", "Request a new OTP and try again.");
        return;
      }
      Alert.alert("Signup failed", message);
      return;
    }
    await finishSignupAccount(email, password, username, phone);
  };

  return {
    loginDemoOrSubmit,
    requestLoginOtpCode,
    completeLoginWithOtp,
    requestSignupOtp,
    startSignup,
    completeSignupWithOtp,
  };
}
