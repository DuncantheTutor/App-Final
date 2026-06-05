import * as ExpoLocation from "expo-location";
import * as ExpoNetwork from "expo-network";
import { Alert, Platform } from "react-native";

import {
  MAX_HORIZONTAL_ACCURACY_M,
  MAX_LOCATION_AGE_MS,
} from "../../addFriend/proximityQr/pairingRules";
import type { PairingProximityEvidence } from "../domain/types";

export const PAIRING_LOCATION_FIX_TIMEOUT_MS = 15_000;

export type PreciseLocationGateReason = "denied" | "approximate_only" | "services_disabled";

export type PreciseLocationGateResult =
  | { ok: true }
  | { ok: false; reason: PreciseLocationGateReason };

const PRECISE_LOCATION_MESSAGES: Record<PreciseLocationGateReason, string> = {
  denied:
    "Location permission is required for in-person Add Friend. Allow location when prompted, or enable it in Settings.",
  approximate_only:
    "Add Friend needs Precise location (not Approximate only). In your phone's settings for Erdos, turn on Location and enable Precise, then try again.",
  services_disabled:
    "Turn on Location services on this phone, then try Add Friend again.",
};

export function preciseLocationGateMessage(reason: PreciseLocationGateReason): string {
  return PRECISE_LOCATION_MESSAGES[reason];
}

/** True when OS granted fine (Android) / full (iOS) location, not approximate-only. */
export function isPreciseLocationPermissionGranted(
  perm: ExpoLocation.LocationPermissionResponse
): boolean {
  if (!perm.granted) return false;
  if (Platform.OS === "android") {
    const acc = perm.android?.accuracy;
    if (acc === "coarse") return false;
    return true;
  }
  if (Platform.OS === "ios") {
    const acc = perm.ios?.accuracy;
    if (acc === "reduced") return false;
    return true;
  }
  return true;
}

function alertPreciseLocationRequired(reason: PreciseLocationGateReason): void {
  const title =
    reason === "approximate_only" ? "Precise location required" : "Location required for Add Friend";
  Alert.alert(title, PRECISE_LOCATION_MESSAGES[reason], [
    {
      text: "Try again",
      onPress: () => {
        void ensurePreciseLocationForPairing({ showAlerts: true });
      },
    },
    { text: "Cancel", style: "cancel" },
  ]);
}

/**
 * Ensures foreground location is granted at **precise** accuracy (Android fine / iOS full).
 * Re-prompts when the user previously chose approximate-only.
 */
export async function ensurePreciseLocationForPairing(options?: {
  showAlerts?: boolean;
}): Promise<PreciseLocationGateResult> {
  const showAlerts = options?.showAlerts !== false;

  const servicesEnabled = await ExpoLocation.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    if (showAlerts) alertPreciseLocationRequired("services_disabled");
    return { ok: false, reason: "services_disabled" };
  }

  let perm = await ExpoLocation.getForegroundPermissionsAsync();
  if (!perm.granted) {
    perm = await ExpoLocation.requestForegroundPermissionsAsync();
  }
  if (!perm.granted) {
    if (showAlerts) alertPreciseLocationRequired("denied");
    return { ok: false, reason: "denied" };
  }
  if (!isPreciseLocationPermissionGranted(perm)) {
    if (showAlerts) alertPreciseLocationRequired("approximate_only");
    return { ok: false, reason: "approximate_only" };
  }

  return { ok: true };
}

function applyLocationObject(pos: ExpoLocation.LocationObject): {
  lat: number;
  lng: number;
  horizontalAccuracyM: number;
  locationTimestampMs: number;
} | null {
  const lat = Number.isFinite(pos.coords.latitude) ? pos.coords.latitude : null;
  const lng = Number.isFinite(pos.coords.longitude) ? pos.coords.longitude : null;
  const horizontalAccuracyM = Number.isFinite(pos.coords.accuracy ?? NaN)
    ? (pos.coords.accuracy as number)
    : null;
  const locationTimestampMs = Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now();
  if (lat == null || lng == null || horizontalAccuracyM == null) return null;
  if (horizontalAccuracyM <= 0 || horizontalAccuracyM > MAX_HORIZONTAL_ACCURACY_M) return null;
  if (Math.abs(Date.now() - locationTimestampMs) > MAX_LOCATION_AGE_MS) return null;
  return { lat, lng, horizontalAccuracyM, locationTimestampMs };
}

/** GPS fix suitable for server proximity checks (≤50m accuracy, fresh). */
export async function readPrecisePairingLocationFix(): Promise<{
  lat: number | null;
  lng: number | null;
  horizontalAccuracyM: number | null;
  locationTimestampMs: number | null;
}> {
  try {
    const cached = await ExpoLocation.getLastKnownPositionAsync({
      maxAge: MAX_LOCATION_AGE_MS,
      requiredAccuracy: MAX_HORIZONTAL_ACCURACY_M,
    });
    if (cached) {
      const parsed = applyLocationObject(cached);
      if (parsed) return parsed;
    }
  } catch {
    /* fall through to fresh GPS fix */
  }

  try {
    const pos = await Promise.race([
      ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Highest,
        mayShowUserSettingsDialog: true,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), PAIRING_LOCATION_FIX_TIMEOUT_MS)
      ),
    ]);
    if (!pos) return { lat: null, lng: null, horizontalAccuracyM: null, locationTimestampMs: null };
    const parsed = applyLocationObject(pos);
    if (!parsed) return { lat: null, lng: null, horizontalAccuracyM: null, locationTimestampMs: null };
    return parsed;
  } catch {
    return { lat: null, lng: null, horizontalAccuracyM: null, locationTimestampMs: null };
  }
}

/** Proximity payload for pairing callables: precise GPS when available + Wi-Fi fallback hints. */
export async function collectPrecisePairingProximityEvidence(): Promise<PairingProximityEvidence> {
  const fix = await readPrecisePairingLocationFix();

  let isWifiConnected = false;
  let localIp: string | null = null;
  try {
    const state = await ExpoNetwork.getNetworkStateAsync();
    isWifiConnected = Boolean(state.isConnected && state.type === ExpoNetwork.NetworkStateType.WIFI);
    localIp = isWifiConnected ? await ExpoNetwork.getIpAddressAsync() : null;
    localIp = localIp?.trim() || null;
  } catch {
    /* optional fallback evidence */
  }

  return {
    lat: fix.lat,
    lng: fix.lng,
    horizontalAccuracyM: fix.horizontalAccuracyM,
    locationTimestampMs: fix.locationTimestampMs,
    isWifiConnected,
    localIp,
  };
}
