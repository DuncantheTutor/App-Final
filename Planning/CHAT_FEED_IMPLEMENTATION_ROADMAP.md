# Chat & feed implementation roadmap

**Status:** Implementation in progress (May 2026). Deploy backend (`functions`, `firestore:rules`, `firestore:indexes`) before testing push, read receipts, and group membership on device.  
**Authority:** Product decisions from chat audit; supersedes informal backlog bullets where they conflict.

**Legend**

| Label | Meaning |
|-------|---------|
| **IMPLEMENT** | Approved for implementation planning now; engineering may break into tickets and build when scheduled. |
| **TODO** | Recorded backlog — **do not start work** until explicitly promoted to IMPLEMENT. |
| **CONFIRMED** | Product rule (not a build task). |

Canonical code: repository root (`app/MainApp.tsx`, `backend/functions/src/index.ts`).

---

## Chat

### P0 — IMPLEMENT

| ID | Deliverable | Acceptance / design notes |
|----|-------------|---------------------------|
| **C-P0-1** | **OS push notifications** (FCM/APNs via Expo) | New message (and optionally post) when app is backgrounded or killed. Deep link opens the correct `chatId`. Respect per-chat mute (`mutedForNotifications`) server-side or via push payload filter. Badge count optional v1. Requires: `expo-notifications`, device token registration callable, Cloud Function on `sendEncryptedMessage` (and policy for group/broadcast). **Not** the same as Firestore `onSnapshot` (in-app realtime). |
| **C-P0-2** | **Read position UI** (no typing indicators) | Instead of checkmarks: show each participant’s **small profile picture** on the thread, positioned **below the lowest message they have read** (1:1 and group). Requires server-backed read cursor per `(conversationId, participantId)` updated when viewer scrolls/opens thread; clients render avatars at the read watermark. E2EE: read position is **metadata** (not message plaintext). |
| **C-P0-3** | **Per-chat message pagination** | Scroll-up loads older messages for **active chat only** (cursor on `createdAt` / doc id). Replace reliance on global 200/500 caps for thread UX. Preserve inverted list + scroll anchor when prepending (`maintainVisibleContentPosition` or equivalent). Boot/listener caps may remain for inbox preview but thread history must paginate. |

### P0 — TODO (do not implement yet)

| ID | Item |
|----|------|
| **C-TODO-1** | **Typing indicators** (“… is typing”) |
| **C-TODO-2** | **Offline send queue** — persist failed/outbox messages, auto-retry when online, tap-to-retry on bubble |

### P1 — IMPLEMENT

| ID | Deliverable | Acceptance / design notes |
|----|-------------|---------------------------|
| **C-P1-1** | **Add member (group)** | Server-orchestrated: callable updates `participantUids` / `participantAuthUids` on conversation + notifies members. Not local-only `memberIds` until next send. |
| **C-P1-2** | **Group admins** | **Chat creator = admin** (v1). Admin can add/remove members, kick, and transfer admin optional later. Store `adminIds` or `createdBy` + admin flag on conversation doc. |
| **C-P1-3** | **Leave / kick** | Member can leave; admin can kick. Server updates membership; system message optional. Align with tombstone policy (T2/T10) when friendship breaks. |
| **C-P1-4** | **History cutoff for new members** | **Server-enforced:** messages before `memberJoinedAt[uid]` are not returned to that member in list/decrypt paths. Client `memberJoinedAt` must match server truth after add. |

### P2 — IMPLEMENT (chat polish)

| ID | Deliverable | Notes |
|----|-------------|-------|
| **C-P2-1** | **Shared media gallery** | Replace MVP stub in chat menu; list images/files/videos in thread. |
| **C-P2-2** | **Message edit / unsend / reactions — server sync** | Today local-only; propagate via encrypted update envelope or metadata callables so all devices and participants see truth. |
| **C-P2-3** | **Voice note UX** | Waveform, playback speed, download state (WhatsApp-class polish). |
| **C-P2-4** | **Chat module split** | Extract `ChatScreen`, message list, composer from `MainApp.tsx` for perf (FlashList, `getItemLayout`) and testability. |
| **C-P2-5** | **Failed-send retry UX** | Tap bubble to retry (pairs with **C-TODO-2** when offline queue ships; P2 can ship retry-before-queue). |

---

## Feed

### CONFIRMED (product)

| Rule | Detail |
|------|--------|
| **No public comment threads** | Comments stay **private 1:1 threads** per (post owner, friend). Do not add IG/FB-style public comment threads. |
| **Likes = reactions** | Emoji reactions on posts; visibility rule below. |

