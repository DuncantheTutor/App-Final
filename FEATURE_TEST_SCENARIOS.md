# Feature Test Scenarios (MVP Prototype)

## Jun 2026 — cold start / inbox load (performance)

- **Feed land:** Home → **Feed** shows at most **3** posts on first paint (cached or server); scroll loads more.
- **Chats land:** Home → **Chats** list paints from cache; opening a thread shows at most **7** recent messages first; scroll-up fetches older pages.
- **Upgrade from encrypted-cache build:** Sign in after installing this APK — chats/posts still restore; first read may briefly migrate legacy `enc1:` storage keys to plaintext (no user action).
- **Many dormant threads:** Account with 20+ old chats — cold start must not freeze for tens of seconds decrypting a giant messages blob; only **visible** inbox rows keep message bodies in RAM (7 each).

- **Chat keyboard:** Composer should sit just above the keyboard — **no large empty gap** (Android: resize only; iOS: KAV padding).
- **Post carousel:** Multi-photo posts keep **all slides** after Tier B resolve; a failed decrypt must not remove a slide.
- **Post comments:** On a **friend's post**, type in Add comment → send enables and posts live. On **your post**, tap **Reply** on a thread first, then send.

## Jun 2026 — testing fixes (5 Jun)

- **Chat keyboard:** Open a 1:1 chat → focus the message field → keyboard must **not** cover the composer (Android + iOS). Repeat on **fullscreen post comment** field and **Publish post** caption.
- **Post comments live:** Open a post fullscreen → send a comment → it appears in the thread **immediately** (no leave/return).
- **Reactions horizontal:** Multiple emoji types on a post/comment/message appear in **one horizontal pill**, not stacked vertically.
- **Remove reaction:** Long-press → **Remove reaction (emoji)** in picker, or tap your current emoji again → reaction clears.
- **Read receipts:** On your sent messages, small read avatars align with the **right screen edge** below your avatar; incoming reads align left under their avatar.
- **Push:** After rebuild, grant notifications → send chat from other phone → heads-up within ~1–3 s (`POST_NOTIFICATIONS` required on Android 13+).

## Jun 2026 — new friend profile + notifications

- **Two phones:** complete Add Friend (QR/NFC dual confirm). Within seconds, each side can open the other's **friend profile** (name + avatar, not blocked tombstone).
- **Cold start (both phones):** force-quit and reopen 2–3 times over the next minute — chat list and online strip must show the **real display name**, not **User**, once roster sync completes.
- **Push (both phones):** notification permission granted, push credentials configured (`RUN_MVP_LOCALLY_AND_ON_PHONE.md`). Background phone B → A sends a chat message → B gets a heads-up within ~1–3 s; same for A receiving from B. Requires **Functions deploy** (`listMyFriends` change) + new APK on both devices.

## May 2026 bug-sweep criticals

### C1 — App builds and Tier B media works
- `npm run typecheck` passes with **no** `expo-file-system/legacy` error; `expo-file-system@19.0.21` installed (not `^55.x`).
- Sending/receiving an encrypted chat image/video and an encrypted feed post with media renders correctly (Tier B decrypt-to-file path), not a bundling error.

