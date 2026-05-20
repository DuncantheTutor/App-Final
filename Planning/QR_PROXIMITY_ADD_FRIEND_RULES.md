# QR + mandatory proximity evidence — Add Friend rule set (v1)

**Status:** Spec + client constants in `addFriend/proximityQr/pairingRules.ts`. **Not wired in `App.tsx` yet.** NFC PIN remains the current default until this flow is implemented and product switches default.

**Rule version:** `QR_PAIRING_RULE_VERSION = 1` (bump when server/client semantics change).

---

## Goals

- Reliable **in-person** pairing without depending on NFC/BLE success.
- **Short-lived, one-time** redeem tokens embedded in a QR payload.
- **Defense in depth:** Android secure surface while QR visible; **screenshot ⇒ revoke**.
- **Mandatory proximity evidence:** both users must pass GPS evidence or approved Wi-Fi fallback evidence before friendship can be written.

---

## Roles

| Role | Device actions |
|------|----------------|
| **Presenter** | Requests mint → receives `token` + metadata → shows QR briefly → may reveal again (each reveal = new mint per product constant). |
| **Scanner** | Opens camera / in-app scanner → submits `token` + own location → server redeems. |

---

## Constants (align with `pairingRules.ts`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `OFFER_TTL_MS` | 15000 | Server rejects redeem after token mint time + TTL. |
| `QR_VISIBLE_DURATION_MS` | 4000 | Full-intent “flash” display; **2–5s** band allowed via `QR_VISIBLE_*`. |
| `NEW_OFFER_ON_EACH_REVEAL` | true | Every “show QR again” **replaces** offer; prior token **revoked** server-side. |
| `SCREENSHOT_REVOKES_OFFER` | true | Screenshot while QR visible → **revoke** + hide QR + user message. |
| `MAX_PAIR_SEPARATION_M` | 100 | Haversine distance between presenter mint fix and scanner redeem fix. |
| `MAX_HORIZONTAL_ACCURACY_M` | 50 | Both fixes must report accuracy ≤ this (reject if worse). |
| `MAX_LOCATION_AGE_MS` | 60000 | Fix timestamps must be recent at redeem. |
| `GPS_COMBINED_UNCERTAINTY_MULTIPLIER` | 1.75 | Dynamic uncertainty factor used before the hard 100m cap. |

---

## State machine (client, presenter)

1. **Idle** — Add Friend entry, method “QR” selected.
2. **Minting** — Call `mintQrFriendOffer` (name TBD) with presenter location + `ruleVersion`.
3. **Visible window** — Render QR for `QR_VISIBLE_DURATION_MS` (with `FLAG_SECURE` on Android). Start screenshot subscription.
4. **Hidden** — QR replaced by placeholder (“Tap to show new code”). Timer to OFFER_TTL may still run in background.
5. **Re-reveal** — User taps → go to **Minting** (new offer; old revoked if `NEW_OFFER_ON_EACH_REVEAL`).

**Cancel / back / leave screen:** call `revokeQrFriendOffer` for the last active `offerId` if still valid.

## State machine (client, scanner)

1. **Scan** — Obtain raw payload string from QR (see payload shape below).
2. **Validate locally** — Non-empty, parse token + optional embedded `ruleVersion`.
3. **Redeem** — Call `redeemQrFriendOffer` with token + scanner location + `ruleVersion`.
4. **Proximity check** — Server evaluates GPS first, then Wi-Fi fallback only if GPS quality is poor.
5. **Identity confirmation** — Show both profiles and prompt: **`Confirm adding {userName} as a friend?`**
6. **Outcome** — Success → friendship UI; failure → show reason (expired, revoked, distance, accuracy, missing Wi-Fi fallback evidence).

---

## Screenshot handling

- While QR is **visible**, subscribe to screenshot events (platform APIs).
- On event:
  - Immediately hide QR and cancel subscription.
  - Call **`revokeQrFriendOffer`** (or batched “screenshot” reason).
  - Toasts: e.g. “Code invalidated for security. Generate a new one.”
