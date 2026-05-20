# Bug audit (May 2026, v4)

Read-only pass after reaction UX, presence, and chat-title fixes. Supersedes informal notes only where listed; see also `BUG_AUDIT_MAY2026_V3.md`, `MESSAGING_BUG_AUDIT_MAY2026.md`, and `MESSAGING_BUG_AUDIT_MAY2026.md` for prior fixed items.

**Scope:** `app/messaging/*`, `app/presence/*`, `app/components/ReactionBubbleHost.tsx`, `MainApp.tsx` (chat/feed/reactions), `app/lib/participantDisplay.ts`, `backend/functions` callables.

**Method:** Static code review (no device run in this pass).

---

## Fixed in code (v4 pass — 2026-05-20, verify on device)

| ID | Fix summary |
|----|-------------|
| C1 | Listener re-decrypts `modified` when `editedAt` is set |
| C2 | `listEncryptedMessages` merges `createdAt` + `editedAt` incremental queries; Firestore index added |
| H4 | Chat reaction pills use `aggregateReactionCounts` + `visibleFriendIds` |
| H5 | Global listener limit raised to 1000 |
| H6 | `listConversationMessages` limit 500; per-thread pull on chat open |
| H7 | Per-chat outbound send queue (`useOutgoingMessages`) |
| H8 | `registerFirebaseAuthUid` calls `refreshPresenceViewerAuthUids` only (no forced online) |
| M1 | Metadata patches apply only when snapshot generation matches |
| M2 | 90s timeout sets `deliveryStatus: failed`; cleared on deliver success |
| M3 | Long-press actions disabled on unsent messages |
| M4 | `chatScreenTitle` deps include `serverFriendUidsForDisplay` / `resolvePd` |
| M5 | Empty server friend set no longer trusts all local friends for display |
| M6 | Listener/pull decode passes `allFriends` for inbound chat names |
| M7 | `send.ts` uses `friendIdToBackendUidRef.current` for `memberJoinedAt` |
| M8 | Watermark advances on partial batch success (`messageSyncCursorMs`) |
| M9 | Feed react FAB disabled without session |
| L1–L3 | Reaction pill wrap, dark-theme detection, removed dead variable |

**Also fixed earlier in May (not re-listed):** H1, H2, H3, presence, ingest policy, comment hydration, etc.

---

## Already fixed (v3 / May 2026 — verify on device)

| Area | Fix |
|------|-----|
| E2EE reinstall | `deviceId` on `getUserKeyBackup`; no key overwrite on failed decrypt |
| Outbound send | Per-message `sent` / partial failure handling |
| Sync watermarks | No advance past decrypt failures |
| Presence | `registerFirebaseAuthUid` refreshes `viewerAuthUids`; boot publish/poll |
| Chat title (partial) | Local name when server set empty; `friendMap` on open DM |

Re-run `FEATURE_TEST_SCENARIOS.md` and `scripts/TWO_PHONE_PARITY_CHECKLIST.md` after each deploy.

---

## Critical

| ID | Issue | Symptom | Location | Suggested fix |
|----|--------|---------|----------|----------------|
| C1 | **Edited message body not synced to recipients** | Editor sees new text; recipient keeps old body (may get `editedAt` only) | `app/messaging/sync.ts` ~244–248; `backend/functions` `updateEncryptedMessage` | On Firestore `modified`, re-decode when ciphertext changes; do not `continue` before decrypt for existing local rows |
| C2 | **Incremental pull skips edits** | `listEncryptedMessages` uses `createdAt > sinceMs`; edits do not bump `createdAt` | `backend/functions/src/index.ts` ~2230–2233 | Incremental query on `updatedAt` / `editedAt` or separate “changes since” pull |

---

## High

| ID | Issue | Symptom | Location | Suggested fix |
|----|--------|---------|----------|----------------|
| H1 | **Message actions unreachable** | Long-press only opens reaction picker; Reply / Edit / Unsend modal never opens (`openMessageActions` has no callers) | `MainApp.tsx` ~5501, ~8622+, modal ~9583 | Long-press → actions sheet, or picker row “More…” (partial link exists); restore `openMessageActions` on long-press |
| H2 | **Identity-locked chat title leak** | Header shows real name after unfriend/refriend lock; list may show **User** | `MainApp.tsx` ~1854–1856 | Do not use `friendMap` fallback when `activeChatIdentityLocked` or `pd.displayName === "User"` |
| H3 | **Feed reaction pill omits self** | Your reaction on + button but not on attached pill / detail list | `MainApp.tsx` ~6335–6349, ~5723+ | Include `CURRENT_USER_ID` in aggregation (like `aggregateReactionCounts`) |
| H4 | **Chat reactions not friend-filtered** | Pills count ex-friends / unknown UIDs; comments use `visibleFriendIds` | `MainApp.tsx` `getReactionEntries` ~5667 | Use `aggregateReactionCounts` + `visibleFriendIds` for messages |
| H5 | **Global message listener cap (500)** | Missed realtime messages in quiet chats when account is busy | `app/messaging/sync.ts` ~167–172 | Per-active-chat listeners or higher scoped queries |
| H6 | **Global callable pull cap (200)** | Boot/poll pull drops older threads | `sync.ts`, `preludeConstants`, `index.ts` | Per-conversation pull + cursors when opening chat |
| H7 | **Concurrent `commitOutgoingMessages`** | Double-send / wrong `deliveryStatus` if user sends fast | `useOutgoingMessages.ts` | Per-chat outbound queue; dedupe by `message.id` |
| H8 | **`registerFirebaseAuthUid` forces presence active** | User shows online when only fixing auth map, not foreground | `backend/functions/src/index.ts` ~331–332 | Update `viewerAuthUids` only; do not set `state: "active"` on register |

