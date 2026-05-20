# QR + optional GPS proximity — Add Friend (new silo)

**No overlap** with `addFriend/nfc/`, `addFriend/nfcPinTransport/`, or `addFriend/ble/`. This tree holds types and constants for the **time-limited QR token** flow plus optional **100m GPS** co-location checks. **`App.tsx` does not wire this yet**; backend callables and state machine live in `pairingRules.ts` and `Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md`.

When implementing: add QR render/scan, Android `FLAG_SECURE`, and screenshot listeners under this folder only (or subfolders here), so NFC/BLE/legacy NFC files stay untouched.
