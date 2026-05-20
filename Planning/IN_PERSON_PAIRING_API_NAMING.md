# In-person pairing API — transport-agnostic naming and migration

**Status:** Proposed contract (not implemented)  
**Audience:** Product, mobile, backend, QA  
**Related:** `MASTER_PRODUCT_PLAN.md`, `BLE_ADD_FRIEND_ARCHITECTURE.md`, `QR_PROXIMITY_ADD_FRIEND_RULES.md`, `contracts/firebaseCallableNames.ts`

---

## Purpose

Today the default Add Friend path is **Show QR / Read QR** with **GPS / Wi‑Fi proximity** and **dual human confirm**, but deployed identifiers still read as **NFC PIN** (`registerNfcPinPairOffer`, `nfcPinPairSessions`, `addFriend/nfcPinTransport/`). That mismatch forces another rename if NFC or BLE becomes the default OOB channel.

This document defines a **single transport-agnostic pairing API** (offer lifecycle + proximity + dual confirm), a **before → after name map**, what stays transport-specific, how **`proximityQr`** folds in, and a **phased migration** that does not require a Firestore cutover on day one.

**User-facing copy** (Show QR, Read QR, tap phones together) may stay transport-specific. **Contracts** (callable names, session storage, orchestration modules, telemetry for server-tied steps) should not.

---

## Design principles

1. **One product API** for the default Add Friend path — not parallel `nfcPin*`, `mintQr*`, and default BLE families for the same friendship write.
2. **Rename by lifecycle role**, not radio or payload shape (NFC, PIN, QR).
3. **Transport lives in client adapters** (`addFriend/nfc/`, `addFriend/ble/`, QR scan/render) and optional **legacy silos**; not in every `callEmulatorFunction` string.
4. **Do not add a second API for `proximityQr`.** Fold TTL, screenshot revoke, and secure-surface rules into the same offer model and client adapters.
5. **`contracts/firebaseCallableNames.ts`** is the seam between logical keys in app code and deployed Cloud Function export names.

---

## Canonical lifecycle (stable vocabulary)

| Step | Meaning today | Stable term |
|------|----------------|-------------|
| 1 | Issuer reserves a short-lived secret | **Register offer** |
| 2 | Issuer or joiner polls session state | **Get offer status** |
| 3 | Joiner sees issuer identity before committing | **Preview offer** |
| 4 | Joiner submits OOB secret + proximity evidence | **Confirm offer** (scanner / phase 1) |
| 5 | Issuer agrees; friendship is written | **Finalize offer** |
| 6 | Either side aborts (or idle timeout) | **Cancel offer** |

**OOB artifact:** the value moved by QR, NFC NDEF, or BLE (today often a 4-digit code). In API and docs use **offer code** or **offer token**, not PIN, unless the UI literally shows digits.

**Session store:** one transient document per active offer (today `nfcPinPairSessions/{code}`).

**Proximity evidence:** GPS-first with hard distance cap and Wi‑Fi / same-subnet fallback when GPS quality is insufficient — enforced on **confirm**, not a separate transport.

**Dual confirm:** scanner **confirm** then issuer **finalize**; extended session TTL after phase 1 so the confirm UI is not bound by the short mint TTL.

---

## Before → after map

### Cloud Functions (default in-person path)

| Today | Proposed | Role |
|-------|----------|------|
| `registerNfcPinPairOffer` | `registerPairOffer` | Issuer mint + reserve |
| `getNfcPinPairOfferStatus` | `getPairOfferStatus` | Poll for issuer / joiner |
| `previewNfcPinPairOffer` | `previewPairOffer` | Issuer identity for joiner |
| `confirmNfcPinPairOffer` | `confirmPairOffer` | Proximity + scanner phase 1 |
| `finalizeNfcPinPairOffer` | `finalizePairOffer` | Issuer phase 2 + friendship write |
| `cancelNfcPinPairOffer` | `cancelPairOffer` | Abort / explicit cancel |

### Request and response fields (additive first, then deprecate)

| Today | Proposed |
|-------|----------|
| `pin` | `offerCode` (or `offerId` if ids become non-numeric) |
| `pairingPin` (where used) | `pairingOfferCode` |
| `issuerProximityEvidence` / `proximityEvidence` | Keep or nest under `proximityEvidence` per side |

New clients should prefer `offerCode` in responses; old keys may remain during an alias window.

### Friendship edge metadata

| Today | Proposed |
|-------|----------|
| `establishedByNfcPinPair` (and similar) | `establishedByPairOffer` |

Optional analytics-only fields: `pairOfferCode`, `pairTransport` (`qr` | `nfc` | `ble`) — not used for authorization.

### Firestore

