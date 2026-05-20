import { Platform } from "react-native";

/** Stops TBH BLE advertising (Android). Safe to call on iOS / web. */
export async function stopTbhBleAdvertising(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BLEAdvertiser = require("react-native-ble-advertiser").default as {
      stopBroadcast: () => Promise<unknown>;
    };
    await BLEAdvertiser.stopBroadcast();
  } catch {
    /* ignore */
  }
}
