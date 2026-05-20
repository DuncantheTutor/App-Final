# Changelog

All notable changes to this project are recorded here. Planning references: `MVP_FINAL_PLAN.md`, `PLANNING.md`, and related MVP docs in this folder.

**Canonical app implementation** (agents and humans): `C:\Users\dunca\OneDrive\Desktop\App FInal V3`. Git remote: [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final). Legacy **`App/mobile`**, older OneDrive **`App Final`**, and duplicate trees are historical only; default new work to **App Final V3** only. Periodically **export Cursor chats** and reread recent exports when resuming work or switching agents (see `PLANNING.md` §0).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions use [Semantic Versioning](https://semver.org/spec/v2.0.0.html) where a published app version exists (`package.json`).

---

## [Unreleased]

### Changed (Canonical workspace, May 2026)
- **App Final V3** (`C:\Users\dunca\OneDrive\Desktop\App FInal V3`) is the sole implementation workspace; planning docs, Cursor rules, and README updated from legacy `App Final` path.
- **Git remote:** [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final) — initialize and push from V3 when ready.

### Fixed (Messaging / sync audit, May 2026)
- **Partial send:** per-message delivery tracking; only failed ids marked failed when some sends succeed.
- **Sync watermarks:** do not advance when any decrypt fails in a batch (messages + posts).
- **Metadata patches:** reactions/unsend apply even when listener generation is stale.
- **`resolveConversationId`:** resolves live/canonical DM rows when passed a bare local id.
- **Chat pagination:** uses decrypted `plain.chatId` for message thread attachment.
- See `Planning/BUG_AUDIT_MAY2026_V3.md`.

### Fixed (E2EE key restore on reinstall, May 2026)
- **`getUserKeyBackup` missing `deviceId`:** cloud key restore always failed after reinstall, so the app generated new keys and published them — breaking decrypt of existing messages/posts and confusing delivery. Restore now passes `deviceId` after `claimDeviceSession`.
- **Backup decrypt failure:** if server backup exists but cannot be decrypted, session init aborts instead of minting new keys and overwriting the backup.

### Fixed (Chat send + reactions, May 2026)
- **Reactions on messages:** metadata-only Firestore updates no longer re-decrypt as new rows; reactions render inside the message bubble (not a separate row below).
- **Reaction keys:** optimistic chat reactions use local `me` id; server sync merges without wiping.
- **Post comments:** reaction controls sit inside the comment bubble.
- **Send guard:** clearer alert when device session is not ready yet.

### Fixed (Friend online / presence, May 2026)
- **Firestore listener:** no longer marks every friend offline when the presence query returns zero docs (stale `viewerAuthUids` or race).
- **Heartbeat:** own presence publishes as soon as the device session is ready; friend polling stays gated on boot roster.
- **Session init:** one immediate `setMyPresence` after `registerFirebaseAuthUid` so `viewerAuthUids` includes friends.
- **Backend:** `writePresenceWithViewers` normalizes legacy friendship `participants` (Firebase Auth ids) to app `u_*` uids.
- **Deploy:** `firebase deploy --only functions` + `npm run apk:release` on both phones.

### Added (Automatic E2EE key backup after reinstall, May 2026)
- **Cloud key backup:** after each session, the app uploads an encrypted copy of the device’s private key bundle (`putUserKeyBackup`), wrapped with a key derived from Firebase Auth + app uid.
- **Silent restore:** on sign-in, `claimDeviceSession` runs first, then `getUserKeyBackup` restores keys **before** any new key generation (fixes reinstall decrypt failures).
- **Social snapshot backup:** encrypted copy of chats, messages, and posts (`putUserSocialSnapshot` / `getUserSocialSnapshot`) restores the timeline immediately on sign-in; local AsyncStorage still used between app restarts without uninstall.
- **Boot pull:** messages and posts fetch in parallel on first session sync (no need to open Feed first).
- **Profile picture:** HTTPS avatar URL is cached per email and restored on boot / after `getUserProfiles`.
- **Deploy required:** `firebase deploy --only functions` (`putUserKeyBackup`, `getUserKeyBackup`, `putUserSocialSnapshot`, `getUserSocialSnapshot`). History from before the first successful backup on an account cannot be recovered.

### Fixed (Feed post layout jump, May 2026)
- **Stable media:** photo posts use a fixed 4:5-style media box (80% of screen width) so images no longer resize the card after decode or when opening fullscreen.
- **Feed vs fullscreen:** inline comment threads render only in fullscreen; the feed card keeps a fixed-height react row + comments teaser line to avoid expansion jumps from background sync.

### Fixed (Post comments visible to post owner, May 2026)
- **Feed / profile:** private comment threads are polled every ~6s on post surfaces (feed, my profile, friend profile) and when posts scroll into view — post owners no longer need fullscreen-only hydration to see friend comments.
- **Sender:** optimistic comment row while the write completes; auto-expand a single comment chain on the owner’s post.

### Fixed (Reactions UX — tap to react, May 2026)
- **Feed posts:** smile **Tap to react** button + summary chips (no inline emoji strip); post reactions apply on tap across feed, fullscreen post, and profile post lists.
- **Post comments:** same picker UX as chat; fixed thread reaction handler (emoji argument); removed non-functional 👍 on 1:1 comment threads.
- **Chat:** smile button + summary chips below each message (replaces overlay trays on bubbles); long-press **React** in the actions menu still works.

### Fixed (Signup username vs email, May 2026)
- **Server:** `claimDeviceSession` no longer overwrites a profile username with the email local-part on every login; accepts the client’s persisted signup username and only uses an email-derived default for brand-new accounts with no name yet.
- **Client:** session restore and login load the persisted signup username from AsyncStorage; display resolution never falls back to the part before `@` in the email.

### Fixed (Chat **User** flash on cold start, May 2026)
- **Cold start navigation:** app always opens on **home → Feed** (no longer restores last chat screen from storage).
- **Display names:** until the boot friend roster pull finishes, chat/list titles trust the persisted local friend catalog instead of an empty server allow-list (which briefly showed **User** for everyone).

### Fixed (Voice notes, May 2026)
- **Composer UX:** mic enters voice-note mode (highlighted); primary button is record → stop; recording strip shows elapsed seconds; tap mic again to exit.
- **Delivery:** `durationSec` and audio `mediaUri` are included in encrypted payloads so voice notes send with correct length and play on the recipient device.

### Fixed (Chat video playback, May 2026)
- **DM video messages:** show a centered play control on the thumbnail; tap plays through once (no loop); after completion the clip stays on the last frame and cannot be replayed in-thread.

### Fixed (Photo editor, May 2026)
- **Crop:** materialize `content://` gallery URIs before manipulate; clearer errors on failure.
- **Android safe area:** sticky footers for edit (→) and preview (✓); non-scrollable edit layout.
- **Filters:** sliders icon opens filter modal instead of always-visible chip row.

### Fixed (Active chat message loss, May 2026)
- **Live DM sends:** outgoing delivery no longer migrates `dm_*__live` threads to the locked canonical `dm_*` id (which made bubbles vanish from the open chat).
- **Join cutoff UI:** friend/inbound bubbles are not hidden when `memberJoinedAt` updates mid-session (cutoff still applies to your own pre-rejoin history only, matching server decode).
- **Sync merge:** message pulls (full or incremental) merge into existing state instead of dropping local rows not present in the latest batch.

### Fixed (Refriend live DM, May 2026)
- **A1 / T9:** After refriend, **Start chat** opens a new live thread (`dm_*__live`, or `__live2` if the prior live thread was locked on unfriend). The old canonical `dm_*` row stays **User**, read-only, and identity-locked. Live threads use a separate Firestore conversation (`enc_dm_*__live`).

### Fixed (Presence + avatars, May 2026)
- **Online strip:** Firestore `presence` listener (`viewerAuthUids`) updates friend online state in real time; heartbeat poll re-runs when the friends list changes (not only on an 8 s timer).
- **Friend avatars:** `getUserProfiles` refresh every 30 s and when friends are added; HTTPS-only merge for `profilePictureUrl`; encrypted profile sync no longer ships `file://` URLs; fallback pull from `users` when encrypted payload has no HTTPS picture.
- **Backend:** `presence` docs include `online: true|false` on heartbeat writes.

### Fixed (Sweep 5, May 2026)
- Tombstone-with-history chat rows after unfriend; block inbound messages from non-friends on known threads; clear `unfriendedIds` when friendship returns (live UX only); **`identityLockedChatIds`** keeps old 1:1 threads on **User** after refriend; map post comment reaction keys to local ids.

### Fixed (Sweep 4, May 2026)
- **Message doc ids:** `sendEncryptedMessage` uses client `messageId` as the Firestore doc id so reactions, edit, and unsend hit the same row.
- **Edit sync:** new `updateEncryptedMessage` re-encrypts edited bodies; decode prefers Firestore doc id.
- **Unsent UX:** recipients see **Message removed**; metadata patches clear body/media; home preview uses **Message removed**.
- **Feed pagination:** merging older posts no longer clears existing `feedReactions`.

### Fixed (Sweep 3, May 2026)
- Android safe-area helpers (`app/lib/safeAreaInsets.ts`) applied across fixed-footers and non-scrollable screens (home bars, profile, auth, settings, modals, tombstone).
- Feed post reactions: `mergeSyncedPosts` prefers server `feedReactions`; pagination maps reaction author uids to local friend ids.

### Added

- **`Planning/BUG_AUDIT_MAY2026_V2.md`:** Security (`listMyFriends` / `getUserProfiles` verified caller), sync hardening, reaction metadata merge, shared media page, fullscreen chat media, GIF send, Android footer padding helpers, profile/presence fixes.
- **`Planning/NFC_QR_UNIFIED_PAIRING_PLAN.md` v2.0:** NFC rewritten as **QR parity** — button-only (**Send** / **Receive friend request**), **no long-press/hold-to-pair**; **128-bit opaque token** (`AFQR2|` / `PN2|`) replaces 4-digit PIN; §1 explains why payment taps work (card/terminal) vs peer NDEF.
- **`addFriend/nfcPairing/`** (`nfc_in_person_button_v1`): pluggable NFC pairing module (not wired in UI yet) — `runNfcPairingPresenterFlow` / `runNfcPairingResponderFlow` + server bridge for future Add Friend integration.
- **Bug fixes (May 2026 audit):** `socialExtensions` device session now uses `users.activeDeviceId` (fixes push, pagination, read receipts, group ops); callable requests send Firebase ID token; `memberJoinedAt` normalized client-side; chat mute syncs to server `mutedBy`; pairing preview no longer adds friend before finalize; QR issuer overlap guard; `listConversationMessages` / `listEncryptedPosts` `hasMore` fixes; `removeFriendship` requires device session.
- **Chat/feed roadmap implementation (first pass):** Backend callables `listConversationMessages`, `updateConversationReadPosition`, `registerPushToken`, `manageConversationMembership`, `setEncryptedPostReaction`, `updateEncryptedPost`, `updateMessageMetadata`; push on `sendEncryptedMessage` (Expo + FCM); group kick on unfriend; friend-filtered posts; presence `viewerAuthUids` mirror. Client: feed pull-to-refresh, infinite scroll, muted in-feed video autoplay, post reactions, chat pagination, read avatars, shared media gallery, server-synced message reactions, group add/leave/kick hooks, OS push registration (`expo-notifications` — run `npm install` if missing).
- **`Planning/CHAT_FEED_IMPLEMENTATION_ROADMAP.md`:** Chat/feed/cross-cutting work split into **IMPLEMENT** (approved for planning/build) vs **TODO** (typing indicators, offline queue, share/repost TBD). Chat P0: OS push, read avatars at watermark, pagination. Chat P1: add member, creator admin, leave/kick, server history cutoff. Feed P0: synced reactions (friends-only visibility), infinite scroll, pull-to-refresh, in-feed video. Feed P1: thread reactions, edit post, multi-device private comments. Cross-cutting: push, presence listener, tombstone/unfriend server filters (**T1–T10**); **no** global search.
- **Chat delivery hints + roster strip:** Release (`App.tsx`) shows **` • Sending…` / ` • Sent`** on your own message timestamps around the encrypted send path; demo (`AppDemo.tsx`) shows **` • Sent`** when the message is committed. Both variants show an **In this chat** horizontal participant strip above the composer (inverted list footer). Real “who has the chat open” presence is not implemented yet—the strip is the conversation roster.
- **`addFriend/proximityQr/`** — silo for **planned** QR Add Friend with mandatory proximity evidence (GPS-first hard 100m cap, Wi-Fi/personal-hotspot fallback); constants in `pairingRules.ts`; full rule set **`Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md`** (UI/backend not wired yet).
- **`Planning/RELEASE_NOTES.md`:** Version/tag alignment (`package.json` + `app.json`), internal-track APK path, unreleased highlight bullets for NFC PIN default.
- **NFC PIN Add Friend (default):** Cloud Functions **`registerNfcPinPairOffer`**, **`cancelNfcPinPairOffer`**, **`getNfcPinPairOfferStatus`**, **`confirmNfcPinPairOffer`**; Firestore **`nfcPinPairSessions`** (TTL cleanup in `cleanupExpiredTransientDocs`). Client: **`addFriend/nfc/`** (NDEF read/write + **`pinPairProtocol.ts`**), **`App.tsx`** Share/Join NFC flow. **BLE silo:** **`addFriend/ble/`** + legacy callables **`createBleFriendSession`**, **`joinBleFriendSession`**, **`getBleFriendSessionStatus`**, **`peekBleFriendSessionForJoin`** / **`bleFriendSessions`** (not wired from default UI). **`app.json`:** `react-native-ble-plx` config plugin + Android BLE permissions (for siloed BLE). **`npm` postinstall + `apk:*`:** `scripts/patch-ble-advertiser-sdk.mjs` … **`gradle-apk.mjs`** …
- **Planning:** `Planning/BLE_ADD_FRIEND_ARCHITECTURE.md` — **NFC 4-digit PIN pair** as **default** Add Friend; **BLE silo** (`addFriend/ble/`); **NFC** helpers under `addFriend/nfc/` (PIN protocol, legacy one-shot/HS2 where noted); **no silent Bluetooth on/off** when BLE is used (permissions + `ACTION_REQUEST_ENABLE` on Android; iOS cannot toggle BT). `PLANNING.md` R1 and related rows updated; `NFC_OPTIONS_AND_HS2_LEGACY.md` updated for PIN-primary + HS2 legacy.

### Changed

- **Local cache vs Firebase delete:** Signup clears on-device friends/chats for that email; boot reconciles friends/chats with `listMyFriends` (empty server list wipes local threads). Deleting Firebase users alone does not clear the phone — use signup (new APK), logout, Settings reset, or uninstall.
- **Legacy `draft-*` DM ids removed:** New chats use `dm_*` (1:1), `grp_*` (group), or `bc_*` (broadcast). Sign-in migrates old local `draft-*` rows. Boot pull shares `pullEncryptedMessagesIncremental`. See `Planning/MESSAGING_BUG_AUDIT_MAY2026.md`.
- **Modular messaging/friends/presence:** Extracted `app/messaging/` (sync, send, decode, hooks), `app/friends/roster.ts`, and `app/presence/heartbeat.ts` from `MainApp.tsx`. UI shell remains in `MainApp.tsx`; behavior unchanged.
- **Feed post comments:** Removed inline **`TextInput` + Send** from post cards (it fought the tap-to-expand card and dropped the keyboard). **Add comment…** opens full-screen post with a **chat-style** composer (**`KeyboardAvoidingView`**, input accessory Send/Done on iOS); thread owners use **Reply…** placeholders and compose in that same pinned footer (`App.tsx` / `AppDemo.tsx`).

### Fixed

- **Friend profile without server friendship (May 2026):** Opening the full friend profile screen only required a local ritual friend entry, not an accepted `friendships` doc — so pairing “success” without Firestore could still show bio/posts. Client now gates `canOpenProfile`, chat names, and profile navigation on server-accepted UIDs only; `hydrateFriendByUid` refuses to add to the local roster until `listMyFriends` includes the peer; `openFriendProfile` re-checks `getUserProfiles` without `pairingPin`. Server strips `bio` from pairing-preview `getUserProfiles` reads. **Deploy functions + new APK.**
- **Pairing without Firestore friendship (May 2026):** After wiping `friendships` but leaving `nfcPinPairSessions`, `finalizeNfcPinPairOffer` could return success without recreating the edge; joiner poll reported `joined` anyway. Server now repairs missing edges; status `joined` requires an accepted friendship doc. Client verifies `listMyFriends` after finalize. **Delete `nfcPinPairSessions` when resetting test data.**
- **DM send reliability (May 2026):** Publish sender keys before encrypt; resolve recipient keys with retry + clear errors; do not block send when `registerFirebaseAuthUid` fails (callable pull still works); server `sendEncryptedMessage` creates missing conversation docs; fix `memberJoinedAt` friend-id mapping. **Deploy functions + new APK on both phones.**
- **Presence false-offline (May 2026):** Client trusts server `online` flag (no device-clock vs server-heartbeat skew). Stale window 45s; heartbeat every 8s with retries on `setMyPresence`. Poll waits for `backendSessionReady`. **Deploy functions + new APK on both phones.**
- **Ghost data after Auth wipe + presence one-way (May 2026):** Boot sync now runs friends reconcile **before** message pull (no race that re-imported deleted threads). Message ingest drops unknown threads from non-friends; listener waits for boot + hidden tombstones. Presence heartbeats even with zero friends (so new accounts show online). `listEncryptedMessages` skips conversations the user left. **Requires functions deploy + new APK on both phones;** wipe Firestore friendships/messages or use a new email if server data was not deleted.
- **DM send flicker + delivery + presence (May 2026):** Outgoing messages now use the canonical `dm_*` chat id immediately (fixes disappear/reappear when the view migrated off `draft-*`). Chat list shows messages across legacy + canonical ids. `upsertConversation` only sets join cutoff for the sender; inbound messages are not filtered by the other party's join stamp. Presence poll resolves friend `u_*` via `friendIdToBackendUid` when `backendUid` is missing. Send requires `registerFirebaseAuthUid` (retries) so live delivery can work. **Requires `firebase deploy --only functions` + new APK on both phones.**
- **Hidden chat listener filter:** `getHiddenConversationIds` callable; client caches server tombstones and filters real-time message listener, boot pull, and foreground sync (not only `listEncryptedMessages`).
- **Messaging/friends hardening (audit pass):** Unified `resolveConversationId` / `serverConversationIdsToHide` for leave/mute/read/delete; `hideConversationForUser` server tombstone + boot restore respects `hiddenChatIds`; `getFriendKeyBundles` / `getUserProfiles` filter `u_*` and fail per-id; friends listener replaces roster from Firestore (no merge of orphan rows); message listener logs missing envelopes/decrypt failures; `claimDeviceSession` latest device wins (one-account policy). **Requires functions deploy + release APK.**
- **Send crash + one-way presence:** Fixed missing `CURRENT_USER_LOCAL_ID` import (send failed after `upsertConversation`). Presence poll now only queries `u_*` friend ids; `getFriendPresence` no longer fails the whole batch when one id is invalid (fixes “A sees B online but B sees nobody”).
- **DM delivery + delete + send flicker:** 1:1 chats now use a deterministic `dm_{u_a}__{u_b}` id on both devices (fixes messages written to different `enc_draft-*` conversations). Incoming sync maps legacy chat ids to the canonical thread. Join cutoff no longer hides in-flight sends; delete hides canonical + legacy ids, calls server `leave`, and flushes local persistence immediately.
- **`listMyFriends` returned zero friends:** Removed incorrect `filterUidsExistingInAuth` pass (it looked up app uids `u_*` in Firebase Auth, which always failed). Boot sync now replaces ritual friends from server truth; production no longer merges demo seed `FRIENDS` into the roster. Friendship listener ignores non-`u_*` participant ids; `registerFirebaseAuthUid` writes `firebaseAuthToAppUid` for legacy edges that stored Auth uids in `participants`. **Requires `firebase deploy --only functions` and a fresh client build.**
- **Show QR / friends list / presence (May 2026):** QR issuer returns to `idle` phase while the code is visible (was stuck on `awaitPairing`, hiding the QR widget). Friends list dedupes seed + server rows by `backendUid`; presence heartbeats apply to all friends via `presenceOnlineByBackendUid`, not only ritual-added entries.
- **Friends list + delivery (root-cause):** `dedupeFriendsByBackendUid` no longer emits the same `id` twice (seed row + real row); friends list uses `friendsForFriendsList()` (one row per `u_*`); `friendMap` also keys by `backendUid`; send always refreshes friend public keys from server; `sendEncryptedMessage` accepts client `participantUids` and rewrites conversation participants (requires functions deploy).
- **Bug sweep (May 2026):** `friendIdToBackendUid` maps only real `u_*` accounts (no `f_*` hash leaks); unified incoming-sender + direct-chat matching; group kick/add use real uids; `registerFirebaseAuthUid` retries on sign-in; server refreshes `participantAuthUids` on send when auth map lands late.
- **Message delivery:** Chat members resolve to real `u_*` app uids (not `f_*` hash placeholders) before `upsertConversation` / `sendEncryptedMessage`; re-register Firebase Auth uid before send; foreground `listEncryptedMessages` pull when app is active; normalize legacy chat `memberIds` on load.
- **Friends list duplicates:** Collapse multiple ritual rows for the same `u_*` account (legacy `id` vs canonical `f_*` hash), including on restore, boot `listMyFriends`, and Firestore listener updates.
- **Client audit (May 2026, core-values pass):** NFC join now uses dual-confirm like QR (no premature “friends” celebration). `seedDemoFriendships` gated to demo mode only. Remote unfriend syncs `unfriendedIds` from Firestore listener; tombstones persist across restarts. Pairing session poll treats only `not-found` as cancelled. Chat list hides all unfriended counterpart ids. Demo issuer finalize completes locally.
- **Release DM send / `upsertConversation`:** outgoing delivery now resolves each chat member’s backend UID with the same **`friendIdToBackendUid` / `backendUidForFriendId` fallback** used by **`seedDemoFriendships`**, instead of requiring `friend.backendUid` only. Seed friends never set `backendUid`, so encrypted sends failed before chat reached the server (or showed the wrong “not linked” error).

- **Firestore index deploy (DM sync):** `firebase deploy --only firestore:indexes` failed with HTTP 400 when `messages` / `participantUids` was declared as a composite index with only one array field; switched to **`fieldOverrides`** with `arrayConfig: CONTAINS` and `queryScope: COLLECTION_GROUP` per Firestore single-field index rules (`backend/firestore.indexes.json`).

- **Appearance persistence:** Dark mode and accent colour choice (`mvpplus.appearance.v1` in AsyncStorage) are restored on cold start instead of resetting to light/green (`App.tsx` and `AppDemo.tsx`).
- **Local chat/message cache (release path):** For accounts without the seeded demo graph, chats and messages are persisted per email (`mvpplus.messaging.v1:<email>`), loaded during sign-in, and cleared when resetting local state for that user—so force-quit does not wipe your own message history locally. Recipient delivery remains backend/sync dependent.
- **Profile photo crop UX:** Choosing a profile picture uses the same in-app **`PhotoEditorModal`** crop + preview pipeline as chat/post media (no ambiguous native picker crop-only step); preview confirm is labelled **Use photo** when the editor was opened from My Profile (`App.tsx` / `AppDemo.tsx` parity).

- **BLE Add Friend (Share):** Host flow no longer **fails on the first** `getBleFriendSessionStatus` error (poll is resilient; short delay before first poll). **Guard** when `backendSessionReady` is false; **`createBleFriendSession`** errors surface a deploy/network hint when appropriate.
- **Add Friend NFC (Transmit reliability):** Documented **writer vs reader** RF mismatch; **Receive** now uses **Android reader mode**; **Transmit** clears NFC, **waits after mint**, and **retries the NDEF write**; pairing copy stresses **Receive first, Transmit second**.
- **Add Friend NFC:** Replaced the **HS2 two-hop** NDEF + nonce exchange with a **one-shot voucher** (`FN1.AF1|<code>`): **Transmit** mints + writes once; **Receive** reads once and redeems on the server; issuer polls until redeemed. Legacy HS2 Cloud Functions remain deployed but **unused** (see `Planning/NFC_OPTIONS_AND_HS2_LEGACY.md`). New callables: `mintNfcFriendVoucher`, `redeemNfcFriendVoucher`, `getNfcFriendVoucherStatus`; `nfcFriendVouchers` docs expire via `cleanupExpiredTransientDocs`.

- **Android OTP assist:** Inbox parsing no longer treats **4-digit years** (e.g. 2026) as an OTP; only **6-digit** codes match the backend. Auto-fill **does not overwrite** the field once you have started typing. **READ_SMS** is requested via an **optional** alert after opening the OTP step instead of an immediate system prompt. **NFC Add Friend:** `cancelTechnologyRequest` no longer waits **1s** between read/write (that gap broke back-to-back taps); use a **~120ms** teardown, **NDEF refresh** via `getNdefMessage` when the tag cache is empty, **multi-tech read** on Android (`Ndef` → `NfcA` → `IsoDep`), **reconnect after write**, and **45s** read/write timeouts aligned with `ADD_FRIEND_NFC_READ_TIMEOUT_MS`.

### Changed

- **App version:** `1.0.1` in root `package.json` and `app.json` (`expo.version`) for the next **internal** APK/AAB traceability (tag suggestion `v1.0.1` when you publish that build).
- **Demo debug profile:** Added offline demo login presets (`User A/1234`, `User B/5678`), seeded 100-friend worlds with overlap, guaranteed friend-post volume (>=5 each), direct/group/broadcast seed chats, and local QR add-friend simulation hooks (including stable User A demo QR PIN). Debug Android build now uses demo app label/package suffix and emits `app-demo-debug.apk`.
- **Build separation:** App entrypoints split into `App.tsx` (release) and `AppDemo.tsx` (demo). Build script now sets `EXPO_PUBLIC_APP_VARIANT` (`release` for release task, `demo` for debug task) so release and demo run isolated app files.
- **Demo seed polish:** `AppDemo.tsx` now seeds realistic friend names, clearer group/broadcast names, pre-existing post/message reactions, and multiple seeded broadcast chats for QA.
- **QR Add Friend runtime policy:** Scanner now fetches issuer preview and prompts **“Confirm adding {userName} as a friend?”** before final confirm. Backend `confirmNfcPinPairOffer` enforces GPS-first proximity (dynamic uncertainty radius with hard **100m** cap) and Wi-Fi/private-subnet fallback (personal hotspot counts) when GPS quality is insufficient. Added callable `previewNfcPinPairOffer`.
- **QR scan diagnostics:** Added client telemetry around scanner callback lifecycle (`pairing.qr.scan.*`) including callback frequency, ignored reasons, permission stages, preview/confirm stages, and lock acquire/release events to debug scan flicker/race conditions.
- **QR scanner UX stabilization:** Read-mode scanner now enters a single `processing` UI state immediately after first valid decode, disables further barcode callbacks while processing, and suppresses intermediate status churn so scans behave like standard QR apps (no rapid flicker while preview/confirm runs).
- **Functions error clarity:** `backendBridge.ts` now guards callable JSON parsing and throws a clear diagnostic when the response is non-JSON (for example HTML starting with `<`), including status/content-type/function URL snippet to quickly identify wrong endpoint, undeployed callable, or network interception.
- **Release messaging safety:** `App.tsx` now hard-disables simulated auto-reply generation unless `DEMO_OFFLINE_MODE` is enabled, so real-friend chats in release no longer receive local test/demo reply injections.
- **Release backend delivery fix:** `App.tsx` now sends outbound chat messages via encrypted backend callables (`upsertConversation` + `sendEncryptedMessage`) and sends posts via `createEncryptedPost` for friend visibility. Outbound failures now surface user-facing errors (messages marked unsent; failed optimistic posts removed).
- **Inbound DM continuity:** encrypted message sync now creates a local direct chat shell when a valid inbound message arrives for an unknown chat id, preventing first-time messages from being silently dropped.
- **Post author identity fix:** encrypted post payload now includes backend author UID and post rendering resolves author display from UID, fixing the bug where friends saw your post labeled as “You.”
- **DM recipient routing hardening:** release send path now requires real `backendUid` recipients for chat participants (instead of fallback local seed IDs) and surfaces a clear error when a chat is not yet linked to a real backend friend.
- **Signup username vs login restore:** session restore and password login no longer overwrite Firestore `username` with the email local-part default. Chosen signup usernames persist on-device and win over auto-generated login placeholders; server profile is merged when appropriate.
- **Firestore indexes (DM sync):** `backend/firestore.indexes.json` uses a **`fieldOverrides`** entry (single-field, `arrayConfig: CONTAINS`, `queryScope: COLLECTION_GROUP`) on collection group **`messages`** / field **`participantUids`** so `listEncryptedMessages` can run; a composite index file entry for the same single field is rejected by the API (“not necessary — use single field index controls”). Deploy with `firebase deploy --only firestore:indexes` from the repo root (or include in your full deploy script).
- **NFC PIN diagnostics (small-payload path):** Added attempt-scoped telemetry in `App.tsx` and `AppDemo.tsx` (`pairing.nfc.pin.*`) across register/write/read/confirm/await-redeem plus cancellation/failure stages, mirroring QR race-debug instrumentation for NFC troubleshooting.
- **Add Friend UI:** Replaced **Share/Join NFC wording** with **Show QR / Read QR** while keeping the existing accent-themed screen and large bottom action button. Show mode now mints and renders a short-lived QR; Read mode opens an on-theme camera scanner frame. `nfcPin*` callables remain the backend path, now with preview + proximity checks.
- **Add Friend default transport:** **NFC 4-digit PIN pair** (`nfcPinPairSessions`, callables **`registerNfcPinPairOffer`**, **`cancelNfcPinPairOffer`**, **`getNfcPinPairOfferStatus`**, **`confirmNfcPinPairOffer`**) with **server-side PIN reservation** (doc id = PIN; client silently regenerates on conflict). **BLE** flow removed from **`App.tsx`**; BLE code siloed under **`addFriend/ble/`** with **`addFriend/ble/SILO.md`**. **`addFriend/inPersonPairingGateway.ts`** only tears down NFC (`cancelActiveNfcRequest`). **`addFriend/nfcPinTransport/pinPairProtocol.ts`** minimal NDEF payload encoding/parsing (legacy NFC session + old flows remain under **`addFriend/nfc/`**).
- **In-person pairing naming (app layer):** `App.tsx` and **`addFriend/inPersonPairingGateway.ts`** use transport-agnostic names (`pairing.*`, `cancelInPersonPairingHardware`, etc.). **NFC / BLE** identifiers remain under **`addFriend/nfc/`** and **`addFriend/ble/`**; legacy **BLE** callables remain for optional/emulator use. Client telemetry uses **`pairing.in_person.*`** / **`pairing.session.create`**.
- **Removed from default Add Friend UI:** BLE beacon scan list, manual BF1 join form, and on-screen host code display (replaced by NFC PIN flow above).
- **New post** footer: **Cancel** and **Publish** swapped (**Cancel** left, **Publish** right); **equal width** (`flex: 1`), shared **minHeight** / padding / **lineHeight** for label alignment; Cancel uses **green outline** (`theme.accent` border) on themed background.
- **Add Friend** big circle button: **light mode** uses a **white** ring (`borderColor`); dark mode keeps the **muted accent** border.
- **Add Friend** accent canvas: **light mode** uses **white** labels/icons, **white** Share/Join switch thumb, and **lighter-tint accent** switch tracks; **dark mode** uses **black** foreground on accent (icons, body copy, spinner, Cancel chip, celebration titles, big-button label). Android **nav button style** and **StatusBar** invert on Add Friend so system chrome matches that foreground.
- **Scrollbars:** `ScrollView` / `FlatList` use `ScrollUntilScroll` wrappers so vertical (and horizontal) indicators stay **hidden until the user actually scrolls** that surface.
- **New post:** Full-screen **publish** flow (no home top-bar highlight, no modal card); large tap target for media, caption field below; photo editor still opens after picking images (same pipeline as before).
- **Android OTP:** `READ_SMS` in the manifest, in-app permission prompt on OTP steps, **SMS Retriever** (`react-native-otp-verify`) plus optional **inbox poll** when read access is granted (`react-native-get-sms-android`).
- **Posts:** Per-email AsyncStorage posts are **loaded during sign-in** before `signedIn` flips so an empty in-memory feed is not persisted over saved posts.
- **Cold start / resume:** A short non-interactive boot splash (~500ms minimum, extended until Firebase initial auth + session restore finishes) shows the **tBH** mark and a placeholder product name so the login UI does not flash when reopening while still signed in; last navigation (`ViewState` + home feed/chats tab) is persisted per email and restored on sign-in until Logout.

### How to update this file

- Under **`[Unreleased]`**, add bullets under **Added** / **Changed** / **Fixed** / **Removed** / **Security** as appropriate.
- When you cut a release, move those bullets into a new dated section **`[x.y.z] - YYYY-MM-DD`**, then add a compare link at the bottom if you use Git tags.
- Keep entries concise: *what* changed and *why* when it helps readers.

### Added

- **`Planning/`** folder inside **App Final**: planning Markdown, checklists, and chat exports copied from `Cursor Projects\App V2` (2026-05-03); Cursor rules updated so the App Final repo root is the single workspace for code plus `Planning/` for docs.
- Planning docs: **§0 Canonical codebase** in `PLANNING.md` — all implementation and APK builds in `C:\Users\dunca\OneDrive\Desktop\App Final` only; note to export Cursor chats periodically; same pointer added across MVP / parity / E2EE / OTP docs and `NEXT_STEPS_PARITY.txt`.
- **App Final** — Add Friend NFC native sheet copy varies with **Transmit / Receive** toggle (`AddFriendNfcPairMode` in `nfcAddFriendHandshake.ts`).

- Planning operations docs for MVP+ stabilization:
  - `MVP_PLUS_EXECUTION_BOARD.md` (`Now / Next / Later` execution board)
  - `E2EE_VERIFICATION_CHECKLIST.md` (manual encrypted-flow validation matrix and run logs)
- Archive marker docs in legacy folders:
  - `../App V2 Build2/README.md`
  - `../App V2 Build3/README.md`
  - `../App V2 Build4/README.md`
- Contract test scaffold in `App/mobile`:
  - `src/services/callableContracts.ts` (callable response parsers + injectable client)
  - `src/services/callableContracts.test.ts` (success/failure tests for callable response shape validation)
  - `npm run test:contracts` script using `tsx --test`
- E2EE envelope test scaffold in `App/mobile`:
  - `src/services/e2eeEnvelope.ts` (pure recipient-envelope encrypt/decrypt helpers)
  - `src/services/e2eeEnvelope.test.ts` (success, recipient mismatch, tamper failure coverage)
  - `npm run test:e2ee` and `npm run test:all` scripts
- Firestore security rules test harness in `App/backend`:
  - `backend/tests/firestore.rules.test.mjs`
  - root script `npm run test:rules:firestore` (`firebase emulators:exec --only firestore ...`)

### Changed

- Source-of-truth implementation path set to `App/` (`mobile` + `backend/functions`) for active MVP+ engineering and verification work.
- Added sync-recovery UX for Firebase sessions in `App/mobile`:
  - Retry sync action
  - Re-authenticate action (sign-out and sign-in flow)
  - Reset local session state action (clears local device/session cache, then signs out)
  - User-facing sync issue guidance for offline/auth/decrypt categories
- Hardened Firestore rules in `App/backend/firestore.rules`:
  - posts: author self-read allowed, friend-gated reads retained, author-only update/delete enforced
  - users: owner-only create/update/delete enforced
- Added Firestore emulator config in `App/firebase.json` (`127.0.0.1:8085`) to avoid local port collision during rules tests.
- Refactored `App/mobile` app state: moved device session claim + sync status derivation from `AppContext.tsx` into `src/state/useDeviceSession.ts` and `src/state/syncIssue.ts`.
- Refactored mock local-state persistence in `App/mobile`: moved AsyncStorage hydrate/save logic from `AppContext.tsx` into `src/state/useMockStatePersistence.ts`.
- Refactored live Firestore subscriptions in `App/mobile`: moved feed/friends/conversations subscription effects from `AppContext.tsx` into `src/state/useLiveDataSubscriptions.ts`.
- Refactored auth/profile state handling in `App/mobile`: moved auth listener, profile hydration, and onboarding/loading derivation from `AppContext.tsx` into `src/state/useAuthProfileState.ts`.
- Refactored interaction action handling in `App/mobile`: moved mock pairing/handshake flows and mock message/post helpers from `AppContext.tsx` into `src/state/useInteractionActions.ts`.
- Refactored device identity lifecycle in `App/mobile`: moved device-id hydrate/reset effect from `AppContext.tsx` into `src/state/useDeviceIdentity.ts`.
- Refactored auth action handling in `App/mobile`: moved mock/Google/anonymous sign-in and sign-out/reset actions from `AppContext.tsx` into `src/state/useAuthActions.ts`.
- Finalized feed UX entry decision for current MVP+ implementation: signed-in landing remains `Connect`, feed is entered via explicit `Go to Feed` action, and Home uses a top action strip (no tab/segmented feed switch).
- Hardened beta preflight checks in `App/scripts/beta-preflight.mjs` to fail fast when Firebase project targets are misaligned between root `.firebaserc` and `mobile/.env` (`EXPO_PUBLIC_FIREBASE_PROJECT_ID`).
- Expanded `App/mobile/scripts/verify-env.mjs` to validate release-critical mobile configuration: Expo bundle/package identity parity, NFC permission + plugin presence, EAS preview internal APK profile, and Firebase auth-domain/project-id consistency.
- Added `App/scripts/beta-readiness-report.mjs` with `npm run beta:readiness` to generate a single-command pass/fail readiness summary across env validation, mobile tests, backend build, and Firestore rules tests before beta sessions.
- Updated `App/BETA_DAY0_KICKOFF_CHECKLIST.md` to include `npm run beta:readiness` as the first Day 0 prep check.
- `npm run beta:readiness` now also writes a timestamped markdown artifact to `App/reports/` for shareable daily evidence snapshots.
- Aligned beta/deployment docs to root-safe commands (`npm --prefix mobile ...`) and added `beta:readiness` to quick-command guidance to reduce operator path mistakes during tester prep.
- Updated `App/mobile/index.ts` runtime comment to avoid implying Expo Go support for this native Firebase/NFC build path.
- Added flow-tester runtime support for Expo Go: backend selection now uses `isLiveBackendEnabled()` so Expo Go (or `EXPO_PUBLIC_FORCE_MOCK_MODE=1`) runs mock/local screen-flow mode even when Firebase env vars are present.
- Refactored `App/mobile/src/lib/firebaseClient.native.ts` to lazy-load React Native Firebase modules so unsupported runtimes do not crash on module import.
- Added `npm --prefix mobile run start:flow` and documented `EXPO_PUBLIC_FORCE_MOCK_MODE=1` in `.env.example` for quick flow-only testing.
- Improved flow-tester UX by seeding mock sign-in with starter friends/feed/messages so screen traversal is meaningful immediately, and added a persistent in-app `FLOW TESTER` badge overlay in navigation.
- Added `expo-dev-client` to `App/mobile` so `build:android:dev` development-client builds can run again for real-device login/NFC testing.
- Hardened `App/mobile/scripts/verify-env.mjs` to fail if `eas.json` requests development-client builds but `expo-dev-client` is not installed.
- Updated `App/mobile/src/screens/MessagesScreen.tsx` shared frontend UX to show distinct peer hints (`Friend · …xxxx`) and selected-conversation emphasis, improving chat navigation clarity in both tester and real runtime modes.
- Improved `App/mobile/src/screens/ConnectScreen.tsx` shared frontend UX with an explicit readiness banner (`Ready to connect` vs `Preparing secure session`) and next-step guidance copy for faster pairing troubleshooting.
- Updated `App V2 Build4/` tester app for Expo Go SDK `54.0.6` compatibility by pinning `expo` and re-aligning `expo-constants` to SDK 54-compatible versions.
- Improved post creation reliability in shared frontend/state: `createPost` now returns a Promise with explicit failure reasons, and `PostComposerScreen` now shows loading/error feedback and only navigates after successful publish.
- Switched `App V2 Build4/App.tsx` to wrap and render the active `App/mobile` frontend implementation so tester and real app share the same UI surface.
- Added required shared-frontend dependencies in `App V2 Build4` and fixed shared `firebaseClient.web.ts` auth initialization for Firebase SDK compatibility.
- Improved real/shared messaging reliability UX in `App/mobile/src/screens/MessagesScreen.tsx` with explicit start/send loading states, inline error banners, and empty-thread guidance to reduce silent failure confusion.
- Added inline auth/onboarding error banners in `App/mobile/src/screens/AuthScreen.tsx` and `App/mobile/src/screens/OnboardingScreen.tsx` so users can recover from failures without relying only on transient alerts.
- Added Spark-safe OTP test fallback in `Desktop/App v4/mobile/src/screens/AuthScreen.tsx`: after successful OTP confirm, username setup callable failures caused by Blaze-only Functions deploy requirements are now non-blocking, allowing real phone OTP flow testing to continue.
- Fixed a confusing Expo Go login regression in `Desktop/App v4/mobile/src/config/firebaseConfig.ts`: `isFlowTesterMode` is now **opt-in** via `EXPO_PUBLIC_FORCE_MOCK_MODE=1` (it no longer auto-enables in Expo Go). This prevents `AuthScreen` from showing the mock phone-only login form while the UI still says "username and password."
- Started frontend parity alignment for modular `Desktop/App v4` against approved MVP baseline `Desktop/App v4_Expo_V54`: `AuthScreen` login now matches approved behavior (email + password input/validation) instead of username-based login copy/flow.
- Continued modular parity alignment in `Desktop/App v4/mobile/src/screens/AuthScreen.tsx`: login now always presents email+password UI (including non-live/mock runs), signup/OTP back actions use icon arrows to match approved MVP feel, and mock-mode login now validates approved test account credentials instead of phone-only fallback.
- Added `@expo/vector-icons` in `Desktop/App v4/mobile/package.json` to support UI parity icon usage in modular auth screens.
- Added parity governance docs for ongoing modular alignment:
  - `FRONTEND_PARITY_BASELINE.md` (approved baseline path + parity rule)
  - `FRONTEND_REGRESSION_CHECKLIST.md` (pre-APK UI/flow regression gate)
- Continued parity polish in `Desktop/App v4/mobile`:
  - `HomeFeedScreen` now labels friend authors with peer hints (`Friend · …xxxx`) to better mirror MVP feed identity cues.
  - `AuthScreen` now includes quick test account credential hint text, matching signed-off MVP testing affordance.
- Corrected the modular app shell color baseline in `Desktop/App v4/mobile` to stop using the legacy phthalo default:
  - `src/theme/colors.ts` now uses a light base palette aligned with approved MVP direction.
  - `src/navigation/RootNavigator.tsx` now uses light header/content backgrounds and dark text (with teal activity indicator), matching the approved app’s default light presentation more closely.

### Fixed

- Security validation now includes executable Firestore rules tests (7/7 passing) covering non-friend read denial and author-only post/profile mutation rules.

### Removed

---

## [1.0.0] - 2026-04-16

MVP UI prototype in React Native (Expo). Chat, friends, and settings flows use **demo/simulated** data unless or until a backend is wired in.

### Added

- **Navigation & shell**: `ViewState` routes for home, chat (existing or draft), friend profile, my profile, friends list, and Add Friend.
- **Theming**: Light/dark palettes, accent options (e.g. blue-teal and hot pink per design), shared `ThemePalette` usage across screens.
- **Home**: Chat rows, online friends strip (with de-duplication vs. chat list per plan), entry to Start Chat and settings.
- **Chat**: Direct and group-style flows with demo threads; message bubbles with left/right alignment; **reply** UI (quoted context + main body); **reactions** (emoji chips); read/edit/unsend-style behaviors as implemented in the prototype.
- **Broadcast**: Creation flow with recipient selection, saved broadcast groups, prompts aligned with MVP rules (e.g. full-selection bypass, staged save prompts).
- **Friends list**: Search, row actions, **PanResponder** swipe interactions, navigation to chat/profile as implemented.
- **Friend profile** from list/chat with return-stack behavior and **unfriend** state handling.
- **Add Friend screen**: Hold-to-pair ritual (local + simulated remote progress), handshake delay, **haptics** (short hint after press-in; completion pattern when both sides finish), **Lottie** confetti, dim overlay, **centered “You're now friends with …”** line in accent color, **profile solo** phase (image + name), completion **sound** without an extra heavy vibration in the post-handshake step; timing constants for fade (~1.5s) and solo linger (~1s); wide **Add Friend+** label inside the circle.

### Changed

- **Add Friend**: Tuned celebration timing, layout (center headline vs. top-only), and button inner width (~98%) for readability.

---

## Release template (copy when tagging)

```text
## [x.y.z] - YYYY-MM-DD

### Added
- …

### Changed
- …

### Fixed
- …
```

---

*End of file — append new `[Unreleased]` work above the latest `[x.y.z]` block.*
