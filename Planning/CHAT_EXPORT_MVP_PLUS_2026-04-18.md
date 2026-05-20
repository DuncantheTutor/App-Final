## Chat export — MVP+ kickoff (2026-04-18)

### Goal
- Start MVP+ work by extending the existing MVP messaging app with **permanent posts** + a **friends feed** + a **profile posts grid**.

### Planning docs created/updated
- **Created**: `App V2/MVP_PLUS_PLAN.md`
  - Defines MVP+ as MVP messaging (`MVP_FINAL_PLAN.md`) plus permanent posts/feed/profile grid (only the permanent-feed slice of `PLANNING.md`).
- **Updated earlier**: `App V2/PLANNING.md` to include permanent posts rules (R24–R30) and §3.8 posts/profile grid spec.

### Codebase baseline verification
- Confirmed `App V2 Build3` matches `App V2 Build2` on key files (hash match):
  - `App.tsx`, `PhotoEditorModal.tsx`, `package.json`, `app.json`, `index.tsx`

### MVP+ implementation work (in `App V2 Build3/App.tsx`)
- **Posts data model**
  - Added `Post` type + `INITIAL_POSTS`
  - Added persistence via `AsyncStorage` (key `mvpplus.posts.v1`)
  - Sorted newest-first; soft-delete via `deletedAt`
- **Friends feed**
  - Added Home tab switcher: `Chats` / `Feed`
  - Feed list shows posts from friends + self (friend-gated by current friend visibility)
  - Post card supports text, image strip, and video playback
- **Profile grids**
  - Added a 3-column posts grid below the bio on:
    - `myProfile`
    - `friendProfile`
  - Thumbnails:
    - image: first image
    - video: poster/thumbnail
    - text-only: mini text tile
- **Post composer**
  - Modal composer to create text/photo/video posts
  - Publish flow for video prompts thumbnail choice:
    - Choose thumbnail (pick an image)
    - Skip (use first frame)
- **Delete**
  - Long-press your own post to delete (soft-delete)

### Dependencies added (in `App V2 Build3/package.json`)
- `expo-video-thumbnails` (installed via `npx expo install expo-video-thumbnails`)
- `@react-native-async-storage/async-storage` is present and used for posts persistence

### Verification
- `npm run typecheck` passed in `App V2 Build3`

### Notes / next good steps
- Split `App.tsx` into smaller components/modules (feed, post composer, post grid) once behavior is stable.
- Add a “Feed entry point” decision to MVP+ UX (tab bar vs segmented control). Currently implemented as a Home tab switcher.

## Chat export — MVP+ continuation (2026-04-18)

### Scope covered in this continuation
- Feed polish and UI refinements in `App V2 Build3/App.tsx`.
- Chat draft/keyboard behavior updates.
- Profile, friends list, and add-friend navigation strip unification.
- Mock authentication flow for MVP+ test mode.

### Feed updates
- Replaced text `Chats` / `Feed` controls with top icon-strip controls.
- Default app open tab set to **feed**.
- Post photo flow now opens the existing **photo editor** before adding to post draft.
- Feed posts rendered full-width; media shown with `contain` (no crop after editing).
- Multi-photo feed posts support swipe pagination + left/right chevron controls.
- Added feed friend-mute durations:
  - 24 hours
  - 1 week
  - 1 month
  - until unmuted
- Added feed-mute indicator icon on friend avatars in Friends list.
- Feed letterbox/padding around contained photos set to **always black** (theme-independent).
- Expanded seeded feed posts for stronger QA coverage (text/photo/multi-photo/video mix).

### Chat and profile interaction updates
- Saved chat drafts now reload into composer and focus input on re-open (keyboard opens).
- Feed post header avatars are clickable and open profile screens.
- Profile screen header now uses icon strip (removed back button style there).
- Profile content split:
  - **Media grid** shows image/gallery posts.
  - **All posts** list below includes text-only posts in chronological feed order.