### C2 — Unfriend revokes server-side access (requires Functions deploy)
- A and B are friends. A unfriends B. On the **server**: B's Auth UID is removed from A's `encryptedProfiles`/`presence` and from `recipientAuthUids`/`recipientUids` of every post A owns (and symmetrically for A on B's docs).
- After unfriend, B's client can no longer read A's profile, posts, or presence via the direct Firestore listeners (and vice-versa). New messages between them remain blocked.
- The existing 1:1 chat history is **not** wiped (both sides keep their mutual copy); the thread tombstones as before.
- Unfriend still succeeds even if the mirror-revocation step errors (best-effort).

### C3 — Sync never skips a message/post that failed to decrypt
- Simulate a batch where an older item fails to decrypt and a newer item succeeds: the sync watermark must **not** jump past the failed item; the next pull re-fetches and retries it (no permanent gap).
- A permanently-undecryptable item causes bounded re-fetch (not silent loss); newer items still arrive.

## May 2026 test-round fixes

### Broadcast routing (separate card)
- User A sends a **Broadcast** to User B (and others). On B, the broadcast arrives as its **own chat card** (📣, sender's broadcast title) — **not** inside B's existing 1:1 DM with A.
- B's existing 1:1 chat with A still shows only direct messages; broadcast messages never appear there.
- Tapping **Start chat** from A's profile (or the friends list) still opens/creates the normal 1:1 DM.
- A subsequent broadcast from the same sender lands in the same broadcast card (stable id), not a new duplicate card.

### One account per email
- Sign up with `name@gmail.com`, then try to create another account with `n.ame@gmail.com` or `name+test@gmail.com` → resolves to the **same account** (aliases canonicalized); no second account is created.
- A second device/client claiming an email already owned by a different uid is rejected with an **"Account already exists"** alert (backend `already-exists`).

### Profile cache offline
- Open a friend's profile while online (caches name/bio/avatar). Go offline (airplane mode) and reopen → the **name, bio, and picture still render**; posts/media area shows **"Not connected to internet"** and status reads the same.
- Cold start while offline: a previously-opened friend's profile still shows the cached card.

### Add Friend feedback
- Completing an add (NFC/QR dual-confirm) plays a **happy chime** and a **celebratory vibration**; failures stay silent. Chime plays even with the iOS ringer on silent.

### Unread badges
- Receiving messages in 2 different chats shows a red **2** badge on the top-nav chat icon across screens (home/feed/profile/add-friend).
- Opening one of those chats drops the badge to **1** immediately; muted chats never contribute to the count; your own sent messages don't count.
- **Broadcast read persistence:** As a broadcast **recipient**, open a broadcast, read all visible messages (general broadcasts + any direct replies to you), force-quit the app, reopen — the broadcast row must **stay read** (no bold title/preview, no unread dot, no chat nav badge). Private replies the broadcaster sends to **other** recipients must **not** mark your broadcast unread. **No flash:** reopening the app must not briefly show a red chat nav badge or unread dot on already-read broadcast rows while the session initializes.
- When a friend **reacts to your post**, you get a push notification (`{username} reacted to your post`, body = emoji) and a red badge on the **feed** nav icon (count = posts with unseen reactions). Opening the **Feed** tab clears the badge once reactions are visible.

### Push notifications
- With push credentials configured (see `RUN_MVP_LOCALLY_AND_ON_PHONE.md`), a backgrounded phone receives a heads-up notification on the **messages** channel. **Chat (1:1):** title is **`New message from {sender’s username}`** — must **not** show your own name (“me”). **Chat (group):** title is **`New message from {group title}`** when the group has a custom name, else `Group chat`. Body is a single preview line (message text up to 120 chars + ellipsis, or `Photo` / `Video` / `Voice note` / `GIF`). **New post:** title **`New post from {username}`**, body `{username} shared a new post`. **Post reaction on your post:** title **`{username} reacted to your post`**, body is the emoji. Tapping a chat notification opens the thread; tapping a post/reaction notification opens **Feed** and refreshes posts. Plaintext previews are composed client-side before encrypt; server never decrypts payloads (1:1 title also resolved from `users.username` on send).
- **Push before bubble (latency):** With the app **foreground** (any screen) or after **tapping** a chat notification, the message bubble should appear within **~1–3 s** of the heads-up — not ~30–45s later. Foreground push delivery and resume-from-background both trigger an immediate encrypted pull for that `conversationId` (Firestore listener remains primary; fallback poll is ~12s in open chat, ~25s inbox-wide).

## Chat Metadata Editing

- Long-press group/broadcast chat title -> edit modal opens -> save updates chat row and header title.
- Long-press group/broadcast avatar bubble -> edit picture modal opens -> save updates chat icon.
- Confirm direct chats do not expose title/picture long-press editing.
- Create-chat and broadcast creation screens both expose visible optional title fields.
- If title field is blank, created chat name falls back to selected member names.

## Message Actions

- Outgoing messages (yours): timestamp line may show **` • Sending…`** while the encrypted send runs, then **` • Sent`** after each `sendEncryptedMessage` succeeds (not only after a full batch). Demo builds mark **` • Sent`** immediately when the message is appended. Unsent messages omit delivery labels.
- Open chat from **online friends strip** → header shows the friend's display name (not **User**) when they appear online with a linked `u_*` account.
- Chat screen does **not** render a redundant participant strip under the header; participant identity comes from the chat header/title.
- Presence must be app-active only: a friend shows online only while their app is in foreground and sending fresh heartbeats; backgrounded/closed app should show offline quickly (about 15 seconds).
- **Two-phone online strip:** with both accounts accepted friends and both apps in foreground on Chats, each phone should show the other in the home **online** strip within a few seconds (immediate boot publish/poll + Firestore `presence` listener + 8 s heartbeat). Requires latest Cloud Functions (`registerFirebaseAuthUid` refreshes `viewerAuthUids`; `setMyPresence` heartbeat) and release APK on both devices. You will **not** appear in your own online strip (friends only). **After unfriend**, neither account should show the other as online (`getFriendPresence` requires an accepted friendship).
- **Unfriend tombstone (chat list):** after unfriend, a thread with history stays on the home chat list as **User** (no name flicker). Long-press row still works; opening the thread shows **Cannot message this account**. After **refriend**, tapping that old **User** row must route to the active **`dm_*__live`** thread (working composer), not stay on the locked artifact. **Start chat** / Add Friend also opens or creates the live thread.
- Message order/timestamps must follow backend server-created times after sync (no device-clock reordering between phones).
- Message reactions must persist across encrypted sync refreshes (must not disappear after a few seconds).
- Long-press any message -> actions menu appears.
- Reply to message -> reply banner appears above composer -> sent message shows reply reference.
- **Composer send completeness:** type `Having fun?` (or any message ending in punctuation) and tap Send immediately — the delivered bubble must include the final character(s), matching what was visible in the composer.
- **Composer send stability:** in a 1:1 chat, type any text and tap the send (arrow) button — the app must **not** close, white-screen, or drop to a blank recents card with the keyboard still up; the message appears in-thread (or shows **Sending…** / **Not sent** if offline, never a silent no-op from a JS error).
- **Encrypted on-device cache:** after sign-in, send a chat message and open a Tier B photo/video — force-quit and reopen; data restores from local cache. Sign out → **Settings → reset local data** (or new signup) clears account cache. AsyncStorage values for social keys should begin with `enc1:` (not plaintext JSON) when inspected on a rooted/debug build.
- Reply rendering: replied-to message appears as muted context card; reply appears in normal foreground card.
- **Press and hold to react (chat):** long-press opens one sheet — emoji row + **Reply**; **Edit** / **Unsend** only on your messages (not on a peer’s).
- **Add Friend QR toggle:** after **Show QR Code** on **this** phone, flipping to **Read QR** cancels that minted offer; flipping to **Read QR** when you were not presenting shows **Ready to scan.** (not “withdrawn”). After switching to Read QR, scanning must still reach the dual-confirm card on the scanner; switch track is visibly lighter in dark mode.
- **Opaque pairing token:** **Show QR** mints a server token (QR payload `AFQR2|…`, 32 hex chars); **Read QR** still requires proximity + dual confirm. Both phones must use a build where **`getUserProfiles` accepts the opaque offer id** (deploy functions + new APK). Old `AFQR1|1234` QRs from previous builds may still scan until offers expire.
- **Read QR camera (Jun 2026):** Warm-check on Add Friend; system dialog when switching to **Read QR** or tapping **Try again** on the scanner card. If denied, alert offers **Try again** / **Cancel** (no in-app Open Settings). Re-check before processing a scan. Enable camera manually in system settings if permanently denied, then **Try again**.
- React to message -> a **small reaction pill** attaches to the **bottom edge** of the message bubble (emoji + count); not a full-width row under the bubble.
- Duplicate emoji reactions collapse into one chip + count bubble.
- **React (feed post):** **press and hold** anywhere on the post card (caption, image, or video) opens the emoji picker; no **+** button; reaction pill **attached to bottom** of post card when reactions exist.
- **Feed post media:** images and video span **full feed width** (edge-to-edge within the card bleed); height follows aspect ratio (no side letterboxing). **Multi-image posts:** every slide uses the **same carousel height** — the tallest image after width-fit; shorter images are **vertically centered** with **symmetric top/bottom black padding**. Single-image posts keep their natural height (no extra padding). After images load, post cards **must not** jump or “vibrate” (no height change when reactions sync in; scroll the feed and return — layout stays stable).
- **Feed comments:** no comment row or inline threads on the home feed — **tap a post** to open fullscreen; comment list + editable **Add comment ...** field at the bottom (post owner replies via **Reply** on a thread, then the footer field).
- **React (post comments):** **press and hold** on a comment opens the picker; reaction pill **attached to bottom** of comment bubble; thread replies toggle correctly.
- **Mute friend in feed:** on another friend’s post, tap **⋯** → mute picker order is **Mute for 24 hours**, **Mute for 1 week**, **Mute until unmuted** (no 1-month option). Timed mutes hide that friend’s posts until expiry; **Mute until unmuted** hides until you unmute. Mutes are stored **per signed-in email** in AsyncStorage (`mvpplus.feedMutes.v1`) and survive **sign-out**, cold start, and reinstall (until app data cleared). **Friends list:** muted friends show a **volume-mute** badge on the avatar; **long-press** a muted friend → **Unmute feed** (not the full Start chat / Unfriend sheet). Long-press an unmuted friend → Start chat / Mute feed / Unfriend.
- **Delete chat (home):** long-press chat row → actions sheet title shows the friend’s **display name**, not a raw `u_*` id.
- Long-press own message -> Edit updates content and adds edited timestamp marker.
- Long-press own message -> Unsend replaces body with "You unsent a message."

## Reinstall / new phone (E2EE key backup)

- Deploy functions, install this build, sign in, use chats and feed for ~1 minute (creates key + social snapshot backups).
- Uninstall completely, reinstall, sign in with the **same email**.
- **Expected:** chats and feed visible within a few seconds (cloud snapshot), not after 30s; background sync refreshes afterward.
- **Expected:** no “restore keys” UI; profile picture returns from server/cache.
- **Note:** uninstall wipes on-device AsyncStorage; cloud snapshot + key backup are the reinstall source. Data from before the first backup on that account cannot be recovered.
- **Key restore requires `deviceId`:** `getUserKeyBackup` runs only after `claimDeviceSession` with the same `deviceId` (May 2026 fix). If restore failed on an older APK, the app may have published **new** keys and old server ciphertext becomes unreadable — use the fixed build and sign in once (~1 min) before the next uninstall so a backup exists.

## Media and Voice

- Tap mic once to start recording state; tap again stops recording and prepares voice-note preview.
- After stopping recording, verify preview controls: play/pause, discard, and send.
- Verify sender can listen to voice note before posting.
- Verify sender can **preview** a recorded voice note (play button in the “Voice note ready” banner) through the **loudspeaker** — not silent / earpiece-only on Android.
- Verify posted voice notes can be played by any participant in that chat.
- Tap camera icon and capture photo -> photo message appears.
- Tap gallery button and attach screenshot/image from library -> photo message appears.
- When no composer text is present, photo posts with no default caption/title text.
- When composer has text, same photo posts with caption equal to typed text.
- Photo card should size around photo dimensions instead of fixed padded frame.
- Photo picker/camera image flow should allow native editing before send (platform-dependent tools).
- Tap video icon and record video -> video message appears.
- **Voice notes:** tap the mic in the composer to enter voice-note mode (mic button highlights). The send button becomes a **mic** — tap to start recording; a red **Recording… Ns** strip appears. The send button turns red **stop** — tap to stop; a **preview** banner appears with play, discard, and send (recording is not sent until you confirm). Tap the highlighted mic again to leave voice-note mode without sending. Duration must match the recording (not `0s`); the recipient can play the audio. **Playback UI:** each voice bubble shows a **progress bar** and elapsed/total time while playing (or loading spinner while Tier B audio decrypts). Sender and recipient must both be able to hear sent voice notes after **`npm run apk:release`**.
- **Chat video playback:** a video bubble shows a centered **play** control. Tap once — **Preparing video…** while Tier B decrypt runs, then inline play with a **draggable progress slider** and transport bar that **fades after ~1.5 s**; **tap the video** to show controls again. **Expand** (or full-screen affordance in controls) opens the fit-to-width viewer. When playback finishes inline, the play control returns. Only one in-thread video plays at a time.
- **Failed chat send:** If a message fails to deliver, it stays visible with **Not sent** and **Try again** / **Delete** actions — it must **not** auto-convert to an unsent/removed message. **Tap the failed bubble** (text/photo/video/voice) to retry send without using the row below.
- **Feed reaction realtime (Jun 2026):** While you stay on **home → Feed**, a friend’s new emoji on your post must update the reaction pill without leaving the feed. **Requires new APK**; server already uses `encryptedPostReactions`.
- **Unsent messages:** Tombstone text (“You unsent a message”) uses **neutral theme colours** (background + subtle text), not the green/pink sent-bubble accent.
- **Offline mode:** When the device has no internet, a **banner** reads “You're offline — showing cached content”. Chats, feed, and profiles remain browsable from cache; sending shows a clear offline message instead of a blank block.
- **Media cache:** Decrypted Tier B photos/videos reuse the **same on-disk cache** across feed, fullscreen, and profile (no re-decrypt when reopening). Chat media resolver shares the same cache map.
- **Read receipts:** Reader avatars below sent messages must **not** flash a **?** while friend profiles are still loading — use cached profile cards / roster fallback letters instead.
- **Chat avatars:** Tapping **your own** avatar in a chat thread opens **My profile**.
- **New-post push:** Friends receive a push when you publish (`New post from {username}`). Requires **Cloud Functions deploy** after this build (`firebase deploy --only functions` from `backend/functions`).
- **Chat performance:** Opening a chat loads the **most recent 30 messages** (scroll up for older). Even when hundreds are already in memory, the list only **mounts a sliding window** (30 at first, +30 per scroll-up) so taps and the keyboard stay responsive. Video bubbles use first-frame posters until play. **Requires new release APK (`npm run apk:release`).**
- **First open / cold start (responsiveness):** On a **fresh install** (or cleared app data), sign in and reach home — bottom nav icons and chat/feed tabs must remain **tappable within a few seconds** (no multi-second freeze). The home feed should show **at most 3 post cards** on first paint (not 10+); scrolling loads more in batches of 5, then older posts from the server. Tier B media on off-screen cards should not block the UI (decrypt starts when cards become viewable). After the first session, reopening the app should feel snappier (cached AsyncStorage + incremental sync). **Requires new release APK (`npm run apk:release`).**
- **Notification pre-prompt (first launch):** After splash, while still signed in, the app shows **Stay in the loop** with **Allow notifications** / **Not now** before the home feed is usable. Chats and feed sync continue in the background during this screen. **Allow** → OS permission sheet → home. **Not now** → home without OS prompt; pre-prompt is not shown again for that email unless app data is cleared. Returning users who already granted or denied OS notifications skip this screen. **Requires new release APK.**
- **Inbound encrypted chat video (responsiveness):** When a friend sends a Tier B encrypted video, the bubble appears immediately with a play icon — **no multi-second UI freeze** while the app decrypts. Tap play → **Preparing video…** spinner while decrypt/download runs, then inline playback as usual. The chat must stay scrollable and the back button must work while a video message is visible (even if decrypt is running). Scrolling the chat or switching the app while a video message arrives must stay responsive. **Feed/post Tier B video** uses the same tap-to-decrypt rule (poster + play until tap). **Full-screen chat/feed media** follows device rotation (portrait + landscape). **Requires new release APK (`npm run apk:release`).**
- **Chat photos:** tap a photo or GIF — **full-screen** page (not a dimmed popup); close with X or Android back. With the composer keyboard open, tap must **dismiss the keyboard** (or open the viewer above it) so the image is fully visible.
- **Photo editor (chat):** Add text on a photo/video or type a caption on the preview step — the keyboard must not cover the chat composer underneath, and caption / **Add text** inputs must stay visible above the keyboard (Send/Add actions reachable).
- **Shared media:** chat ⋮ → **Shared media** lists all photos/videos in the thread (3-column grid); tile tap opens full-screen viewer; back arrow returns to chat.
- **Post media (in fullscreen post):** tap a photo or video in the post body — dedicated full-screen media viewer (video includes draggable progress slider + play/pause). **Rotate the phone** in full-screen photo or video — media follows **portrait or landscape** (no forced landscape lock).
- **Feed / post-viewer video:** In the feed card, video posts show a **play overlay**. **First tap** plays inline. While playing, controls **fade out after ~1.5 s**; **tap the video** to bring them back (pause, seek, expand). Use the **expand** icon for full-screen. In **post detail**, same fade/tap behaviour — full-screen must not open under the post modal. Scrubbing must **not** jump back to 0:00. When playback finishes, the **play overlay returns**.
- **Video post thumbnail:** Publish a video post → modal shows the **first-frame default** preview and explains that default. **Use first frame** publishes with that still. **Choose custom thumbnail** picks any image (no square crop) — in the feed the custom image is **letterboxed on black** inside the video frame (not pasted over the first frame). Skip/custom choice is shown **before** publish completes.
- **Android hardware back:** mirrors in-app back/close (modals first, then screen stack — e.g. shared media → chat → home).
- **Blob-only media uploads (regression guard):** sending or posting any image/video/voice and uploading a profile picture MUST NOT raise `"Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"` or `undefined is not a function`. Device URIs are read via `FileSystem.readAsStringAsync` (base64) when possible; uploads pass an RN-native Blob from a temp `file://` path to `uploadBytes` (shared helper `readLocalMediaForUpload.ts`).
- **Video send while multitasking:** Send a chat video, then immediately navigate home, open another chat, or scroll the feed — the app must stay responsive (no multi-second freeze). While sending, the bubble shows a spinner (not a live video player). After `Sent`, the video player appears and plays normally. **Requires new APK.**
- **Chat video prepare / orientation / reply preview:** Tap play on a Tier B chat video → **Preparing video…** overlay with **Cancel** (cancel must stop prepare and allow scrolling away). Portrait-filmed videos render tall in the bubble (`contain`, not cropped to landscape). Long-press reply to a video → composer reply strip shows a **thumbnail** plus “Video” (photo replies show photo thumb).
- **Tier B encrypted media (Phase 1):** Send a **new** chat photo/video/voice after updating to this build → recipient sees media after brief decrypt (file cache). **Publish a feed post with a photo or video** → post appears on home feed and profile (no `Post not published` / `undefined is not a function`). Inspect encrypted payload: should include `mediaTier: 2` + key fields, not a public HTTPS URL. Legacy posts with HTTPS URLs still work. Profile picture upload must still use plaintext Storage (unchanged). **Requires new APK** on all test phones; no Cloud Functions deploy needed for Tier B client-only path.
- **Profile post grid tiles:** On **My profile** (and friend profile media grid), each tile shows a **cover thumbnail** — first photo from multi-image posts, **video poster** or **first-frame still** for video posts, or a miniature text card for text-only posts. Tier B encrypted posts must **not** show the blank image icon once decrypt finishes (brief spinner while resolving is OK). **All media tiles load** in the grid.
- **Profile feed below grid:** Full post cards under the grid show **6 initially**; tap **Load more posts** for +8 at a time. The grid above is unchanged (every media post still gets a tile).
- **Profile picture sync:** pick a new profile picture from gallery/camera → it appears instantly for the editor (local `file://` preview), then is replaced by an HTTPS Storage URL; **encrypted profile sync must not run until HTTPS is set** (no empty overwrite during upload). After upload settles, friends see the same picture on chat list, online strip, and friend profile within ~30 s (`getUserProfiles` refresh + encrypted profile push). Force-closing + reopening the app keeps the picture visible (AsyncStorage + `users.profilePictureUrl`). Empty/stale encrypted payloads must **not** clear a valid HTTPS avatar — client reconciles from `users` via `getUserProfiles`. Failed upload restores the last persisted HTTPS URL (does not blank the avatar).
- **Profile bio persistence:** Bio is stored in **`users.bio`** (not the encrypted profile blob). Edit your bio on **My Profile** → sign out → sign in → bio must still appear. Friend viewing your profile must see the same bio via `getUserProfiles`. Cold start before network returns should show the last cached bio from AsyncStorage. Clearing bio intentionally should persist as empty after sync.
- **Photo editor & preview footer:** the editor is **non-scrollable** (fixed layout: canvas + tool dock + sticky footer). **Filters** open from a **sliders** icon (modal), not a permanent chip row. **Crop** maps to the letterboxed image bounds (`contain` preview, full screen width); **rotate** reflows portrait/landscape in the canvas. Preview shows two large footer buttons — **Back** and **Send** (or **Post** / **Use photo**) — side by side with minimal gap, filling the bottom band above `stickyFooterPadding`; Android system nav bar background/border match the active theme (light/dark/pink/green). "Clear overlays" is the trash icon in the tool row.
- **Chat/feed media aspect:** chat photos and videos size to natural aspect (width up to ~82% of screen, height from ratio — no letterbox padding or square frame). Feed images use width-fit `contain` with **square** outer corners; multi-photo carousels letterbox with **black** padding (see Feed post media above).
- **Feed media corners:** post images/video on the home feed use **square** full-bleed edges (no rounded media corners). Media sits outside the post tap target so `Pressable` clipping cannot round corners. Rebuild with **`npm run apk:debug`** (MainApp) — not the old default demo-only debug bundle.
- **New-post composer:** the media tray uses icon-only buttons (image, video, trash) instead of text. Cancel and Publish live in a sticky bottom footer with a hairline top divider that sits at `Math.max(insets.bottom, 16) + 8` so Publish is never inside the Android gesture/nav area. Scrolling the body never hides the Publish button.

## Draft Lifecycle

- Start chat and leave before typing -> no draft row created.
- Type in new draft and back out -> prompt appears with Discard/Save draft.
- Open saved draft, clear composer text, back out -> draft row is removed if no messages.
- Delete chat from home list -> row disappears and stays hidden after pull/sync/cold restart (must not reappear from encrypted message backfill).
- Delete a 1:1 chat, then start a new chat with the same friend -> new `__live` row appears on the home list; new messages deliver both ways; opening the thread does not resurrect the deleted canonical history from sync.
- Delete a 1:1 chat, **force-quit and reopen** the app (do not clear app data), then message the same friend again -> must open/create `dm_*__live`, show new bubbles on the home list, and must **not** silently reuse the hidden canonical `dm_*` thread.
- After delete, if the other phone still sends on the old canonical server conversation briefly, the deleter's device should still surface those lines on the **`__live`** row once sync runs (canonical tombstone stays server-side; client maps inbound canonical docs to live).
- Home chat list must use the filtered visible list (hidden/deleted chats do not flash back in immediately).
- **Send ordering:** While a slow upload is still `Sending…`, sending a quick follow-up text in the same chat must keep the sent line **below** the in-flight bubble in the thread, and the home chat row must **not** sort above other chats whose latest delivered message is newer (timestamp + preview follow the latest confirmed traffic until the upload completes).

## Broadcast

- Start Chat -> Broadcast row appears above friends.
- Broadcast row is highlighted with accent treatment.
- Enter Broadcast picker, select/deselect friends, create broadcast.
- `Select all` / `Clear all` toggles full recipient list.
- Long-press broadcast title in creation header to rename broadcast before create.
- If all friends are selected, broadcast creation skips all save prompts.
- For partial selections, first prompt title is **Save broadcast friend selection** with body copy explaining save vs continue without saving.
- If yes, second prompt title **Overwrite a saved broadcast group?** with body copy explaining overwrite vs new group.
- Overwrite path uses dropdown + `Save`.
- New-group path uses title field + `Save`.
- Saved group dropdown can repopulate recipient list.
- First send appears once in the broadcast thread as the creator’s message, with no “Thread: …” line on that message.
- **Recipients cannot broadcast to the group:** as a broadcast recipient, the composer is locked until you long-press a **broadcaster** message and choose **Reply**; there is no “send to everyone” confirm.
- **Recipient visibility:** only (1) general broadcasts from the creator and (2) the creator's direct replies in your private thread; never another recipient's thread. Your own private replies appear for context but only broadcaster messages offer **Reply**.
- **Private thread isolation:** recipient A's replies are visible only to A and the broadcaster; recipient B must not see A's thread.
- Broadcast helper text (creator): `Broadcast mode: tap a friend's message to reply…` Recipient helper explains long-press Reply only.
- Tap a friend's message in broadcast to target thread, send follow-up, verify it stays in that thread.
- After the initial broadcast, friend replies appear with per-thread labels as before.
- Confirm broadcast prompt blocks follow-up send until a thread is selected.
- Verify broadcast chat scroll order matches standard chats (newest at bottom).
- Verify simulated broadcast/direct/group friend replies arrive after randomized delay between 0 seconds and 5 minutes.
- Broadcast rows on home use strong accent tint (left border + background) and broadcast title in accent color; display only their defined chat title with no extra broadcast tag.

## Expanded Seed/Test Data

- Friends list now includes 30 users, each with a rotating fake bio string for profile preview.
- Friend and My Profile screens have no centered “Profile” title; bio editing has no separate “Bio” label.
- Home chat list: group and broadcast rows prefix the last-message preview with the sender (`You: …` for self, otherwise `Name: …`); 1:1 chats show the message line only.
- Existing seed data contains an example broadcast chat (`c11`) with private thread replies.
- Auto-reply simulation: sending messages can trigger friend responses in direct/group chats and broadcast threads.
- Seed messages include users reacting to each other and to messages sent by `me` for reaction UI validation.
- Broadcast-group save flow supports skip, overwrite existing named group from dropdown, or save as new group with prompted title.
- All broadcast-group prompt windows share the same larger modal card (`broadcastSaveModalCard`), title + body copy, and centered positioning.
- Group chat seed rows include varied random icons, while some group chats intentionally leave `profilePicture` blank to exercise chevron (`^`) fallback rendering.

## Boot splash and session restore

- Cold start while **signed out:** a centered **tBH** mark and placeholder product name appear on a blank themed background for at least ~500ms; no login controls are tappable during that window, then the login (or signup) UI appears.
- Cold start while **still signed in** (did not Logout): the same splash shows until Firebase initial auth resolves, local cache is hydrated, and for at least ~500ms from launch—login must not flash first. **`claimDeviceSession`** and related session init continue **after** the splash; cached feed/chats may appear before the server session is ready.
- After splash on cold start, the app always lands on **home → Feed** (it does **not** reopen the last chat or deep screen). Open a chat from the list after the feed paints; friend names/avatars should show real usernames, not transient **User**, once the boot friend roster resolves (persisted friends are used for titles until then).
- **Logout** (or auth expiring to signed-out) clears stored navigation for that account; next launch shows splash then login without restoring the old screen.

## Appearance and local social cache

- **Settings navigation:** tapping the cog opens a **full-screen Settings page** (not a modal popup): options are listed top-to-bottom on the page background (no centered card or dimmed overlay). There is no **Done** button; leave via home/profile/chats/feed icons. While on that page, the cog icon uses its active state styling.
- **Dark mode + accent:** After toggling dark mode and the green/pink accent, force-close and reopen while still signed in — both choices should persist (global AsyncStorage appearance key).
- **My profile photo:** Opening **change photo** runs the library picker without native crop-only ambiguity, then opens the **in-app crop/editor**; the final preview confirms with **Use photo** (same editor as posts uses **Post** on that step).
- **Release messaging cache:** For normal (non-demo-seed) accounts, chats and messages are saved per-email on device; force-quit after sending should still show **your own** threads and outgoing lines after restart. If the other party does not receive a message, verify backend/Firestore sync and indexes separately—local cache does not replace server delivery.

## Add Friend, feed publish, scrollbars, OTP

- **Demo offline profile (debug app):** login uses **username/password** only with seeded accounts **User A / 1234** and **User B / 5678**. Signup/OTP paths are disabled in this profile. User A and User B are **not friends** at start.
- **Demo social graph:** User A has 100 friends; User B has 100 friends; overlap subset exists across both account friend lists for visibility testing.
- **Demo content volume:** each seeded friend has at least **5 feed posts**; seeded chats include direct, group, and multiple broadcast examples with sensible names.
- **Demo reactions:** demo seed includes visible reactions on posts and messages before user interaction.
- **Demo simulated activity:** low-volume auto responses use a delay window of roughly **5 seconds to 2 minutes**; inbound senders are capped to a small active subset for noise control.
- **Release chat behavior:** simulated auto replies are **disabled**; after adding a real friend, DM replies must come from that real friend account/device only.
- **Release DM delivery:** sending a DM now writes through encrypted backend callables (`upsertConversation` + `sendEncryptedMessage`); failed sends are marked unsent and surface an error instead of pretending delivered.
- **Inbound messages are push-delivered (no client polling):** with two devices signed in to two accounts that are friends, open the same 1:1 chat on device A. From device B, send a message. Device A should render the new bubble within roughly **1 second** (sub-second on a good network), without any user interaction. The same applies regardless of which surface device A is on — chat list, feed, friend profile — because the listener is global, not per-screen. Photo / video / voice messages flow through the same path.
- **Active chat persistence:** with both devices in the same 1:1 thread, exchange several messages back and forth (including after you send). Bubbles from **both sides** must remain visible — none should vanish when the next message arrives, when you send, or during the ~4 s foreground chat pull. On a **refriend live** thread (`dm_*__live`), your sends must stay on that thread (not jump to the locked **User** artifact row).
- **Push delivery requires the May 2026 backend deploy:** verify `firebase deploy --only functions,firestore:rules,firestore:indexes` has run for this workspace. Without it: (a) `participantAuthUids` is missing on new message docs, (b) rule reads on `conversations/.../messages` always deny, (c) the snapshot listener attaches but never receives docs. In that degraded state, messages still arrive at app launch through the boot-time `listEncryptedMessages` callable — but they will **not** push in real time. The `messages` sync indicator surfacing **error** while the network is healthy is a strong signal the deploy is missing or stale.
- **Auth-uid registry (`registerFirebaseAuthUid`):** on every sign-in / session claim, the client calls `registerFirebaseAuthUid` after `claimDeviceSession`. This writes `userFirebaseAuthMap/{uid} = { firebaseAuthUid }` server-side (where `uid` is the app uid, `u_…`). Verify with the Firestore console (or emulator UI) that the doc exists for both test accounts before expecting push delivery on either. The registry write soft-fails to avoid blocking sign-in; degraded mode in that case is the same as a missing deploy (callable-only delivery).
- **Boot-time historical pull is still the safety net:** even with push live, the initial-server-sync effect still runs **one** `listEncryptedMessages` callable pull per signed-in session **in the background** (the splash no longer waits on it — see "Splash gating is local-only" below). This covers (a) messages predating `participantAuthUids`, and (b) the first launch on a device where the auth-uid registry hasn't propagated yet. The home renders immediately from cache; backlog messages and any missing friend display names stream in as the background pull completes.
- **Splash gating is local-only:** the boot splash waits only on **Firebase Auth state resolution** plus a 500 ms minimum. It does **not** wait on `listMyFriends`, `getUserProfiles`, `listEncryptedMessages`, `claimDeviceSession`, `publishUserKeyBundle`, or `upsertUserProfile`. Cold start on a fresh install therefore lands on an empty home in roughly the same time as a returning user — the empty state populates in-place as the background sync resolves. A regression to "splash sits for 12 seconds on a fresh install" indicates the gate has been re-tightened in `MainApp.tsx`'s `showBootSplash` expression.
- **Tombstone DM (non-friend / unknown):** in a 1:1 chat where the counterpart resolves as **User** (no profile), the composer is replaced by **Cannot message this account** (no mic/camera row).
- **Chat list ghost rule:** the home chat list only shows a row when the chat has at least one **visible message** (after `joinCutoffForViewer` and `hiddenFromOwner` filtering), **or** when the row is *my own* draft (`isDraft && createdBy === me`) carrying a non-empty `draftComposerText`. A chat with no messages and no saved draft text **must not** appear — it must never leak a friend's username/avatar through an otherwise empty thread (including chats orphaned by cold-kill mid-typing). Legacy ghost-empty chats already in the per-email `AsyncStorage` blob are pruned at sign-in via `pruneGhostEmptyChats`. Drafts where `visibleToRecipients !== true` stay private to the drafter. **Tombstone-with-history:** after unfriend, a 1:1 thread **with existing messages** stays on the home list; names/avatars render as **User** and the composer shows **Cannot message this account** — empty ex-friend threads without history stay hidden. **Refriend does not restore identity** on the old artifact thread (`identityLockedChatIds` set on unfriend, persisted). **Refriend messaging:** use **Start chat** or tap the old **User** row — both must open the active **`dm_*__live`** thread with a working composer (same live id on both phones when possible). The old canonical **User** artifact stays read-only in the list. After a second unfriend/refriend cycle, live may become `dm_*__live2` if the prior live row was locked.
- **Firestore messaging index:** production projects must deploy `backend/firestore.indexes.json` (`firebase deploy --only firestore:indexes`). The config uses **`fieldOverrides`** for collection-group **`array-contains`** on `messages.participantUids` (not a composite index — Firestore rejects that shape). If this is missing, inbound message sync (`listEncryptedMessages`) may fail.
- **Signup username:** the username entered at signup is persisted for that email and written to the backend on session init; it must not revert to the email prefix after cold start or plain login. Friends must see the chosen username (not `john` from `john@example.com`). Requires **`firebase deploy --only functions`** for the `claimDeviceSession` fix (May 2026) plus a fresh login after signup so the server profile is corrected.
- **Release feed delivery:** publishing a post now writes through encrypted backend callable (`createEncryptedPost`) to self + current friends; backend publish failures remove the optimistic post and show an error.
- **Firestore read budget (May 2026):** With two test accounts, leaving the app on **feed** must not drive hundreds of thousands of reads/day — no 6s comment polling; message global listener ≤40 docs; open chat uses per-thread listener + ~12s thread pull fallback, not 1000-doc global snapshot; home feed posts listener ≤**3** docs and only while **home → Feed** (not on Chats tab).
- **Home feed first page (May 2026):** On feed open, at most **10** newest posts load from the server initially; scrolling to the end loads older posts in pages of **30**. Opening **My profile** or a **friend profile** may pull a larger catalog (up to **80**) for the grid.
- **Feed + chat photos/videos (release):** local gallery/camera URIs are uploaded to Firebase Storage under `encrypted-media/{FirebaseAuthUid}/…` (must match **`request.auth.uid`**) before encrypting payloads so recipients get HTTPS download URLs (not sender-only `file://` paths). Deploy **`backend/storage.rules`** so authenticated reads are allowed on that prefix (`firebase deploy --only storage`).
- **Delete post (release):** deleting your own post calls **`deleteEncryptedPost`** (removes the `encryptedPosts` document, reaction row, and **Firebase Storage** objects listed in `storageObjectPaths` on that doc). Your feed drops the post immediately; friends lose it when the Firestore listener fires **`removed`** or on their next feed/profile open (full-catalog **`listEncryptedPosts`** reconcile — incremental-only cache could keep ghosts before May 2026 fix). Wait until publish finishes before delete (optimistic `p-*` ids are rejected). Posts published before Storage-path tracking may leave orphan blobs until manually cleaned.
- **Delete post — cold start (Jun 2026):** After delete, force-quit and reopen the app — deleted posts must **not** flash on the feed then vanish; they must not reappear from AsyncStorage, cloud social snapshot, or `listEncryptedPosts`. Applies to **legacy HTTPS posts and Tier B posts** (same Firestore doc id). If a post still returns after a **new APK** delete, check Firebase `encryptedPosts/{postId}` — if the doc still exists, server delete did not run (session/owner mismatch); you should see **Could not delete post** on failure. Re-delete once on the new build so `deletedPostIds` is recorded.
- **Reset local data (Jun 2026):** Settings → reset local cache must also clear **feed mutes**, **feed reaction seen**, and **posts shared with friends** for that email (not only chats/messages/posts).
- **Presence on auth repair (Jun 2026):** `registerFirebaseAuthUid` must not mark the user **active** in Firestore — only refresh viewer maps. **Requires `firebase deploy --only functions`** from repo root (after `npm run build` in `backend/functions`).
- **Friends across restarts:** ritual/backend friends (`addedFriendsFromRitual`) are persisted in the same per-email social AsyncStorage blob as chats/messages and restored on session restore; **`listMyFriends` + profiles** also refresh on an interval so a failed first fetch does not strand an empty friends list until the next dependency change.
- **Background boot sync (not splash-gated):** after sign-in, a one-shot **`listMyFriends` + profiles + `listEncryptedMessages` + home feed posts (10)** runs in the background once `backendSessionReady` is true (12 s safety timeout). The splash does **not** wait on this pull — see **Splash gating is local-only** above. Fresh install may briefly show an empty friends list until this completes; persisted cache on returning users should paint immediately.
- **Add Friend** screen uses the same **light/dark background** as Home/Chats/Feed. Nav icons use **theme accent**; the **active** nav pill uses a **muted accent** fill (`${accent}1F`). Primary actions (**Show QR Code**, **Confirm**, **Allow camera**) use **`primaryButton`** (**accent** fill, white label). **Show QR / Read QR** `Switch`: thumb always **accent**; track **muted accent** (light `${accent}1F`, dark `${accent}66` so the rail is visible on black for green and pink); toggle disabled while QR session / scan / confirm is active. Android hardware **back** from Add Friend aborts any in-flight PIN/redeem and returns home.
- **Scrollbars** on lists/profile: no thumb/track until the user **starts scrolling** that list (then normal indicators).
- **Photo crop (Option B):** Pick a photo for profile, post, or chat → opens the photo editor first; tap **Crop** for **expo-dynamic-image-crop**. Multi-photo posts still queue through the editor one by one. GIFs and videos skip crop.
- **Photo editor filters:** tap **Filters** → swipe the label strip (white on black) left/right; tool row scrolls horizontally.
- **Photo editor undo:** **Undo** reverses draw strokes, text add/move/resize, filter, rotate, crop, and clear overlays (up to 40 steps).
- **Open source licences:** **Settings → Open source licences** lists MIT/Apache notices for key dependencies.
- **New post:** Tap the **create** (pencil) icon (leftmost in the top nav bar) from feed or any screen that shows `HomeTopNavBar`. Opens the **publish** composer with the **same top nav**; the **create** icon is **highlighted** while composing. Screen **scrolls**; footer **Cancel** / **Publish** use safe-area padding. Top **media slot** (tap for photos); caption below; **Photos / Video / Clear** row. Photo **editor** runs after picking images; **Continue** and **Post** sit above the Android gesture/nav inset (`SafeAreaView` + `photoEditorFooterPadding`). **Settings** is second-from-right; **logout** is rightmost. There is **no** bottom feed **New post** bar.
- **Feed multi-photo fullscreen:** Tap a photo on a multi-image post → full-screen black viewer with **horizontal swipe** (same paging as the in-feed/post carousel), **left/right chevrons**, and **1/N** counter. Closing fullscreen returns to the **same slide index** on the feed card or post fullscreen carousel.
- **Feed multi-photo swipe (in-card):** Swipe to slide 2 (or 3) on a freshly published multi-image post — the carousel **must stay** on that slide after the animation completes (no snap-back to slide 1 when publish finishes or when image aspects finish loading).
- **Home feed / chats lists:** lists use **`homeBottomActionClearance(insets.bottom)`** bottom padding so the last chat/post scrolls above the **Start Chat** bar and gesture nav; **Chats** pins Start Chat with **`position: 'absolute'`** plus **`navDeadZoneHeight`**. Fixed footers (friend profile **Start chat**, auth, settings, composer modals, tombstone strip) use **`stickyFooterPadding`** from `app/lib/safeAreaInsets.ts`.
- **Android OTP:** OTP field accepts only **6 digits**. On login OTP step, **Request OTP code** (left) calls `requestEmailOtp`; **Verify OTP** (right) calls `verifyEmailOtp` after the code is entered. Auto-fill only applies when the SMS body includes the app marker text **`App Final`** (placeholder app name); non-matching 2FA SMS must be ignored. Suggested codes **do not overwrite** a completed 6-digit field.
- **My profile bio:** While editing bio on **My profile**, the bio field scrolls above the keyboard and the profile scroll gains bottom padding so typed text stays visible (iOS + Android).
- **Keyboard + Android back:** When the keyboard is open, focused fields in scroll areas (profile bio, publish caption, etc.) pin just above the keyboard and restore when it closes. **Android hardware back** dismisses the keyboard first (then continues with the normal back stack).
- **Settings -> Delete account:** Settings shows a destructive **Delete account** row that opens an irreversible warning describing policy: profile/access + posts are deleted, while already-sent chat messages and prior comments/reactions may remain for others under **`User`** attribution.
- **Add Friend precise location (Jun 2026):** Android must grant **Precise** (fine), not **Approximate only** — if approximate, the app shows **Precise location required** with **Try again** / **Cancel** (enable Precise in system settings manually). Re-check before **Show QR Code** and before processing a **Read QR** scan. GPS fix uses highest accuracy (server rejects >50m). Wi-Fi fallback still applies when GPS quality is poor but permission is precise. **Requires new APK** (native `expo-location` config).
- **Direct chat title "User":** After **unfriend**, 1:1 threads stay **User** (identity-locked). Otherwise a brief **User** flash was a Firestore empty-snapshot race — should no longer happen after roster listener fix; if it persists, note whether chat was opened right after sign-in or refriend.
- **Add Friend (current UI):** **Show QR / Read QR** toggle. **Show QR:** tap the button to mint a short-lived code and render QR on-screen for a brief window, then auto-hide; redeem runs in the background (button stays on the QR view). **Read QR:** after a valid scan the camera closes and a full-screen **Authenticating** spinner shows until the dual-confirm card. **Confirm:** overlay spinner on the dual-confirm card (not `awaitPairing`). Switching **Show QR → Read QR** on the **presenter** cancels that offer; switching to Read QR on a non-presenting phone does not cancel the friend’s QR. **Android back** cancels active PIN/background work. **Photo editor:** hardware back exits **crop** before closing the editor.
- **Add Friend QR screenshot voiding:** while a presenter QR is visible, taking a screenshot on iOS/Android must show **`Screenshot detected, QR code voided`**, immediately hide the QR, and cancel/rescind the active backend pin offer token.
- **Add Friend QR confirmation UX:** after QR scan (phase 1: `confirmNfcPinPairOffer` + proximity), show an inline confirmation card (not a popup) with the other user's photo + username. **Both** must press **Confirm**: scanner calls **`confirmRedeemerNfcPinPairOffer`**, Show QR user calls **`finalizeNfcPinPairOffer`**. Friendship must **not** exist until **both** confirms are on the server (verify with only one phone confirming — the other must still show no friendship / no privileges). After **either** phone taps **Confirm**, the overlay must read **Waiting for your friend to confirm…** until the friendship is created (order of taps does not matter).
- **Add Friend QR failure copy:** if hydration or any step fails during this flow, user-facing fallback is generic **`Add friend failed`** (no tombstone fallback profile insertion).
- **Add Friend dual-confirm TTL:** Short PIN mint TTL gates **scan/preview** only. After scanner phase 1 (`confirmNfcPinPairOffer`), the server extends session **`expiresAt`** by **7 days** (long server window). **Client:** if **neither** phone taps **Confirm** or **Cancel** within **45s** on the dual-confirm card, show **`Add friend timed out`** and cancel the offer. After **one** phone taps **Confirm**, the other must respond within **45s** or that waiter sees **`Add friend failed`**. Either party can **Cancel** (`cancelNfcPinPairOffer`) anytime. Issuer confirm screen **polls** session presence — if the other side aborted (session deleted), show **`Add friend cancelled`**. **Confirm UI** shows for both phones whenever phase is `confirmFriend` (do **not** hide issuer confirm because the **Show QR / Read QR** toggle was flipped).
- **Show QR again:** Tapping **Show QR Code** a second time **cancels** the previous offer on the server and mints a **new** code (safe after the 4s QR hide).
- **Add Friend profile hydration:** During pairing, the client passes the active **`pairingPin`** into **`getUserProfiles`** so each side can load the other's profile **before** friendship exists; outside pairing, viewing another user's profile still requires an accepted friendship (no global profile lookup).
- **Friends list sync:** After pairing, `listMyFriends` may briefly lag Firestore; client **must not** drop ritual-added friends until the server lists them (replication). Empty **username** from profile load must still produce a usable display fallback so friends from `getUserProfiles` are not filtered out of the merged list.
- **QR proximity checks (active):** `confirmNfcPinPairOffer` enforces GPS-first proximity (dynamic uncertainty radius capped at **100m**) and falls back to same Wi-Fi/private-subnet evidence (personal hotspot counts) when GPS quality is insufficient. Failing fallback returns guidance to connect both phones to same Wi-Fi/hotspot and retry.
- **NFC (siloed legacy pieces):** `addFriend/nfc/oneShot.ts` and HS2-era paths in **`handshake.ts`** kept for reuse; one-shot voucher Functions (`mintNfcFriendVoucher` / `redeemNfcFriendVoucher`) unchanged for ops/legacy.
- **Own posts:** After several sign-in/out cycles, posts saved for that account should still **reload from device storage** (no wipe from an empty persist race).
- **Post comments (feed):** Feed cards do **not** expand inline comment threads (avoids layout jump while comments sync). Tap **Comments** / **Add comment…** opens **full-screen post** where threads and composers live. Composer matches **chat**: multiline field + send glyph, **`keyboardVisible`** padding, pinned above the keyboard. **Owner** selects a thread via **Reply** in the modal before typing; clearing the banner exits thread-reply mode. iOS: **Send** / **Done** on the input accessory mirrors chat.
- **Feed post layout:** scrolling the feed or opening a post must not shift card height when images finish loading (fixed media box); opening fullscreen uses a fade (not a relayout jump).
- **Post comment permanence:** comments/thread replies must remain visible for both participants in that thread after app refresh and backend post sync (no flicker/reset from post polling).
- **Post owner sees friend comments on feed:** friend comments on your post appear on the feed card within ~6s (or when the post scrolls into view) — tap the friend’s name row to expand if multiple threads; a single thread auto-expands.
- **Logout safety:** tapping logout opens an explicit confirmation dialog: **“Are you sure you want to logout?”** with Cancel/Logout actions.
- **Feed polling — poll on open / poll on reopen (current):** `listEncryptedPosts` fires **once** each time the user **enters** a post-bearing surface (`home`+`feed` tab, **My Profile**, a friend's profile) and **once** when the app **foregrounds while already on such a surface**. While the user *stays* on the feed, **no further polling happens**. **Messages (Jun 2026):** no periodic `listEncryptedMessages` while foregrounded — inbox updates via Firestore listener on **Home → Chats** only; open chat uses a per-thread listener. One boot-time message pull still runs after sign-in; push notification taps may trigger a one-off inbox pull.
- **Historical posts after new friendship:** When A and B become friends, **each phone** re-shares **its own** older encrypted posts with the new friend (background `listMyOwnedEncryptedPosts` + `updateEncryptedPost`). **Verify:** A posts while B is not a friend → pair → within ~1–2 min (both apps foreground, keys published) B sees A's pre-friendship posts on feed/profile; repeat with B's posts visible to A. Requires deployed **`listMyOwnedEncryptedPosts`** + updated **`updateEncryptedPost`** (writes `recipientUids` / `recipientAuthUids`) and Firestore index `encryptedPosts`: `ownerUid` + `createdAt desc`. **Manual Firebase friendship:** same backfill runs on next app open for both users; if a prior backfill failed (e.g. reversed friendship doc id), reopen the app after fixing the edge — failed backfills retry and are not marked complete until all owned posts update successfully.
- **Chat push after manual friendship:** **Verify:** B sends a 1:1 message while A's app is backgrounded → A gets a lock-screen/heads-up notification within a few seconds (not only after opening the app). Requires B's message to reach the server (`sendEncryptedMessage` + friendship check), A's OS notifications **allowed**, and A's push token stored under `users/{A app uid}/pushTokens`. If messages sync only when A opens the app, check `userFirebaseAuthMap/{uid}` and message `participantAuthUids` on the sender's device after both users foreground once.
- **Friend profile offline / cache:** Tapping a friend with a cached display name opens their profile **immediately** (AsyncStorage + roster cache); profile fields refresh in the background when online. With **no cache** and no network, show **Profile unavailable — You need an internet connection to load this profile.** (not a silent no-op).

## Whole-account smoke (manual, two devices)

Use two physical phones (or one phone + one emulator where camera access allows). Align with **`PRODUCTION_READINESS_CHECKLIST.md`** (smoke row), **`scripts/TWO_PHONE_PARITY_CHECKLIST.md`**, and **`Planning/E2EE_VERIFICATION_CHECKLIST.md`** for encrypted messaging.

**Suggested order**

1. **Account A / B:** Sign up or sign in, complete **OTP** where required; confirm **home** and **feed** load.
2. **Pairing:** **Add Friend** — **Show QR / Read QR** flow (one phone shows, the other scans); confirm friendship edges and friend-visible profile rules.
3. **Feed / post:** **New post** (photo path + caption); confirm **B** sees the post if friend-gated; **publish** / **cancel** footer behavior per § Add Friend, feed publish, scrollbars, OTP above.
4. **Story (if used in your pass):** Create a story, confirm friend visibility and expiry behavior per product scope.
5. **Chat:** Open **1:1** chat, send/receive messages, **reply** / **reaction** / **edit** / **unsend** as needed from § Message Actions.
6. **Unfriend / edge:** Unfriend; confirm **non-friend** cannot read profile/DM as designed; optional re-pair via NFC PIN.

Record pass/fail and timestamps in **`Planning/E2EE_VERIFICATION_CHECKLIST.md`** (execution log) and your parity checklist copy when you formalize a beta run.
