# MVP Plan - Messaging Only

> **Canonical implementation:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` only. Export Cursor chats periodically; see `PLANNING.md` §0.

This document defines the Minimum Viable Product (MVP) for the app.
It intentionally narrows scope to friend creation and messaging only.

> Putting the social back in social media.

---

## 1. MVP objective

Ship a secure, friend-gated messaging app where:

- Users become friends only via in-person NFC handshake.
- Only friends can send messages to each other.
- Group chats are allowed only when every member is friends with every other member.

Everything else from the long-term plan is out of scope for this MVP.

---

## 2. MVP hard rules

| ID | Requirement | MVP enforcement |
|----|-------------|-----------------|
| M1 | Friending is NFC-only | No remote friend request flow. Friendship can be created only after successful in-person NFC handshake validated by backend. |
| M2 | 1:1 messaging is friend-only | A direct chat can be created/opened/sent only if an active friendship exists between both users. |
| M3 | Group chat requires pairwise friendship | For a group member set `M`, every distinct pair in `M` must have an active friendship (friend clique). |
| M4 | Messaging is E2E encrypted | Message content is encrypted end-to-end in transit and at rest in Firestore as ciphertext. |
| M5 | One account per phone number | A verified phone number can map to only one user account. Registration/linking must fail if the number is already in use. |
| M6 | One account per email | An email address can map to only one user account. Registration must fail if the email is already in use. |
| M7 | Credentials are stored using standard secure web-app practices | Usernames and emails are stored normally with uniqueness checks; passwords are never stored in plaintext and are handled by the auth provider's secure hashing flow. |
| M8 | Fresh OTP is required for any new sign-in after sign-out | Once a user signs out on a device, the next sign-in attempt (same or different account) must pass OTP verification before access is granted. While the user remains logged in, normal session usage does not require repeated OTP prompts. |
| M9 | A user can be signed in on only one device at a time | Creating a new authenticated session for a user invalidates any previous active session on other devices, forcing logout there. |
| M10 | Non-friend profile data is never visible | If users are not friends, they cannot view username, email, profile picture, bio, or any profile details for that user. |
| M11 | New chat member selection and default naming rules | Start-chat member picker supports friend search. 1:1 chat default name is the selected friend's name. Multi-member chat default name is concatenated participant names until creator sets a custom name. |
| M12 | Home/chat screen separation and full chat history | Home screen shows online strip + recent chat list only (no message input); the chat list begins **immediately below** the online strip without a large blank gap. Opening a chat navigates to dedicated chat screen with full scrollable history, **keyword search behind chat overflow menu** (not always visible), and the only bottom message input/send field. |
| M13 | Profile-picture tap opens profile | **Online strip:** tap opens **new or existing 1:1 chat** with that friend. **Chat list avatar and message avatars:** tap opens that friend's **full-screen profile** (large hero image, name, bio, **Start chat** CTA). |
| M14 | Home profile control and self-profile editing | Home top bar includes person icon next to settings; tapping opens **full-screen My Profile** where profile picture (including device photo upload) and bio can be edited. |
| M15 | Chat-row tap target separation | On home chat list, only profile-picture region opens friend profile; all other row area (invisible tap-card) opens chat screen. |
| M16 | Chat overflow menu | Chat screen uses a header overflow control (e.g. three dots) for **View chat members**, **Search in chat**, and **Shared media** (MVP may placeholder shared media). |
| M17 | Presence color vs accent | **Online** indicators use a **bright online green** distinct from the selected UI accent (**green** `#0C8579` or **hot pink** `#E91E8C`). |
| M18 | Safe area and keyboard | Bottom CTAs and message composer respect device safe areas. **Composer:** while typing in a conversation, the message field remains **visible above the soft keyboard** (keyboard-avoiding layout + platform keyboard resize settings). **IME send:** `returnKeyType="send"` (or equivalent) with `onSubmitEditing` so the keyboard’s send action submits; on-screen send control may reuse the same **send** icon. **Top:** headers on the conversation screen and full-screen profile surfaces must respect the status bar / safe top (apply inset on each full-screen overlay when using absolute layering—do not rely on a padded root alone). |
| M19 | Message thread scroll anchor | In conversation view, **newest messages appear at the bottom** (above the composer); the user scrolls **up** to read older messages. Implementation may use an inverted scroll list with appropriate data order. Message list layout must not use scroll-content `flexGrow` in a way that leaves a false empty half-screen above the thread. |

---

## 3. In-scope features (MVP)

- Authentication: username + email/password plus phone OTP, with unique username, unique email, and unique phone per account.
  - Passwords are handled by auth provider only (no plaintext password writes to Firestore).
  - Usernames and emails are stored in the normal app profile format with lookup indexes for uniqueness checks.
  - After sign-out, any new sign-in on that device requires OTP verification.
  - Only one active signed-in device session is allowed per user at a time.
