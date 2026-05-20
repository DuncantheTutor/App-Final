import { PermissionsAndroid, Platform } from "react-native";

/** Android 12+ scan/connect/advertise; API 23–30 uses location for BLE scans. */
export async function requestBleAddFriendPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const ver = typeof Platform.Version === "number" ? Platform.Version : 0;
  try {
    if (ver >= 31) {
      const r = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      ]);
      return (
        r["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
        r["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
        r["android.permission.BLUETOOTH_ADVERTISE"] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    const loc = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return loc === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