---

## Medium

| ID | Issue | Symptom | Location | Suggested fix |
|----|--------|---------|----------|----------------|
| M1 | **Metadata patches before snapshot generation guard** | Reactions/unsend flicker or revert under rapid snapshots | `sync.ts` ~313–319 vs ~319 | Apply metadata only when `generation === snapshotGeneration` |
| M2 | **90s sending timeout vs in-flight send** | Label clears while send still running | `useOutgoingMessages.ts` ~143–151 | Clear on deliver completion or show failed/retry |
| M3 | **Reactions on unsent messages** | Long-press still opens picker after unsend | `MainApp.tsx` long-press handlers | Disable picker when `item.unsentAt` |
| M4 | **`chatScreenTitle` stale deps** | Title tombstone/name lags after roster sync | `MainApp.tsx` ~1867–1878 | Add `serverFriendUidsForDisplay` / `resolvePd` to `useMemo` deps |
| M5 | **Empty server friend set trusts all local** | **User** vs real name wrong until roster fills; opposite of strict privacy | `participantDisplay.ts` ~32–34 | Use `null` = loading, `Set` empty = tombstone until boot completes |
| M6 | **Auto-chat title “Friend”** | New inbound thread generic name | `decodeIncoming.ts`; `sync.ts` omits `allFriends` | Pass friend map into decode/listener refs |
| M7 | **`send.ts` stale `friendIdToBackendUid` for join-at** | Wrong `memberJoinedAt` keys | `send.ts` ~136–141 | Use `friendIdToBackendUidRef.current` |
| M8 | **One decode failure blocks batch watermark** | Stuck re-pulling same doc | `sync.ts` ~325–331 | Advance watermark per successful id; quarantine bad docs |
| M9 | **Feed react without session** | Tap + on feed; silent no-op | `MainApp.tsx` feed `HoldToReactButton` | `disabled={!session}` like comments |

---

## Low

| ID | Issue | Symptom | Location |
|----|--------|---------|----------|
| L1 | Reaction pill `flexWrap: "nowrap"` overflow | Many emojis clip past bubble | `ReactionBubbleHost.tsx` |
| L2 | Dark pill uses `background === "#000000"` only | Wrong pill on near-dark themes | `ReactionBubbleHost.tsx` |
| L3 | Dead `myMessageReactionEmoji` per row | Wasted work | `MainApp.tsx` ~8478 |
| L4 | Duplicate picker UIs | `HoldToReactButton`, `ReactionPickerModal`, `MainApp` modal | Multiple files |
| L5 | `AppDemo.tsx` diverges from production | Misleading QA on demo APK | `AppDemo.tsx` |
| L6 | `optimisticWindowMs` unused in `mergeSyncedMessages` | Misleading API | `mergeEncryptedSync.ts` |

---

## Suggested fix order (engineering)

1. **C1 + C2** — message edits visible to recipients  
2. **H1** — restore message actions (regression from reaction long-press change)  
3. **H2** — identity-locked title privacy  
4. **H3 + H4** — reaction display parity (feed + chat)  
5. **H5 + H6** — sync scale (active chat)  
6. **H7 + M2** — send reliability  
7. **H8 + M5** — presence + display trust rules  

---

## Device verification matrix (after fixes)

| # | Test | Pass criteria |
|---|------|----------------|
| 1 | A edits message; B has chat open | B sees new text within ~5s |
| 2 | Long-press message | Actions sheet **or** picker with path to Reply/Edit |
| 3 | Unfriend → refriend, open old locked DM | Header stays **User** |
| 4 | React to own post | Pill shows your emoji |
| 5 | Two phones, foreground | Online strip within ~10s |
| 6 | Send text | **Sending…** → **Sent**; not stuck |

---

**Last updated:** 2026-05-20 (static review, App Final V3 workspace).
