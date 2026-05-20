# Master product plan (App Final V3 workspace)

## Purpose

This document is the **single planning entry point** for work tracked from **`App Final V3`**. It preserves the **same core product values** as `App Final V2/docs/PRODUCT_SPEC.md` and the goals in **`Planning/PLANNING.md`**, while treating **what ships today in this workspace** as the definition of the **current product surface** (validated in practice against the **release APK**, not Expo or ad-hoc debug builds).

Canonical implementation code for this product line:

`C:\Users\dunca\OneDrive\Desktop\App FInal V3`

Git remote: [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final)

Parity reference (UI/UX authority):

`android/app/build/outputs/apk/release/app-release.apk` (this workspace; optional `npm run apk:release:demo` adds `app-demo-release.apk` for labeled QA installs)

---

## Product principles (unchanged intent)

These align with **V2 `PRODUCT_SPEC` principles** and **§1 Goals and principles** in **`Planning/PLANNING.md`**:

| Principle | Meaning |
|-----------|---------|
| **Physical-first trust** | Friendships are created through **in-person** pairing flows, not remote friend links or open graph discovery. |
| **Private-by-default graph** | Non-friends cannot message you or view private identity fields (username, photo, bio, etc.). No friends-of-friends browsing. |
| **Strict isolation** | The social graph stays intentionally small and pairwise; discovery is not expanded through mutuals. |
| **Human, transparent feed** | Ordering favors explicit, understandable modes (e.g. **new** / chronological baselines)—not an opaque engagement-only ranker. |
| **End-to-end encrypted messaging** | Routine **direct** (and group) **message plaintext** is not intended to be readable by the backend; ciphertext is stored server-side. |
| **Deterministic critical flows** | No misleading “success” for pairing, publish, or send when the backend rejected the operation. |
| **Server-authoritative time** | Message and post ordering and freshness rely on **backend timestamps**, not conflicting device clocks. |
| **Reliability before breadth** | Stabilize core auth, pairing, chat, presence, and friend-gated surfaces before expanding optional product. |
| **Device and session posture** | **One active signed-in device per account** where enforced; **fresh OTP on next sign-in after sign-out** on a device (per product rules). |
| **Presence = real activity** | Online reflects **foreground-active** use with fresh heartbeats; background/closed sessions move to offline quickly. |

Non-goals as *values* (still true even when some legacy code paths exist): **remote friend invites**, **public explore “For You” feeds**, and **friends-of-friends discovery**.

---

## Current application scope (as implemented in App Final V3)

The following is a **planning-level summary** of functionality **exercised and described** for the shipping tree (this repo), including **`README.md`**, **`FEATURE_TEST_SCENARIOS.md`**, **`RUN_MVP_LOCALLY_AND_ON_PHONE.md`**, and **`backend/`**. Treat omissions or regressions as **engineering bugs**, not spec drift—update this doc when intentional product change is agreed.

### Platform and backend

- **Client:** React Native (Expo), native Android project under `android/`.
- **Backend:** Firebase (Firestore, Storage, Cloud Functions), rules and indexes documented in-repo.
- **Standalone installs:** APK build paths documented in-repo; demo vs release behavior differentiated where noted in test scenarios.

### Identity, auth, and session

- **Sign-up / sign-in** with username, email, and password; **phone OTP** where enabled (including Android SMS retriever / inbox assist patterns documented in scenarios).
- **Demo / offline-style profile** (where applicable): reduced paths for seeded accounts documented in **`FEATURE_TEST_SCENARIOS.md`**—not the release contract.
- **Session restore and splash** behavior (**local-only gate**, v1.6): cold-start gating until **Firebase Auth state resolves** plus a 500 ms minimum (`APP_BOOT_SPLASH_MIN_MS`); logout clears persisted navigation appropriately. The splash **never waits on any server pull** — not for returning users, not for first sign-in on a new device. Friends, chats, messages, posts, and profiles are hydrated from `AsyncStorage` (where available) and the home renders immediately; the background `onSnapshot` listeners (see "Push-based sync" below) plus a one-shot boot-time callable pull (`listMyFriends` + `getUserProfiles` + an *incremental* `listEncryptedMessages` from the persisted watermark) reconcile against server truth as data arrives. The boot-time pull is best-effort — its purpose is to backfill `participantAuthUids` onto pre-migration docs (so the snapshot listeners can see them) and to seed friend display names — and any failure within it is swallowed because the home is already rendered. This closes the previously possible "splash forever wedged on a failed backend-session boot" path by removing the server dependency from splash-release altogether. The internal `INITIAL_SERVER_SYNC_TIMEOUT_MS = 12 s` is retained purely as a defensive one-shot guard inside the boot-sync effect; it is no longer reachable from the splash code path.
- **Username persistence** across cold start aligned with scenarios (signup username must not silently revert).