- User profile (minimal): display name, profile picture, and optional bio.
- NFC friendship handshake flow.
- Friend list view.
- Home screen:
  - icon-only settings/profile/logout controls,
  - online friends strip,
  - recent chats list sorted by latest activity,
  - bottom start-chat button with mail icon,
  - no message input field.
- 1:1 chat:
  - Create/open friend conversation.
  - Send/receive text messages.
  - View full history in dedicated chat screen with sender name/picture + timestamp.
  - Search messages by keyword.
  - Read receipts (optional if easy in MVP).
- Group chat:
  - Create group from valid friend clique.
  - Add/remove members only if clique invariant remains true.
  - Send/receive group messages.
- Basic settings:
  - Sign out.
  - Unfriend.

---

## 4. Explicitly out of scope for MVP

- Stories, feed, pinned stories.
- Comments on stories.
- Vulnerable account type and guardian workflows.
- Advanced ranking/filtering modes for feed.
- Business/celebrity campaign features.
- Moderation/reporting tooling beyond basic abuse contact.

These stay in the long-term roadmap and can be added in later phases.

---

## 5. User flows

### 5.1 Sign up and sign in

1. User registers with username, email, and password.
2. Registration is allowed only if the username and email are not already associated with another account.
3. User verifies phone number via OTP.
4. Phone verification/link is allowed only if the phone number is not already associated with another account.
5. User profile doc is created with username/email profile fields (no plaintext password stored anywhere in app database).

### 5.1b Sign-out and re-authentication

1. If user signs out, the app marks the device session as requiring OTP on the next sign-in.
2. Any subsequent sign-in attempt (same account or different account) must complete OTP verification before access is granted.
3. Once signed in, the user stays logged in and uses the app normally without repeated OTP prompts until the next sign-out (or explicit high-risk re-auth event, if added later).

### 5.1c Single-device session policy

1. A device can only switch to another account after the currently signed-in user explicitly signs out on that device.
2. When a user signs in on a new device, backend marks that as the only active session for that user.
3. Any previously active device session for that user is revoked.
4. The previous device is forced to sign out (or denied further API access on token refresh / next request).

### 5.2 Become friends (NFC-only)

1. Both users open "Add Friend."
2. Both users press and hold the "Add Friend" button and keep holding until pairing is complete.
3. While both holds remain active, devices complete NFC token exchange.
4. Backend validates handshake and writes friendship edge.
5. Both users see each other in friend list.

### 5.3 Direct messaging (friend-only)

1. User opens a chat from home list or online-friend strip.
2. App navigates to dedicated chat screen (new screen) and loads full scrollable chat history; **newest messages appear at the bottom** (scroll up for older), per M19.
3. User can search chat messages by keyword via **Search in chat** in the chat overflow menu.
4. Tapping a friend's profile picture **in the chat** opens that friend's **full-screen profile** (online strip on home is chat per M13).
5. Outbound message from bottom chat input is E2E encrypted and stored as ciphertext.
6. Recipient decrypts on device.

### 5.4 Group chat (friend clique only)

1. Creator starts a new group and adds the first member.
2. Member picker supports searching through the creator's friends.
3. After the first add, the app limits "addable" users to the intersection of friends shared by all current group members (including the creator).
4. Each time another member is added, this allowed-candidate set is recomputed and narrowed again to users who are friends with everyone already in the group.
5. Backend validates all pairwise friendships in the final selected set before creation.
6. When user taps `Create chat`, system checks for an existing chat with the same participant set:
   - If it exists, open the existing chat instead of creating a duplicate.
   - If it does not exist, create a creator-only draft chat and initialize encryption session.
7. Default naming rules for newly created drafts:
   - If exactly one friend is selected, chat name defaults to that friend's display name.
   - If multiple friends are selected, chat name defaults to a joined list of participant names until user renames.
8. If creator exits before first message, keep the draft for creator to resume later; draft remains invisible to recipients until first message is sent.
9. Sending and reading follow normal encrypted group messaging rules.

### 5.5 Unfriend impact

1. User unfriends another user.
2. 1:1 messaging between that pair is blocked.
3. For any group where pairwise friendship is now broken, the users in the broken friendship connection are ejected from that group.
4. The group creator is notified that members were ejected due to friendship break.

---

## 6. Proposed data model (MVP)

- `users/{uid}`
  - `username`, `displayName`, `profilePictureUrl`, `bio` (optional), `email`, `phoneNumber`, `phoneVerified`, `createdAt`
- `usernameIndex/{normalizedUsername}`
  - `uid`
- `emailIndex/{normalizedEmail}`
  - `uid`
- `phoneIndex/{e164Phone}`
  - `uid`
- `deviceSessionState/{deviceId}` (or secure local equivalent)
  - `lastSignOutAt`, `nextSignInRequiresOtp` (boolean)
- `activeUserSessions/{uid}`
  - `activeDeviceId`, `sessionVersion`, `updatedAt`