| Today | Proposed | Notes |
|-------|----------|--------|
| Collection `nfcPinPairSessions` | `pairOffers` (or `inPersonPairOffers`) | TTL cleanup, rules, indexes, in-flight sessions |
| Document id = 4-digit code | Unchanged initially | Later: opaque doc id + `offerCode` field if needed |
| Field `pin` on document | `offerCode` | Dual-read during transition |

**Pragmatic deferral:** ship generic **callable** names first while the collection id stays `nfcPinPairSessions` for one release if Firestore migration cost is too high — document the debt in ops dashboards.

### Client contract seam (`contracts/firebaseCallableNames.ts`)

App code uses **logical keys** only. Example mapping during migration:

| Logical key (TypeScript) | Deployed name (alias phase) | Deployed name (target) |
|--------------------------|-------------------------------|-------------------------|
| `registerPairOffer` | `registerNfcPinPairOffer` | `registerPairOffer` |
| `getPairOfferStatus` | `getNfcPinPairOfferStatus` | `getPairOfferStatus` |
| `previewPairOffer` | `previewNfcPinPairOffer` | `previewPairOffer` |
| `confirmPairOffer` | `confirmNfcPinPairOffer` | `confirmPairOffer` |
| `finalizePairOffer` | `finalizeNfcPinPairOffer` | `finalizePairOffer` |
| `cancelPairOffer` | `cancelNfcPinPairOffer` | `cancelPairOffer` |

Remove raw `"confirmNfcPinPairOffer"`-style literals from `app/MainApp.tsx`, `AppDemo.tsx`, and `app/screens/AddFriendScreen.tsx` as Phase 1 completes.

### Client folders and modules

| Today | Proposed role |
|-------|----------------|
| `addFriend/nfcPinTransport/` | `addFriend/oobOffer/` or `addFriend/pairOfferTransport/` — encode/decode payload, not “NFC PIN” |
| `pinPairProtocol.ts` | `offerPayload.ts` (QR string, NDEF bytes, etc.) |
| `encodeNfcPinPairNdefPayload` / `parsePinFromNfcPairPlaintext` | `encodeOfferForNdef` / `parseOfferCodeFromPayload` |
| `addFriend/proximityQr/pairingRules.ts` | Merge into shared **pair offer rules v1** under `oobOffer/` or `pairOffer/` |
| `addFriend/inPersonPairingGateway.ts` | Keep; extend teardown when BLE is active on the screen |
| `addFriend/nfc/`, `addFriend/ble/` | Remain **transport silos** — not folded into default API names |

Orchestration stays in `AddFriendScreen` (and thin hooks); avoid new transport-specific names at call sites in `MainApp`.

### Telemetry

| Today | Proposed |
|-------|----------|
| `pairing.nfc.pin.*` | `pairing.offer.*` for server-tied steps |
| `pairing.qr.scan.*` | `pairing.transport.qr.*` |
| `pairing.in_person.*` | Keep as umbrella |

During migration, **dual-emit** old and new event names for one release if dashboards depend on legacy strings.

### Planning and QA references

Update callable lists in `FEATURE_TEST_SCENARIOS.md`, `PRODUCTION_READINESS_CHECKLIST.md`, `RUN_MVP_LOCALLY_AND_ON_PHONE.md`, and `MASTER_PRODUCT_PLAN.md` to use **lifecycle verbs**, with a footnote for deployed aliases until the sunset release.

---

## What stays transport-specific (no generic rename)

| Surface | Policy |
|---------|--------|
| BLE callables (`createBleFriendSession`, `joinBleFriendSession`, `getBleFriendSessionStatus`, `peekBleFriendSessionForJoin`) | Optional / siloed; not renamed to `registerPairOffer` |
| Legacy NFC voucher (`mintNfcFriendVoucher`, `redeemNfcFriendVoucher`, …) | Legacy; retire or wrap internally |
| HS2 handshake callables (`beginNfcHandshakeSession`, …) | Legacy unless explicitly removed |
| `addFriend/nfc/handshake.ts`, `addFriend/ble/*` | Adapter implementations only |

**Future unification:** BLE or legacy NFC paths **delegate** into the same `pairOffers` handler and lifecycle — they do not get a second product-facing API with transport in the name.

---

## `proximityQr` consolidation

The `addFriend/proximityQr/` spec must not introduce parallel server callables such as `mintQrFriendOffer` / `redeemQrFriendOffer`.

| Spec idea today | After consolidation |
|-----------------|---------------------|
| Separate QR mint/redeem callables | Same six callables: `registerPairOffer` … `cancelPairOffer` |
| `pairingRules.ts` constants (TTL, 100m, screenshot revoke) | **Pair offer rules v1** shared by server + client |
| QR-only UX (short visible window, `FLAG_SECURE`, screenshot → revoke) | QR **transport adapter** under `oobOffer/qr/` (or equivalent) |

