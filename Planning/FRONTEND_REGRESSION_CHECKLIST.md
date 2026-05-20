# Frontend Regression Checklist

> **Canonical implementation:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` only. Export Cursor chats periodically; see `Planning/PLANNING.md` §0.

Use this checklist before publishing an APK intended for UI verification.

## A) Auth Flow

- [ ] Login screen shows centered card with `Email` and `Password`.
- [ ] Top-right `Sign up` is visible on login.
- [ ] Sign up screen has top-left back arrow icon.
- [ ] Sign up field order is:
  1. Email
  2. Username
  3. Phone number
  4. Desired password
  5. Re-enter password
- [ ] `Create account` transitions to OTP screen.
- [ ] OTP screen has top-left back arrow icon and verify action.
- [ ] OTP resend behavior works as expected.

## B) Connect / Home Entry

- [ ] Signed-in landing route matches expected baseline behavior.
- [ ] `Go to Feed` path works from Connect.
- [ ] Session/readiness copy is clear and non-blocking for testing.
- [ ] No unexpected lockout due to mock/live mode confusion.

## C) Feed

- [ ] New post CTA placement/visibility matches approved behavior intent.
- [ ] Feed opens from expected entry point.
- [ ] Empty state CTAs are sensible (`Connect`, `Messages` where applicable).
- [ ] Post card actions and transitions feel consistent with baseline expectations.

## D) Messages

- [ ] Conversation list and open-thread behavior match expected flow.
- [ ] Send action labels/states are clear.
- [ ] Empty-thread and no-friends guidance are non-blocking.
- [ ] Back-to-list behavior is predictable.

## E) Profile / Compose

- [ ] Profile entry/exit flow matches expected nav.
- [ ] Compose post opens, submits, and returns correctly.
- [ ] Error/loading states are visible and understandable.

## F) Technical Gate

- [ ] `npm run typecheck` (or `npx tsc --noEmit`) passes at the App Final V3 repo root.
- [ ] Lints clean on changed files.
- [ ] Build command runs:
  - `npm run apk:release` (or `npm run apk:debug` for debug signing)
- [ ] Build artifact opens on device and core flow is manually verified.
