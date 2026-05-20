import { Platform } from "react-native";
import { BleManager, State } from "react-native-ble-plx";
import { TBH_BLE_SERVICE_UUID } from "./constants";
import { requestBleAddFriendPermissions } from "./permissions";
import { parseSessionIdFromScanDevice } from "./sessionCodec";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until Bluetooth is on or timeout (joiner).
 */
export async function waitForBlePoweredOn(manager: BleManager, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let st = await manager.state();
  if (st === State.PoweredOn) return true;
  return await new Promise<boolean>((resolve) => {
    const sub = manager.onStateChange((s) => {
      st = s;
      if (s === State.PoweredOn) {
        sub.remove();
        resolve(true);
      } else if (Date.now() >= deadline) {
        sub.remove();
        resolve(false);
      }
    }, true);
    void (async () => {
      while (Date.now() < deadline) {
        if (st === State.PoweredOn) {
          sub.remove();
          resolve(true);
          return;
        }
        await delay(200);
      }
      sub.remove();
      resolve(st === State.PoweredOn);
    })();
  });
}

export type BleFriendHostCandidate = {
  sessionId: string;
  /** Best (highest) RSSI seen for this session; -100 if unknown. */
  rssi: number;
};

/**
 * Scan for hosts advertising our service + session beacon. Deduplicates by `sessionId`, keeps best RSSI.
 * Sorted strongest signal first.
 */
export async function scanForTbhFriendHostCandidates(timeoutMs: number): Promise<BleFriendHostCandidate[]> {
  if (Platform.OS === "web") return [];
  const perm = await requestBleAddFriendPermissions();
  if (!perm) return [];
  const manager = new BleManager();
  try {
    const powered = await waitForBlePoweredOn(manager, Math.min(4000, timeoutMs));
    if (!powered) return [];

    const bestRssiBySession = new Map<string, number>();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        void manager.stopDeviceScan().catch(() => {});
        resolve();
      };

      manager.startDeviceScan([TBH_BLE_SERVICE_UUID], { allowDuplicates: true }, (_err, device) => {
        if (!device) return;
        const sid = parseSessionIdFromScanDevice({
          manufacturerData: device.manufacturerData ?? null,
          serviceUUIDs: device.serviceUUIDs ?? null,
        });
        if (!sid) return;
        const raw = device.rssi;
        const rssi = typeof raw === "number" && Number.isFinite(raw) ? raw : -100;
        const prev = bestRssiBySession.get(sid);
        if (prev === undefined || rssi > prev) bestRssiBySession.set(sid, rssi);
      });
    });

    return Array.from(bestRssiBySession.entries())
      .map(([sessionId, rssi]) => ({ sessionId, rssi }))
      .sort((a, b) => b.rssi - a.rssi);
  } catch {
    return [];
  } finally {
    try {
      await manager.stopDeviceScan();
    } catch {
      /* ignore */
    }
    manager.destroy();
  }
}

/**
 * Scan for a host advertising our service + session beacon. Returns strongest `BF1_…` or null.
 */
export async function scanForTbhFriendSessionId(timeoutMs: number): Promise<string | null> {
  const list = await scanForTbhFriendHostCandidates(timeoutMs);
  return list[0]?.sessionId ?? null;
}
