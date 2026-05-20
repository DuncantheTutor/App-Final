import { PermissionsAndroid, Platform } from "react-native";

type SmsListFn = (
  filter: string,
  fail: (err: string) => void,
  success: (count: string, smsList: string) => void
) => void;

type SmsRow = {
  body?: string;
  date?: number;
  date_sent?: number;
};

const REQUIRED_APP_OTP_MARKER = "app final";

function hasRequiredAppOtpMarker(text: string): boolean {
  return text.toLowerCase().includes(REQUIRED_APP_OTP_MARKER);
}

function getSmsAndroid(): { list: SmsListFn } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-get-sms-android") as { list?: SmsListFn };
    if (mod && typeof mod.list === "function") {
      return { list: mod.list };
    }
    return null;
  } catch {
    return null;
  }
}

function getOtpVerify():
  | { startOtpListener: (cb: (msg: string) => void) => Promise<unknown>; removeListener: () => void }
  | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-otp-verify") as {
      startOtpListener: (cb: (msg: string) => void) => Promise<unknown>;
      removeListener: () => void;
    };
  } catch {
    return null;
  }
}

/**
 * Extract every 6-digit token that looks word-bounded from SMS/plain text (not greedy substrings inside longer numbers).
 */
function allSixDigitTokens(text: string): string[] {
  return [...text.matchAll(/\b(\d{6})\b/g)].map((m) => m[1] ?? "").filter(Boolean);
}

/**
 * Score SMS body likely being *this app’s* email OTP vs random 2FA (bank, etc.).
 * Prefer messages mentioning app/product words or the recipient email local-part.
 */
export function scoreOtpSmsRelevance(body: string, emailLocalPartHint: string): number {
  const b = body.toLowerCase();
  if (!hasRequiredAppOtpMarker(b)) return 0;
  let score = 20;
  const local = emailLocalPartHint.trim().toLowerCase();
  if (local.length >= 2 && b.includes(local)) score += 25;
  if (/\bnfc-app\b|nfc app|nfcapp/i.test(body)) score += 22;
  if (/\btbh\b/i.test(body)) score += 12;
  if (/\blog ?in|sign ?in|verify|verification|one[- ]?time|authenticate|security code\b/i.test(b)) score += 8;
  if (/otp|your code\b|passcode/i.test(b)) score += 4;
  const codes = allSixDigitTokens(body);
  if (codes.length === 1) score += 5;
  return score;
}

/**
 * Pick best 6-digit code from scanned SMS inbox rows (newest first).
 * Requires minimum relevance vs wrong 2FA messages.
 */
export function pickBestOtpFromSmsRows(rows: SmsRow[], emailLocalPartHint: string): string | null {
  const sorted = [...rows].sort((a, b) => {
    const ta = typeof a.date_sent === "number" ? a.date_sent : typeof a.date === "number" ? a.date : 0;
    const tb = typeof b.date_sent === "number" ? b.date_sent : typeof b.date === "number" ? b.date : 0;
    return tb - ta;
  });

  let bestCode: string | null = null;
  let bestScore = 0;

  for (let i = 0; i < sorted.length; i++) {
    const body = String(sorted[i]?.body ?? "");
    const codes = [...new Set(allSixDigitTokens(body))];
    const baseScore = scoreOtpSmsRelevance(body, emailLocalPartHint);
    /** Slight preference for newer messages when relevance ties. */
    const recency = Math.min(5, Math.floor(i));
    const rowScore = baseScore + Math.max(0, 5 - recency);

    for (const code of codes) {
      const tied = rowScore;
      if (tied > bestScore) {
        bestScore = tied;
        bestCode = code;
      }
    }
  }

  if (bestScore >= 12 && bestCode) return bestCode;
  return null;
}

/**
 * Extract a 6-digit OTP from SMS / retriever text (single message).
 */
export function extractOtpDigits(text: string): string | null {
  const matches = [...text.matchAll(/\b(\d{6})\b/g)].map((m) => m[1] ?? "");
  return matches.length ? matches[0] ?? null : null;
}

/** Android: show rationale and request inbox read for OTP pickup (optional; retriever works without it). */
export async function requestReadSmsPermissionIfNeeded(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: "Read text messages",
        message:
          "Allow access to recent SMS so this app’s 6-digit verification code can be detected. Other OTP messages are ignored unless they match your sign-in context.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function hasReadSmsPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  } catch {
    return false;
  }
}

export type AndroidOtpAssistOptions = {
  /** If false, the assist will not overwrite the OTP field (e.g. user is editing). Default true. */
  shouldApplyCode?: () => boolean;
  /** Local part of email (before @); helps prefer the correct SMS vs other 6-digit OTPs. */
  emailLocalPartHint?: string;
};

/**
 * Android OTP assist: SMS Retriever listener (no permission) + optional inbox poll when READ_SMS granted.
 * Returns cleanup.
 */
export function startAndroidOtpAssist(
  onOtp: (code: string) => void,
  options?: AndroidOtpAssistOptions
): () => void {
  if (Platform.OS !== "android") return () => {};

  const shouldApply = options?.shouldApplyCode ?? (() => true);
  const emailHint = (options?.emailLocalPartHint ?? "").trim();
  const safeApply = (code: string) => {
    if (!shouldApply()) return;
    onOtp(code);
  };

  const cleanups: Array<() => void> = [];
  const otpVerify = getOtpVerify();
  if (otpVerify?.startOtpListener) {
    void otpVerify
      .startOtpListener((message: string) => {
        const body = String(message ?? "");
        if (!hasRequiredAppOtpMarker(body)) return;
        const codes = allSixDigitTokens(body);
        if (!codes.length) return;
        const bestForMessage = (() => {
          if (codes.length === 1) return codes[0];
          let best: string | null = null;
          let bestS = -1;
          for (const c of codes) {
            const seg = body.indexOf(c);
            const window = body.slice(Math.max(0, seg - 80), seg + 90);
            const s = scoreOtpSmsRelevance(window, emailHint);
            if (s > bestS) {
              bestS = s;
              best = c;
            }
          }
          return bestS >= 12 ? best : null;
        })();
        if (bestForMessage) safeApply(bestForMessage);
      })
      .catch(() => {
        /* native module optional */
      });
    cleanups.push(() => {
      try {
        otpVerify.removeListener();
      } catch {
        /* */
      }
    });
  }

  const sms = getSmsAndroid();
  const interval =
    sms &&
    setInterval(() => {
      void (async () => {
        if (!(await hasReadSmsPermission())) return;
        sms.list(
          JSON.stringify({ box: "inbox", maxCount: 25, indexFrom: 0 }),
          () => {},
          (_count, smsList) => {
            try {
              const rows = JSON.parse(smsList) as SmsRow[];
              const picked = pickBestOtpFromSmsRows(rows, emailHint);
              if (picked) {
                safeApply(picked);
              }
            } catch {
              /* */
            }
          }
        );
      })();
    }, 2800);
  if (interval) cleanups.push(() => clearInterval(interval));

  return () => {
    cleanups.forEach((fn) => fn());
  };
}