- `friendships/{friendshipId}`
  - `userA`, `userB`, `status`, `createdAt`
- `conversations/{conversationId}`
  - `type` (`direct` | `group`)
  - `memberIds`
  - `name` (default generated by participant rule, optional custom rename)
  - `profilePicture` (optional designated chat avatar, fallback `^` for group if unset)
  - `isCustomName` (boolean)
  - `createdBy`, `createdAt`, `updatedAt`
- `messages/{messageId}` (subcollection under conversation or flat with `conversationId`)
  - `conversationId`
  - `senderId`
  - `ciphertext`
  - crypto metadata (nonce, key epoch, protocol headers)
  - `createdAt`

---

## 7. Backend and security rules

### Firestore rules

- Only authenticated users can read/write their own allowed data.
- Direct conversation access allowed only for members.
- Group writes allowed only for members; membership updates require server-side validation.
- No plaintext message body fields allowed.
- Non-friends cannot read user profile PII/identity fields (`username`, `email`, `profilePictureUrl`, `bio`, etc.).

### Authentication and data protection

- Do not store plaintext passwords in Firestore or any app-managed collection.
- Use auth provider password hashing and credential handling.
- Store usernames and emails in standard profile fields with uniqueness indexes.

### Cloud Functions

- Validate and finalize NFC friendship creation.
- Validate group creation/member updates against pairwise friendship rule.
- Enforce ejection of users in broken friendship connections when unfriend breaks a group clique, and notify the group creator.
- Enforce uniqueness checks for email and phone mapping at account creation/link time.
- Enforce post-sign-out OTP requirement for all new sign-ins on a device.
- Enforce one-active-device session per user by rotating/revoking prior session on new sign-in.
- Enforce home-screen presence ranking logic for online strip (prioritize online friends not represented in first visible chats).

---

## 8. MVP delivery phases

| Phase | Deliverables |
|------|--------------|
| P0 Foundation | Firebase project, Expo app shell, auth, basic profile, post-sign-out OTP re-auth enforcement for all new sign-ins, and one-active-device session enforcement |
| P1 Friending | NFC handshake flow + friendship storage + friend list |
| P2 Direct chat | 1:1 encrypted messaging between friends |
| P3 Group chat | Pairwise-friend group creation, group messaging |
| P4 Hardening | Rules audit, basic load test, handshake replay checks, QA |

---

## 9. MVP acceptance criteria

- Users cannot become friends without successful NFC handshake.
- Friendship pairing only completes if both users press and hold the "Add Friend" button for the duration of pairing.
- Non-friends cannot start or continue direct messaging each other.
- During group composition, after the first member is added, the addable user list is restricted to the intersection of friends of all current members (including creator), and this list updates after each add.
- Start-chat member picker supports friend search.
- If user selects a participant set that already has a chat, tapping `Create chat` opens the existing chat instead of creating a duplicate.
- If no existing chat is found, `Create chat` creates a creator-only draft that is kept if creator exits before first message, and is visible to recipients only after first message is sent.
- New chat naming defaults are correct: 1:1 uses friend's name; multi-member uses participant names unless renamed.
- Home screen has no message input; message input appears only on dedicated chat screen.
- Opening any chat from home shows full scrollable message history with sender name/profile picture and day/time timestamps; **newest messages at bottom**, scroll **up** for older (M19).
- Chat screen supports keyword search over messages via overflow menu (**Search in chat**), not a persistent search bar.
- Conversation header (back, title, overflow) is not obscured by the system status bar on Android/iOS (M18).
- Message composer stays visible above the soft keyboard while typing; keyboard send action submits the message (M18).
- Home chat list has **no** large vertical blank region between the online strip and the first chat row (M12).
- Tapping a friend's profile picture opens **full-screen profile** with **Start chat** except on the **home online strip**, where tap opens **chat** (1:1).
- Online indicators use bright online green; UI chrome uses the selected accent (green or hot pink).
- In home chat list, profile-picture tap opens profile while the rest of the row opens chat.
- If a friendship break violates an existing group clique, the users in the broken connection are ejected from the group and the group creator is notified.
- Non-friends cannot view username, email, profile picture, bio, or any profile details of another user.
- Message content is stored as ciphertext and decrypted only on client devices.
- Attempting to register with an email that is already used by another account is rejected.
- Attempting to register with a username that is already used by another account is rejected.
- Attempting to verify/link a phone number that is already used by another account is rejected.
- No plaintext passwords are present in app-managed databases.
- Usernames and emails are stored normally for account lookup while password handling remains secure via auth-provider hashing.
- After sign-out on a device, the next sign-in (same or different account) requires fresh OTP; once signed in, normal session use does not require repeated OTP prompts.
- Signing in on a new device invalidates prior active sessions for that user, so only one device remains signed in.

---

## 10. Post-MVP path

After this MVP is stable, incrementally add features from `PLANNING.md` (stories/feed, vulnerable accounts, advanced privacy controls, and broader product use cases).

