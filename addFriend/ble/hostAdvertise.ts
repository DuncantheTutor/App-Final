import { Platform } from "react-native";
import { TBH_BLE_MANUFACTURER_ID, TBH_BLE_SERVICE_UUID } from "./constants";
import { requestBleAddFriendPermissions } from "./permissions";
import { beaconBytesFromSessionId } from "./sessionCodec";

export type BleAdvertiseHandle = {
  stop: () => Promise<void>;
};

/**
 * Android: advertises service UUID + manufacturer payload (session beacon).
 * iOS: `react-native-ble-advertiser` does not attach manufacturer bytes; host relies on on-screen session id.
 */
export async function startTbhFriendAdvertise(sessionId: string): Promise<BleAdvertiseHandle> {
  if (Platform.OS !== "android") {
    return { stop: async () => {} };
  }
  const okPerm = await requestBleAddFriendPermissions();
  if (!okPerm) {
    return { stop: async () => {} };
  }
  const bytes = beaconBytesFromSessionId(sessionId);
  if (!bytes?.length) {
    return { stop: async () => {} };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BLEAdvertiser = require("react-native-ble-advertiser").default as {
    setCompanyId: (n: number) => void;
    broadcast: (
      uid: string,
      manufData: number[],
      opts: Record<string, boolean | number>
    ) => Promise<unknown>;
    stopBroadcast: () => Promise<unknown>;
  };
  BLEAdvertiser.setCompanyId(TBH_BLE_MANUFACTURER_ID);
  await BLEAdvertiser.broadcast(
    TBH_BLE_SERVICE_UUID,
    bytes.map((b) => b & 0xff),
    {
      connectable: false,
      includeDeviceName: false,
      includeTxPowerLevel: false,
    }
  );
  return {
    stop: async () => {
      try {
        await BLEAdvertiser.stopBroadcast();
      } catch {
        /* ignore */
      }
    },
  };
}
