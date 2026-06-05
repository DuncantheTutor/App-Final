# Dated change log (mandatory)

**Purpose:** **One entry per code change** (Cursor or human), with a **to-the-minute** timestamp and a brief description. Agents must append here in the same task as any file edit (see `.cursor/rules/timestamped-changelog.mdc`).

`Planning/CHANGELOG.md` stays release-oriented (topic buckets); **this file** is the bisect trail.

**Cursor chat:** User must start a message with **`(code)`** on the first line to allow file edits; otherwise read-only. After edits, agent asks whether to **git commit** (never commits without yes).

**Git reality (check with `git log`):** As of **2026-06-04**, the remote `main` branch still points at **`f85a5fd` (2026-05-20 23:47 +0100)**. Much Jun 2026 work may still be **uncommitted** in the working tree until you commit.

---

## 2026-06-05 21:28 +01:00

| Time | Area | Change |
|------|------|--------|
| 21:28 +01:00 | Chat / Keyboard | Fixed Android double keyboard lift; photo caption uses compact/wider composer when keyboard open. |

---

## 2026-06-05 21:08 +01:00

| Time | Area | Change |
|------|------|--------|
| 21:08 +01:00 | Chat / Media | Chat photos skip editor caption step; edited photo attaches above regular composer for optional caption + send. |

---

## 2026-06-05 21:05 +01:00

| Time | Area | Change |
|------|------|--------|
| 21:05 +01:00 | Chat / Keyboard | Android chat overlay shrinks with `bottom: keyboardHeight` (absoluteFill fix); auth KAV on both platforms. |

---

## 2026-06-05 21:03 +01:00

| Time | Area | Change |
|------|------|--------|
| 21:03 +01:00 | Auth / Keyboard | Login and OTP screens use KAV + scroll + Android keyboard lift so Request/Verify OTP buttons stay visible. |

---

## 2026-06-05 20:29 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:29 +01:00 | Chat | Read-receipt avatars always align to the right screen edge. |

---

## 2026-06-05 20:27 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:27 +01:00 | Chat | Scroll-up pagination kept messages in memory for the open thread; trim no longer deletes loaded history after fetch. |

---

## 2026-06-05 20:26 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:26 +01:00 | Keyboard / Media | Restore Android keyboard lift without KAV double-stack; Tier B decrypt runs 3-wide with high/low priority so tap-to-play video is not blocked. |

---

## 2026-06-05 20:23 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:23 +01:00 | Security / Git | Stop tracking Firebase API keys: `.env` + `app.config.js`, untrack `google-services.json`, scrub keys from planning exports. |

---

## 2026-06-05 18:26 +01:00

| Time | Area | Change |
|------|------|--------|
| 18:26 +01:00 | Keyboard / Posts / Comments | Stop stacking KAV + keyboardHeight padding; iOS-only KAV. Tier B carousel keeps one URI per slot on decrypt failure. Post comment composer uses ref+state like chat send. |

---

| Time | Area | Change |
|------|------|--------|
| 17:42 +01:00 | Testing fixes | Chat/post keyboard lift on Android; live fullscreen post comments; horizontal reaction pills; remove-reaction in picker; read receipts at screen edge; POST_NOTIFICATIONS + FCM token priority. |

---

| Time | Area | Change |
|------|------|--------|
| 22:15 +01:00 | Performance | Reverted AsyncStorage cache encryption (plaintext + one-time `enc1:` migration). Chat hydrate capped at **7** messages; boot pulls **visible chats only**; in-memory messages trimmed to visible/open threads. Feed remains **3** on land. |

---

## 2026-06-04 21:22 +01:00

| Time | Area | Change |
|------|------|--------|
| 21:22 +01:00 | Chat send (3 Jun fallout) | Reverted active-thread sort to `createdAt` (removed `messageThreadSortKey` on send). `activeChatForRead` uses thread-id fallback; conversation listener targets resolved row. Read watermark: server-only push (no local `setChats` on each message); skip while own message is `sending`. |

---

## 2026-06-04 21:04 +01:00

| Time | Area | Change |
|------|------|--------|
| 21:04 +01:00 | Chat send white screen | Deferred outgoing `setMessages`/`setChats` via `InteractionManager.runAfterInteractions`; `ChatThreadErrorBoundary` around chat UI; Android chat `KeyboardAvoidingView` disabled (iOS only). |

---

## 2026-06-04 20:45 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:45 +01:00 | Chat send white screen | `showChatScreen` no longer requires `resolvedChat` (unmount left white + keyboard). `resolvedChat` resolves canonical thread ids; migrate updates `setView` before `setChats`; dismiss keyboard on send. |

---

