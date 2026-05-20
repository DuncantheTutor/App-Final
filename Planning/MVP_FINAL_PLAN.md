# MVP FINAL PLAN - Messaging + UI Consolidated

> **Code:** Canonical implementation is **`App Final V3`** only — `C:\Users\dunca\OneDrive\Desktop\App FInal V3`. Export Cursor chats periodically and reread before long sessions (`PLANNING.md` §0).

This document consolidates the MVP technical plan and MVP app look plan into one source of truth.
It includes messaging/domain rules, security/session constraints, and UI behavior rules.

> Putting the social back in social media.

---

## 1. MVP objective

Ship a secure, friend-gated messaging app where:

- Friendship is created only by in-person NFC handshake.
- Only friends can message each other.
- Group chats are allowed only when all members are pairwise friends (friend clique).
- Core chat-home UI is simple, presence-aware, and theme-consistent.

---

## 2. Consolidated MVP hard rules

| ID | Requirement | MVP enforcement |
|----|-------------|-----------------|
| F1 | Friending is NFC-only | No remote friend requests. Friendship is created only after valid in-person NFC handshake. |
| F2 | Hold-to-pair interaction | Both users must press and hold `Add Friend` until pairing completes; release/cancel aborts pairing. |
| C1 | Direct messaging is friend-only | 1:1 chat can be created/opened/sent only with active friendship. |
| C2 | Group chat requires pairwise friendship | For member set `M`, every distinct pair in `M` must have active friendship. |
| C3 | Existing chat reuse | On `Create chat`, if matching participant-set chat already exists, open it; do not create duplicate. |
| C4 | Draft chat lifecycle | New chat opens in pending state and is saved only after first typed character. Leaving with empty composer saves nothing; leaving with unsent text prompts `Discard` or `Save draft`. |
| C5 | Default chat naming | 1 selected friend => chat name defaults to that friend's name. Multi-member => default joined participant names until user renames. |
| C6 | Group violation handling | If unfriend breaks pairwise group rule, broken-connection users are ejected and group creator is notified. |
| C7 | Group creator controls | Group/broadcast creator can long-press chat title to rename and long-press chat picture to change icon. |
| C8 | Broadcast mode privacy | Broadcast sends one-to-many, but all replies are private per friend-thread; sender sees all threads in one screen. Friends do not see each other's replies. |
| C9 | Broadcast first-message visibility | The creator's first broadcast appears once in the broadcast timeline as their message, with no per-recipient Thread line on that message. |
| C10 | Broadcast recipient groups | User can save named broadcast recipient selections, reselect via dropdown, and use Select All / Clear All. |
| C10a | Full-selection bypass | If all friends are selected for broadcast, skip all broadcast-group save prompts and proceed directly to broadcast creation. |
| C11 | Message timeline order | Broadcast and standard chats share identical timeline behavior: chronological data with newest message rendered at bottom. |
| C12 | Simulated reply delay (testing) | Automated friend replies are delayed by randomized 0 to 5 minutes to mimic asynchronous behavior. |
| C13 | Broadcast follow-up thread | After the first message, sends require a selected friend thread; threaded messages show Thread: friend. |
| P1 | Non-friend profile privacy | Non-friends cannot view username, email, profile picture, bio, or any profile details. |
| A1 | One account per username | Normalized username maps to one uid only. |
| A2 | One account per email | Normalized email maps to one uid only. |
| A3 | One account per phone | Verified phone maps to one uid only. |
| A4 | Secure credential handling | Passwords are never stored in app-managed DB plaintext; auth provider handles secure password hashing/verification. |
| S1 | OTP after sign-out | After sign-out on a device, next sign-in (same or different account) must pass OTP. |
| S2 | One active device session per user | New sign-in revokes previous active session(s) for that user on other devices. |
| U1 | Presence display precedence | If online friend is visible in current chat rows, show presence marker there and exclude them from top online strip. |
| U2 | Theme support | Light mode (white bg / black text) and dark mode (black bg / white text). |
| U3 | Accent color options | Approved highlight accents are **green** (`#0C8579`) and **hot pink** (`#E91E8C`) for active controls/key chrome; online markers stay a distinct bright-online-green. |

---

## 3. In-scope features (MVP)

- Authentication: username + email/password + phone OTP.
- Minimal profile: `displayName`, `profilePictureUrl`, optional `bio`.
- NFC friend pairing with hold-to-pair interaction.
- Friend list access for chat composition.
- 1:1 chat:
  - open/create with friend only,
  - send/receive text messages,
  - optional read receipts.
- Group chat:
  - pairwise-friend member constraint,
  - dynamic mutual-friend narrowing when adding participants,
  - existing-chat reuse and draft lifecycle rules,
  - creator-controlled title/picture editing.
