# Bug audit (May 2026, v5)

General read-only pass after feed mute persistence, post-delete sync, opaque pairing token, and feed hold-to-react fixes. See `BUG_AUDIT_MAY2026_V4.md` for the prior messaging/reaction sweep.

**Method:** Static code review (no device run in this pass).  
**Canonical app:** `app/MainApp.tsx` (not `AppDemo.tsx` for release QA).

---

## Deploy / preflight

| Check | Command |
|-------|---------|
| Client TS | `npm run typecheck` |
| Functions | `cd backend/functions && npm run build` |
| Indexes | `firebase deploy --only firestore:indexes` |
| Functions | `firebase deploy --only functions` |
| APK | `npm run apk:release` — same build on both test phones |

---

## Verified fixed since v4 (do not re-file without regression)

| Area | Evidence |
|------|----------|
| Message edit listener | `app/messaging/sync.ts` — re-decrypt when `editedAt` on `modified` |
| Incremental edit pull | `backend/functions/src/index.ts` + `firestore.indexes.json` |
| Per-chat send queue | `app/messaging/useOutgoingMessages.ts` |
| Per-conversation message pull | `app/messaging/sync.ts` `pullEncryptedMessagesForConversation` |
| Chat reaction aggregation | `aggregateReactionCounts` + `visibleFriendIds` in chat |
| Feed hold-to-react on media | `app/components/FeedPostCard.tsx` `handlePostLongPress` on slides/video |
| Post delete for friends | Full-catalog feed pull + `deleteEncryptedPost` + listener `removed` |
| Feed mute persistence | `app/lib/feedMutePersistence.ts` per-email AsyncStorage |
| Opaque pairing token | `pairOfferProtocol.ts` `AFQR2` / `PN2`; server mint in `registerNfcPinPairOffer` |

**Note:** v4 changelog claimed `registerFirebaseAuthUid` no longer forces online — **current code still calls `writePresenceWithViewers(..., "active")`** (~line 342). Treat presence-on-register as **still open** until removed.

---

## Critical

None newly confirmed in this pass. Prior criticals (E2EE `deviceId`, decrypt key overwrite) remain “verify on device” from v3/v4.

---

## High

| ID | Issue | Symptom | Location | Suggested fix |
|----|--------|---------|----------|----------------|
| H1 | **Feed reactions not realtime** | Friend reacts on a post; other user on feed does not see pill until feed refresh / re-enter | Reactions in `encryptedPostReactions/{postId}`; feed `onSnapshot` only merges new **posts** (`MainApp.tsx` ~1515–1620) | Secondary listener on `encryptedPostReactions` or patch reactions when post docs change |
| H2 | **Feed reaction detail omits self** | Your emoji on pill/summary; detail sheet empty for you | `feedReactionDetailRows` filters `visibleFriendIds` only (`MainApp.tsx` ~6397–6398) | Include `userId === CURRENT_USER_ID` in filter (match `FeedPostCard` ~126–129) |
| H3 | **`registerFirebaseAuthUid` forces active presence** | User shows online after auth-map repair without foreground app | `backend/functions/src/index.ts` ~342 | Refresh `viewerAuthUids` only; do not set `state: "active"` here |
| H4 | **Global message listener cap (1000)** | Busy accounts miss realtime updates in older/quiet threads | `app/messaging/sync.ts` `MESSAGE_LISTENER_LIMIT` | Per-open-chat listeners; document “open chat once” for QA |

---

## Medium

| ID | Issue | Symptom | Location | Suggested fix |
|----|--------|---------|----------|----------------|
| M1 | **Cache clear skips feed mutes** | Reset local state / `clearLocalSocialCacheForEmail` leaves `mvpplus.feedMutes.v1:{email}` | `app/lib/localSocialCache.ts`; `resetLocalStateForCurrentUser` | Remove feed-mute key in cache clear; reset in-memory on account reset |
| M2 | **Dual-confirm pairing 30s auto-cancel** | Confirm UI dismissed while users still deciding | `AddFriendScreen.tsx` `ADD_FRIEND_DUAL_CONFIRM_TIMEOUT_MS` | Longer timeout or reset on interaction |
| M3 | **Boot sync “done” before pulls finish** | Brief window: UI ready, timeline still catching up | `app/boot/useInitialServerSync.ts` | Tie done-flag to pull completion or show syncing |
| M4 | **Message actions inside reaction picker** | Long-press feels “react only”; Reply/Edit/Unsend hard to discover | `MainApp.tsx` reaction modal | Actions sheet first, or “More…” on picker |
| M5 | **Failed send: no retry tap** | “Not sent” with no recovery | `MainApp.tsx` delivery labels | Tap failed bubble → re-queue send |
| M6 | **Chat header name vs tombstone** | List shows **User**; open chat may show old display name | `MainApp.tsx` `chatScreenTitle` ~2017–2028 | Do not override with `friendMap` when identity locked / tombstone |
| M7 | **QR hides after 4s, PIN still valid** | Joiner must scan quickly | `AddFriendScreen.tsx` `ADD_FRIEND_QR_VISIBLE_MS` | “Show again” without re-register when PIN active |
| M8 | **Silent AsyncStorage failures** | Lost mutes / hidden chats / watermarks with no UI | `MainApp.tsx` persist effects | Surface warning; retry writes |

---

## Low

| ID | Issue | Location | Notes |
|----|--------|----------|-------|
| L1 | Wrong posts key on demo reset | `MainApp.tsx` ~2472 | Uses `POSTS_STORAGE_KEY` not `postsStorageKeyForEmail(email)` |
| L2 | **AppDemo parity** | `AppDemo.tsx` | No identity lock, fake pairing, auto-replies — do not judge release behavior from demo APK |
| L3 | Pairing poll errors swallowed | `AddFriendScreen.tsx` | Cancel detection delayed |
| L4 | `optimisticWindowMs` unused in `mergeSyncedMessages` | `mergeEncryptedSync.ts` | Dead parameter |

---

## Demo vs MainApp (testing)

| Topic | MainApp (`apk:debug` / release) | AppDemo (`apk:debug:demo`) |
|-------|--------------------------------|----------------------------|
| Firebase / E2EE | Live | Offline seeds |
| Pairing | QR/NFC + callables | Simplified / queue |
| Unfriend tombstone | `identityLockedChatIds` | Not modeled |
| Feed mutes | Persisted per email | Same module |

---

## Suggested fix order

1. H2 — feed reaction detail includes self (small, user-visible)  
2. H1 — feed reaction realtime  
3. H3 — presence on `registerFirebaseAuthUid`  
4. M1 — feed mutes in cache clear  
5. M4 / M5 — chat UX (actions + failed retry)  
6. H4 — listener scale (if QA shows missed messages)  

---

## Manual smoke (two phones)

| # | Flow | Pass |
|---|------|------|
| 1 | Opaque QR pairing + dual confirm | Friends on both devices |
| 2 | Delete post on A | Gone on B after feed open or refresh |
| 3 | Mute friend 24h → sign out → sign in | Still muted + badge |
| 4 | Hold-to-react on feed **photo** | Picker opens |
| 5 | A reacts to B’s post on feed | B sees pill without leaving feed (fails today → H1) |
| 6 | Tap reaction summary on own post | “You” row in detail (fails today → H2) |

---

**Next:** Implement fixes in Agent mode by ID, or run device matrix and attach logs for any failed row.
