/**
 * expo-network on Android reports `isInternetReachable` when any network is
 * active, and `isConnected` only when it also recognises the transport.
 * A Wi-Fi or mobile link whose transport comes back unknown used to fail the
 * `isConnected && reachable` check, so the app stayed on the offline banner.
 */
export function deviceNetworkLooksOnline(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
} | null | undefined): boolean {
  if (!state) return true;
  if (state.isConnected === true || state.isInternetReachable === true) return true;
  if (state.isConnected === false && state.isInternetReachable === false) return false;
  return true;
}
