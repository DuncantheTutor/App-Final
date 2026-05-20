# Release notes (App Final V3)

Canonical tree: `C:\Users\dunca\OneDrive\Desktop\App FInal V3`. Git: [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final). Pairing and Firebase details: `Planning/BLE_ADD_FRIEND_ARCHITECTURE.md`, `RUN_MVP_LOCALLY_AND_ON_PHONE.md`.

## Versioning and tags

- Keep **`package.json`** `version` and **`app.json`** `expo.version` **in sync** (Play Console and support both read these).
- When you cut a build for testers, create a git tag `v<version>` (example `v1.0.1`) on the commit that produced the APK/AAB, and paste the same version into Play **Internal testing** release notes.
- **Internal track:** Upload `android/app/build/outputs/apk/release/app-release.apk` (or an AAB if you switch artifact type) with release notes summarizing user-visible changes since the last internal build.

---

## [Unreleased] — internal / next tag

**Highlights**

- **Add Friend (default):** **NFC 4-digit PIN pair** — server reserves PIN (`nfcPinPairSessions`); NDEF carries PIN only over NFC; **`registerNfcPinPairOffer`**, **`cancelNfcPinPairOffer`**, **`getNfcPinPairOfferStatus`**, **`confirmNfcPinPairOffer`** must be deployed for live pairing.
- **BLE:** Siloed under `addFriend/ble/` (not default UI); see `addFriend/ble/SILO.md`.
- **Telemetry:** `pairing.in_person.*` / `pairing.session.create` for in-person flows.

**Build**

- From repo root: `npm run apk:release` → `android/app/build/outputs/apk/release/app-release.apk`.

---

## [1.0.0]

Baseline before NFC PIN became default in subsequent internal builds; see git history and `Planning/CHANGELOG.md` for full detail.