Server proximity semantics already live on **confirm**; remaining work is client policy and naming, not a second backend family.

---

## Phased migration

### Phase 0 — Lock the contract (documentation only)

- Approve the verb set and target Firestore collection name (`pairOffers` vs keep legacy collection temporarily).
- Decide whether **offer codes remain 4-digit** for v1 of the generic API.
- Record alias policy and collection strategy in this file (or a short addendum with target release and alias sunset).
- Do **not** rename user-visible strings yet.

**Exit:** any engineer can list the six callables and the session collection without reading `backend/functions/src/index.ts`.

### Phase 1 — Client indirection (no backend deploy required)

- Route all pairing calls through `FirebaseCallables` logical keys.
- Rename local types and state where “pin” means **server offer code**, not user-facing “PIN” copy.
- Add glossary: **offer code** (OOB secret) vs **UI copy** (QR).

**Exit:** no raw `*NfcPinPair*` strings in app code except the contract file (and comments pointing to legacy deploy names).

### Phase 2 — Callable aliases (backward compatible deploy)

- New Cloud Function exports are thin wrappers around existing handlers (or a shared internal `pairOffer` service module).
- Deploy **both** old and new export names; new app builds call new names; older APKs keep working.
- Optional: log which alias was invoked for traffic split during beta.

**Exit:** latest internal APK passes smoke using **new** names only; previous APK still passes on **old** names.

### Phase 3 — Firestore (optional; separate decision)

**Option A — Cutover:** new collection `pairOffers`, migrate TTL job and handlers, brief dual-read if needed.

**Option B — Defer:** generic callables only; collection remains `nfcPinPairSessions` until offer id shape or reporting requires change.

Choose A when ops and security rules must not say `nfcPin`; choose B to ship callable rename faster.

**Exit:** one canonical collection in cleanup and handlers; no orphaned TTL on the old name.

### Phase 4 — Remove aliases

- After the last supported client uses new callables, remove old exports (or return a clear error for obsolete clients).
- Scrub deploy docs and checklists of `nfcPin*` in the API column.
- Friendship metadata: write new fields; stop writing legacy analytics fields.

**Exit:** Firebase function list matches the generic map; parity checklist references lifecycle verbs only.

### Phase 5 — Transport adapters (when NFC or BLE becomes default)

- Each transport: obtain **offer code** → same six callables.
- `proximityQr` behaviors live in the QR adapter + shared rules, not new server names.
- BLE join either calls `confirmPairOffer` with evidence or stays siloed until merged — **product** decision, not a prerequisite for generic API names.

---

## Risks and guardrails

- **Half rename:** generic callables with `nfcPinPairSessions` and “PIN” in user-facing errors — finish Phase 0 before Phase 2.
- **Over-generic handlers:** prefer a shared service module plus transport adapters over a single function with a growing `transport` enum.
- **Preview vs confirm:** keep distinct names and docs; proximity-before-identity is product-critical.
- **Dual confirm and TTL extension:** document under **offer session**, not “PIN TTL.”
- **Alias window:** required for any APK already in the wild; internal-only tracks can shorten Phases 2–4.

---

## Pairing API v2 summary (target contract)

- **Product:** In-person Add Friend uses a short-lived **pair offer**, mandatory proximity evidence, then dual human confirm.
- **Callables:** `registerPairOffer`, `getPairOfferStatus`, `previewPairOffer`, `confirmPairOffer`, `finalizePairOffer`, `cancelPairOffer`.
- **Storage:** transient docs in `pairOffers` (or legacy collection until Phase 3).
- **Transports:** QR (current default UI), NFC NDEF, BLE (optional) — each supplies an **offer code** to the same API.
- **Legacy:** `*NfcPinPair*` exports are **aliases** until removal release **vX.Y** (set when Phase 2 ships).

---

## Recommended sequencing for this workspace

Current baseline: QR UI on `nfcPin*`, `proximityQr` not wired as a separate stack, BLE siloed.

1. **Phase 0 → Phase 1 → Phase 2** — largest naming benefit without Firestore migration.
2. **Phase 3** — when changing offer id shape or collection reporting.
3. **Phase 5** — when NFC or BLE ships as default transport, not as a blocker for generic API names.

---

## Traceability

| Artifact | Role |
|----------|------|
| `contracts/firebaseCallableNames.ts` | Logical keys ↔ deployed callable names |
| `backend/functions/src/index.ts` | Handlers and session persistence |
| `app/screens/AddFriendScreen.tsx` | Default pairing UI orchestration |
| `addFriend/inPersonPairingGateway.ts` | Transport-agnostic teardown |
| `Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md` | Proximity and QR policy detail |
| `Planning/BLE_ADD_FRIEND_ARCHITECTURE.md` | BLE silo and legacy NFC notes |

---

**Version:** 1.0  
**Last updated:** 2026-05-12
