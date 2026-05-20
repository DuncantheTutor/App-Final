# In-person Add Friend — architecture plan (NFC PIN primary, BLE siloed)

**Status:** **Default pairing UX is QR** (Show / Read QR). **NFC** is being aligned to the same button flow per **`Planning/NFC_QR_UNIFIED_PAIRING_PLAN.md` v2.0** (Send / Receive friend request, no hold-to-pair, opaque session token on wire). Backend callables remain **`registerNfcPinPairOffer`** / **`confirmNfcPinPairOffer`** / etc. on collection **`nfcPinPairSessions`** (doc id migrating from 4-digit PIN to opaque token). **BLE** remains siloed in **`addFriend/ble/`**. **Rebuild native** after NFC native changes.

---

## 1. Product shape (NFC PIN — current default)

- **In-person** friendship remains the rule (`PLANNING.md` R1).
- **Host (issuer):** random **4-digit PIN**; **`registerNfcPinPairOffer`** reserves it server-side (silent regenerate on **`PIN unavailable`**). **NDEF** carries **plaintext PIN** (4 chars, minimal). No PIN on screen. **`getNfcPinPairOfferStatus`** until join or timeout; **`cancelNfcPinPairOffer`** on cancel / failed NFC / timeout-after-wait.
- **Joiner:** **`readAddFriendNdefPayload`** (Receive) → **`confirmNfcPinPairOffer`**. Friendship edge written server-side.
- **BLE (silo):** optional future / parity; see `addFriend/ble/SILO.md`.
- **Optional hardening:** `allowedRedeemerUid` (or equivalent) when the joiner’s identity is known before mint; **LE Secure Connections** at the BLE stack when the RN library exposes it (link-layer encryption in addition to app session).

---

## 2. Code layout (NFC PIN default, BLE siloed)

**Goal:** **Default** Add Friend is **NFC PIN pair** (`addFriend/nfcPinTransport/pinPairProtocol.ts`, NDEF read/write via `addFriend/nfc/handshake.ts`, `nfcPinPairSessions` callables). **`App.tsx`** owns Share/Join UX and should not sprawl low-level NFC/BLE imports; use **`addFriend/inPersonPairingGateway.ts`** for transport-agnostic teardown. **BLE** stays in **`addFriend/ble/`** only (see `addFriend/ble/SILO.md`). **Planned QR + GPS** pairing is siloed in **`addFriend/proximityQr/`** — see **`Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md`** (not default in UI until implemented).

| Location | Role |
|----------|------|
| `addFriend/nfcPinTransport/pinPairProtocol.ts`, `addFriend/nfc/index.ts` | **PIN pair** NDEF encode/decode; barrel re-exports from `nfcPinTransport`. |
| `addFriend/nfc/handshake.ts`, `addFriend/nfc/oneShot.ts` | NFC session IO + legacy one-shot / HS2-era helpers (not all are default Add Friend path). |
| `addFriend/proximityQr/*` | QR token rule constants + future UI/scan (**no overlap** with NFC/BLE folders). |
| `addFriend/ble/*` | BLE constants, Android advertise, scan (`react-native-ble-plx`), permissions — **silo**. |
| `addFriend/inPersonPairingGateway.ts` | Thin **transport-agnostic** facade + **`cancelInPersonPairingHardware`** (NFC cancel for pairing teardown). |
| `App.tsx` | Share / Join UI; NFC PIN register / poll / confirm; Cloud Functions for pairing sessions. |

**Backend:** Existing **`mintNfcFriendVoucher` / `redeemNfcFriendVoucher` / `getNfcFriendVoucherStatus`** can be **reused** for the actual friendship write (rename in docs to “friend voucher” transport-agnostic) **or** wrapped by new **`createBleFriendSession` / `joinBleFriendSession`** that internally mint the same voucher shape after code verification. HS2 legacy callables stay siloed per `NFC_OPTIONS_AND_HS2_LEGACY.md`.

---

## 3. Bluetooth: “ask permission” vs “turn Bluetooth on/off automatically”

### Android

- **Permissions:** Android 12+ uses **`BLUETOOTH_SCAN`** / **`BLUETOOTH_CONNECT`** (and legacy location rules for some scan paths on older APIs). The app should request these **when entering Add Friend**, with clear copy.
- **Turning Bluetooth on:** Apps **cannot** silently enable Bluetooth. The supported pattern is **`BluetoothAdapter.ACTION_REQUEST_ENABLE`** (or the **Settings panel** / **intent**) so the **user confirms** once. Some OEMs may still show a system dialog.
- **Turning Bluetooth off after pairing:** Technically possible in older APIs; **not recommended** and often **blocked**, **ignored**, or **bad UX** (user may be using audio, watch, etc.). **Preferred:** leave Bluetooth state unchanged; **stop BLE advertise / scan / connections** when the Add Friend screen closes so **battery** impact drops without toggling global Bluetooth.

### iOS

- **No programmatic on/off:** Apps **cannot** turn Bluetooth on or off. **`CBCentralManager`** / **`CBPeripheralManager`** may prompt to **allow Bluetooth** for the app; the user may need **Settings** if Bluetooth is off at the OS level.
- **Preferred:** same as Android — **tear down** BLE sessions when done; do not assume you can flip the system switch.

**Summary for product copy:** “We may ask you to **enable Bluetooth** to pair; we **won’t** turn it off for you when you’re done — we only **stop** our pairing session.”

**UX rule:** **Prompt only to turn Bluetooth on** (or to grant **Bluetooth permissions** on Android 12+, which is separate from the radio being on). **Never** prompt or automate **turning Bluetooth off** after pairing; rely on **session teardown** only.

---

## 4. Comparison to “Combo A” (earlier chat)

- **Combo A** was: **BLE** + **Bluetooth Numeric Comparison** (stack-generated six digits on **both** phones) + optional **server-bound redeemer**.
- **This plan** is: **BLE** + **app-generated six digits** on host + **joiner types code** + same **server session / voucher** model + optional **redeemer binding** + stack **LE Secure Connections** if available.
- Same **security class** (short authenticated string + proximity session); **better product control** over UX and easier to align with **QR / link** fallbacks later.

---

## 5. Implementation order (when coding starts)

1. Add BLE native dependency + manifests / Info.plist usage strings.  
2. Cloud Functions: session doc + code hash + TTL + rate limit; join verifies code then redeems/creates friendship (reuse voucher logic where possible).  
3. `addFriend/ble/` host + joiner state machine; foreground-first.  
4. NFC PIN payloads live under `addFriend/nfcPinTransport/`; legacy NFC helpers under `addFriend/nfc/`; smoke-test legacy NFC path if retained.  
5. Update `FEATURE_TEST_SCENARIOS.md`, `PRODUCTION_READINESS_CHECKLIST.md` (BLE permissions, crash analytics), and parity scripts.

---

## 6. Related docs

- `Planning/NFC_OPTIONS_AND_HS2_LEGACY.md` — RF roles, HS2 legacy, **NFC retained as siloed option**  
- `Planning/PLANNING.md` — R1 / physical-first; **default NFC PIN**; planned **QR proximity** in `Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md`
