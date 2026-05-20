/**
 * Concrete rule set version 1 — QR proximity Add Friend.
 *
 * Full prose + server semantics: Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md
 */

export const QR_PAIRING_RULE_VERSION = 1 as const;

/** Server: offer document / token is valid only this long after mint. */
export const OFFER_TTL_MS = 15_000;

/** UI: each reveal shows QR at full brightness for this long, then hides or replaces with “tap to show again”. */
export const QR_VISIBLE_DURATION_MS = 4_000;

/** Minimum visibility when product wants a 2–5s band (clamp UI to this range). */
export const QR_VISIBLE_MIN_MS = 2_000;
export const QR_VISIBLE_MAX_MS = 5_000;

/** Each “tap to show again” mints a **new** offer id; previous server offer is revoked. */
export const NEW_OFFER_ON_EACH_REVEAL = true;

/** If true, screenshot while QR is displayed → revoke active offer immediately (client + server). */
export const SCREENSHOT_REVOKES_OFFER = true;

/** Both parties must look within this horizontal distance (meters) for redeem to succeed. */
export const MAX_PAIR_SEPARATION_M = 100;

/** Reject locations whose reported accuracy is worse than this (meters). Tune per field feedback. */
export const MAX_HORIZONTAL_ACCURACY_M = 50;

/** Location fixes older than this at redeem time are rejected (ms). */
export const MAX_LOCATION_AGE_MS = 60_000;

/**
 * Dynamic GPS tolerance multiplier over combined uncertainty:
 * combinedUncertaintyM = sqrt(aPresenter^2 + aScanner^2).
 * Final GPS pass radius is always capped by MAX_PAIR_SEPARATION_M (100m).
 */
export const GPS_COMBINED_UNCERTAINTY_MULTIPLIER = 1.75;

/** Final confirmation copy shown before writing friendship. */
export const FINAL_CONFIRMATION_PROMPT_TEMPLATE = "Confirm adding {userName} as a friend?";

/** Fallback helper copy when GPS is weak and Wi-Fi evidence is missing. */
export const WIFI_FALLBACK_HELP_TEXT =
  "Could not verify proximity with GPS. Connect both phones to the same Wi-Fi network (personal hotspot also counts) and try again.";

export type QrOfferMintRequest = {
  ruleVersion: typeof QR_PAIRING_RULE_VERSION;
  /** Presenter's device location at mint time (or refreshed within MAX_LOCATION_AGE_MS). */
  lat: number;
  lng: number;
  horizontalAccuracyM: number;
  locationTimestampMs: number;
};

export type QrOfferRedeemRequest = {
  ruleVersion: typeof QR_PAIRING_RULE_VERSION;
  token: string;
  /** Scanner's location at scan time. */
  lat: number;
  lng: number;
  horizontalAccuracyM: number;
  locationTimestampMs: number;
};

/** Redeem-time distance between presenter fix and scanner fix (Haversine), server-computed. */
export type ProximityCheck = {
  separationM: number;
  presenterAccuracyM: number;
  scannerAccuracyM: number;
  passes100mGate: boolean;
  passesAccuracyGate: boolean;
};
