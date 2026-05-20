/**
 * Shell / pairing state contracts (App Final V2 shape). Implementation still largely lives in
 * `app/MainApp.tsx`; these types anchor future extraction into `state/` + thin views.
 */

export type AppPhase = "bootstrap" | "signed_out" | "signed_in";

export type AuthStage =
  | "idle"
  | "requesting_signup_otp"
  | "requesting_otp"
  | "signup_otp_requested"
  | "otp_requested"
  | "verifying_signup_otp"
  | "verifying_otp"
  | "authenticated";

export type AuthMode = "login" | "login_otp" | "signup" | "signup_otp";

export type AuthState = {
  mode: AuthMode;
  email: string;
  password: string;
  otpCode: string;
  otpDebugCode: string | null;
  signupEmail: string;
  signupUsername: string;
  signupPhoneNumber: string;
  signupPassword: string;
  signupPasswordConfirm: string;
  signupOtpCode: string;
  stage: AuthStage;
  errorMessage: string | null;
};

export type PairingStage =
  | "idle"
  | "registering_offer"
  | "offer_ready"
  | "awaiting_other_confirmation"
  | "previewing_offer"
  | "confirming_offer";

export type PairingState = {
  pin: string;
  encodedOffer: string;
  scannedPayload: string;
  previewedUsername: string;
  previewedProfilePictureUrl: string | null;
  stage: PairingStage;
  statusMessage: string | null;
  errorMessage: string | null;
};

export type AppShellState = {
  phase: AppPhase;
  auth: AuthState;
  pairing: PairingState;
};

export type AppShellActions = {
  setAuthMode(mode: AuthMode): void;
  setAuthEmail(email: string): void;
  setAuthPassword(password: string): void;
  setAuthOtpCode(otpCode: string): void;
  requestLoginOtp(): Promise<void>;
  verifyOtpAndSignIn(): Promise<void>;
  setSignupEmail(email: string): void;
  setSignupUsername(username: string): void;
  setSignupPhoneNumber(phoneNumber: string): void;
  setSignupPassword(password: string): void;
  setSignupPasswordConfirm(passwordConfirm: string): void;
  setSignupOtpCode(otpCode: string): void;
  requestSignupOtp(): Promise<void>;
  verifySignupOtpAndCreateSession(): Promise<void>;
  signOut(): Promise<void>;
  setScannedPayload(scannedPayload: string): void;
  startPairingOffer(): Promise<void>;
  previewScannedOffer(): Promise<void>;
  confirmScannedOffer(): Promise<void>;
  resetPairing(): Promise<void>;
};

export type UseAppShellResult = AppShellState & {
  actions: AppShellActions;
};
