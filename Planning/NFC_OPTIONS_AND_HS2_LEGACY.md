# NFC options and legacy HS2

**Primary Add Friend transport (current app default):** **QR Show/Read UI** backed by server-reserved **4-digit PIN offers** (same callables in **`Planning/BLE_ADD_FRIEND_ARCHITECTURE.md`**). PIN plaintext helpers live in **`addFriend/nfcPinTransport/`** (legacy HS2 / one-shot NFC code stays under **`addFriend/nfc/`**). **Planned hardening:** **mandatory proximity evidence** (GPS-first hard 100m cap, Wi-Fi/personal-hotspot fallback) — **`addFriend/proximityQr/`** + **`Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md`**. **BLE** is **siloed** under `addFriend/ble/` (not wired from default Add Friend UI).

This note still documents **RF roles** (Transmit vs Receive), **one-shot voucher** option A (historical default before PIN pair), and **legacy HS2** callables unused by the app.

For diagnostics, the current smallest-payload NFC PIN flow in `App.tsx` and `AppDemo.tsx` now emits attempt-scoped telemetry under `pairing.nfc.pin.*` (register/write/read/confirm/await-redeem stages plus cancellation/failure markers) to help trace race conditions and fast callback churn during in-person tests.

---

# Why Transmit often failed immediately (RF roles)

**Transmit** used `writeNdefMessage`: the phone acts as an NFC **writer / poller (PCD)** and expects the peer to look like a **passive tag**. **Receive** used a normal foreground **read** session, which is **also** a poller looking for a tag — not a passive tag. Two pollers often **never** establish a writer→tag link, so `requestTechnology` can **reject or finish quickly** and the flow looks like an “instant” failure.

**Mitigations in the app:** (1) **Receive** uses **Android reader mode** when in Receive mode so the peer can be discovered more like a tag. (2) **Transmit** clears the NFC session, **waits ~900ms** after mint so the Receive phone can arm, then **retries the write** several times with short gaps. (3) UX copy stresses **Receive opens first**, **Transmit taps second**.

Long-term fixes without changing transport are **HCE** on one side or **OS-level NDEF push** (deprecated APIs).

---

# NFC-only options for “one send” Add Friend (pros / cons)

These are **phone-to-phone NFC only** (no QR / LAN / link). They describe **different roles on the RF link**, not different server designs.

## A) One **write** (Transmit phone → Receive phone)

**Idea:** The Transmit handset runs `writeNdefMessage` once with `FN1.AF1|<voucher>`. The Receive handset is already waiting in a read session and **does not** write back.

| Pros | Cons |
|------|------|
| Fewest NFC API turns; matches “one payload over the air”. | The receiving phone must present as something the writer can **write to** (often flaky between two smartphones). |
| Server can stay “mint voucher → redeem voucher” (simple). | If both phones try to **write**, pairing fails unless UX enforces **one Transmit / one Receive**. |

**Current app choice:** **Option A**, enforced by the **Transmit / Receive** toggle.

---

## B) One **read** (Receive phone reads emulated tag on Transmit phone)

**Idea:** Transmit side uses **Host Card Emulation (HCE)** so it looks like a passive NFC tag; Receive side reads once.

| Pros | Cons |
|------|------|
| Classic reader ↔ tag model; one read is enough. | **HCE is Android-specific**, needs **native** service code; not exposed by `react-native-nfc-manager` out of the box. |
| Often more reliable than “peer write” on some chipsets. | **iOS** cannot play the same HCE role for arbitrary third‑party payloads in this way. |

---

## C) OS **NDEF push / Beam**–style single push

**Idea:** OS mediates a one-shot NDEF push between devices (historical Android Beam pattern).

| Pros | Cons |
|------|------|
| When it worked, it was very “tap once”. | **Deprecated / removed** on modern Android; **not** something RN can rely on. |

---

## D) Symmetric “try read, then try write” with **no** role toggle

**Idea:** Both phones run the same algorithm to avoid asking users to pick Transmit/Receive.

| Pros | Cons |
|------|------|
| Simpler UX copy. | Two devices can pick the **same** branch (both mint, both write, both read empty) → **races** and **higher failure rate**. |

---

# Legacy HS2 handshake (siloed)

The previous **two-step** NFC + nonce exchange (`beginNfcHandshakeSession` / `respondNfcHandshakeSession` / `finalizeNfcHandshakeSession` / `getNfcHandshakeSessionStatus`) is **no longer called from the app**. Implementations remain in `backend/functions/src/index.ts` under a **LEGACY** banner for rollback or ops reference until intentionally removed.

Archived client flow (responder read → write HS2R, initiator write → read / poll) lived in `App.tsx` before the one-shot change; recover it from version control if needed.