## 2026-06-04 20:33 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:33 +01:00 | Chat send crash | `sendMessage` reads composer ref; `sendPayload` clears via `setChatInputSynced`; chat `FlatList` `extraData` uses `activeChatListRenderKey` not global `messages`; defer `advanceChatReadWatermark`; media rows never `return null`. |

---

## 2026-06-04 20:21 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:21 +01:00 | Chat read receipts | Reverted `app/lib/readReceipts.ts` and `readAvatarsForActiveChat` memo in `MainApp.tsx` to last committed baseline (`f85a5fd`): simple `createdAt` anchor, no thread-sort / `lastReadMessageId` / outgoing clamp; memo maps `readBy` via `getBackendSession()?.uid` again. Bisect for send-arrow hard crash (3 Jun night). |

---

## 2026-06-04 20:02 +01:00

| Time | Area | Change |
|------|------|--------|
| 20:02 +01:00 | Rules / Docs | Added Cursor rules: `(code)` permission gate, commit prompt after code, mandatory minute log; updated `documentation-required.mdc`, `PLANNING.md` §0, `CHANGELOG.md`. |

---

## 2026-06-04 (evening, local disk)

| Time (approx) | Area | Change |
|---------------|------|--------|
| Session | Chat send | User reports send arrow still **hard-crashes** after read-receipt revert + send-path revert to `f85a5fd` style. |
| Session | Docs | Added this file; clarified CHANGELOG does not use per-change timestamps. |
| Disk `MainApp.tsx` | — | Last saved **2026-06-04 19:46** (469 KB; was ~much smaller at `f85a5fd`). |

**Still present in tree vs `f85a5fd` (likely crash vectors even if send/read-receipt code matches old commit):**

- `ChatMessageMediaResolver`, `ChatVideoMessageBubble`, `ChatVoiceNoteBubble`, `ChatVideoAutoPlayWhenReady` inside chat `FlatList` `renderItem`
- `app/lib/encryptedLocalStorage.ts` + `firebaseAuthClient.ts` encrypted AsyncStorage adapter
- `app/messaging/useMessagingSync.ts`, `decodeIncoming.ts`, `send.ts` (large diffs)
- Debounced encrypt+persist of full `messages` array on every `messages` state change (~2.2s debounce)
- Tier B media (`app/lib/tierBMedia/`, hooks under `app/hooks/`)

---

## 2026-06-04 – 2026-06-02 (uncommitted; from CHANGELOG + Cursor sessions)

Work landed in **`Planning/CHANGELOG.md` → [Unreleased]** without commit dates. Approximate order (newest sections first in that file):

1. **Encrypted on-device cache** — `encryptedLocalStorage`, Tier B `.enc` files, Firebase auth persistence adapter.
2. **Chat send crash** — multiple attempted fixes (composer `onChange`, ref sync, `removeClippedSubviews`, read-receipt layout); **not verified fixed on device**.
3. **Read receipt avatars** — `readReceipts.ts` anchor logic; UI moved/refactored; then partially reverted to inline row on text bubbles only.
4. **Add Friend** — precise location + camera gates.
5. **Bug sweep v6** — feed reactions listener, cache clear, chat long-press order.
6. **Deleted posts / boot / Firestore read reduction / cold-start** — large MainApp + boot + backend changes (see CHANGELOG sections).

**Cursor chats (for narrative detail, not timestamps in repo):**

- Send crash: `9c694409-2fb9-4454-8506-df8e89a0ffe0`
- Read receipts / “U” avatar: `1c74c5c9-d59f-4d5e-845f-bccfbc3e4560`

---

## 2026-05-20 (committed)

| Commit | Date | Summary |
|--------|------|---------|
| `f85a5fd` | 2026-05-20 23:47 | Fix delete-chat recovery, crashes, feed layout, messaging sync. **Last known git baseline.** |
| `2cb2598` | 2026-05-20 17:56 | Initial App Final V3 import. |

---

## How to record the next change

```markdown
## YYYY-MM-DD HH:MM (timezone)

| Time | Area | Change |
|------|------|--------|
| HH:MM | Chat | … |
```

Also add a short bullet under the right heading in `Planning/CHANGELOG.md` when behavior changes.

---

## Send crash — binary proof test (recommended)

Build from **committed** baseline without the uncommitted tree:

```powershell
cd "C:\Users\dunca\OneDrive\Desktop\App FInal V3"
git stash push -u -m "wip-before-send-bisect"
git checkout f85a5fd -- .
npm install
npm run apk:release
```

Install `app-release.apk`. If send **works**, the regression is 100% in stashed WIP (not “mystery Android”). If send **still crashes**, the problem is environment, data, or backend — not this diff.

Restore WIP: `git checkout main -- .` (or `git stash pop`) after the test.
