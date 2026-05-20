# Feature Test Scenarios (MVP Prototype)

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
- **Two-phone online strip:** with both accounts accepted friends and both apps in foreground on Chats, each phone should show the other in the home **online** strip within a few seconds (immediate boot publish/poll + Firestore `presence` listener + 8 s heartbeat). Requires latest Cloud Functions (`registerFirebaseAuthUid` refreshes `viewerAuthUids`; `setMyPresence` heartbeat) and release APK on both devices. You will **not** appear in your own online strip (friends only).
- Message order/timestamps must follow backend server-created times after sync (no device-clock reordering between phones).
- Message reactions must persist across encrypted sync refreshes (must not disappear after a few seconds).
- Long-press any message -> actions menu appears.
- Reply to message -> reply banner appears above composer -> sent message shows reply reference.
- Reply rendering: replied-to message appears as muted context card; reply appears in normal foreground card.
- **Press and hold to react (chat):** long-press a message bubble opens the emoji picker; reaction summary chips appear only when reactions exist (no large button row under every message). Picker includes **Reply, edit, and more…** for extra actions.
- React to message -> a **small reaction pill** attaches to the **bottom edge** of the message bubble (emoji + count); not a full-width row under the bubble.
- Duplicate emoji reactions collapse into one chip + count bubble.
- **React (feed post):** **press and hold** anywhere on the post card (caption, image, or video) opens the emoji picker; no **+** button; reaction pill **attached to bottom** of post card when reactions exist.
- **Feed post media:** images and video span **full feed width** (edge-to-edge within the card bleed); height follows aspect ratio (no side letterboxing). After images load, post cards **must not** jump or “vibrate” (no height change when reactions sync in; scroll the feed and return — layout stays stable).
- **Feed comments:** no comment row or inline threads on the home feed — **tap a post** to open fullscreen; comment list + editable **Add comment ...** field at the bottom (post owner replies via **Reply** on a thread, then the footer field).
- **React (post comments):** **press and hold** on a comment opens the picker; reaction pill **attached to bottom** of comment bubble; thread replies toggle correctly.
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
- Verify posted voice notes can be played by any participant in that chat.
- Tap camera icon and capture photo -> photo message appears.
- Tap gallery button and attach screenshot/image from library -> photo message appears.
- When no composer text is present, photo posts with no default caption/title text.
- When composer has text, same photo posts with caption equal to typed text.
- Photo card should size around photo dimensions instead of fixed padded frame.
- Photo picker/camera image flow should allow native editing before send (platform-dependent tools).
- Tap video icon and record video -> video message appears.
- **Voice notes:** tap the mic in the composer to enter voice-note mode (mic button highlights). The send button becomes a **mic** — tap to start recording; a red **Recording… Ns** strip appears. The send button turns red **stop** — tap to stop and send. Tap the highlighted mic again to leave voice-note mode without sending. Duration must match the recording (not `0s`); the recipient can play the audio.
- **Chat video playback:** a video bubble shows a centered **play** control on a dimmed thumbnail. Tap once — it plays through to the end **without looping**; when finished, the play control does not return and tapping the bubble does not restart (leave and re-enter the chat to test a fresh view). While playing, only one in-thread video plays at a time.
- **Blob-only media uploads (regression guard):** sending or posting any image/video MUST NOT raise `"Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"`. The local URI is read via `await fetch(uri).blob()` and that Blob is passed straight to `uploadBytes`; the recipient payload only ever contains the HTTPS download URL.
- **Profile picture sync:** pick a new profile picture from gallery/camera → it appears instantly for the editor (local file preview), then is replaced by an HTTPS Storage URL before the encrypted profile sync ships it. After the upload settles, friends see the same picture on chat list, online strip, and friend profile within ~30 s (callable `getUserProfiles` refresh + encrypted profile push). Force-closing + reopening the app keeps the picture visible (no broken-image fallback). If a stale `file://` value ever comes back from encrypted sync or restore, the client drops it and pulls HTTPS from `users` via `getUserProfiles`.
- **Photo editor & preview footer:** the editor is **non-scrollable** (fixed layout: canvas + tool dock + sticky footer). **Filters** open from a **sliders** icon (modal), not a permanent chip row. **Crop** center-square uses `expo-image-manipulator` (materializes `content://` URIs on Android when needed). Preview **check** (✓) and edit **continue** (→) buttons sit in a sticky footer with `stickyFooterPadding` above the Android gesture/nav area. "Clear overlays" is the trash icon in the tool row.
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
- Broadcast helper text reads exactly: `Broadcast mode: tap a friend's message to reply.`
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
- Cold start while **still signed in** (did not Logout): the same splash shows until Firebase initial auth **and** session restore complete, and for at least ~500ms from launch—login must not flash first.
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
- **Chat list ghost rule:** the home chat list only shows a row when the chat has at least one **visible message** (after `joinCutoffForViewer` and `hiddenFromOwner` filtering), **or** when the row is *my own* draft (`isDraft && createdBy === me`) carrying a non-empty `draftComposerText`. A chat with no messages and no saved draft text **must not** appear — it must never leak a friend's username/avatar through an otherwise empty thread (including chats orphaned by cold-kill mid-typing). Legacy ghost-empty chats already in the per-email `AsyncStorage` blob are pruned at sign-in via `pruneGhostEmptyChats`. Drafts where `visibleToRecipients !== true` stay private to the drafter. **Tombstone-with-history:** after unfriend, a 1:1 thread **with existing messages** stays on the home list; names/avatars render as **User** and the composer shows **Cannot message this account** — empty ex-friend threads without history stay hidden. **Refriend does not restore identity** on the old artifact thread (`identityLockedChatIds` set on unfriend, persisted). **Refriend messaging:** use **Start chat** (friends list, online strip, or friend profile) — opens a **new live** thread (`dm_*__live`, same id on both phones) with a working composer; the old **User** row stays read-only. After a second unfriend/refriend cycle, live may become `dm_*__live2` if `__live` was locked.
- **Firestore messaging index:** production projects must deploy `backend/firestore.indexes.json` (`firebase deploy --only firestore:indexes`). The config uses **`fieldOverrides`** for collection-group **`array-contains`** on `messages.participantUids` (not a composite index — Firestore rejects that shape). If this is missing, inbound message sync (`listEncryptedMessages`) may fail.
- **Signup username:** the username entered at signup is persisted for that email and written to the backend on session init; it must not revert to the email prefix after cold start or plain login. Friends must see the chosen username (not `john` from `john@example.com`). Requires **`firebase deploy --only functions`** for the `claimDeviceSession` fix (May 2026) plus a fresh login after signup so the server profile is corrected.
- **Release feed delivery:** publishing a post now writes through encrypted backend callable (`createEncryptedPost`) to self + current friends; backend publish failures remove the optimistic post and show an error.
- **Feed + chat photos/videos (release):** local gallery/camera URIs are uploaded to Firebase Storage under `encrypted-media/{FirebaseAuthUid}/…` (must match **`request.auth.uid`**) before encrypting payloads so recipients get HTTPS download URLs (not sender-only `file://` paths). Deploy **`backend/storage.rules`** so authenticated reads are allowed on that prefix (`firebase deploy --only storage`).
- **Delete post (release):** deleting your own post calls **`deleteEncryptedPost`** (removes the `encryptedPosts` document); friends lose it on their next **`listEncryptedPosts`** refresh—local **`deletedAt`** alone is not sufficient across accounts.
- **Friends across restarts:** ritual/backend friends (`addedFriendsFromRitual`) are persisted in the same per-email social AsyncStorage blob as chats/messages and restored on session restore; **`listMyFriends` + profiles** also refresh on an interval so a failed first fetch does not strand an empty friends list until the next dependency change.
- **Boot splash holds for initial server pull:** after sign-in (cold start *or* fresh login), the **boot splash stays visible** until a one-shot server fetch finishes — **`listMyFriends` + `getUserProfiles`** for the friend graph and an initial **`listEncryptedMessages`** decode for chats/messages. The splash is released as soon as both settle, or after a hard **`INITIAL_SERVER_SYNC_TIMEOUT_MS`** (12 s) safety timeout, whichever is first. Periodic ticks (friends 60 s, messages 15 s, posts 30 s, profile 45 s) continue afterwards. This guarantees that after an APK reinstall (which wipes AsyncStorage), the home never paints with an empty friends list while a chat row for the same person has already been created by the messages sync — i.e., no real-username row attached to a friend who is missing from the friends page. Demo (`DEMO_OFFLINE_MODE`) and logout / session-replaced flows mark the boot sync done / re-arm appropriately.
- **Add Friend** screen is full **accent** background; **light mode** uses **white** icons/labels, **white** switch thumb, **lighter-tint accent** switch tracks, and a **white** border ring on the large button; **dark mode** uses **black** foreground on accent (including spinner, Cancel, celebration copy, and button label) with a **muted accent** circle border. Status bar / Android nav buttons follow that contrast on Add Friend.
- **Scrollbars** on lists/profile: no thumb/track until the user **starts scrolling** that list (then normal indicators).
- **New post:** From feed FAB opens a **full-screen** composer (back arrow + title only — no home icon strip); the screen **scrolls** so Cancel/Publish stay reachable above the Android system gesture/nav inset (`paddingBottom` uses safe area). Top area is a **blank media slot** (tap for photos); caption below; **Photos / Video / Clear** row; footer: **Cancel** (left, green outline, same width as Publish) then **Publish** (right, filled); Publish returns to feed. Photo **editor** still runs after picking images (not before).
- **Home feed / chats lists:** lists use **`homeBottomActionClearance(insets.bottom)`** bottom padding so the last chat/post scrolls **above** the full-width **Start Chat** / **New post** bars and gesture nav; **Chats** pins the Start Chat bar with **`position: 'absolute'`** plus a **`navDeadZoneHeight`** spacer (Android min **28px** when `insets.bottom === 0`). Fixed footers (friend profile **Start chat**, feed **New post** FAB, auth, settings, composer modals, tombstone strip) use **`stickyFooterPadding`** / **`fabBottomOffset`** from `app/lib/safeAreaInsets.ts`.
- **Android OTP:** OTP field accepts only **6 digits**. On login OTP step, **Validate OTP** and **Request OTP code** buttons are side-by-side at the bottom. Auto-fill only applies when the SMS body includes the app marker text **`App Final`** (placeholder app name); non-matching 2FA SMS must be ignored. Suggested codes **do not overwrite** a completed 6-digit field.
- **Settings -> Delete account:** Settings shows a destructive **Delete account** row that opens an irreversible warning describing policy: profile/access + posts are deleted, while already-sent chat messages and prior comments/reactions may remain for others under **`User`** attribution.
- **Add Friend location prompt:** Foreground **location** permission is requested when **Add Friend** opens, when toggling **Show QR / Read QR**, and before minting **Show QR Code** if still denied — not only after scanning a QR code.
- **Add Friend (current UI):** **Show QR / Read QR** toggle. **Show QR:** tap the button to mint a short-lived code and render QR on-screen for a brief window, then auto-hide; server uses pin offer callables (`registerNfcPinPairOffer` / `getNfcPinPairOfferStatus` / `cancelNfcPinPairOffer`) with presenter proximity evidence snapshot. **Read QR:** camera scanner opens with on-theme frame and now behaves like a standard scanner on first decode (single processing state, scan callback disabled while processing to prevent flicker); **after decode**, the client runs **`confirmNfcPinPairOffer`** (GPS/Wi‑Fi proximity + phase 1), **then** shows dual-confirm with issuer identity — not plain preview-only before proximity.
- **Add Friend QR screenshot voiding:** while a presenter QR is visible, taking a screenshot on iOS/Android must show **`Screenshot detected, QR code voided`**, immediately hide the QR, and cancel/rescind the active backend pin offer token.
- **Add Friend QR confirmation UX:** after QR verification, show an inline confirmation card (not a popup) with the other user photo + name in the same hero frame position as the friendship-confirmed animation. Both sharer and scanner must explicitly press **Confirm**, and friendship must not finalize until server has both confirmations (scanner `confirmNfcPinPairOffer` + sharer `finalizeNfcPinPairOffer`).
- **Add Friend QR failure copy:** if hydration or any step fails during this flow, user-facing fallback is generic **`Add friend failed`** (no tombstone fallback profile insertion).
- **Add Friend dual-confirm TTL:** Short PIN mint TTL gates **scan/preview** only. After scanner phase 1 (`confirmNfcPinPairOffer`), the server extends session **`expiresAt`** by **7 days** so both users can stay on the confirm UI without the early PIN expiry biting them. Either party can **Abort** (`cancelNfcPinPairOffer`): issuer anytime before friendship finalizes; scanner after phase 1. The confirm screen **polls** session presence — if the other side aborted (session deleted), show **`Add friend cancelled`**. **Dual-confirm idle:** if neither **Confirm** nor **Cancel** within **30 seconds** on that screen, the session is aborted and **`Add friend cancelled`** is shown (same as explicit cancel).
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
- **Feed polling — poll on open / poll on reopen (current):** `listEncryptedPosts` fires **once** each time the user **enters** a post-bearing surface (`home`+`feed` tab, **My Profile**, a friend's profile) and **once** when the app **foregrounds while already on such a surface**. While the user *stays* on the feed, **no further polling happens** — `setInterval` for posts has been removed. Sequence to verify: open app → land on feed → exactly one `listEncryptedPosts` request; sit on feed for 60s → no further post requests; switch to **Chats** tab → no post request; switch back to **Feed** → one new post request. Same applies to navigating to/from My Profile / a friend's profile. Friends, messages, and profile syncs keep their existing intervals (out of scope for this change). User-initiated refresh affordance (header refresh button + pull-to-refresh) is **still backlog** — `MASTER_PRODUCT_PLAN.md` → Feed and ranking breadth.

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
