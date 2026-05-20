# Frontend Parity Baseline

> **Canonical implementation:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` only (all edits and APK builds). Export Cursor chats periodically; see `Planning/PLANNING.md` §0.

## Approved UI Baseline

- Approved frontend reference: `C:\Users\dunca\OneDrive\Desktop\App v4_Expo_V54\mobile` (read-only comparison)
- Canonical reference file in that baseline: `App.tsx` (monolithic MVP flow)
- **Target implementation path:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` (this repo; primary UI in root `App.tsx` and supporting modules)

## Rule

- Preserve the App Final repo layout; do not reintroduce a separate `mobile/` tree unless you intentionally split the project.
- Match user-visible behavior from approved baseline:
  - same screen order and entry points
  - same auth/signup/OTP flow behavior
  - same primary navigation actions
  - same feed/messages/profile/post composer UX expectations

## Runtime/Mode Policy

- Real UX parity must not silently switch to mock-only login forms.
- `EXPO_PUBLIC_FORCE_MOCK_MODE=1` is opt-in only.
- When unset, app should use configured Firebase path and show real auth UX.

## Current Parity Progress (2026-04-25)

- Auth login parity:
  - email + password UI aligned in modular app
  - email format validation aligned
  - signup/OTP back navigation uses icon arrows to match baseline feel
  - mock mode no longer falls back to phone-only login UI

- Remaining parity batches:
  - Connect interaction copy/steps
  - Feed card/nav behavior details
  - Messages list/thread transitions and action text
  - Profile/post-composer surface details