- Broadcast chat:
  - explicit `Broadcast` option at top of Start Chat picker,
  - select/deselect full friend list,
  - `Select all` / `Clear all`,
  - optional save of recipient selection as named reusable group,
  - if all friends are selected, skip save prompts and create immediately,
  - staged save prompts for partial selections:
    - ask whether to save the friend selection,
    - if yes, ask whether to overwrite an existing broadcast group,
    - overwrite flow uses dropdown + save,
    - new-group flow uses title field + save,
  - dropdown to apply previously saved broadcast groups,
  - long-press broadcast creation title to set custom broadcast title,
  - first send appears once in the broadcast chat as the creator’s message (no per-recipient “thread” line on that message),
  - follow-up messages require replying inside a selected private friend-thread.
- Chat creation:
  - create-chat flow includes visible optional title field,
  - if left blank, chat name falls back to selected member names,
  - same rule applies to broadcast title field.
- Message actions:
  - reply to message,
  - react with emoji (compact bottom-right chips, grouped by emoji with count bubble for duplicates),
  - edit own message (edited marker + edit timestamp),
  - unsend own message.
- Reply UI treatment:
  - replied-to content appears as muted context card,
  - new reply content appears in the foreground message card.
- Reaction UI treatment:
  - reactions are plain emoji anchored half-on / half-off the bottom-right edge of message card,
  - same-emoji reactions aggregate into one emoji with count bubble,
  - different emoji reactions sit tightly side-by-side with centered layout around single-reaction anchor point.
- Rich send:
  - text,
  - voice note (record, preview/listen before send, then post),
  - photo capture/send and gallery image attach (including screenshots),
  - video capture/send.
- Chat-home UI:
  - top online profile strip,
  - current chats list,
  - bottom `Start Chat` CTA,
  - top-right `Settings` + `Logout`.
- Settings currently limited to light/dark mode toggle.

---

## 4. Explicitly out of scope

- Stories, feed, pinned stories.
- Story comments.
- Vulnerable account and guardian workflows.
- Business/celebrity campaign tooling.
- Moderation/reporting beyond basic abuse contact.
- Advanced recommendation/ranking systems outside chat-home needs.

---

## 5. UX structure and behavior

### 5.1 Main screen layout

- **Top**
  - App title.
  - `Settings` and `Logout` buttons.
  - Horizontal, scrollable online-friends profile row.
- **Middle**
  - `Current Chats` section as primary content.
- **Bottom**
  - Persistent `Start Chat` button.
  - No always-visible friends list on home.

### 5.2 Presence rendering rules

- If online friend appears in currently visible chat rows:
  - show online marker on that chat avatar,
  - exclude that friend from top online strip.
- Top online strip contains only online friends not currently visible in chat rows.
- Online strip ordered by message volume with that friend (most to least).

### 5.3 Start Chat flow (authoritative)

1. User taps `Start Chat`.
2. Friend picker opens with search.
3. User selects first friend.
4. Additional selectable users narrow to mutual-friend intersection across selected participants.
5. User taps explicit `Create chat`.
6. System checks existing chat by participant set:
   - existing chat found => open it,
   - none found => create creator-only draft.
7. Apply default chat naming (friend name for 1:1, participant names for group) unless custom name is set.
8. In group creation, long-press selected-names summary to override group title before creating.
9. Draft row is created on first typed character (or first media send in pending chat).
10. Leaving pending chat with no typed content saves nothing.
11. Leaving draft with unsent content prompts `Discard` vs `Save draft`.
12. Returning to a draft, clearing composer, and exiting removes empty draft.

### 5.4 Top online-strip interaction

- Tap online friend:
  1. open existing direct chat if present,
  2. otherwise open start-chat flow preselected to that friend.

---

## 6. Core product flows

### 6.1 Sign up and sign in

1. Register with username, email, password.
2. Reject if username/email already used.
3. Verify phone via OTP.
4. Reject phone link if already used by another account.
5. Create profile record.

### 6.2 Sign-out and session policy

1. On sign-out, mark device session as requiring OTP for next sign-in.
2. Any next sign-in on that device requires OTP.
3. While signed in, normal use continues without repeated OTP prompts.
4. New sign-in on another device revokes previous active sessions for the user.

### 6.3 Friend pairing (NFC-only)

1. Both users open `Add Friend`.
2. Both press and hold `Add Friend` until pairing completes.
3. NFC token exchange occurs while both holds are active.
4. Backend validates and writes friendship edge.

### 6.4 Messaging permissions

- 1:1 only for active friendships.
- Group only for pairwise-friend member sets.

### 6.5 Unfriend impact

1. Block 1:1 messaging for unfriended pair.
2. For any affected group, eject users in broken connection.
3. Notify group creator.

---

## 7. Data model (MVP consolidated)

- `users/{uid}`
  - `username`, `displayName`, `profilePictureUrl`, `bio?`, `email`, `phoneNumber`, `phoneVerified`, `createdAt`
- `usernameIndex/{normalizedUsername}` => `uid`
- `emailIndex/{normalizedEmail}` => `uid`
- `phoneIndex/{e164Phone}` => `uid`
- `friendships/{friendshipId}`
  - `userA`, `userB`, `status`, `createdAt`
- `deviceSessionState/{deviceId}`
  - `lastSignOutAt`, `nextSignInRequiresOtp`
- `activeUserSessions/{uid}`
  - `activeDeviceId`, `sessionVersion`, `updatedAt`