### Friendship and pairing

- **In-person pairing** via **Show QR / Read QR** (default transport); server-minted **opaque session token** in QR (`AFQR2|…`); **read path** runs **proximity (`confirmNfcPinPairOffer`) immediately after scan**, then dual human confirm (`finalizeNfcPinPairOffer` + wait), not profile preview before proximity.
- **NFC (planned parity):** same server phases and dual confirm as QR; **Send friend request** / **Receive friend request** buttons only — **no long-press hold-to-pair**; OOB `PN2|…` over NDEF. Rationale for payment-style taps vs peer NFC: **`Planning/NFC_QR_UNIFIED_PAIRING_PLAN.md` v2.0**.
- **Dual explicit confirmation** after verification so friendship success is not ambiguous or one-sided in UI; **30s** idle limit on the dual-confirm step (neither confirm nor cancel) aborts with **Add friend cancelled**.
- **Location permission** for pairing: requested when **Add Friend** opens, when toggling **Show/Read QR**, and before **Show QR Code** if still denied — not deferred until after a scan.
- **Proximity:** server-validated evidence (**GPS-first** with documented uncertainty cap; **Wi‑Fi / same-network** fallback when GPS quality is insufficient), consistent with **`Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md`** intent.
- **Pairing callables** (`registerNfcPinPairOffer`, `confirmNfcPinPairOffer`, …) and **`nfcPinPairSessions`** remain the server contract (session id migrating from 4-digit PIN to opaque token). **BLE / NFC voucher** paths are **siloed legacy** ops code—see `Planning/BLE_ADD_FRIEND_ARCHITECTURE.md` / `Planning/NFC_OPTIONS_AND_HS2_LEGACY.md`.
- **Unfriend** and **non-friend access restrictions** for profile and DM as enforced by rules and client.

### Push-based sync architecture (v1.6 — most server reads are now `onSnapshot`)

Direct client `onSnapshot` listeners replace the previous polling intervals for all major collections. The unifying pattern is a **`participantAuthUids` / `recipientAuthUids` Firebase Auth UID mirror** populated by every Cloud Function that writes the doc; Firestore rules authorise reads on the mirror, so a signed-in client can run `where("…AuthUids", "array-contains", firebaseAuth.currentUser.uid)` and receive every relevant doc as a live push without callable round-trips.

| Collection | Listener (client) | Mirror field | Replaces |
|------------|------------------|--------------|----------|
| `conversations/{cid}/messages` (collection group) | `where("participantAuthUids", "array-contains", auth.uid)` ordered `createdAt desc`, limit 500 | `participantAuthUids` on every `sendEncryptedMessage` write | (already pushed in v1.5) |
| `friendships` | `where("participantAuthUids", "array-contains", auth.uid)` | `participantAuthUids` on every friendship-write callable (`finalizeNfcPinPairOffer`, `redeemNfcFriendVoucher`, `joinBleFriendSession`, `finalizeNfcHandshakeSession`, `consumeHandshake`, `seedDemoFriendships`) plus opportunistic backfill in `listMyFriends` | 60 s `listMyFriends` `setInterval` |
| `encryptedPosts` | `where("recipientAuthUids", "array-contains", auth.uid)` ordered `createdAt desc`, limit 150 | `recipientAuthUids` on every `createEncryptedPost` write + backfill in `listEncryptedPosts` | poll-on-open `listEncryptedPosts` (still kept for backlog/backfill) |
| `encryptedProfiles` | `where("recipientAuthUids", "array-contains", auth.uid)` | `recipientAuthUids` (envelope keys resolved to auth UIDs) on every `putEncryptedProfile` write | 45 s `getEncryptedProfile` `setInterval` |
| `privatePostThreads/{tid}/messages` (per open post) | per-thread doc subscription gated by `where("participantAuthUids", "array-contains", auth.uid)` | `participantAuthUids` on both thread + message doc writes by `createPrivatePostThreadMessage` + backfill in `listPrivatePostThreadMessages` | post-action `.then(() => hydratePrivateThreadForPost(post))` reload chains for *remote* changes |

