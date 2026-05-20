# Bug audit fixes + UX pass (May 2026, v2)

Read-only audit follow-up: security, sync, reactions, presence, profile picture propagation, shared media screen, Android safe areas, crop, GIFs.

## Deploy required

```powershell
cd backend\functions; npm run build; cd ..\..
firebase deploy --only functions
npm run apk:release
```

Install the **same release APK** on **both** test phones after deploy.

## Backend

- `listMyFriends` / `getUserProfiles` now use `assertVerifiedCallableCaller` (device session + auth map).
- Clients must pass `deviceId` on those callables (boot, roster, profile open).

## Client sync

- Friendship listener no longer wipes roster on empty snapshot.
- Boot reconcile does not wipe local threads unless friends fetch succeeded with empty list.
- Message pull + listener merge **server** `reactions` / `editedAt` / `unsentAt`; `mergeSyncedMessages` prefers incoming metadata.
- Chat-screen poll waits for `initialServerSyncDone`.
- Message listener no longer re-attaches on `allFriends` changes; snapshot generation guard.

## UX

- Tap photo/GIF in chat → fullscreen modal.
- Shared media → full-screen **page** (`chatSharedMedia`) with back arrow, 3-column grid.
- Publish + chat composer + photo editor use `stickyFooterPadding` / `composerBottomPadding`.
- Crop loads real image dimensions via `Image.getSize` when asset metadata is missing.
- Gallery pick supports GIF (`MediaTypeOptions.All`); sends as `kind: "gif"`.
- Friend profile pictures update from `encryptedProfiles` listener + `upsertUserProfile` on HTTPS upload.
- Presence poll waits for boot sync; uses friend list refs.

## Sweep 5 — tombstone, unfriend ingest, post comment reactions (same deploy)

- **Tombstone-with-history:** home chat list keeps threads that already have visible messages after unfriend (preview/name via **User** tombstone); empty ex-friend threads stay hidden.
- **Unfriend ingest:** inbound messages from non-accepted senders are dropped even when the local chat row still exists (no new traffic after unfriend).
- **Re-add friend:** Firestore friendship listener clears `unfriendedIds` when a `u_*` friend returns (live friends list / profile only). **`identityLockedChatIds`** (set on unfriend, persisted) keeps old 1:1 threads on **User** — no username restore after refriend.
- **Post comment reactions:** private-thread hydration maps server `u_*` reaction keys to local `me` / `f_*` ids.

## Sweep 4 — message ids, edit sync, unsent UX (same deploy)

- **`sendEncryptedMessage`** uses client `messageId` as the Firestore doc id so reactions / edit / unsend metadata target the same row as decrypt.
- **`updateEncryptedMessage`** re-encrypts edited message bodies for all participants.
- **Decode** prefers Firestore `messageDocId` over plaintext id.
- **Unsent:** metadata patches clear body/media; chat + home preview show **Message removed** for recipients.
- **Feed pagination** no longer wipes `feedReactions` when a page item omits them.

## Sweep 3 — Android safe area + feed reactions (same deploy)

- **Non-scrollable / fixed-footer screens:** centralized helpers in `app/lib/safeAreaInsets.ts` (`androidNavInset`, `navDeadZoneHeight`, `fabBottomOffset`, `scrollPageBottomPadding`, `stickyFooterPadding`). Applied on home Start Chat dead zone, feed FAB, friend profile bar, friends list, settings, auth signup, chat composer modals, tombstone strip, Add Friend, photo editor.
- **Feed post reactions:** `mergeSyncedPosts` now prefers **incoming** `feedReactions` from server (was keeping stale local). Pagination maps reaction uids to local friend ids.

## Sweep 2 fixes (same deploy)

- **Reaction on old messages:** listener skipped `modified` docs past watermark — now skips watermark for `modified` and applies metadata-only patches when decrypt is skipped.
- **Edit / unsend:** now call `updateMessageMetadata` on server (was local-only).
- **Sign-in `getUserProfiles`:** passes `deviceId` after `claimDeviceSession`.
- **Pagination:** maps reaction keys via `overlayMessageDocMetadata`.
- **Friend avatars:** roster batch-refreshes `getUserProfiles` every 45s + encrypted-profile listener; marks profile fetch attempted per uid.
- **Roster / listener:** snapshot generation guards on friendship listener.
- **GIF preview** in chat list: shows "GIF".

## Manual test matrix (two phones)

| # | Steps | Pass criteria |
|---|--------|----------------|
| 1 | A and B sign in, add friend | Both see each other in friends list |
| 2 | A foreground 30s | B sees A online in friends strip / list |
| 3 | A changes profile photo (HTTPS upload completes) | B sees new avatar in friends list and chat within ~30s (encrypted profile + users doc) |
| 4 | A sends text, photo, GIF from gallery | B receives all; photo/GIF tap opens fullscreen |
| 5 | A reacts to B's message | B sees reaction on message within ~5s (listener or poll) |
| 6 | Open Shared media from chat ⋮ menu | Grid page, back returns to chat; tile tap fullscreen |
| 7 | New post screen | Cancel/Publish above Android nav bar |
| 8 | Photo editor crop on tall image | Square crop succeeds |
| 9 | Unfriend / re-add (optional) | Per tombstone backlog if not yet implemented |

## Automated preflight

| Check | Command | Status |
|-------|---------|--------|
| Client TS | `npm run typecheck` | PASS (2026-05-18) |
| Functions | `cd backend/functions && npm run build` | PASS (2026-05-18) |