- Friends list and Add Friend screens both use top icon strip; Add Friend strip icons are white on theme-colored banner.

### Authentication (mock MVP test flow)
- Replaced placeholder signed-out screen with Login / Sign Up flow:
  - email
  - password
  - unique username
  - phone number
  - OTP
- Sign-up validates username/email uniqueness in mock account store.
- Test account seeded:
  - `usera@app.com` / `1234`
  - username: `User A`
  - includes profile image + bio
- Test signup path for `userb@app.com` uses OTP `123456` (test override).
- Other signups generate pseudo-random 6-digit OTP (test-mode behavior only).

### Verification logged during this continuation
- `npm run typecheck` passed after each major patch set.
- `ReadLints` reported no lint issues for `App V2 Build3/App.tsx`.

## Chat export — E2EE backend integration (2026-04-21)

### Scope covered
- Migrated from placeholder transport cipher to real client-side E2EE primitives for profile/posts/chat writes.
- Added Firebase Functions + emulator scaffolding for encrypted data contracts and one-device session handling.
- Added encrypted read/decrypt path in the client and backend callables to return caller-specific envelopes.
- Switched UI hydration toward backend-authoritative encrypted snapshots with optimistic local grace windows.

### Frontend crypto + app wiring (`Desktop/App`)
- **New file:** `e2eeCrypto.ts`
  - Key generation + persistence via `expo-secure-store`
  - CSPRNG via `expo-random`
  - Payload encryption with NaCl `secretbox`
  - Per-recipient content-key wrapping with NaCl `box` envelopes
  - Recipient decrypt path (`decryptPayloadForRecipient`)
- **Updated:** `App.tsx`
  - Session init publishes real key bundle (`publishUserKeyBundle`)
  - Recipient key resolution cache (`getFriendKeyBundles`)
  - Encrypted dual-write for:
    - `putEncryptedProfile`
    - `createEncryptedPost`
    - `upsertConversation` + `sendEncryptedMessage`
  - Encrypted read/decrypt polling for:
    - profile (`getEncryptedProfile`)
    - posts (`listEncryptedPosts`)
    - messages (`listEncryptedMessages`)
  - Backend-authoritative merge strategy with short optimistic retention for recent unsynced local items
  - Added home E2EE sync badge (offline/syncing/ok/error)
- **Updated:** `backendBridge.ts`
  - Removed mock XOR helper, retained backend UID/device helpers + callable bridge.

### Backend additions (`Desktop/App/backend/functions/src/index.ts`)
- Existing write/session functions retained and used:
  - `claimDeviceSession`, `createHandshake`, `consumeHandshake`
  - `publishUserKeyBundle`, `putEncryptedProfile`, `createEncryptedPost`, `sendEncryptedMessage`
  - `seedDemoFriendships`, `upsertConversation`, `getFriendKeyBundles`
- Added encrypted read callables:
  - `getEncryptedProfile`
  - `listEncryptedPosts`
  - `listEncryptedMessages`
- Added timestamp normalization helper for safe client-facing ms values.

### Backend project scaffolding (`Desktop/App/backend`)
- Added/updated:
  - `functions/package.json`
  - `functions/tsconfig.json`
  - `firestore.rules`
  - `storage.rules`
  - `firebase.json`
  - `.firebaserc`
  - `backend/README.md`

### Auth and policy behavior covered in this session
- Signup flow enforced: email/password/phone -> email verification -> phone OTP -> account creation.
- Login flow now requires fresh phone OTP after sign-out.
- One-device-only session enforced by backend session claims.

### Verification logged
- Frontend: `npm run typecheck` passed.
- Functions: `npm run typecheck` and `npm run build` passed.
- Lints: no new lint errors in edited files.

### Transcript references (raw)
- [MVP planning + build session](be5fac11-a56c-4e9c-81f0-0d81d4c6f90f)
- [E2EE decrypt + sync session](7bc7df36-68c2-4205-9da3-1c42ea280b7f)