The `userFirebaseAuthMap/{uid}` collection (populated by `registerFirebaseAuthUid` on sign-in) holds the app-uid → Firebase Auth UID mapping. It is **not directly readable or writeable by clients** (admin SDK only) and is consulted server-side by `resolveParticipantAuthUids` whenever a write callable needs to compute the mirror array.

**Local cache (`app/lib/clientSyncCache.ts`)** survives sign-out and is keyed by signed-in email:
- `mvpplus.syncWatermarks.v1:<email>` — last seen `createdAtMs` and last full-sync wall-clock for messages and posts. Seeded on every `applySignedInAccount` so the boot-time `listEncryptedMessages` / `listEncryptedPosts` callable pulls run as **incremental** `sinceMs` queries instead of replaying the full backlog.
- `mvpplus.friendKeyBundles.v1:<email>` — friend public-key cache. Eliminates the first-post-cold-start `getFriendKeyBundles` round-trip before an outbound message can encrypt.

**RN-specific transport:** Firestore is initialised with `experimentalForceLongPolling: true` because the default WebChannel transport is unreliable under Hermes on Android. Long-polling still pushes updates within sub-second latency and is far more resilient on mobile networks.

**Lifecycle:** all listeners attach on sign-in (after `claimDeviceSession` and `registerFirebaseAuthUid`) and detach on sign-out, session replacement, or Firebase Auth UID change. The per-thread private-post listener additionally attaches/detaches with `fullScreenPost`.

**Deployment requirement:** the push paths only work after `firebase deploy --only functions,firestore:rules,firestore:indexes` from this workspace. Without the deploy, clients fall back transparently to the callable pulls and the local cache, and any new messages/friends/posts/profiles won't push until the rules + indexes are live.

### Messaging and real-time social

