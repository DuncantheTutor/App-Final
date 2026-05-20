# BLE Add Friend — siloed implementation

**Default Add Friend in the app is NFC 4-digit PIN pair** (`registerNfcPinPairOffer` / `confirmNfcPinPairOffer`). Payload helpers: **`addFriend/nfcPinTransport/`**; NFC session I/O: **`addFriend/nfc/handshake.ts`**. Planned QR path: **`addFriend/proximityQr/`**.

This folder keeps the **BLE** stack (`react-native-ble-plx`, `react-native-ble-advertiser`, scan/advertise helpers) for **reuse or future opt-in**, but **`App.tsx` does not import it** for the primary pairing flow.

Use `addFriend/inPersonPairingGateway.ts` for transport-agnostic cancel (NFC session teardown only).