### P0 — IMPLEMENT

| ID | Deliverable | Acceptance / design notes |
|----|-------------|---------------------------|
| **F-P0-1** | **Post reactions (likes)** | Wire `toggleReactionMap` (or equivalent). **Visibility:** on a friend’s post, you only see **your friends’** reactions (including your own). Persist server-side (encrypted payload extension or sidecar doc per post). Remove dead/read-only-only reaction UI. |
| **F-P0-2** | **Infinite scroll** | Feed `onEndReached` + cursor pagination in `listEncryptedPosts` / snapshot query (not fixed 150-only window for UI). |
| **F-P0-3** | **Pull-to-refresh** | `RefreshControl` on feed list; forces incremental pull + user feedback. Complements existing `onSnapshot`. |
| **F-P0-4** | **In-feed video** | Viewport-aware behavior: autoplay **muted** when card is sufficiently visible; pause when off-screen; tap for sound/fullscreen optional. Align with IG/TikTok expectations without a separate Reels tab. |

### P0 — TODO

| ID | Item |
|----|------|
| **F-TODO-1** | **Share / repost** — product shape TBD; no implementation until design is agreed |

### P1 — IMPLEMENT

| ID | Deliverable | Acceptance / design notes |
|----|-------------|---------------------------|
| **F-P1-1** | **Private comment thread reactions** | Wire UI `onPress` to `togglePrivatePostThreadMessageReaction` (backend exists). |
| **F-P1-2** | **Edit post after publish** | `updateEncryptedPost` (or new callable) + composer UX; optimistic rollback on failure. |
| **F-P1-3** | **Multi-device comment parity** | Ensure private-thread messages hydrate on all devices (not only via local `Post.comments` merge); listener or sync on post open / feed surface. |

---

## Cross-cutting / sync & presence

See **`Planning/MASTER_PRODUCT_PLAN.md` § “Cross-cutting roadmap”** for the plain-language summary.

### IMPLEMENT (user approved May 2026)

| ID | Deliverable | Notes |
|----|-------------|-------|
| **X-P0-1** | **OS push** | Same as **C-P0-1** (chat); extend policy for feed if desired. |
| **X-P1-1** | **Presence via Firestore push** | Replace 10 s `setMyPresence` / `getFriendPresence` poll with `onSnapshot` (see master plan options). |
| **X-P1-2** | **Server-side unfriend / delete filtering (T3, T8)** | Ex-friend posts hidden from `listEncryptedPosts` / feed listeners; not client-only filter. |
| **X-P1-3** | **Tombstone + thread freeze (T6, T7, T9, T10)** | “User” label, no profile navigation, frozen DM on unfriend, new DM on re-friend, group kick/frozen bands. |
| **X-P1-4** | **Unfriend callable (T1)** | Server ends friendship; both clients converge. |
| **X-P1-5** | **Group kick on friendship break (T2)** | Pairwise unfriend removes both from shared groups + system message. |

### Explicit non-goals (unchanged)

| Item | Status |
|------|--------|
| **Global user search** | **Never** — in-network (friends) search only. |
| **Public explore / For You** | **Never** per product principles. |
| **Friends-of-friends discovery** | **Never** |

### TODO / deferred (cross-cutting)

| ID | Item |
|----|------|
| **X-TODO-1** | Algorithmic feed modes (`hot`, `popular`) — only if ever requested |
| **X-TODO-2** | Stories / Reels / 24h ephemeral — full product in `PLANNING.md` R5–R9 |

---

## Suggested implementation phasing (engineering)

When work starts, recommended order (dependencies first):

1. **C-P0-3** pagination + **F-P0-2** / **F-P0-3** feed loading (unblocks scale)  
2. **C-P0-1** / **X-P0-1** push  
3. **C-P0-2** read watermarks  
4. **F-P0-1** reactions + **F-P0-4** video  
5. **C-P1-*** group membership server model  
6. **F-P1-*** feed engagement parity  
7. **X-P1-*** tombstone/unfriend/presence  
8. **C-P2-*** chat polish  

---

## Traceability

| Audit source | This doc |
|--------------|----------|
| Chat gaps (push, read, pagination, group, local-only edits) | § Chat |
| Feed gaps (reactions dead, no infinite scroll, no PTR, video) | § Feed |
| Tombstone tickets T1–T12 | § Cross-cutting |
| User decisions May 2026 | IMPLEMENT vs TODO labels throughout |

**Version:** 1.0 — initial roadmap from product review (May 2026).