- **1:1 chat** between friends using **encrypted** message path in production scenarios; delivery status semantics (`Sending…` / `Sent` / failures) described per build type. Live delivery uses the `messages` collection-group `onSnapshot` listener (see the table above); the boot-time `listEncryptedMessages` callable pull is now an **incremental** `sinceMs` query seeded from the persisted watermark, so a cold start no longer replays the full 200-row backlog.
- **Group chats** and **broadcast** flows, including metadata editing (title/avatar where applicable), saved broadcast groups, and thread behavior documented in **`FEATURE_TEST_SCENARIOS.md`**.
- **Replies** (in ciphertext) and **new-message encrypted sync** are server-backed. **Reactions, edits, and unsend** exist in UI but are **local-only** today (not propagated to other devices)—see **`Planning/CHAT_FEED_IMPLEMENTATION_ROADMAP.md`** (**C-P2-2**) for planned server sync.
- **Media:** photos, gallery, camera, video, voice notes; optional native editing before send where the platform allows. All locally picked media URIs are uploaded to Firebase Storage as a **Blob** (RN's `Blob` constructor refuses `ArrayBuffer`/`ArrayBufferView` parts, so `uploadBytes` is fed `await fetch(uri).blob()`) before the resulting HTTPS download URL is encrypted into the recipient payload; ciphertext is never carried inline.
- **Presence** aligned with foreground-only online semantics and quick offline aging.
- **Drafts and chat deletion:** lifecycle behaviors that must survive sync and restart without “ghost” rows.
- **Chat list visibility rule (no identity leak via empty rows):** the home chat list renders a row **iff** the chat has at least one visible message (after `joinCutoffForViewer` + `hiddenFromOwner` filtering) **or** the chat is the viewer’s own draft (`isDraft && createdBy === me`) carrying non-empty `draftComposerText`. A chat with no messages and no saved draft text must **never** appear (no friend username/avatar leakage from an otherwise empty thread). Legacy ghost-empty chats persisted in `AsyncStorage` are pruned at sign-in by `pruneGhostEmptyChats` (`app/lib/viewPersistence.ts`). Drafts whose `visibleToRecipients !== true` stay private to the drafter until the first message is sent. Tombstone-with-history rendering for unfriended counterparts is still backlog (tickets **T6 / T9**).

### Feed, posts, and profile

- **Permanent posts** (friends-only visibility), **friends feed**, and **profile grid** below bio with thumbnail rules converging toward **`PLANNING.md` §3.8** and **`Planning/MVP_PLUS_PLAN.md`** (ordering starts from clear **newest-first** / **new** semantics unless extended).
- **Post sync** is **push-based** via the `encryptedPosts` `onSnapshot` listener (see the "Push-based sync architecture" table). New friend posts and `deleteEncryptedPost` removals propagate in real time. The legacy poll-on-open `listEncryptedPosts` call (`home + feed`, `myProfile`, `friendProfile`, and on foreground) is still kept and serves two roles: (a) backlog fetch on first sign-in when the snapshot listener has no cached docs, and (b) the trigger for the server-side `recipientAuthUids` backfill on pre-migration posts. **Planned (not built):** pull-to-refresh, infinite scroll, in-feed video autoplay, server-synced post reactions — **`Planning/CHAT_FEED_IMPLEMENTATION_ROADMAP.md`** (**F-P0-***).
- **Post publishing** through encrypted/backend-backed paths in release scenarios; optimistic rollback on failure.
- **Post comments:** thread behavior and composer UX documented in scenarios (including full-screen composer parity with chat patterns); inline rows may remain **presentation-only** on the card where specified.
- **New-post composer (`publishPost` screen):** media tray uses **icon-only** add-photos / add-video / clear actions; Cancel and Publish live in a **sticky bottom footer** that adds `Math.max(insets.bottom, 16)` Android padding so the primary action never sits inside the gesture/nav reserved area. The Android navigation bar tint follows `theme.background` (set globally by the screen-level nav-bar effect in `MainApp.tsx`).
- **Profile picture upload:** when a user edits their profile picture, the local file URI is shown as an instant preview but is **immediately uploaded** via `uploadSharedMediaFromDevice` and replaced with the HTTPS download URL before the debounced `putEncryptedProfile` ships it to recipients. The persistence + decrypt-sync read paths sanitize incoming values so anything that is not `https://` is dropped to `null` (defends against stale `file://` blobs from older builds).
- **Theming:** dark mode and accent persistence; accessibility/contrast notes on key screens (e.g. Add Friend) per scenarios.

### Security and privacy (as built)

- **Friend-gated** reads for sensitive profile fields and messaging (defense in depth: client + rules + callable validation).
- **E2EE verification** checklists in **`Planning/E2EE_VERIFICATION_CHECKLIST.md`** for messaging hardening.
- **Pairing replay resistance** via short-lived offers and server-side validation.

---

## Chat & feed implementation roadmap (May 2026)

**Full ticket list:** **`Planning/CHAT_FEED_IMPLEMENTATION_ROADMAP.md`**.

Summary of product decisions (planning only — **no code started**):

| Area | Implement now (when scheduled) | Todo (do not start) |
|------|-------------------------------|---------------------|
| **Chat P0** | OS push; read avatars below last-read message; per-chat pagination | Typing indicators; offline send queue |
| **Chat P1** | Add member; creator = admin; leave/kick; server history cutoff for new members | — |
| **Chat P2** | Shared media gallery; sync edit/unsend/reactions; voice polish; module split; retry UX | — |
| **Feed P0** | Reactions (friends-only visibility on friends’ posts); infinite scroll; pull-to-refresh; in-feed video | Share/repost (design TBD) |
| **Feed P1** | Thread reaction taps; edit post; multi-device private comments | — |
| **Feed product** | **No** public comment threads (private threads only) | — |

---

## Cross-cutting roadmap (plain language)

**“Cross-cutting”** means features that span chat, feed, and the whole app—not one screen.

| Topic | What it is today | Planned (you approved) |
|-------|------------------|------------------------|
| **OS push notifications** | Only Firestore realtime while the app is open | **Implement** — notify when app is closed; open the right chat |
| **In-app “push” sync** | `onSnapshot` listeners for messages, posts, friends, profiles | Keep; this is **not** OS push |
| **Presence (online strip)** | Callable poll every ~10 s | **Implement** — Firestore listener so online status updates faster |
| **Unfriend / ex-friend posts** | Mostly client-side hiding | **Implement** server filtering (**T3/T8**) so ex-friend posts never arrive |
| **Tombstone “User” UI** | Partial / backlog | **Implement** (**T6–T10**) — generic name/avatar, frozen DMs, group kick rules |
| **Unfriend + group kick backend** | Partial | **Implement** (**T1/T2**) |
| **Global user search** | Not present | **Never** — friends-only search only (explicit non-goal) |

Details and ticket IDs: **`Planning/CHAT_FEED_IMPLEMENTATION_ROADMAP.md`** § Cross-cutting.

---

## Future improvements (planned in docs, not the current baseline)

Items below appear in **`Planning/PLANNING.md`**, MVP roadmaps, or **`App Final V2/docs/`**, but are **explicitly not** part of the **MVP+ baseline** or are **deferred / unimplemented** as a complete product slice in the current planning artifacts. Implement in **App Final V3** when prioritized; update this section when any item lands in the release APK baseline.

### Vulnerable accounts and guardians

- **`accountType: vulnerable`**, **up to five guardians**, **3-way friendship handshake** (vulnerable user + guardian + prospective friend), **guardian ratification** for guardian adds, and **asynchronous multi-guardian approval** to remove vulnerable status (**`PLANNING.md` R11, R12, R18; §3.2; P5**).
- Firestore collections and function workflows described in **`PLANNING.md` §7** (`guardianRatifications`, `vulnerableRemovalRequests`, etc.) as a coordinated feature—not partial stubs.

### Full ephemeral stories / reels / pins (full-product depth)

- **24-hour story lifecycle**, **`friends_only` vs `sharable` tags**, **creator-only story comments**, **pinned profile stories** (up to five non-sharable slots), **pin fan-out on new friendship**, and associated feed fan-out/expiry jobs (**`PLANNING.md` R5–R9, R14–R15, P4**).  
  *Note:* **`Planning/MVP_PLUS_PLAN.md`** explicitly excluded full story/pin scope from MVP+; **`FEATURE_TEST_SCENARIOS.md`** may mention optional story smoke—treat **full parity with §3 and R5–R9** as future unless the release APK proves otherwise.

### Transport and pairing policy (product-level consolidation)

- **`App Final V2/docs/DECISIONS.md`** scopes **near-term rebuild** work to **QR-only OOB** in the clean V2 architecture; **`App Final`** retains **QR + NFC/BLE legacy** surfaces. A future decision may **collapse** alternate transports behind one user-facing story after production confidence—document in `DECISIONS` equivalent when made.

### Feed and ranking breadth

- Additional **explicit modes** (`hot`, `popular`) with published formulas/time windows (**`PLANNING.md` R20, §9**).
- **User-initiated feed refresh:** moved to **approved implement** list — **`CHAT_FEED_IMPLEMENTATION_ROADMAP.md`** **F-P0-3** (pull-to-refresh; header refresh button optional).

### Presence push delivery

- **Approved for implementation** (**`CHAT_FEED_IMPLEMENTATION_ROADMAP.md`** **X-P1-1**): move `setMyPresence` / `getFriendPresence` from a 10 s callable poll to a Firestore `onSnapshot` push. Two viable shapes: (a) rename `presence/{uid}` to be authUid-keyed and add a `friendAuthUids` array on each presence doc resolved on every heartbeat write (one extra Firestore read per heartbeat), or (b) introduce a separate `presenceSubscriptions/{viewerAuthUid}_{targetAuthUid}` indirection collection populated by a friendship trigger so the rule check is a doc-`exists()` against the subscription rather than an in-array check on every presence doc.

### Group graph edge cases

- Precise behavioral spec for **clique breaks** on unfriend (ejection rules, creator notifications) where still marked **open** in **`PLANNING.md` §9**.

### Posts and engagement (open product questions)

- Items listed under **`PLANNING.md` §9** for posts/video (fan-out vs pull, multi-image grid presentation, edit-after-publish, comment/reaction breadth beyond current scenarios, thumbnail UX depth).

### Organizational / production readiness (V2 roadmap mirror)

- **CI gates**, broader **telemetry/alerting**, and **beta sign-off** packaging as in **`App Final V2/docs/ROADMAP.md` Phase 4**—when this workspace grows execution trackers, mirror those tasks here or in sibling checklists.

### Other explicitly deferred V2 baseline items

From **`App Final V2/docs/PRODUCT_SPEC.md` “Explicitly deferred”** (still valid *product backlog* themes unless contradicted by the release APK):

- **Friends-of-friends discovery** (remains contrary to core values; any future “discovery” must be explicit and rare, if ever).
- **Broad parity with every legacy experimental UX path** outside the **baseline QR-led pairing** story.

---

## Tombstone, friendship gate, and account exit (agreed policy → backlog)

**Policy anchor (Feb 2026 alignment):** Friendship unlocks **identity** and **messaging**. Outside friendship, others see **no real profile** — except on the **friend-add confirmation** screen (only time pre-friend username/photo appear). **Search** stays **in-network only** (friends) for friends list and composer/broadcast picking — **no global user search.**

**Tombstone (“User” + blank avatar):** For threads where **interaction existed while friends**, then friendship ends or account is deleted — **not** for “declined add friend” (no surface). **Friends list:** non-friends **disappear** (no tombstone row). **Header taps** that would open profile: **no-op** for tombstone / non-friend contexts.

**Posts:** No visibility of ex-friend or deleted-account **posts** for viewers who lost access — **including** threads where you commented.

**Groups:** Pairwise-friend rule for adds; **both** members auto-kicked when their pairwise friendship breaks; owner may re-add when graph allows; **frozen** period vs **live** period; history **does not rewrite** — estranged-era messages stay **“User”**; after re-friendship, **new** messages show real names.

**1:1 after re-friendship:** Old DM becomes **read-only artifact**; **new** friendship starts a **fresh** 1:1 thread.

**Self-delete account:** Irreversible warning. **Your posts** removed for everyone. **Your chat messages** may remain for recipients under tombstone **“User.”** **Comments/reactions on others’ posts** remain but attribute to **“User.”**

---

### Ticket backlog (implementation order suggested)

| ID | Area | Deliverable | Acceptance / notes |
|----|------|-------------|-------------------|
| **T1** | Backend — unfriend | Callable(s) to **end friendship** server-side: delete or mark `friendships` edge; optional **`friendshipEndedAt`** on edge for analytics; **immediate** effect for both clients on next sync. | Pairwise unfriend updates Firestore; `listMyFriends` / profile gates respect new state; idempotent. |
| **T2** | Backend — group kick | On pairwise friendship break, **remove both** UIDs from any **shared group** conversations (or mark membership inactive per schema); write **system message** (“both left” / policy copy). | No stranded members violating pairwise rule; owner flow unchanged for re-add when friendships exist. |
| **T3** | Backend — posts & feed | When viewer loses friendship or author deletes account: **exclude** author’s posts from `listEncryptedPosts` (or equivalent); **strip or tombstone** comments/reactions by deleted user as **“User.”** | No post cards from blocked authors; comment rows show generic label only. |
| **T4** | Backend — messages | Ensure **message list** calls resolve **display epoch**: tombstone when `message.sentAt < friendshipEndedAt` (or edge archived) vs live — or store **displayRevision** per thread per participant if simpler for client. | Scrollback rules from policy without rewriting ciphertext plaintext strategy (may be metadata-only). |
| **T5** | Backend — account deletion | Admin/auth trigger or callable: **delete Auth user** + cascade: user doc, friendships, **posts** ownership, anonymize **comments/reactions** to “User”, **leave** message bodies for peers with tombstone sender metadata. | Matches deletion matrix in policy anchor; documented in user-facing delete dialog. |
| **T6** | Client — tombstone UI | Central **resolveParticipantDisplay(uid, threadContext)** → `{ label, avatarUrl, profileNavigation: 'none' \| 'friend' }`. Chat bubbles, headers, lists use it. | Taps on avatar/name **no-op** when not allowed; no black-screen routes. |
| **T7** | Client — friends list | Remove unfriended users **from list** immediately after successful unfriend + hydrate. | Ghost names do not persist after server truth updates. |
| **T8** | Client — feed / post detail | Hide posts from non-friends / deleted authors; hide or tombstone **your** comments on invisible posts per rules. | Matches T3. |
| **T9** | Client — 1:1 threads | On unfriend: **freeze** thread UI (no composer / clear “past conversation” copy). On **new** friendship: **create new chat id** for DM; old thread remains artifact only. | Two threads max scenario documented for QA. |
| **T10** | Client — groups | Implement **frozen vs active** UI for kicked/re-added user; **historical band** remains “User” for estranged period. | Visual distinction optional (date divider + label). |
| **T11** | Client — delete account | Settings flow: **warning** copy (posts gone; messages remain for others as User; comments as User); call T5; logout locally. | Single destructive confirmation; no recovery claim. |
| **T12** | QA / scenarios | Extend **`FEATURE_TEST_SCENARIOS.md`** (or V3 equivalent) with **unfriend**, **group kick**, **re-add**, **DM artifact + new DM**, **delete account** matrix. | Release checklist for APK sign-off. |

**Suggested phasing:** **T6 + T7** (stop bleeding + list truth) → **T1** → **T2** → **T9** → **T3 + T8** → **T4 + T10** → **T5 + T11** → **T12**.

Dependencies: **T4** may need a product decision on whether **server** sends display hints vs **client** derives from timestamps + friendship events — pick one pattern and document in **`contracts/`** or backend README.

---

## Traceability

| Source | Role |
|--------|------|
| **`Planning/PLANNING.md`** | Full requirements catalog, R-ids, data model sketch, phases P0–P6. |
| **`Planning/MVP_*.md`** | Phased execution for messaging, look, MVP+, etc. |
| **`FEATURE_TEST_SCENARIOS.md`** | Executable acceptance language for the current prototype/release behaviors. |
| **`App Final V2/docs/PRODUCT_SPEC.md`** | Concise principle + phase requirements used as **style and discipline** inspiration for this file. |
| **`App Final V2/docs/ROADMAP.md`**, **`DECISIONS.md`** | Phase structure and locked decisions for rebuild workstreams (QR-only V2 architecture vs legacy tree). |

---

## Document governance

- **Core values** should remain stable unless you intentionally revise this file alongside user-visible change.
- When **App Final V3** gains a capability that was listed under **Future improvements**, move that bullet into **Current application scope** and leave a dated note in **`Planning/CHANGELOG.md`**.

**Version:** 1.7 — **`Planning/CHAT_FEED_IMPLEMENTATION_ROADMAP.md`** added (May 2026): chat/feed IMPLEMENT vs TODO from product review; cross-cutting section; corrected messaging metadata sync wording.

**Version:** 1.6 — push (`onSnapshot`) sync extended from messages to **friendships, encrypted posts, encrypted profiles, and private post threads**, each via a `participantAuthUids` / `recipientAuthUids` auth-UID mirror populated by every write callable and gated by Firestore rules on that mirror. Boot splash is now **fully local**: it waits only on Firebase Auth state resolution + a 500 ms minimum, then renders home from cache while a background `listMyFriends` / `getUserProfiles` / `listEncryptedMessages` pull and the snapshot listeners reconcile against the server. Local cache adds persisted sync watermarks (so cold-start callable pulls are incremental, not full-backlog replays) and a friend public-key cache (so first send after cold start needs no extra `getFriendKeyBundles` round-trip). The legacy app-level user id (`u_…`) is now named **`uid`** everywhere (was `demoUid`); backend callables still accept the old `demoUid` field name for wire-protocol compatibility with already-deployed clients. Presence is still callable-polled (10 s heartbeat) — pushing it requires either renaming `presence/{uid}` to be authUid-keyed or resolving the friend-uid list on every write; deferred to a follow-up (May 2026).  
**Last aligned to:** `App Final V2/docs/PRODUCT_SPEC.md`, `Planning/PLANNING.md` v1.8, `FEATURE_TEST_SCENARIOS.md`, `Planning/MVP_PLUS_PLAN.md`, agreed tombstone policy (Feb 2026).
