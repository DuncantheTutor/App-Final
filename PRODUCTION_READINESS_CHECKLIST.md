# Production Readiness Checklist

This tracks what must be complete before broad user rollout.

## Repo automated preflight (no devices)

Run from **`App Final V3`** root (`C:\Users\dunca\OneDrive\Desktop\App FInal V3`) before device smoke or CI packaging:

| Step | Command | Last recorded |
|------|---------|----------------|
| Client TypeScript | `npm run typecheck` | **PASS** — 2026-05-03 |
| Cloud Functions compile | `cd backend/functions && npm run build` | **PASS** — 2026-05-03 |

Update the **Last recorded** column when you re-run after meaningful changes.

## Must-have before beta

- [x] **Firebase live wiring**  
  App uses real Firebase project config and live function routing on device builds.

- [x] **Auth baseline**  
  Email/password auth works with OTP verification in signup path.

- [x] **Private thread permissions**  
  Backend enforces owner/friend participant checks for private post threads.

- [x] **Two-phone core parity path**  
  Handshake + private comment/reaction flows are implemented and testable.

- [x] **Deploy automation scripts**  
  PowerShell one-command scripts exist for rules/functions deploy and parity report.

- [x] **Remove seeded data bleed for non-seed users**  
  Sign-in resets local social state; posts persist per email only; logout clears profile/timeline; default signed-out state is empty (no User A preview data).

- [x] **Auth + OTP abuse hardening**  
  Backend: OTP resend cooldown + verify-attempt cap. Client: friendly alerts for wait/too-many-attempts.

- [x] **Operational runtime upgrade**  
  Cloud Functions target **Node.js 22**; `firebase-functions` / `firebase-admin` upgraded in `backend/functions`.

- [x] **Crash/error telemetry**  
  `telemetry.ts` forwards `logAppEvent` / `logAppError` to Cloud Function `logClientTelemetry` (Firestore `clientTelemetry` collection) with console fallback; IP rate-limited server-side; 14-day retention cleanup in scheduled job.

- [ ] **Smoke test suite pass (2 devices)**  
  Run scripted pass for signup/login, **QR Add Friend** (Show QR/Read QR UI; deploy `registerNfcPinPairOffer` / `cancelNfcPinPairOffer` / `getNfcPinPairOfferStatus` / `previewNfcPinPairOffer` / `confirmNfcPinPairOffer`), including GPS/Wi-Fi proximity checks and final identity confirmation prompt, plus private thread visibility and reaction parity (manual; see `scripts/TWO_PHONE_PARITY_CHECKLIST.md` and `FEATURE_TEST_SCENARIOS.md` § Whole-account smoke).

- [x] **Backend-authoritative single-device lock**  
  Device lock is now enforced by Cloud Functions (`claimDeviceSession` / `releaseDeviceSession`) instead of client-side lock writes.

- [x] **Transient data cleanup job**  
  Scheduled function prunes expired handshake/session docs, old telemetry rows, and stale OTP / telemetry throttle buckets.

- [x] **OTP abuse controls (network-level)**  
  Added per-IP OTP request throttling window in backend, in addition to per-email cooldown.

## Can wait until post-beta

- [ ] Push notifications for messages/comments.
- [ ] Better account recovery and password reset UX.
- [ ] Moderation/reporting hooks for abuse review.
- [ ] Performance optimization for large timelines/conversations.
- [ ] Admin support tooling and user report triage dashboard.

## Production-grade social product backlog (beyond current prototype)

- [ ] **Legal & policy** — Terms of Service, Privacy Policy, age gate / parental controls where required, consent for analytics.
- [ ] **Account lifecycle** — password reset, email verification, account deletion / export (GDPR-style).
- [ ] **Safety** — block/report user, content moderation queue, automated spam detection on writes.
- [ ] **Media** — virus scanning, size limits, transcoding pipeline, CDN delivery, abuse of storage costs.
- [ ] **Scale & reliability** — pagination everywhere, idempotent writes, backoff, SLOs, staging environment.
- [ ] **Security** — Firebase App Check on Functions, secrets rotation, least-privilege IAM, audit logs.
- [ ] **Observability** — dashboards (errors, latency, OTP / **in-person pairing** (`nfcPin*` QR flow + planned proximity checks + siloed BLE/NFC legacy) success rates), paging on critical failures.

## Current sprint focus

1. Run two-device smoke pass and record results (pass/fail per step in `scripts/TWO_PHONE_PARITY_CHECKLIST.md`); include **whole-account** path in `FEATURE_TEST_SCENARIOS.md` § Whole-account smoke.
2. Run **E2EE matrix** device cases in `Planning/E2EE_VERIFICATION_CHECKLIST.md` (update execution log after each run).
3. For an internal Play build: bump/sync version (see `Planning/RELEASE_NOTES.md`), `npm run apk:release`, tag `v<version>`, upload with short notes.
4. Review `clientTelemetry` in Firebase Console during beta; add Crashlytics or BigQuery export if volume grows.
5. Tighten API key restrictions in Google Cloud for production package IDs/SHA certificates only.