- **iOS:** detection is **after** capture; pairing with short TTL + revoke limits usefulness of the image.

---

## Proximity gate (mandatory)

On **mint** and **redeem**, client sends:

- `lat`, `lng`
- `horizontalAccuracyM`
- `locationTimestampMs`

### A) GPS-first path (primary)

1. Reject GPS path if either fix is older than `MAX_LOCATION_AGE_MS` relative to server clock (with small skew allowance).
2. Reject GPS path if either `horizontalAccuracyM` > `MAX_HORIZONTAL_ACCURACY_M`.
3. Compute Haversine distance (`separationM`) between presenter position (stored at mint) and scanner position (at redeem).
4. Compute uncertainty:  
   `combinedUncertaintyM = sqrt(presenterAccuracyM^2 + scannerAccuracyM^2)`
5. Compute dynamic tolerance:  
   `dynamicToleranceM = GPS_COMBINED_UNCERTAINTY_MULTIPLIER * combinedUncertaintyM`
6. Final allowed GPS radius (hard-capped):  
   `allowedGpsRadiusM = min(MAX_PAIR_SEPARATION_M, max(0, dynamicToleranceM))`
7. GPS path passes only if `separationM <= allowedGpsRadiusM`.

### B) Wi-Fi / hotspot fallback (only when GPS path fails for quality reasons)

Use this path when GPS is missing/stale/too inaccurate (not when token/security checks fail).

1. Evaluate shared network evidence (prefer same BSSID/AP evidence where available).
2. Treat **personal hotspot** as valid Wi-Fi evidence in this fallback path.
3. If evidence is strong enough, proximity passes via fallback.
4. If evidence is weak, reject and prompt user with recovery copy:

`Could not verify proximity with GPS. Connect both phones to the same Wi-Fi network (personal hotspot also counts) and try again.`

**Field tuning:** If indoor failures are too frequent, product may relax `MAX_HORIZONTAL_ACCURACY_M` or require “retry outdoors” copy — do not silently widen distance without product sign-off.

**Security note:** GPS and Wi-Fi are both **spoofable** on compromised devices; these checks raise effort for remote pairing but are not cryptographic proof of proximity.

---

## Final identity confirmation (always required)

After proximity passes (GPS or fallback), both users must confirm identity before final write:

- Show avatar + username.
- Prompt copy: **`Confirm adding {userName} as a friend?`**
- If either side declines, no friendship edge is written.

---

## QR payload shape (suggested)

Keep QR compact; signed opaque token from server is preferred.

Example **opaque** payload (string inside QR):

`AFQR1|<jwtOrOpaqueToken>`

- Prefix `AFQR1` allows future formats (`AFQR2`, …).
- Server validates signature / lookup for opaque token.

Alternatively **non-JWT**: `AFQR1|<offerId>|<randomSecret>` only if `offerId` lookup is server-authoritative and secret is unguessable — prefer single server-minted blob.

---

## Backend contracts (sketch)

| Callable | Purpose |
|----------|---------|
| `mintQrFriendOffer` | Auth presenter; validate location; write `qrFriendOffers/{id}` with TTL, `presenterUid`, location snapshot; return `{ offerId, token, expiresAt }`. |
| `revokeQrFriendOffer` | Auth presenter; mark offer revoked (cancel, screenshot, navigation). |
| `redeemQrFriendOffer` | Auth scanner; validate token, TTL, not revoked, not used, GPS rules; write friendship; mark offer consumed. |

**Firestore rules / indexes:** Restrict reads; all mutations via Functions.

---

## Traceability

- **R1** (physical-first friends): QR remains short-range intent, and proximity evidence is mandatory (GPS primary, Wi-Fi/hotspot fallback). Final identity confirmation is always required before write.
- Update `FEATURE_TEST_SCENARIOS.md` when UI ships.
- NFC/BLE docs: `Planning/BLE_ADD_FRIEND_ARCHITECTURE.md`, `Planning/NFC_OPTIONS_AND_HS2_LEGACY.md`, silo READMEs under `addFriend/*`.
