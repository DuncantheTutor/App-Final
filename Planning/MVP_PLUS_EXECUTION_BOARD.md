# MVP+ Execution Board (Now / Next / Later)

> **Canonical implementation:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` only. Export Cursor chats periodically; see `PLANNING.md` §0.

Date: 2026-04-21
Owner: App V2 team

This board operationalizes the latest MVP+ status from `CHAT_EXPORT_MVP_PLUS_2026-04-18.md`.
Current direction: stabilize E2EE and backend-authoritative sync before adding more product surface.

---

## Now (Phase 1: lock scope and verify baseline)

### 1) Lock source-of-truth implementation path

- [x] Decide one active implementation folder and freeze the others as archives.
- [ ] Write the decision in:
  - [x] `CHANGELOG.md` (`[Unreleased] -> Changed`)
  - [x] this file under "Decision log"
- [x] Mark non-active folders as archived in their local README files.

Definition of done:
- Only one path is used for active coding, test runs, and release work.
- Team members can identify active path in under 30 seconds.

---

### 2) Run E2EE verification checklist

- [ ] Execute all cases in `E2EE_VERIFICATION_CHECKLIST.md`.
- [ ] Record pass/fail and notes in the checklist log tables.
- [ ] Create follow-up bug list for any failed case.

Definition of done:
- Full manual run completed on current baseline.
- No unknown status rows remain.

---

### 3) Confirm local dev reproducibility

- [x] Validate mobile typecheck command works from clean shell.
- [x] Validate backend functions typecheck/build works from clean shell.
- [x] Document exact commands used and expected success outputs.

Definition of done:
- A new terminal session can reproduce the same successful checks.

---

## Next (Phase 2: harden reliability)

### 4) Add E2EE/session recovery UX

- [x] Add visible recovery actions for sync error states:
  - [x] Retry sync
  - [x] Re-authenticate session
  - [x] Reset local crypto state (gated confirm)
- [x] Add user-facing copy that distinguishes offline vs auth vs decrypt errors.

Definition of done:
- Every error badge/state has at least one direct user action.

---

### 5) Add minimal automated crypto and contract tests

- [x] Unit tests for encrypt/decrypt envelope success path.
- [x] Unit tests for recipient mismatch and tampered payload failure.
- [x] Callable contract tests for encrypted read/write payload shape.

Definition of done:
- CI/local test command covers at least one success and one failure case per critical primitive.

---

### 6) Security rules validation pass

- [x] Add or update emulator-backed tests for Firestore/Storage deny-by-default behavior.
- [x] Verify non-friend read blocked, author-only post/profile write/delete enforced.

Definition of done:
- Rules test suite explicitly proves expected allow and deny cases.

---

## Later (Phase 3: maintainability and scale)

### 7) Split oversized app orchestration

- [x] Extract feed UI + state logic.
- [x] Extract post composer flow.
- [x] Extract profile post grid/all-post list.
- [x] Extract encrypted sync orchestration service/hooks.

Definition of done:
- Core app shell composes modules; feature logic is no longer monolithic.

---

### 8) Feed UX cleanup decisions

- [x] Finalize feed entry point pattern (home icon strip vs tab).
- [x] Confirm default landing target and update docs/tests.

Definition of done:
- UX decision is documented once and reflected consistently in UI.

---

## Decision log

- 2026-04-21: Execution board created from latest chat export.
- 2026-04-21: Source-of-truth path set to `App/` (`mobile` + `backend/functions`).
- 2026-04-21: Added archive notices in `App V2 Build2/`, `App V2 Build3/`, and `App V2 Build4/`.
- 2026-04-21: Added sync status badge + recovery actions in `App/mobile/src/screens/ConnectScreen.tsx` with context actions in `App/mobile/src/state/AppContext.tsx`.
- 2026-04-21: Added callable contract tests in `App/mobile/src/services/callableContracts.test.ts` with command `npm run test:contracts`.
- 2026-04-21: Added envelope crypto tests in `App/mobile/src/services/e2eeEnvelope.test.ts` (success, recipient mismatch, tamper failure) with commands `npm run test:e2ee` and `npm run test:all`.
- 2026-04-21: Firestore rules test harness in `App/backend/tests/firestore.rules.test.mjs` with `npm run test:rules:firestore`; emulator rules suite executed successfully (`7/7` pass) after Java install and isolated emulator cache.
- 2026-04-21: Refactored device session + sync presentation out of `App/mobile/src/state/AppContext.tsx` into `useDeviceSession.ts` and `syncIssue.ts`.
- 2026-04-21: Extracted mock state load/save persistence from `App/mobile/src/state/AppContext.tsx` into `useMockStatePersistence.ts`.
- 2026-04-21: Extracted feed/friends/conversations live subscriptions from `App/mobile/src/state/AppContext.tsx` into `useLiveDataSubscriptions.ts`.
- 2026-04-21: Extracted auth/profile hydration from `App/mobile/src/state/AppContext.tsx` into `useAuthProfileState.ts`.
- 2026-04-21: Extracted NFC/mock interaction handlers (pairing, handshakes, mock message/post actions) from `App/mobile/src/state/AppContext.tsx` into `useInteractionActions.ts`.
- 2026-04-21: Extracted auth action handlers (mock/Google/anonymous sign-in + sign-out/reset actions) from `App/mobile/src/state/AppContext.tsx` into `useAuthActions.ts`.
- 2026-04-21: Extracted device identity lifecycle (device ID hydrate/reset effect) from `App/mobile/src/state/AppContext.tsx` into `useDeviceIdentity.ts`.
- 2026-04-21: Closed Phase 3 item 7 for the current modular `App/mobile` architecture (screen-level feed/post/profile flows + hook-based state orchestration).
- 2026-04-22: Snapshot strategy locked: `App/` active development, `App V3 Build 1/` and `App V3/` frozen reference snapshots with local README policy notes.
- 2026-04-22: Feed UX decision finalized for current implementation: stack navigation with `Connect` as signed-in landing, `Go to Feed` entry action, and Home top action strip (no tab/segmented feed switch).
- 2026-04-22: Added beta preflight project-alignment guard in `App/scripts/beta-preflight.mjs` to block test/deploy flow if `mobile/.env` Firebase project id differs from root `.firebaserc` default.
- 2026-04-22: Expanded `App/mobile/scripts/verify-env.mjs` with app identity and release prerequisites checks (`app.json` package/bundle parity, NFC permission/plugin, `eas.json` preview APK profile, Firebase auth-domain/project alignment).
- 2026-04-22: Added single-command readiness summary `npm run beta:readiness` (`App/scripts/beta-readiness-report.mjs`) and linked it into `App/BETA_DAY0_KICKOFF_CHECKLIST.md` as the first release-owner prep gate.
- 2026-04-22: Extended `npm run beta:readiness` to emit timestamped markdown evidence under `App/reports/` for day-by-day beta readiness tracking.
- 2026-04-22: Normalized operator commands in `App/DEPLOYMENT_TODO.md` and `App/BETA_DAY0_KICKOFF_CHECKLIST.md` to root-safe `npm --prefix mobile ...` usage and documented `beta:readiness` in quick commands.
- 2026-04-22: Added Expo Go flow-tester mode path (`isLiveBackendEnabled`, `EXPO_PUBLIC_FORCE_MOCK_MODE`, `npm --prefix mobile run start:flow`) and lazy native Firebase module loading to avoid runtime crashes when running mock-only screen flow checks.
- 2026-04-22: Upgraded flow-tester usability in `App/mobile`: mock sign-in now seeds starter friends/feed/messages and `RootNavigator` displays a persistent `FLOW TESTER` badge to prevent runtime-mode confusion during screen-flow validation.
- 2026-04-22: Restored real-app development build path by adding `expo-dev-client` and extending `verify-env` to assert dependency presence when `eas.json` enables development-client builds.
- 2026-04-22: Improved shared messaging frontend (`App/mobile/src/screens/MessagesScreen.tsx`) with per-conversation peer hints and selected-row emphasis so real app chat navigation is less ambiguous during friend-thread testing.
- 2026-04-22: Improved shared `Connect` frontend in `App/mobile/src/screens/ConnectScreen.tsx` with explicit readiness/next-step banner copy to reduce pairing confusion before session claim completes.
- 2026-04-22: Updated `App V2 Build4` tester app dependency pinning for Expo Go `54.0.6` compatibility (`expo` + SDK-matched `expo-constants`), with `tsc --noEmit` validation pass.
- 2026-04-22: Improved shared posting flow reliability by making `createPost` async with explicit error propagation and adding submit/loading/failure UX handling in `App/mobile/src/screens/PostComposerScreen.tsx`.
- 2026-04-22: Re-pointed `App V2 Build4/App.tsx` to render the active `App/mobile` frontend and installed missing shared dependencies so tester UI remains in lockstep with current app screens.
- 2026-04-22: Updated shared `App/mobile/src/lib/firebaseClient.web.ts` auth initialization fallback for Firebase SDK compatibility during wrapper-based tester typecheck.
- 2026-04-22: Improved `App/mobile/src/screens/MessagesScreen.tsx` reliability UX with inline chat errors, sending/start-chat loading states, and no-message guidance for clearer realtime messaging behavior under transient backend failures.
- 2026-04-22: Improved auth/setup reliability UX in `App/mobile` by adding persistent inline error banners to `AuthScreen.tsx` and `OnboardingScreen.tsx` alongside existing alerts.
- 2026-04-24: Added Spark-plan OTP continuity fallback in `Desktop/App v4/mobile/src/screens/AuthScreen.tsx` so post-OTP username setup callable failures (Blaze-required Functions deploy) no longer block real-phone OTP verification testing.
- 2026-04-25: Began explicit UI/flow parity pass to keep modular `Desktop/App v4` behavior aligned with approved frontend baseline `Desktop/App v4_Expo_V54`; first fix updates `AuthScreen` login to email+password behavior parity.
- 2026-04-25: Continued parity pass in modular `Desktop/App v4` auth flow: removed phone-only mock login fallback UI, aligned back-arrow icon behavior on signup/OTP screens, and added mock credential validation path so visible login behavior mirrors approved baseline more closely across runtime modes.
- 2026-04-25: Added explicit parity control docs in `App V2` (`FRONTEND_PARITY_BASELINE.md`, `FRONTEND_REGRESSION_CHECKLIST.md`) to enforce approved baseline behavior checks before future APK verification builds.
- 2026-04-25: Continued modular parity polish in `Desktop/App v4/mobile`: improved feed author identity cues (`Friend · …xxxx`) and restored visible test-credential hint on auth login surface to match approved MVP testing flow expectations.
- 2026-04-25: Fixed major color-shell mismatch in modular `Desktop/App v4/mobile` by removing phthalo default background from global theme and navigation shell (`colors.ts`, `RootNavigator.tsx`), aligning default app presentation toward approved MVP light baseline.

---

## Reproducibility command log

- `mobile` typecheck (success):
  - Command: `npx tsc -p tsconfig.json --noEmit`
  - Working directory: `App/mobile`
  - Expected/observed: exits `0` with no TypeScript errors
- `backend/functions` build (success):
  - Command: `npm run build`
  - Working directory: `App/backend/functions`
  - Expected/observed: runs `tsc -p tsconfig.json` and exits `0`
