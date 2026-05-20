# E2EE Verification Checklist (MVP+)

> **Canonical implementation:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` only. Export Cursor chats periodically; see `PLANNING.md` §0.

Date: 2026-05-03 (execution log updated; matrix unchanged)
Build under test: **`App Final V3`** (`C:\Users\dunca\OneDrive\Desktop\App FInal V3`) for the active prototype; legacy `App/mobile` + older OneDrive `App Final` only if explicitly validating that stack.
Tester: Mix of repo preflight (2026-05-03) and prior automated row; device-manual cases still pending for full sign-off.

Use this checklist for the current encrypted profile/posts/messages stack. Log every case with result and notes.

---

## Preconditions

- [ ] **Repo preflight (developer machine):** From **App Final V3** root, `npm run typecheck` **PASS**; from `backend/functions`, `npm run build` **PASS** (update execution log when run).
- [ ] App is installed and can sign in.
- [ ] Backend callables are reachable from this device.
- [ ] Test accounts available (at least 2 users).
- [ ] Network can be toggled on/off for offline checks.

**Note:** Automated cases **C7** (envelope tamper) and **C10** (Firestore rules) in this matrix were originally wired to **`npm run test:e2ee`** / **`npm run test:rules:firestore`** in the legacy **`App/mobile`** + **`App/backend`** trees. **App Final V3** does not yet expose those npm scripts at the repo root; keep **C7/C10** as manual or re-home tests here when you add a harness.

---

## Test matrix

| ID | Area | Scenario | Expected result | Status | Notes |
|----|------|----------|-----------------|--------|-------|
| C1 | Auth/session | Sign in with valid credentials + OTP | Session established; app loads home without crypto errors | BLOCKED | Requires device/manual runtime pass. |
| C2 | Auth/session | Sign out then sign in again | Fresh OTP challenge required and succeeds | BLOCKED | Requires device/manual runtime pass. |
| C3 | Device policy | Attempt concurrent second-device login | Previous device/session invalidated per one-device policy | BLOCKED | Requires two-device manual validation. |
| C4 | Key bootstrap | First launch after login | Key bundle publish succeeds; no permanent sync error | BLOCKED | Requires live mobile runtime validation. |
| C5 | Messaging E2EE | Send encrypted message A -> B | B can decrypt/read message content | BLOCKED | Requires two-account manual runtime validation. |
| C6 | Messaging E2EE | Receive encrypted message B -> A | A can decrypt/read message content | BLOCKED | Requires two-account manual runtime validation. |
| C7 | Messaging integrity | Tampered/invalid envelope (if test hook exists) | Message fails decrypt safely; app does not crash | PASS | `npm run test:e2ee` includes tamper + recipient mismatch failure tests. |
| C8 | Profile E2EE | Update encrypted profile fields | Readback returns updated decrypted values | BLOCKED | Requires live backend + app runtime validation. |
| C9 | Posts E2EE | Create encrypted post (text/media) | Post appears for allowed viewer and decrypts correctly | BLOCKED | Requires live backend + app runtime validation. |
| C10 | Posts visibility | Non-friend access attempt | Post is not returned/readable to non-friend | PASS | `npm run test:rules:firestore` validates friend-only reads and author-only mutations. |
| C11 | Sync state | Temporary network loss during write | UI shows offline/syncing state; recovers after reconnect | BLOCKED | Requires device network toggle test. |
| C12 | Merge behavior | Local optimistic item while backend delayed | Item reconciles to backend-authoritative snapshot without duplicates | BLOCKED | Requires staged runtime timing test. |
| C13 | Recovery UX | Force auth/crypto error state | User sees actionable recovery options | BLOCKED | UX exists in code; runtime forced-error flow still needs manual verification. |

Legend for Status: TODO / PASS / FAIL / BLOCKED

---

## Execution log

| Run time | Device | Account(s) | Cases run | Pass | Fail | Blocked | Notes |
|----------|--------|------------|-----------|------|------|---------|-------|
| 2026-04-22 | Local shell automation | N/A | C7, C10 | 2 | 0 | 11 | Automated evidence pass only; remaining cases require manual mobile runtime testing. |
| 2026-05-03 | Local shell (App Final) | N/A | Repo preflight only | 2 | 0 | 12 | `npm run typecheck` (repo root) + `npm run build` (`backend/functions`) both **PASS**. E2EE matrix C1–C6, C8–C9, C11–C13 still **BLOCKED** until two-account device pass. C7/C10 not re-run in App Final (no root `test:e2ee` / `test:rules:firestore`); see Preconditions note. |

---

## Bug follow-up list

| Bug ID | Linked case | Severity | Owner | Status | Notes |
|--------|-------------|----------|-------|--------|-------|
|        |             |          |       |        |       |

