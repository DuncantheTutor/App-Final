"use strict";
/** Pure proximity checks. GPS coordinates are still client-reported. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROXIMITY_GPS_UNCERTAINTY_MULTIPLIER = exports.PROXIMITY_MAX_LOCATION_AGE_MS = exports.PROXIMITY_MAX_ACCURACY_M = exports.PROXIMITY_MAX_DISTANCE_M = void 0;
exports.haversineMeters = haversineMeters;
exports.gpsSeparationAllowed = gpsSeparationAllowed;
exports.isGpsEvidenceUsable = isGpsEvidenceUsable;
exports.hasSameWifiSubnetFallback = hasSameWifiSubnetFallback;
exports.evaluatePairingProximity = evaluatePairingProximity;
exports.PROXIMITY_MAX_DISTANCE_M = 100;
exports.PROXIMITY_MAX_ACCURACY_M = 50;
exports.PROXIMITY_MAX_LOCATION_AGE_MS = 60_000;
exports.PROXIMITY_GPS_UNCERTAINTY_MULTIPLIER = 1.75;
function haversineMeters(lat1, lng1, lat2, lng2) {
    const earthRadiusM = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusM * c;
}
/**
 * Accept a pair inside the 100m cap even when the GPS fix is tight.
 * Reject only when they are farther than 100m and farther than the uncertainty radius.
 */
function gpsSeparationAllowed(separationM, combinedUncertaintyM) {
    if (!Number.isFinite(separationM) || separationM < 0)
        return false;
    if (separationM <= exports.PROXIMITY_MAX_DISTANCE_M)
        return true;
    const uncertaintyRadius = exports.PROXIMITY_GPS_UNCERTAINTY_MULTIPLIER * Math.max(0, combinedUncertaintyM);
    return separationM <= uncertaintyRadius;
}
function isGpsEvidenceUsable(e, nowMs) {
    if (typeof e.lat !== "number" ||
        typeof e.lng !== "number" ||
        typeof e.horizontalAccuracyM !== "number" ||
        typeof e.locationTimestampMs !== "number") {
        return false;
    }
    if (Math.abs(e.lat) > 90 || Math.abs(e.lng) > 180)
        return false;
    if (e.horizontalAccuracyM <= 0 || e.horizontalAccuracyM > exports.PROXIMITY_MAX_ACCURACY_M)
        return false;
    if (Math.abs(nowMs - e.locationTimestampMs) > exports.PROXIMITY_MAX_LOCATION_AGE_MS)
        return false;
    return true;
}
function ipv4ToOctets(ip) {
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m)
        return null;
    const octets = m.slice(1).map((x) => Number(x));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
        return null;
    return octets;
}
function isPrivateIpv4(octets) {
    const [a, b] = octets;
    if (a === 10)
        return true;
    if (a === 192 && b === 168)
        return true;
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    return false;
}
function hasSameWifiSubnetFallback(a, b) {
    if (!a.isWifiConnected || !b.isWifiConnected || !a.localIp || !b.localIp)
        return false;
    const aOctets = ipv4ToOctets(a.localIp);
    const bOctets = ipv4ToOctets(b.localIp);
    if (!aOctets || !bOctets)
        return false;
    if (!isPrivateIpv4(aOctets) || !isPrivateIpv4(bOctets))
        return false;
    return aOctets[0] === bOctets[0] && aOctets[1] === bOctets[1] && aOctets[2] === bOctets[2];
}
function evaluatePairingProximity(a, b, nowMs) {
    const aGps = isGpsEvidenceUsable(a, nowMs);
    const bGps = isGpsEvidenceUsable(b, nowMs);
    if (aGps && bGps) {
        const separationM = haversineMeters(a.lat, a.lng, b.lat, b.lng);
        const combinedUncertaintyM = Math.sqrt(Math.pow(a.horizontalAccuracyM, 2) + Math.pow(b.horizontalAccuracyM, 2));
        return gpsSeparationAllowed(separationM, combinedUncertaintyM)
            ? { ok: true }
            : { ok: false, reason: "gps" };
    }
    return hasSameWifiSubnetFallback(a, b) ? { ok: true } : { ok: false, reason: "fallback" };
}
