import type { NfcPairingMethodId } from "./constants";

/** Server bridge — same callables as QR; screen injects MainApp handlers. */
export type NfcPairingServerBridge<TFriend> = {
  registerSessionWithRetry: () => Promise<string | null>;
  awaitRedeem: (sessionHandle: string) => Promise<TFriend | null>;
  confirmRead: (sessionHandle: string) => Promise<TFriend | null>;
  cancelSession: (sessionHandle: string) => Promise<void>;
};

export type NfcPairingFlowHooks = {
  onStatus: (label: string) => void;
  logEvent: (name: string, payload?: Record<string, unknown>) => void;
  isCancelled: () => boolean;
};

export type NfcPairingPresenterSuccess<TFriend> = {
  ok: true;
  methodId: NfcPairingMethodId;
  sessionHandle: string;
  friend: TFriend;
};

export type NfcPairingResponderSuccess<TFriend> = {
  ok: true;
  methodId: NfcPairingMethodId;
  sessionHandle: string;
  friend: TFriend;
};

export type NfcPairingFailure = {
  ok: false;
  methodId: NfcPairingMethodId;
  stage: string;
  userMessage: string;
};

export type NfcPairingPresenterResult<TFriend> =
  | NfcPairingPresenterSuccess<TFriend>
  | NfcPairingFailure;

export type NfcPairingResponderResult<TFriend> =
  | NfcPairingResponderSuccess<TFriend>
  | NfcPairingFailure;
