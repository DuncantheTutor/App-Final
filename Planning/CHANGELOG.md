# Changelog

All notable changes to this project are recorded here. Planning references: `MVP_FINAL_PLAN.md`, `PLANNING.md`, and related MVP docs in this folder.

**Canonical app implementation** (agents and humans): `C:\Users\dunca\OneDrive\Desktop\App FInal V3`. Git remote: [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final). Legacy **`App/mobile`**, older OneDrive **`App Final`**, and duplicate trees are historical only; default new work to **App Final V3** only. Periodically **export Cursor chats** and reread recent exports when resuming work or switching agents (see `PLANNING.md` §0).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions use [Semantic Versioning](https://semver.org/spec/v2.0.0.html) where a published app version exists (`package.json`).

**Timestamped audit trail:** Month/topic headings here are **not** enough for regression bisect. Use **[`Planning/DATED_CHANGE_LOG.md`](./DATED_CHANGE_LOG.md)** for date/time notes and git-vs-WIP reality. Last **git** commit on `main` as of Jun 2026 docs pass: **`f85a5fd` (2026-05-20)**; most Jun 2026 bullets below are **uncommitted** local work until pushed.

---

## [Unreleased]

### Security (Jun 2026)
- **No committed API keys:** Firebase web API key loads from **`.env`** (`EXPO_PUBLIC_FIREBASE_API_KEY` via `app.config.js`). **`android/app/google-services.json`** is gitignored; use **`google-services.json.example`** or download from Firebase console. Hardcoded fallbacks removed from `firebaseAuthClient.ts`.

### Fixed (Jun 2026 — testing report 5 Jun, follow-up)
- **Keyboard gap:** Removed double-lift (`keyboardHeight` padding on top of KAV/`adjustResize`); composers use minimal 4px inset when keyboard is open; KAV is **iOS-only** (`composerKeyboardAvoidanceEnabled`).
- **Missing carousel photos:** `useResolvedPostMedia` maps one display URI per Tier B ref by index; failed decrypts keep legacy/peek URIs instead of dropping slides.
- **Post comment send:** Comment field uses `postCommentTextRef` + `postCommentInput` (same pattern as chat); send enables as you type; submit reads ref after input settles.

### Fixed (Jun 2026 — testing report 5 Jun)
- **Chat keyboard:** Re-enabled `KeyboardAvoidingView` on Android for chat; fixed composers use `keyboardComposerBottomPadding` (explicit lift from `keyboardHeight` on edge-to-edge). Same helper on post comment composer, publish footer, and chat/broadcast composer modals.
- **Post comments live:** Fullscreen post viewer reads from live `posts` state (`fullScreenPostLive`) so new comments appear immediately without leaving the thread.
- **Reactions horizontal:** Reaction pills use `flexWrap: "nowrap"` and `alignSelf: "flex-start"` so emoji chips stay on one row (posts, comments, chat).
- **Remove reaction:** Reaction picker shows **Remove reaction (emoji)** when you already reacted; toggle still works by tapping the same emoji again.
- **Read receipts:** Small read avatars sit at the **screen edge** below sender avatars, not inset to bubble width.
- **Push notifications:** `POST_NOTIFICATIONS` on Android; FCM device token preferred on Android; pre-prompt waits for backend session before registering token. **Rebuild APK** after pulling these changes if push stopped working.

### Added (2026-06-04 20:02 +01:00 — Cursor workflow)
- **Agent workflow:** `.cursor/rules/code-permission-gate.mdc` — file edits only when the user starts a message with `(code)` on the first line. `commit-prompt-after-code.mdc` — ask before every git commit. `timestamped-changelog.mdc` — append **`Planning/DATED_CHANGE_LOG.md`** with minute timestamp + brief line on every code change.

### Changed (Jun 2026 — cold-start performance)
- **Plaintext on-device cache again:** `app/lib/encryptedLocalStorage.ts` now writes **plaintext** AsyncStorage (Firebase Auth uses stock `AsyncStorage` persistence). Legacy `enc1:` blobs from the brief encrypted-cache experiment are **decrypted once on read** and rewritten as plaintext.
- **Smaller inbox hydrate:** Feed stays **3** posts on first paint. Chat threads load **7** messages (UI mount, server pull, per-thread listener). Boot hydrates **visible inbox chats only** (up to 12 threads × 7 messages); incremental inbox hint pull stays **7**. In-memory `messages` are trimmed to **visible chats + open thread**, **7 newest per chat** (`trimInMemoryMessages`, `messageRetentionChatIds`).
- **Tier B media on disk (unchanged):** Downloaded chat/feed media remains **NaCl secretbox** under `mvpplus-tierb-enc/` with session decrypt files.

### Known regression (Jun 2026 — chat send crash, **open**)
- **Send button still crashes on device** after send-path revert; **read-receipt logic now matches `f85a5fd`** (`readReceipts.ts` + `readAvatarsForActiveChat` memo, 2026-06-04 20:21 +01:00). Large WIP remains vs that commit: chat Tier B `ChatMessageMediaResolver` / video-voice bubbles, encrypted AsyncStorage, messaging sync refactors (~71 files). **Verify:** `npm run apk:release`, test text-only send; if still crashing, build pure `f85a5fd` or capture logcat per `Planning/DATED_CHANGE_LOG.md`.

### Fixed (Jun 2026 — chat send crash, attempted)
- **Send white screen (21:22 +01:00 — 3 Jun read-receipt fallout):** Active chat messages sort by `createdAt` again (not `messageThreadSortKey` on send). Read position updates no longer call `setChats` on every new latest message; skip server read push while own outbound is still `sending`. `activeChatForRead` + Firestore listener use canonical thread row id.
- **Send white screen (21:04 +01:00):** Outgoing state updates deferred until after keyboard/interactions; `ChatThreadErrorBoundary` on chat thread; Android no longer uses `KeyboardAvoidingView` on chat (iOS only). Prior: `showChatScreen` / migrate / composer sync (20:33–20:45). **Verify on device.**
- **Send white screen (20:45 +01:00):** Chat overlay stayed gated on `resolvedChat`; send/migrate briefly dropped the row → full chat UI unmounted (white tab + keyboard). Now `showChatScreen = view.screen === "chat"`, thread-aware `resolvedChat`, migrate `setView` before `setChats`. **Verify on device.**
- **Send crash (20:33 +01:00):** Composer clear uses `setChatInputSynced`; send reads `chatInputTextRef`; chat list `extraData` no longer passes entire `messages` array; read watermark deferred via `InteractionManager`; chat media rows avoid `return null` in `FlatList`. **Verify on device.**
- **Read receipts (bisect revert, 2026-06-04 20:21 +01:00):** Removed 3 Jun thread-sort / `lastReadMessageId` / outgoing-clamp logic; restored May `createdAt` anchor and `getBackendSession()`-based `readBy` mapping in `MainApp.tsx`. **Status: send crash not confirmed fixed on phone.**
- **Send button crash (regression revert):** Restored last-known-good send path from commit `f85a5fd`: `sendMessage` → `chatInput.trim()` → `sendPayload` → `setChatInput("")` (no composer ref / `requestAnimationFrame` / deferred clear). Chat `FlatList` `extraData` again includes `messages` and `readAvatarsForActiveChat`. Read-profile avatars use the pre-refactor inline row (text bubbles only), not `renderReadReceiptRow` on every media row. Kept: `removeClippedSubviews={false}`, `messageDisplayText()` for bubbles, try/catch around send. **Status: not confirmed fixed on phone.**

### Fixed (Jun 2026 — Add Friend precise location + camera)
- **Precise location required:** Add Friend checks Android **fine** / iOS **full** permission (rejects approximate-only), re-prompts with **Try again** (no in-app Open Settings — use system settings manually), collects GPS at **Highest** accuracy (≤50m), and re-checks before Show QR and QR scan.
- **Camera for Read QR:** Same gate pattern as location — warm-check on Add Friend, alert + **Try again** when switching to **Read QR** or on scan if denied; in-scanner **Try again** card replaces non-working Open Settings button.

### Fixed (Jun 2026 — bug sweep v6 implementations)
- **Feed reactions realtime (H1):** Home feed subscribes to `encryptedPostReactions/{postId}` for visible posts and maps server uids to local friend ids.
- **Presence on auth repair (H3):** `registerFirebaseAuthUid` no longer calls `writePresenceWithViewers(..., "active")` — only refreshes viewer maps.
- **Local cache clear (M1):** `clearLocalSocialCacheForEmail` also removes feed mutes, feed reaction-seen, and posts-shared keys; account reset clears in-memory copies.
- **Chat UX (M4/M5):** Long-press message sheet lists Reply/Edit/Unsend before emojis; tapping a failed outbound bubble retries send.

### Docs (Jun 2026 — bug sweep v6)
- **`Planning/BUG_AUDIT_JUN2026_V6.md`:** Static sweep after delete-cache fixes; H1/H3/M1/M4/M5 closed in follow-up pass.

### Fixed (Jun 2026 — chat read receipts) — **reverted 2026-06-04 20:21 +01:00** for send-crash bisect
- **Read receipt avatars (3 Jun work, temporarily removed):** Had anchored on `lastReadMessageId`, thread sort key, and outgoing-message clamp. Restored May logic in `readReceipts.ts` until send crash is verified fixed on device.
- **Startup “U” flash:** Hide read-receipt avatars until the friend’s name/avatar is known (tombstone **User** placeholder no longer shown while roster hydrates).

### Fixed (Jun 2026 — deleted posts still returning from cache)
- **Not Tier B–specific:** Legacy HTTPS and Tier B posts share the same `encryptedPosts/{postId}` delete path; resurrection was stale **local/cloud cache** plus **incremental** sync keeping old rows. Boot now always runs a **full post catalog reconcile**; cloud snapshot restore filters `deletedPostIds` and no longer blocks reconcile; incremental merge purges suppressed ids from the in-memory catalog.

### Fixed (Jun 2026 — deleted posts reappearing after reopen)
- **Delete post persistence:** Record id in sync watermarks (`deletedPostIds`), remove the post from in-memory feed state and AsyncStorage immediately (not only after the 1.8s debounce), purge feed-reaction/gallery side caches, and suppress deleted ids during server/cloud merges so stale disk cache or snapshots cannot resurrect removed posts.
- **Appear-then-vanish on feed open:** Cached posts could paint first while incremental sync kept ghosts until a full reconcile; boot now forces a full post catalog pull when `deletedPostIds` is non-empty, and merge filters suppressed/deleted rows on every incremental pass.
- **Cloud social snapshot:** Stop re-uploading the *pre-merge* snapshot on sign-in (could overwrite a good backup with deleted posts still in it); upload only visible posts in scheduled/background backups; refresh snapshot immediately on delete and again after successful `deleteEncryptedPost`.

### Fixed (Jun 2026 — delete post before session ready)
- **Delete post:** Waits up to ~10s for `claimDeviceSession` after sign-in instead of failing immediately with "Account session is not ready"; clearer copy when the server connection failed vs session still starting.

### Fixed (Jun 2026 — new friend profile, "User" tombstone, push)
- **Boot roster no longer wipes recent friends:** `fetchFriendsOnBoot` keeps locally linked friends when `listMyFriends` is empty or slow, merges server + local rows, and boot sync unions server uids with persisted ritual friends (fixes new friends vanishing after cold start).
- **`listMyFriends` includes all accepted edges:** Stopped requiring a `users/{uid}` doc before returning a friend uid (new accounts could be missing from the roster until profile upsert finished).
- **"User" tombstone after Add Friend:** `resolveParticipantDisplay` trusts the local undirected friend graph while the server roster catches up; friendships listener merges Firestore snapshot with local-only friends instead of replacing the roster.
- **Profile + push after pairing:** `hydrateFriendByUid` persists social state, re-registers `registerFirebaseAuthUid` + push token, and refreshes presence so message mirrors and notifications work for the new friend.
- **Feed reaction detail:** Reaction summary sheet includes your own emoji row (not only friends).

### Fixed (Jun 2026 — Firestore read reduction)
- **Messages:** Removed foreground callable polling (25s inbox / 12s open-chat). Delivery is Firestore listeners only (inbox listener on **Chats** tab; per-thread listener while a chat is open). Boot still runs one `listEncryptedMessages` pull; push taps still trigger a pull.
- **Server `listEncryptedMessages`:** Batch-loads conversation docs once per request (fixes N+1 reads). Dropped incremental `editedAt` collection-group query (edits arrive via listener `modified` events).
- **Server backfills:** Removed opportunistic `recipientAuthUids` / `participantAuthUids` backfill on `listEncryptedPosts`, `listMyFriends`, and `listPrivatePostThreadMessages`.
- **Presence:** Removed `getFriendPresence` polling loop; online dots use the Firestore `presence` listener. Own heartbeat publish interval **30s** (was 8s).
- **Post comment listeners:** Fullscreen post viewer listens only to threads that already have comments (plus the thread being replied to), not every friend.

### Fixed (Jun 2026 — manual friendship post visibility)
- **Post backfill after manual Firebase friendship:** Boot now hydrates the friend roster **before** triggering historical post re-share; backfill includes server-known friend uids even when the local roster is still catching up; failed backfills retry instead of being marked complete.
- **Server friendship lookup:** `assertAcceptedFriendship` accepts accepted edges found via `participants` query (covers reversed Console doc ids) so `createEncryptedPost` / `updateEncryptedPost` can run when `listMyFriends` already returns the friend.
- **Push token refresh on foreground:** Re-checks OS notification permission when the app becomes active and re-registers Firebase Auth mapping + push token so chat/post alerts work after the user enables notifications in Settings.

### Fixed (Jun 2026 test round — first-open / cold-start responsiveness)
- **Boot timeline stagger:** Initial server sync pulls **messages first**, yields to the UI, then pulls feed posts (no longer parallel decrypt storms on first install).
- **Smaller boot caps:** Home feed server pull + listener capped at **3** posts (was 10). First cold-start inbox pull capped at **30** messages (was 120). Older feed posts still paginate at 30 via scroll.
- **Feed UI window:** Home feed mounts **3** cards on first paint (`FEED_UI_INITIAL_COUNT`); scroll expands by 5 before requesting the next server page. FlatList uses `initialNumToRender={3}`, `maxToRenderPerBatch={2}`, `windowSize={5}`, `removeClippedSubviews`.
- **Lazy Tier B media:** Feed cards skip Tier B decrypt until viewable (first 3 seeded on load); post viewer / profile cards still resolve immediately.
- **Lazy Tier B video:** Feed/post video blobs decrypt **only on tap-to-play** (poster/thumbnail still loads). Profile grid never pre-decrypts video. UI shows play overlay → **Preparing video…** → inline player; scrolling stays responsive.
- **Early backend session:** `claimDeviceSession` + key bundle marks the session ready immediately; cloud snapshot restore, profile upsert, auth registry, and hidden-chat refresh run in a **background** continuation with UI yields (no longer blocks boot sync).
- **Skip redundant feed poll:** Poll-on-open for home feed skipped for ~12 s after boot sync (same watermark/page already fetched).
- **Posts listener scope:** Firestore encrypted-post listener attaches only on **home → Feed** (not Chats tab or other surfaces).
- **Notification pre-prompt (product flow):** After splash, first signed-in launch shows an in-app **Stay in the loop** screen (Allow / Not now) before home is interactive. Boot sync (friends, messages, posts) continues in the background during this step. **Allow** opens the OS permission sheet, then registers the push token when the backend session is ready. **Not now** skips the OS sheet and does not re-prompt on later cold starts (per email, AsyncStorage `mvpplus.notificationPrePrompt.v1`). Users who already granted or denied at the OS level skip the pre-prompt.
- **Duplicate post sync removed:** Feed/profile post pull and Firestore post listener wait until **`initialServerSyncDone`** so boot sync is not immediately duplicated.
- **Feed comment hydration:** Removed bulk 25-post comment hydration on feed open; only **visible** feed cards hydrate (max 3, 500 ms debounce). Profile surfaces still hydrate in small batches with UI yields.
- **Decrypt yields:** Post and message E2EE decrypt loops, Tier B post media resolution, and Firestore post listener decode **yield to the UI thread** between items.
- **Debounced persistence:** AsyncStorage writes for posts/messages debounced (~1.8–2.2 s) so boot merges do not sync-stringify the entire timeline on every batch.
- **Deferred feed layout work:** Carousel aspect-ratio preload runs after interactions settle (reduces first-paint jank).

### Fixed (Jun 2026 test round — start chat / broadcast groups)
- **Removed demo seed broadcast groups:** Start Chat no longer preloads **Family Core** / **Project Leads** saved recipient groups (empty until the user saves one).

### Fixed (Jun 2026 test round — chat list / send ordering)
- **In-flight send ordering:** Home chat list sort and timestamps no longer treat a stuck `sending` preview as newer than already-delivered traffic in the same thread (e.g. slow video upload + quick follow-up text). Tie-break prefers confirmed lines over `sending` when `createdAt` matches. In-thread bubbles keep in-flight sends at the bottom when newer lines are already `sent`. Server echo merge preserves the optimistic client `createdAt` so Firestore server timestamps do not reorder mid-upload.

### Fixed (Jun 2026 test round — chat video UX)
- **Prepare cancel:** Tap-to-play chat video shows a **Preparing video…** overlay with **Cancel** instead of a blocking spinner; cancel aborts decrypt/prepare so you can scroll or leave the chat.
- **Filmed orientation:** Chat video bubbles use display dimensions from thumbnails / encrypted payload (`mediaWidth`/`mediaHeight`) with portrait-friendly defaults and `contain` framing (no forced landscape crop).
- **Reply preview thumbnail:** Long-press reply to a photo/video shows a small thumbnail in the composer reply strip (not just the word “Video”).
- **Full-screen over keyboard:** Opening chat photo/GIF/video full-screen dismisses the composer keyboard so media is not hidden behind it.
- **Photo editor keyboard isolation:** Chat/post/profile composers no longer shift when the photo editor or crop overlay has focus; caption and on-image text fields scroll above the keyboard inside the editor.
- **Broadcast unread flash on cold start:** Chat nav badges and unread rows no longer flash while the backend session is still initializing (`readBy` lookup requires a known `myUid`). Unread also respects `lastReadMessageId` when it matches the visible last message.
- **Broadcast read watermark flush:** Leaving a chat flushes the latest visible read cursor one more time; cloud snapshot restore **merges** messages/posts instead of blunt replace (preserves local read context).
- **Feed video UX:** Video posts show a centered **play** overlay on the poster/first frame. **First tap** plays inline; **second tap while playing** opens full-screen. After playback ends, the play overlay returns (no native rewind button). Feed no longer auto-plays videos on scroll.
- **Post viewer video UX:** Same tap-to-play / tap-while-playing-to-fullscreen / replay overlay behaviour in the post detail view (text tap), not only in the feed card.
- **Video scrubbing:** Chat and post inline/full-screen video controls use a draggable **progress slider** (skip/rewind). Scrubbing must **stay at the chosen position** (not snap back to 0:00). Control chrome is more transparent.

### Fixed (May 2026 test round — orientation, video thumbnail, broadcast unread)
- **Full-screen media orientation:** Photos and videos in the full-screen viewer follow **device rotation** (portrait or landscape). Removed forced landscape lock for landscape clips; unlocks while full-screen is open and restores portrait when closed.
- **Video post thumbnail UX:** Publish flow shows a modal with the **first-frame preview** and copy explaining the default. Custom thumbnails are picked without square crop and display **letterboxed on black** in the feed (separate poster layer, not overlaid on the video first frame).
- **Broadcast unread badges:** Chat list / nav unread state now uses **broadcast-visible** last messages only (other recipients' private threads no longer mark your broadcast unread). Read watermarks merge from local + server + cloud restore instead of being overwritten on cold start.

### Fixed (May 2026 test round — notifications, media send, chat UX, posts)
- **Multi-image feed carousel:** Restored shared slide height — all photos in a multi-image post use the tallest width-fit height; shorter images are vertically centered with symmetric **black** letterboxing (not per-slide variable heights).
- **Feed carousel swipe snap-back:** Swiping to slide 2+ no longer jumps back to slide 1 after the animation — carousel index is local on the feed until fullscreen sync; gallery index migrates when optimistic post ids are replaced by server ids; carousel height changes no longer reset scroll offset.
- **Profile post grid thumbnails:** Grid tiles resolve Tier B encrypted media and show the first image (or video poster / first-frame still) instead of the blank placeholder icon.
- **Post reaction notifications:** When a friend reacts to your post, the server sends a push (`{username} reacted to your post`, emoji body) and the client shows a feed nav badge until you open the Feed tab.
- **Chat composer send truncation:** Fixed last character(s) sometimes missing on send (e.g. `Having fun?` → `Having fun`) by reading a synchronous composer ref after input settles instead of stale React state when Send is tapped quickly.
- **Broadcast recipient privacy:** Recipients cannot send to the whole group — only private replies via long-press **Reply** on a broadcaster message (global or direct reply in their thread). Recipients only see general broadcasts plus the broadcaster's replies to them; **Reply** appears on every such broadcaster message. Private threads stay visible only to the broadcaster and that recipient.
- **Push notifications:** Chat pushes use title `New message from {sender username}` in 1:1 (not the recipient’s name / “me”) and `New message from {group or broadcast title}` for multi-member threads. Body is a single preview line — message text (120 chars + ellipsis), or `Photo` / `Video` / `Voice note` / `GIF` for media. Server rebuilds 1:1 titles from `users.username` when sending push. New-post pushes: `New post from {username}`.
- **Push → chat sync latency:** Incoming message pushes now trigger an immediate encrypted pull for that conversation (foreground receive + notification tap) and a resume pull when the app returns to foreground, instead of relying only on Firestore listeners and 45–90s fallback polling. Active-chat fallback poll shortened to 12s; inbox fallback to 25s.
- **Tier B media send:** Fixed React Native blob upload for encrypted chat media (photos, video, voice) — ciphertext now uploads via temp file + `fetch().blob()` instead of `new Blob([Uint8Array])`, which RN rejects. Local files are read via `FileSystem.readAsStringAsync` (base64) before encrypt; `blob.arrayBuffer()` and missing `EncodingType` fallbacks added for RN.
- **Shared local-media reader:** New `app/lib/readLocalMediaForUpload.ts` centralizes device URI reads (FileSystem base64 first, fetch/blob fallback) and RN-safe `uploadBytes` Blobs (temp file materialization). Tier B storage and **Tier A profile picture** uploads (`mediaStorageUpload.ts`) both use it — fixes `content://` / missing `cacheDirectory` gaps that could break feed posts or avatar upload with `undefined is not a function`.
- **Video send responsiveness:** Large video/audio reads skip base64-in-JS (fetch + FileReader instead), base64 encoding runs in yielded chunks, and upload work yields to the UI thread between read/encrypt/upload steps. Outgoing chat videos show a spinner placeholder instead of mounting `expo-av` while `deliveryStatus === 'sending'`. Chat video pickers use slightly lower quality to reduce file size.
- **Inbound encrypted chat video responsiveness:** Tier B decrypt/download for received chat videos is deferred until the user taps play (bubble shows a play icon immediately). When decrypt runs, download/decrypt/cache writes yield to the UI thread, dedupe in-flight work per Storage object, and queue one resolve at a time app-wide — **user-tapped play uses high priority** in that queue. Inline video bubbles show a **first-frame poster** until play; the native `expo-av` player mounts only while a clip is actively playing. Opening a chat fetches the **most recent 30 messages**; scroll-up paginates +30 at a time. The chat list also caps **mounted rows** (30 initial window, +30 per scroll-up) so hundreds already in memory do not all mount at once. **Full-screen chat/feed media** uses `contain` and follows **device rotation** (portrait + landscape). **Replay:** play overlay returns after inline playback finishes. Leaving chat clears video prepare/play state.
- **Profile feed pagination:** Media grid tiles still load for **all** posts with media; full feed cards below the grid show **6 initially** with **Load more posts** (+8).
- **Failed chat send:** Delivery failures mark the bubble **Not sent** with **Try again** / **Delete** — no automatic unsend tombstone.
- **Unsent message styling:** Unsent tombstones use neutral theme background/subtle text instead of sent-bubble accent colours.
- **Offline cached browsing:** Red offline banner; cached chats/feed/profiles stay usable without network.
- **Display media cache:** Shared in-memory + Tier B disk cache so feed → fullscreen → profile reuse decrypted URIs.
- **Read receipt avatars:** Fallback to cached profile cards while roster syncs (no `?` placeholder flash).
- **Chat self-avatar:** Tap your avatar in chat → **My profile**.
- **New-post push:** `createEncryptedPost` now **awaits** push delivery before the Cloud Function returns; posts listener runs globally (not only on feed tab).
- **Voice note playback (Tier B):** Voice recordings upload with correct audio content-type (including extensionless Android `.3gp` / `.m4a` URIs). Playback prefers Tier B decrypt (ignores stale local `file://` paths), uses Android `overrideFileExtensionAndroid`, and explicit `playAsync()` after load. **Pre-send preview** uses the same speaker routing and AAC `.m4a` recording preset. Chat voice bubbles use a dedicated wider card (`voiceMessageCard`) so the progress bar fits inside the bubble.
- **Chat list:** Unread accent dot moved to the far right of each row (after timestamp).
- **Read receipts:** Small reader avatars align to the screen’s right edge below sent messages; multiple readers stack horizontally (text, photo, and video messages).
- **Photo editor:** Chat flow preview button reads **Send** (not Post).
- **Historical posts for new friends:** Post backfill only marks a friend “shared” after a full scan succeeds; unfriend clears that marker so refriend re-runs backfill.
- **Post comments:** Optimistic comments show **Posting…** then **Posted** (or **Could not post** on failure).

### Fixed (Profile picture persistence, May 2026)
- **Avatars no longer vanish after upload or restart:** The debounced `putEncryptedProfile` sync skips when the in-memory URL is still a local `file://` preview (it normalized to `""` and overwrote `encryptedProfiles` before Firebase Storage upload finished). The encrypted-profile listener no longer clears your own HTTPS avatar on empty ciphertext — it reconciles from `users.profilePictureUrl` via `getUserProfiles` instead. Boot session init merges AsyncStorage + server URLs and omits `profilePictureUrl` from `upsertUserProfile` when empty so sign-in cannot wipe a stored avatar. Friend boot roster + profile-card cache use `mergeProfilePictureUrl` so transient empty server fields do not erase cached HTTPS avatars. Backend `upsertUserProfile` only writes `profilePictureUrl` when the client sends a non-empty HTTPS URL (same contract as `username`). Failed profile uploads restore the last persisted HTTPS URL instead of clearing the UI.

### Added (Dev helper — make friends script, May 2026)
- **`scripts/make-friends.mjs`** (`npm run make:friends`): writes an accepted `friendships/{minUid_maxUid}` edge for two sign-in emails or `u_*` app uids (Firestore emulator or production). Documented in `backend/README.md`.

### Changed (Branding — app named "Erdos")
- **App name is now "Erdos"** with a placeholder simple capital-"E" wordmark. Updated everywhere it surfaces in the UI:
  - **Boot splash** (`app/MainApp.tsx` + `AppDemo.tsx`): the `tBH` mark is now a large **`E`**, and the line beneath it shows **`Erdos`** (`PLACEHOLDER_APP_PRODUCT_NAME` in `app/lib/viewPersistence.ts` / `AppDemo.tsx`).
  - **Android launcher label** (`strings.xml` `app_name` → `Erdos`; debug variant override in `android/app/build.gradle` → `Erdos Demo`).
  - **Android launcher icon + native splash logo**: both now use a new vector wordmark `android/app/src/main/res/drawable/erdos_e.xml` (a capital "E"). The adaptive icon foreground (`ic_launcher.xml` / `ic_launcher_round.xml`) and the splash window background (`ic_launcher_background.xml`) reference it; the old `ic_launcher_foreground` / `splashscreen_logo` bitmaps are now unreferenced (left on disk, harmless). API < 26 still falls back to the legacy raster mipmaps.
  - **Expo `app.json` `name` → `Erdos`.**
  - **Left unchanged (internal, non-UI):** npm package name + Expo `slug` (`app-v2-build2`) and Gradle `rootProject.name` — changing the slug/package id risks Expo update + install identity churn and is not user-visible.
- _Placeholder mark:_ the "E" is a vector letterform for now; swap `erdos_e.xml` (and optionally the in-app `Text` mark) for a designed logo later.
- **Launcher icon colours:** Home-screen adaptive icon and native splash now use **black background** (`iconBackground` / `splashscreen_background` → `#000000`) with the **E** in app accent green **`#0C8579`** (`erdos_accent`, same as `ACCENT_GREEN` in `app/theme/preludeConstants.ts`). `app.json` splash/adaptiveIcon `backgroundColor` aligned for future Expo prebuilds.

### Fixed (May 2026 bug-sweep criticals — build dependency, unfriend revocation, sync watermark)
- **C1 — Build/dependency blocker:** `package.json` pinned `expo-file-system` to `^55.0.19`, a **nonexistent version** (npm flagged it `invalid`; the package failed to install and `expo-file-system/legacy` was unresolvable). Because `app/lib/tierBMedia/storage.ts` imports it, **all Tier B encrypted chat/feed media** — and the whole bundle — was broken. Pinned to the SDK-54 bundled version **`19.0.21`**. Typecheck now clean. (Sibling `^55.x` pins for camera/location/network/screen-capture do resolve and were left as-is; `expo-file-system` is on a separate version track.)
- **C2 — Unfriend now revokes server access:** `removeFriendship` previously only deleted the friendship edge, so an ex-friend's client could still read the other's `encryptedProfiles`, `encryptedPosts`, and `presence` via the Firestore `recipientAuthUids` / `viewerAuthUids` mirrors (rules authorise reads on those arrays). Unfriend now also strips each party from the **other's** owned profile, post, and presence mirrors (`revokeFriendDataMirrors` + `revokeOwnedPostRecipients`, both directions, never removing a party from its own docs). The shared 1:1 conversation is intentionally left intact (mutual history both sides already hold; new sends are already blocked by `assertAcceptedFriendship`). Best-effort — never fails the unfriend. **Requires Cloud Functions deploy.**
- **C3 — Sync watermark no longer skips failed decodes:** the message and post sync watermark advanced to the newest *successfully* decoded item even when an older item in the same batch failed to decrypt, so the next pull started past it and the failed message/post was **lost permanently**. New `nextSafeWatermarkMs` caps the watermark just below the earliest failed item so it is retried (applied to all three message sync sites in `sync.ts`/`decodeMessageBatch.ts` and both post-pull sites in `pullEncryptedPosts.ts` + `MainApp.tsx`). The post path previously refused to advance at all on any failure (re-fetch loop) — now it advances safely up to the first failure.

### Fixed (May 2026 test round — broadcast routing, one-account-per-email, profile cache, add-friend feedback, push, unread badges)
- **Broadcast routing:** Incoming Broadcast messages now always land in a **dedicated broadcast chat card** instead of being folded into the 1:1 DM with the sender. The inbound resolver (`resolveInboundDirectMessageTarget` / `resolveIncomingDirectChatId`) no longer collapses multi-party `bc_*` (broadcast) and `grp_*` (group) conversation ids into the canonical `dm_*` thread. Outgoing broadcasts now carry `isBroadcast` + `broadcastTitle` in the E2EE payload so the recipient's card shows the sender's title with a 📣 avatar (`decodeIncomingEncryptedMessage`). Starting a 1:1 chat from a profile still opens the existing DM. **Both sides are tagged:** the sender creates the thread with a `bc_*` id + `kind: "broadcast"`, the receiver derives the same tag from the `bc_` prefix (works even for payloads without the flag), the `kind` persists through local cache + sync, and `mergeMissingChatsIntoState` will upgrade an existing row to `broadcast` if one ever pre-existed as standard — so a broadcast can't get stuck rendering as a 1:1.
- **One account per email:** Client uid derivation now **canonicalizes** the email (`canonicalizeEmail` in `backendBridge.ts` — strips `+tag`, removes Gmail dots) so mailbox aliases map to one account. Backend `claimDeviceSession` additionally writes an authoritative `emailAccounts/{hash}` registry and rejects a second uid claiming the same mailbox with **`already-exists`** (surfaced as an "Account already exists" alert). Prevents the multiple-accounts-per-inbox bug.
- **Profile card cache:** New per-email `profileCardCache` (name/bio/avatar) persists every opened profile (`app/lib/profileCardCache.ts`), kept in step with the roster and cleared with the rest of the local social cache. Friend profiles render from the cached card when offline; posts/media show **"Not connected to internet"** (new `isOnline` network state via `expo-network`).
- **Add Friend feedback:** A successful add now reliably plays the happy chime (fixed a stale-closure bug that skipped the sound) and fires a celebratory vibration pattern; audio is set to play in iOS silent mode. Failure paths stay silent.
- **Push notifications:** Client registers an Android high-importance **`messages`** notification channel and falls back from Expo push token → native device (FCM) token; backend push payloads now target the `messages` channel. **Setup still required** for delivery on standalone APKs — see `RUN_MVP_LOCALLY_AND_ON_PHONE.md` (EAS `projectId` for Expo push, or `google-services.json` + FCM credentials).
- **Unread badges + row highlight:** The top nav chat icon shows a red count badge of chats with unread messages (`HomeTopNavBar` `badges` prop). Unread is now a single source of truth — `unreadChatIdSet` (chats whose latest visible, non-self message arrived after the viewer's `readBy` watermark; the open chat and muted chats excluded) drives both the badge count and **per-row highlighting** on the home chat list: unread rows show a **bold name + bold/darkened preview** and a small accent **unread dot**. Opening a chat clears both immediately (optimistic local read watermark).

### Added (Tier B Phase 1 — encrypted chat/feed media — May 2026)
- **Tier B media model:** New chat messages and feed posts upload **ciphertext** to Firebase Storage (`encrypted-media/{authUid}/*.enc`). Per-blob keys (`mediaKeyB64`, `mediaNonceB64`, `mediaObjectPath`, `mediaTier: 2`) live inside the existing E2EE JSON payload — not in plaintext Storage metadata.
- **Display:** Client decrypts to an app-cache `file://` URI (`resolveTierBMediaToFileUri`) for chat bubbles, shared-media grid, and feed cards. **Legacy Tier A** posts/messages with HTTPS `mediaUri` / `imageUris` still render unchanged.
- **Out of scope (Phase 1):** Profile pictures and bios remain **Tier A** (`users.profilePictureUrl`, `users.bio`). **Tier B+** (encrypted bio + avatar in `encryptedProfiles`) is planned later.
- **Dependency:** `expo-file-system` (legacy cache API) for decrypt-to-disk cache.

### Fixed (profile bio persistence — May 2026)
- **Canonical bio store:** Profile bios now use **`users.bio` only** via `upsertUserProfile` (same as username and profile picture URL). Bio edits no longer go through `putEncryptedProfile`, which was causing sign-in races and empty overwrites.
- **Self bio:** Hydrated from server + AsyncStorage (`profileBioStorageKey`) on sign-in; debounced `upsertUserProfile` after `backendSessionReady`; multi-device refresh via periodic `getUserProfiles` self pull.
- **Friend bio:** Boot sync and roster merges keep prior bio when server returns empty (`mergeProfileBio`).

### Fixed (historical feed posts + friend profile cache — May 2026)
- **New friendship feed gap:** Posts were encrypted only for friends at publish time, so pre-friendship posts never reached a new friend. When the roster detects a new accepted friend, each device now re-encrypts **its own** owned posts for the current friend list (`listMyOwnedEncryptedPosts` + `updateEncryptedPost` with full `recipientUids` / `recipientAuthUids`). The other side picks up shared posts via the existing `encryptedPosts` listener + a full feed pull.
- **Friend profile tap offline:** Opening a friend profile no longer blocks on a live `getUserProfiles` call when cached name/avatar exist (persisted social blob + roster). Uncached + offline shows an explicit **Profile unavailable** alert instead of a silent no-op.

### Changed (boot splash + feed scope — May 2026)
- **Splash:** Dismisses after Firebase auth resolves, per-email **AsyncStorage** cache hydrate, and the 500 ms minimum — **`claimDeviceSession` / key publish / profile upsert** run in the **background** after `setSignedIn(true)` (no longer block `applySignedInAccount`). Send/post until `backendSessionReady` may show connection retry UI; cached feed/chats paint immediately.
- **Home feed:** First page and realtime listener capped at **3** posts; scroll expands the UI window (+5 cards) then loads **30** older posts per server page (`ENCRYPTED_POSTS_PAGE_SIZE`). Profile grids still pull up to **80** on open (with periodic full reconcile). Posts Firestore listener attaches **only on home → Feed** (not Chats tab or profile).

### Changed (Firestore read cost — May 2026)
- **Messages:** Global collection-group listener capped at **40** recent docs (was 1000); **per-conversation** listener while a chat is open; removed duplicate boot pull on listener attach; foreground callable pull every **90s** (was 12s); active chat uses thread pull every **45s** (was 4s global poll).
- **Posts:** Home listener **10** docs (feed tab only); home callable pull incremental unless pull-to-refresh; profile open uses up to **80** with 20+ min full reconcile (fixed bug that forced full catalog on every feed visit).
- **Comments:** Hydrate private threads **once** when feed/profile posts change — removed **6s × 25 posts** polling.
- **Profiles:** Background `getUserProfiles` refresh every **5 min** (was 30s).

### Fixed (post delete Storage cleanup — May 2026)
- **`createEncryptedPost`** stores `storageObjectPaths` (`encrypted-media/{authUid}/…`) for each uploaded image/video/poster; **`deleteEncryptedPost`** deletes those Firebase Storage objects after removing the Firestore post (best-effort; legacy posts without paths are unchanged).

### Fixed (refriend DM send blocked — May 2026)
- **Unfriend → refriend:** Opening the old identity-locked chat from the list no longer lands on **Cannot message this account** when the friendship is live again — `goToChat` routes to the active `dm_*__live` thread (or creates one). **Start chat** from the composer uses the same path. Unfriend only locks canonical history rows, not `__live` threads.

### Fixed (Read QR false “offer withdrawn” — May 2026)
- **Show QR / Read QR toggle:** Switching to **Read QR** without an active QR on **this** phone no longer runs a full pairing abort or leaves `pairingHandshakeCancelled` set — that flag was discarding a successful phase-1 scan while the host already saw the confirm card. Status copy is **Ready to scan.** (not “Host QR offer withdrawn”). Toggling away from **Show QR** on the **presenter** phone still cancels that device’s minted offer.

### Changed (Read QR authenticate screen — May 2026)
- **After QR scan:** camera closes immediately; full-screen **Authenticating** (spinner) until the confirm card appears (no frozen camera / “Verifying QR and proximity” copy).

### Fixed (Read QR stuck on “Verifying…” — May 2026)
- **Scanner confirm UI:** After phase-1 `confirmNfcPinPairOffer` succeeds, return preview/minimal profile immediately so Read QR reaches the confirm card when Show QR does; `getUserProfiles` hydrate is capped (8s) and no longer blocks indefinitely.
- **Scan cancel paths:** Stale or aborted scans release the camera freeze instead of leaving “Verifying QR and proximity…” forever.
- **GPS:** `getCurrentPositionAsync` for pairing capped at 12s so proximity collection cannot hang silently.

### Changed (Add Friend dual-confirm copy — May 2026)
- **Confirm prompt:** **Confirm adding {name} as friend?** (uses the other user’s display name).

### Fixed (Add Friend dual-confirm idle timeout — May 2026)
- **45s idle on confirm card:** If **neither** phone taps **Confirm** or **Cancel** within **45s** after the dual-confirm screen appears (server still `awaiting_redeemer_confirm`), the offer is cancelled and the UI shows **Add friend timed out**. Does not fire once either side has confirmed (waiting path keeps its own 45s rule).

### Fixed (Add Friend dual-confirm wait copy — May 2026)
- **Dual-confirm:** After either phone taps **Confirm**, both see **Waiting for your friend to confirm…** on the overlay until friendship is created (Show QR was previously generic “Finishing add friend…”).

### Fixed (Add Friend dual-confirm — May 2026)
- **Two-sided confirm:** Scanner (Read QR) must call **`confirmRedeemerNfcPinPairOffer`** on Confirm; issuer **`finalizeNfcPinPairOffer`** now requires **`redeemerConfirmed`** — friendship is not created when only the Show QR user confirms.
- **Read QR confirm UI:** Profile hydration falls back to **`previewNfcPinPairOffer`** when `getUserProfiles` fails so the joiner still reaches the dual-confirm screen after phase-1 scan.
- **Read QR freeze:** On valid scan the camera **stays on the QR frame**, barcode events stop, and a **Processing scan…** overlay shows (normal QR-reader behavior) while proximity runs; stale duplicate reads are ignored. No full-screen swap away from the camera during verify.
- **Status poll:** `getNfcPinPairOfferStatus` exposes `awaiting_redeemer_confirm` vs `awaiting_issuer_confirm`; issuer redeem poll accepts both after phase 1.
- **Deploy:** `firebase deploy --only functions` (new **`confirmRedeemerNfcPinPairOffer`** callable).

### Fixed (opaque token Add Friend regression — May 2026)
- **Pairing profile preview:** `getUserProfiles` and client hydration now accept **opaque 32-hex** offer ids (not only legacy 4-digit `pairingPin`). Without this, the scanner could not load the issuer profile during dual-confirm and the joiner often never reached a stable **Confirm** screen.
- **Joiner confirm poll:** session-presence polling runs on the **issuer** only; the joiner no longer gets kicked to idle by a false “session gone” race when the host finalizes first.

### Fixed (Add Friend dual-confirm + tombstone titles + presence — May 2026)
- **Add Friend:** issuer **Confirm** no longer hidden when **Show QR / Read QR** toggle does not match host role; removed **30s** auto-cancel on the dual-confirm screen (was aborting sessions while the other phone was still confirming).
- **Chat titles:** list + open chat use **User** whenever `resolveParticipantDisplay` reports `canOpenProfile: false` (ex-friend / identity lock), not only when `identityLockedChatIds` is set locally.
- **Unfriend:** local tombstone + identity lock apply **before** server `removeFriendship`; roster listener no longer briefly clears `unfriendedIds` while the friendship doc still exists (sticky unfriend).
- **Presence:** `registerFirebaseAuthUid` again marks the device **active** after auth registration (restores online while still friends when client heartbeat lags).

### Fixed (delete post sync — May 2026)
- **Feed delete:** opening feed/profile always runs a **full post catalog** pull so friends drop posts removed via **`deleteEncryptedPost`**; delete removes the post locally (not only `deletedAt`) and blocks delete while a `p-*` optimistic id is still publishing.

### Changed (feed mute UX — May 2026)
- **Mute picker:** **24 hours** first, then **1 week**, then **Mute until unmuted** (removed 1-month). **Friends list:** muted friends keep the **volume-mute** avatar badge; **long-press** a muted friend opens **Unmute feed** only.
- **Persist feed mutes:** per-email AsyncStorage (`mvpplus.feedMutes.v1`) — survives sign-out and cold start (timed mutes pruned on load).

### Fixed (feed hold-to-react — May 2026)
- **Feed posts:** long-press on **photos and video** opens the reaction picker (was only wired on caption/header).

### Changed (Add Friend toggle — May 2026)
- **Show QR / Read QR** switch track uses a lighter muted-accent wash in **dark mode** (`${accent}66`) for green and pink themes; light mode unchanged (`${accent}1F`).

### Added (photo editor undo — May 2026)
- **Undo** in the photo editor toolbar (draw, text, filters, rotate, crop, clear overlays).

### Changed (photo editor crop + filters — May 2026)
- **Pick → editor:** photos open `PhotoEditorModal` directly; **Crop** launches `expo-dynamic-image-crop` from the editor toolbar (not before the editor).
- **Filters:** horizontal strip — white labels on black pills above preview icons, swipe like online friends; tool icons scroll horizontally.

### Changed (opaque pairing token — May 2026)
- **Add Friend:** server mints **128-bit hex** offer tokens; QR uses `AFQR2|<token>`; NFC uses `PN2|<token>`. Legacy `AFQR1` / `PN1` four-digit codes still parse. Deploy **`registerNfcPinPairOffer`** (and related) Cloud Functions before testing on device.

### Fixed (Add Friend QR toggle + chat long-press — May 2026)
- **Show QR / Read QR:** switch stays enabled after showing a QR code; toggling aborts the host scan session so you can switch to Read QR while waiting.
- **Add Friend switch (dark mode):** lighter track (`rgba(255,255,255,0.32)`).
- **Chat long-press:** one sheet — emoji reactions + **Reply** on any message; **Edit** / **Unsend** only on yours (removed separate actions menu; AppDemo aligned).

### Added (expo-dynamic-image-crop + open source licences — May 2026)
- **Photo flow (Option B):** `expo-dynamic-image-crop` runs after gallery/camera pick and before `PhotoEditorModal` for profile, post, and chat photos (MIT; `react-native-gesture-handler` in `index.tsx`).
- **Settings → Open source licences:** attribution screen (`app/lib/openSourceLicenses.ts`, `OPEN_SOURCE_LICENSES.md`).

### Changed (Read QR, chat reactions, nav bar, photo editor — May 2026)
- **Read QR:** system permission on first open; in-app camera card only when permission is denied.
- **Chat long-press:** reactions plus **Reply** (and **Edit** / **Unsend** on your messages); Android nav bar theme on picker modals.
- **Top nav:** evenly spaced icons (`space-evenly`).
- **Photo editor:** exclusive tools (crop/draw/filters); stable canvas when drawing; vertical filter list; themed tool buttons.

### Fixed (Gallery index sync + keyboard pinning — May 2026)
- **Photo gallery:** Fullscreen media uses the same **horizontal swipe** pager as feed/post carousels; opening from slide *N* and swiping in fullscreen restores slide *N* when you close.
- **Keyboard:** Scroll fields pin above the keyboard (`useScrollPinnedInput`); **Android back** dismisses the keyboard before other back actions.
- **Bugsweep:** Tap-to-fullscreen uses the tapped slide index (not stale carousel state); fullscreen gallery no longer dedupes URIs (index parity); gallery index clamped when post image count shrinks; `onScrollEndDrag` sync on feed + fullscreen pagers; keyboard pin retries after keyboard height is known; `keyboardInputScroll` TypeScript import fix.

### Fixed (Profile bio keyboard + login OTP buttons — May 2026)
- **My profile bio:** Bio editor scrolls into view above the keyboard (`keyboardInputScroll` helper); profile scroll adds keyboard bottom padding; `KeyboardAvoidingView` enabled while the keyboard is open.
- **Login OTP:** **Request OTP code** is left (requests OTP); **Verify OTP** is right (validates then signs in). Help text matches that order.

### Fixed (Feed gallery fullscreen + photo editor footer — May 2026)
- **Feed photo gallery:** tapping a photo in a multi-image post opens **fullscreen photo** (not the post viewer) with **prev/next** chevrons and **1/N** counter; `onOpenMedia` now forwards `galleryUris` / `galleryIndex` from all feed/profile `FeedPostCard` surfaces.
- **Photo editor:** **Continue** / **Post** footers sit in a **bottom safe-area** region with extra Android lift so buttons clear the gesture/nav bar.

### Changed (Feed new post + top nav — May 2026)
- **Feed:** removed bottom **New post** bar; compose opens from the **create** (pencil) icon at the **top-left** of the home nav bar.
- **Publish post:** keeps the shared top nav; **create** icon is highlighted on the create screen.
- **AppDemo:** same nav + feed FAB removal + fullscreen photo gallery parity as MainApp.
- **Nav order:** left — New post, profile, friends, chats, feed, add friend; right — **settings** (second from right), **logout** (rightmost). Shared `HomeTopNavBar` on home, settings, profiles, friends list, add friend, and publish post.

### Fixed (Chat "User" title flash + Add Friend switch — May 2026)
- **Chat names:** Firestore friendship listener no longer publishes an empty server-friend set on startup/cache races (that forced direct chats to show **User** until the next snapshot). Display resolution also trusts local friend links when the server set is briefly empty.
- **Add Friend switch:** Thumb always **theme accent**; track always **muted accent** (`${accent}1F`). Role toggle locks while QR presenter session / scan / confirm is active.

### Fixed (Add Friend pairing lifecycle + theme — May 2026)
- **Pairing abort:** `abortPairingSession` invalidates background QR redeem, cancels PIN, and clears confirm state on Android back, screen unmount, Share→Join role switch, and explicit cancel.
- **Read QR:** scan verification keeps the camera visible (no `awaitPairing` full-screen wait); confirm finalize uses an overlay on the dual-confirm UI.
- **Confirm UI:** gated by active role vs `pendingVerifiedSource` so the wrong tab cannot show a stale confirm card.
- **Theme:** primary actions use `theme.accent` (`primaryButton`); active nav pills use muted accent (`${theme.accent}1F`).
- **Photo editor:** Android hardware back exits crop first (`cropExitTick` / `onCropModeChange`).
- **AppDemo:** Add Friend screen matches MainApp theme (background + accent buttons/pills); `BackHandler` added for common stacks.

### Fixed (Chat reactions not appearing — May 2026)
- **`mapServerReactionsToLocal`:** optimistic reactions stored under local `me` were dropped when rendering counts; mapper now treats `me` like the signed-in user so pills appear immediately and toggle-off works.

### Fixed (Show QR, media corners, profile feed — May 2026)
- **Show QR:** no longer switches to the pairing-wait screen (QR appears as soon as the PIN registers); redeem poll runs in background; button stays tappable after use.
- **Profile / shared media grids:** rounded tile corners (`borderRadius: 10`).
- **Profile posts:** full-bleed `FeedPostCard` layout like home feed.
- **Chat photos/videos:** rounded corners, `cover` fill (no letterbox padding); feed stays square-edged.

### Changed (Add Friend theme + Read QR UI — May 2026)
- **Add Friend:** white/black background like other screens; nav icons use theme accent; primary buttons match app `primaryButton` style.
- **Read QR:** removed small status text under the camera preview (processing overlay only).

### Fixed (Chat photo sizing — May 2026)
- **Chat photos:** inline size follows image aspect (width-led, height capped); no `contain` letterboxing or divider padding; bubble is not forced square.

### Fixed (Feed square media + debug APK variant — May 2026)
- **Debug APK:** `apk:debug` now bundles **MainApp** (not AppDemo) unless you run `apk:debug:demo`; earlier debug builds ignored feed UI fixes.
- **Feed corners:** media moved outside the post `Pressable` (no rounded clip); `overflow: visible` on media wrappers; shared `postFeedImageSlide` style with `borderRadius: 0`.

### Fixed (Media UX follow-up — May 2026)
- **Full-screen media:** `FullscreenMediaViewer` is an absolute black overlay (not an Android centered `Modal` popup).
- **Chat video replay:** nested `Pressable` no longer swallows taps after finish; `playbackKey` remount + `restartOnPlay`; inline video uses `contain`.
- **Feed media:** explicit `borderRadius: 0` on feed image/video wrappers; width-fit `contain` heights from aspect ratio.
- **Photo editor:** crop uses live `Image.getSize` dimensions; preview **Back** / **Send** buttons enlarged; Android nav bar colors synced to theme on all editor steps.
- **Android back:** hardware back clears post/comment reaction picker targets, dismisses fullscreen post thread reply focus, and chat search.

### Changed (Media UX, voice preview, Android back — May 2026)
- **Chat video:** inline play → tap again for full-screen; replay after finish; `VideoWithFadeControls` progress bar with auto-fade.
- **Chat photos / shared media grid:** true full-screen viewer (`FullscreenMediaViewer`); shared media hook includes `chatSharedMedia` screen.
- **Feed:** tap media inside post viewer for full-screen; square full-bleed feed media.
- **Voice notes:** record → preview (play / discard / send) before posting.
- **Photo editor:** full-width canvas, `contain` + letterbox-aware crop, rotation layout fix.
- **Android:** `BackHandler` mirrors modal close and screen back stack.

### Fixed (Feed list layout jump / “vibrating” posts, May 2026)
- **Stable feed rows:** `FeedPostCard` moved to a memoized module component (was redefined inside `MainApp` every render, remounting all posts).
- **Image height:** aspect ratio is preloaded and cached per URI; height no longer changes after `onLoad` once set.
- **Reactions:** feed cards always reserve space for reaction pills so counts syncing in do not shift the card.

### Fixed (App closing / crash on sign-in, May 2026)
- **`presenceRosterKey` hook order:** `usePresenceHeartbeat` referenced `presenceRosterKey` before `useMemo` defined it (`ReferenceError` / hard crash on MainApp render after sign-in). Roster key memos now run before the presence hooks.
- **Message listener:** Firestore snapshot handler wrapped in `try/catch` so merge/decode failures log as sync errors instead of an unhandled rejection.

### Changed (Feed comments + delete chat title, May 2026)
- **Feed:** removed home-feed comment row; tap post → fullscreen with thread list + **Add comment ...** input (friends); owners reply via **Reply** on a comment.
- **Delete chat:** long-press actions sheet uses resolved friend display name instead of stale `chat.name` (`u_*`).

### Changed (Reactions + feed media layout, May 2026)
- **Reactions:** removed feed **+** react buttons; **press and hold** on posts, comments, and chat bubbles opens the emoji picker (chat picker still links to Reply / edit / unsend).
- **Feed media:** post images and video render **full feed width** with height from aspect ratio (`cover`), not fixed-height letterboxed boxes.

### Fixed (Friends not showing online — poll + UI mapping, May 2026)
- **`getFriendPresence`:** honors `presence.online` and normalizes `heartbeatAtMs` (number or Timestamp) so Console “online” matches callable results.
- **Client:** same heartbeat normalization for Firestore listener + poll fallback; friend roster `u_*` ids map into `applyPresenceToFriends` via `serverAcceptedFriendBackendUids`.

### Fixed (Friends not showing online, May 2026)
- **Presence poll:** uses server-accepted friend uids from boot + Firestore roster, not only hydrated local rows.
- **Roster repair:** when friends load or change, re-runs `registerFirebaseAuthUid` + immediate `getFriendPresence` poll (fixes boot race where poll ran with zero friends).

### Fixed (Delete chat hid all future DMs with that friend, May 2026)
- **Delete tombstone:** hiding a `__live` thread no longer adds the canonical `enc_dm_*` server id (deleted canonical thread still stays hidden forever).
- **New chat after delete:** opening a 1:1 with a friend whose canonical thread is server-hidden creates/uses a `dm_*__live` row and `enc_dm_*__live` sync path instead of reusing the hidden canonical conversation.
- **Chat list:** last-message preview aggregates per thread so new live rows appear when messages exist; local hide on delete no longer blocks unrelated `__live` rows.
- **Cold start after delete:** `openDirectChat` / `findActiveDirectChatForFriend` now honor **persisted** local hide (`hiddenChatIds`), not only the in-memory server tombstone set (which was empty until `getHiddenConversationIds` returned).
- **Inbound sync:** encrypted pull + listener decode redirect messages on a hidden canonical `enc_dm_*` onto the active `dm_*__live` row (or allocate one) instead of dropping them; boot restore seeds canonical `enc_*` tombstones from persisted local hide ids.

### Fixed (Username wiped to null on app reopen, May 2026)
- **`upsertUserProfile`:** only updates `username` when the client sends a non-empty value — boot/profile sync no longer writes `null` over Console edits or saved names.
- **Client:** `usernameForProfileUpsert` prefers persisted + server username; never persists placeholder `"User"` to AsyncStorage.

### Fixed (Presence offline + messages show Sent but not received, May 2026)
- **Presence:** `registerFirebaseAuthUid` now writes a fresh active heartbeat (`writePresenceWithViewers`), not only `viewerAuthUids`; also merges friend auth onto the registrant's presence doc so friends can see them online.
- **Messages:** Firestore listener no longer applies the global pull watermark (was skipping new inbound DMs); boot pull runs when the listener attaches; background pull every 12s while the app is active; `participantAuthUids` backfill uses merge writes; send path re-resolves auth UIDs on each message doc.

### Fixed (Friend shown as "Friend" instead of username, May 2026)
- **`getUserProfiles`:** no longer defaults missing `users.username` to the literal string `"Friend"`; uses `User {uid-prefix}` like boot roster fetch.
- **Client:** `friendDisplayNameFromProfile` strips the legacy placeholder everywhere friends and DM rows are built.

### Fixed (Presence & chat delivery — root cause, May 2026)
- **Message ingest:** existing DM threads are never dropped when the server friends set is stale or partial (`knownChatIds` checked first; local roster `backendUid` trusted as fallback).
- **Presence listener:** `registerFirebaseAuthUid` adds the new Firebase Auth UID to each accepted friend’s `presence.viewerAuthUids` so the other phone’s `onSnapshot` can see online state without waiting for the next heartbeat.
- **Message listener:** recent message docs get `participantAuthUids` backfilled on auth registration so Firestore rules allow real-time reads.
- **Pairing:** friendship finalize refreshes presence viewer lists for both uids; issuer publishes active presence after PIN pair completes.
- **Deploy required:** `firebase deploy --only functions,firestore:indexes` then `npm run apk:release` on **both** phones.

### Changed (Canonical workspace, May 2026)
- **App Final V3** (`C:\Users\dunca\OneDrive\Desktop\App FInal V3`) is the sole implementation workspace; planning docs, Cursor rules, and README updated from legacy `App Final` path.
- **Git remote:** [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final) — initialize and push from V3 when ready.

### Fixed (Bug audit v4 — messaging sync & display, May 2026)
- **Edits (C1/C2):** Firestore listener re-decrypts edited messages; incremental pull also queries `editedAt > sinceMs`.
- **Chat open (H6):** `listConversationMessages` pull (limit 500) when a thread is opened.
- **Reactions (H4):** Chat pills friend-filtered like comments.
- **Send (H7/M2):** Per-chat outbound queue; failed delivery label after timeout.
- **Presence (H8):** Auth UID registration refreshes `viewerAuthUids` without forcing online.
- **Display (M5):** Empty server friend list shows **User** until roster is confirmed.
- **Deploy:** `firebase deploy --only functions,firestore:indexes` + new APK on both phones.

### Changed (Post reactions & owner comments, May 2026)
- **Comment reactions:** press and hold on a comment (no + button); shared reaction picker.
- **Post react control:** + FAB anchored bottom-right on post image, video, or caption-only text.
- **Owner post viewer:** all comment threads expanded; each friend’s top comment is the root with replies indented below.

### Fixed (Comments, crop, delivery, username, May 2026)
- **Comment layout:** fullscreen threads show name, text, then timestamp (no duplicate author·time + body).
- **Comment persistence:** optimistic comments survive `hydratePrivateThreadForPost` until the server echoes them; thread replies get optimistic rows too.
- **Photo editor:** interactive crop rectangle (drag corners, pinch to resize, **OK** to apply); preview/footer labels **Back** / **Send** / **OK** replace arrow icons.
- **Reaction pills:** sit slightly lower on bubble corners so they do not overlap message text; feed pills include your own reaction.
- **Chat delivery:** inbound DMs are not dropped while the friends allow-list is still empty on cold start (`messageIngestPolicy`).
- **Message edits:** Firestore `modified` docs with `editedAt` re-decrypt instead of metadata-only skip.
- **Identity-locked DMs:** chat title stays **User** (no `friendMap` name leak).
- **Username:** `claimDeviceSession` / `upsertUserProfile` prefer persisted signup name over email-local server defaults.
- **Long-press chat:** opens Reply / React / Edit / Unsend sheet again (not reactions-only).

### Fixed (Chat title, reactions UX, sending label, May 2026)
- **Chat header "User":** trust local friend `displayName` when server allow-list is empty or still backfilling; new DM rows use friend catalog name from online strip.
- **Reactions:** small **+** on feed posts and comments; **press and hold** opens picker; existing reactions render as a **small pill attached to the bottom** of chat bubbles, comments, and posts (not a separate wide row).
- **Sending… stuck:** mark **Sent** per message as each `sendEncryptedMessage` succeeds; server echo in sync also clears `sending`; 90s timeout clears stale label.

### Added (Bug audit v4, May 2026)
- **`Planning/BUG_AUDIT_MAY2026_V4.md`** — static review: message edit sync (critical), message actions regression, identity-locked title leak, feed/chat reaction filtering, sync caps, send queue.

### Fixed (Friend online / presence regression, May 2026)
- **`registerFirebaseAuthUid`** now refreshes `presence` `viewerAuthUids` server-side so friends can see you in the Firestore listener as soon as auth maps land.
- **Session init** awaits `publishActivePresence` after a successful auth registration (not only fire-and-forget).
- **Presence listener** re-subscribes when Firebase Auth uid becomes available (`onAuthStateChanged`).
- **Boot sync** triggers immediate publish + `getFriendPresence` poll when `initialServerSyncDone` (no 8s wait).
- **Friendship listener** resolves legacy `participants` Firebase Auth ids to `u_*` for roster + presence friend keys.
- **Deploy:** `firebase deploy --only functions` + `npm run apk:release` on both phones.

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
