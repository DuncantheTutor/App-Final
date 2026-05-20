# NFC PIN pair transport — current default (client)

**This folder** holds the **active** 4-digit PIN NFC payload helpers used by **Add Friend** (`pinPairProtocol.ts`). It does **not** contain earlier NFC experiments (one-shot voucher UI, HS2 handshake) — those stay under **`addFriend/nfc/`** (`handshake.ts`, `oneShot.ts`).

| Area | Location |
|------|----------|
| PIN NDEF encode/parse | `addFriend/nfcPinTransport/pinPairProtocol.ts` |
| NFC session read/write for pairing | `addFriend/nfc/handshake.ts` (imports unchanged) |
| Legacy NFC flows | `addFriend/nfc/oneShot.ts`, HS2-era helpers in `handshake.ts` |
| BLE (optional / siloed) | `addFriend/ble/` |
| QR + GPS proximity (planned) | `addFriend/proximityQr/` |

`addFriend/inPersonPairingGateway.ts` remains the transport-agnostic NFC teardown hook.
