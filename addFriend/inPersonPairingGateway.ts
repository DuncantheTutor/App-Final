/**
 * In-person Add Friend — transport-agnostic hooks for the active UX.
 * QR: `app/screens/AddFriendScreen.tsx`. NFC buttons: `addFriend/nfcPairing/`.
 * BLE remains siloed under `./ble/` (see `ble/SILO.md`).
 */
import { cancelActiveNfcRequest } from "./nfc/handshake";

/** Stops active NFC reader/writer sessions started for pairing. */
export async function cancelInPersonPairingHardware(): Promise<void> {
  await cancelActiveNfcRequest();
}
