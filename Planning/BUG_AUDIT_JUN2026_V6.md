# Bug audit (Jun 2026, v6)

Read-only sweep after **deleted-post cache** fixes, cloud snapshot upload on delete, and boot full-reconcile when `deletedPostIds` is non-empty. Prior backlog: `BUG_AUDIT_MAY2026_V5.md`.

**Method:** Static review + `npm run typecheck` + `cd backend/functions && npm run build` (both passed Jun 2026).

**Canonical app:** `app/MainApp.tsx` (not `AppDemo.tsx` for release QA).

---

## Deploy / preflight

| Check | Command |
|-------|---------|
| Client TS | `npm run typecheck` |
| Functions | `cd backend/functions && npm run build` |
| Functions deploy | `firebase deploy --only functions` (repo root) |
| Indexes | `firebase deploy --only firestore:indexes` (when indexes changed) |
| APK (client-only fixes) | `npm run apk:release` |

**Recent delete-cache work:** app-only — **no functions redeploy** unless you also changed `backend/functions/`.

---

## Verified fixed since v5 (do not re-file without regression)

| Area | Evidence |
|------|----------|
| Deleted post flash on reopen | `deletedPostIds` in watermarks; `persistPostsNow`; boot filter; merge suppress; cloud snapshot on delete; no stale snapshot re-upload on sign-in (`MainApp.tsx`, `mergeEncryptedSync.ts`, `clientSyncCache.ts`) |
| Feed reaction detail includes self | `feedReactionDetailRows` filters `userId === CURRENT_USER_ID` (`MainApp.tsx` ~7948–7966) — **H2 from v5 closed** |
| Delete post session wait | `waitForBackendSession` in `confirmDeletePost` |
| Boot friends / tombstone “User” | See `CHANGELOG.md` Jun 2026 friend/boot entries |

---

## Critical

None newly confirmed in this pass.

---

## High

| ID | Issue | Status |
|----|--------|--------|
| H1 | Feed reactions not realtime | **Fixed** — per-post `encryptedPostReactions/{postId}` listeners on home feed (`MainApp.tsx`, `mapPostFeedReactions.ts`) |
| H3 | `registerFirebaseAuthUid` forces active presence | **Fixed** — removed `writePresenceWithViewers(..., "active")` from auth registration (`backend/functions/src/index.ts`) |

---

## Medium

| ID | Issue | Symptom | Location | Suggested fix |
|----|--------|---------|----------|----------------|
| M1 | **Partial local cache clear** | **Fixed** — `clearLocalSocialCacheForEmail` + `resetLocalStateForCurrentUser` clear feed mutes, reaction-seen, posts-shared |
| M3 | **Boot sync “done” before pulls finish** | UI ready while timeline still catching up | `app/boot/useInitialServerSync.ts` | Tie `initialServerSyncDone` to pull completion or show syncing |
| M4 | **Message actions inside reaction picker** | **Fixed** — chat long-press sheet shows Reply/Edit/Unsend above emoji row; title “Message” |
| M5 | **Failed send: no retry tap** | **Fixed** — tap failed bubble (text/photo/video/voice) retries send; “Try again” row unchanged |
| M6 | **Chat header name vs tombstone** | List **User**; open chat shows old name | `chatScreenTitle` | Respect identity lock / tombstone |
| M8 | **Silent AsyncStorage failures** | Lost mutes / watermarks with no UI | Many `.catch(() => …)` persist paths | Log + optional user warning |
| M9 | **`deletedPostIds` unbounded** | Long-term account accumulates ids in watermarks blob | `clientSyncCache.ts` | Cap (e.g. last 500) or prune ids absent from feed for 30d |

---

## Low

| ID | Issue | Location | Notes |
|----|--------|----------|-------|
| L1 | Wrong posts key on sign-out reset | `MainApp.tsx` `resetLocalSocialStateForSignedOut` ~3312 | Uses legacy `POSTS_STORAGE_KEY` not `postsStorageKeyForEmail(email)`; per-email posts intentionally kept for return sign-in |
| L2 | **AppDemo parity** | `AppDemo.tsx` | Not release behavior |
| L3 | Pairing poll errors swallowed | `AddFriendScreen.tsx` | Cancel detection delayed |
| L4 | `optimisticWindowMs` unused in `mergeSyncedMessages` | `mergeEncryptedSync.ts` | Dead parameter |
| L5 | Friend’s deleted post ghost in cache | Incremental merge keeps local rows not in server page until full reconcile | Full pull on profile / `postsLastFullSyncAt` expiry mitigates |

---

## Downgraded / closed from v5

| ID | Status |
|----|--------|
| H2 | **Fixed** — reaction detail includes self |
| H4 | **Outdated** — inbox listener uses `ENCRYPTED_MESSAGES_LISTENER_LIMIT = 40` (`preludeConstants.ts`); per-open-chat listener exists. Re-open only if QA shows missed messages on busy accounts |

---

## Manual smoke (two phones)

| # | Flow | Pass |
|---|------|------|
| 1 | Delete post → wait 30s → force-quit → reopen | No flash of deleted post on feed |
| 2 | Delete post on A | Gone on B (listener or feed open) |
| 3 | A reacts on B’s post while B on feed | B sees pill without leaving feed (fails → H1) |
| 4 | Tap reaction summary on own post | “You” row visible |
| 5 | Mute 24h → sign out → sign in | Still muted |
| 6 | Add Friend → profiles + push for new friend | Names not stuck on **User** |

---

## Suggested fix order

1. H1 — feed reaction realtime  
2. H3 — presence on `registerFirebaseAuthUid`  
3. M1 — complete cache clear keys  
4. M5 / M4 — chat send recovery + actions discoverability  

---

**Next:** Implement by ID in Agent mode, or run device matrix and attach logs for failed rows.