- `conversations/{conversationId}`
  - `type` (`direct` | `group` | `broadcast`)
  - `memberIds`
  - `name` (default-generated unless custom)
  - `profilePicture?` (emoji/icon for group/broadcast)
  - `isCustomName`
  - `createdBy`
  - `broadcastRecipientIds?`
  - `createdBy`, `createdAt`, `updatedAt`
  - optional `isDraft`, `draftOwnerUid` (until first message)
- `messages/{messageId}`
  - `conversationId`, `senderId`, `ciphertext`, crypto metadata, `createdAt`
  - `kind` (`text` | `photo` | `video` | `voice`)
  - `replyToMessageId?`, `reactions?`, `editedAt?`, `unsentAt?`
  - `broadcastThreadFriendId?` (for private sub-thread routing in broadcast chats)

---

## 8. Security and backend enforcement

### 8.1 Firestore/security rules

- Authenticated access only.
- Conversation reads/writes only for members.
- Non-friends cannot read profile identity fields.
- No plaintext message body storage.

### 8.2 Auth and credential handling

- Passwords never stored in app-managed plaintext.
- Auth provider handles password hashing and verification.
- Username/email/phone uniqueness enforced using index docs + guarded writes.

### 8.3 Cloud Functions

- NFC pairing validation and friendship writes.
- Group pairwise-friend validation on create/member updates.
- Existing-chat reuse resolution for participant set.
- Draft lifecycle management (create/delete on first-send vs exit).
- Group ejection + creator notification on unfriend violations.
- OTP-after-sign-out enforcement.
- One-active-device session revocation enforcement.

---

## 9. Theming and visual tokens

- **Light mode:** white background, black text.
- **Dark mode:** black background, white text.
- **Accent/highlight:** approved accent options are **green** (`#0C8579`) and **hot pink** (`#E91E8C`) for:
  - primary CTA (`Start Chat`),
  - active/focus states.
- **Online indicators:** use a distinct bright-online-green (not the UI accent color).

Build with centralized design tokens (`colors`, `spacing`, `typography`) to ensure consistency.

---

## 10. Delivery phases

| Phase | Deliverables |
|------|--------------|
| P0 Foundation | Firebase setup, auth, uniqueness indexes, OTP-after-sign-out, one-device session enforcement, base UI shell |
| P1 Friending | NFC hold-to-pair flow, friendship writes, friend list |
| P2 Direct Chat | Friend-only 1:1 encrypted messaging |
| P3 Group Chat | Mutual-friend narrowing, existing-chat reuse, draft lifecycle, naming defaults, group encryption |
| P4 Presence + UX Polish | Presence precedence rules, online strip behavior, notifications for group ejections, theme/accessibility polish |
| P5 Hardening | Rules audit, replay/session tests, load tests, QA signoff |

---

## 11. Acceptance criteria

- Friendship only created by successful NFC hold-to-pair flow.
- Non-friends cannot message or view profile identity details.
- Group create/add enforces pairwise friendship.
- Start-chat supports friend search and mutual-friend narrowing.
- Start-chat includes broadcast entry above friend list and supports select/deselect full friend list for broadcast.
- Broadcast creator flow supports `Select all`, saved named recipient groups, and dropdown re-use.
- `Create chat` opens existing chat when participant set already exists.
- Pending chats are not saved until first typed char/media send; unsent draft exit prompts discard/save.
- Default chat naming behavior matches 1:1 and group rules unless renamed.
- Group/broadcast creator can long-press title and icon to edit.
- Message reply/reaction/edit/unsend flows are available in-chat; edited messages display edited marker + timestamp.
- Voice, photo, and video sends work in-chat.
- Voice notes can be preview-played by sender before posting, and played by any chat member after posting.
- Photo attachment behavior:
  - after camera or library pick, full-screen editor: rotate, center-square crop, filter presets (warm/cool/mono/sepia), finger drawing, on-image text labels; then preview step to add optional caption before post,
  - baked edits export as a single image for the message,
  - in the thread, the image renders without a message bubble border; the chat bubble/card starts below the image and holds caption (if any), metadata, and reactions.
- Broadcast chats keep all private friend threads in one owner-visible chat screen; replies require per-thread context.
- The creator's first broadcast appears once in the broadcast timeline (no Thread line on that message); friend replies follow with per-thread labels as usual.
- Broadcast mode helper text reads: `Broadcast mode: tap a friend's message to reply.`
- Broadcast rows on home use the currently selected accent styling (green or hot pink), but display only their defined chat title with no extra broadcast tag or count suffix.
- Unfriend group violations eject broken-connection users and notify creator.
- Unique username/email/phone constraints are enforced.
- No plaintext password storage in app-managed DB.
- After sign-out, next sign-in requires OTP.
- Only one active signed-in device per user at a time.
- Main-screen presence precedence behaves as specified (chat-row first, top-strip remainder).
- Light/dark themes and approved accent options (green + hot pink) are implemented consistently.

---

## 12. Post-MVP path

After MVP stabilization, continue with long-term features in `PLANNING.md` (stories/feed expansion, vulnerable-account workflows, and broader product scenarios).

