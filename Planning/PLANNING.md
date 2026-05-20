# Mobile App - Stories, Posts, Feed & Privacy - Planning Document

This document captures product requirements, privacy rules, technical scope, and implementation planning for a React Native (Expo) app backed by Firebase (Firestore + Cloud Functions). **MVP+** extends the core model with **permanent posts** alongside **ephemeral stories/reels**.

> Putting the social back in social media.

---

## 0. Canonical codebase, agents, and chat exports

- **Canonical app implementation** lives only in **`App Final V3`**:  
  `C:\Users\dunca\OneDrive\Desktop\App FInal V3`  
  All coding, **NFC/BLE** friend pairing (default **NFC 4-digit PIN pair**; BLE siloed), APK builds, and prototype parity for this product line happen here. **Open this folder as the Cursor workspace** for day-to-day work.
- **Git remote:** [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final) — push from this tree when version control is initialized.
- **Planning and spec Markdown** live in **`Planning/`** inside App Final V3 (same directory as this file). Legacy copies under `Cursor Projects\App V2` or the older OneDrive **`App Final`** folder are historical only; do not treat `App V2 Build*`, `App/mobile`, `App v4`, or other trees as edit targets unless a task explicitly says to migrate from them.
- **Agent continuity:** Periodically **export chats** from Cursor (chat menu → Export) and save exports under **`Planning/`** (or merge into your latest export). Before long sessions or when opening a **new agent**, skim recent exports so decisions and file paths are not lost.
- **Release hygiene:** Keep `package.json` and `app.json` versions aligned; see **`Planning/RELEASE_NOTES.md`** for internal APK path and tagging.

---

## 1. Goals and principles

- **Friendship is physical-first:** Users add each other only through an **in-person** pairing flow (**Show QR / Read QR UI** currently, backed by server-reserved 4-digit PIN offers; **no** remote friend-request path that bypasses this). **Planned hardening:** **mandatory proximity evidence** (GPS-first with hard 100m cap, Wi-Fi/personal-hotspot fallback when GPS quality is poor) — see `Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md` and `addFriend/proximityQr/`. **BLE** helpers are siloed under `addFriend/ble/` for reuse — see `Planning/BLE_ADD_FRIEND_ARCHITECTURE.md` and `Planning/NFC_OPTIONS_AND_HS2_LEGACY.md`. Live PIN payload helpers live in **`addFriend/nfcPinTransport/`** (separate from legacy NFC under `addFriend/nfc/`).
- **Privacy from non-friends (core value):** Non-friends cannot reach you. This reduces random scam contact and online harassment by design.
- **Strict isolation:** The social graph is private by default. Users never discover friends-of-friends; they only see each connected friend's profile.
- **Human feed, not a hidden "For You" machine:** Feed ordering is transparent and user-controlled (for example `new`, `hot`, `popular`), not a black-box ranking optimized only for engagement.
- **End-to-end encrypted communication:** Message content is E2E encrypted so the backend cannot read routine message content.
- **Ephemeral stories / reels:** Shared stories (and reels-style short video where applicable) land in friends' feeds, expire after 24 hours, and are deleted.
- **Permanent posts (MVP+):** Friends can publish posts that remain until the author deletes them. They appear in friends' feeds when published and are listed on the author's profile in a grid below the bio.
- **Profile pins:** Each user can keep up to 5 pinned stories on profile, non-sharable, and swap current story into any pin slot.
- **Support for vulnerable users:** Vulnerable accounts use stricter guardian-involved workflows.
- **Unique account identity:** Each account has unique username, email, and phone identity constraints.
- **Post-sign-out OTP re-auth:** After sign-out on a device, the next sign-in must pass OTP (same or different account). Once signed in, normal session use continues without repeated OTP prompts.
- **One active device session per user:** A user can only be signed in on one device at a time; new sign-in revokes older active sessions.
- **Group chats are friend-cliques:** All members must be pairwise friends.

### 1.1 Illustrative use cases (informal)

These scenarios are motivation only, not product specs.

- Harassment and stranger spam are reduced because non-friends cannot message or discover you through open social graph paths.
- Users can share contextual/private photos with trusted in-person friends instead of broadcasting publicly.
- Vulnerable accounts can support safer family communication for older adults with lower scam exposure.
- Vulnerable accounts can support child safety by requiring stronger in-person + guardian gatekeeping.
- Local shops can use **in-store** pairing (NFC PIN / optional siloed BLE) for friendship to reach real visitors with offers.
- Artists/venues/sports teams can use **in-person** friend flows at events to reach real attendees.
- In-person-only friendship raises the cost of bot farms and large-scale inauthentic amplification.

---

## 2. Required product functionality (hard rules)

| ID | Requirement | Notes for implementation |
|----|-------------|---------------------------|
| R1 | Users can only become friends **in person** via **NFC PIN pair** (4-digit, server-reserved), **planned QR token + mandatory proximity evidence** (GPS-first with hard 100m cap, Wi-Fi/personal-hotspot fallback; see `Planning/QR_PROXIMITY_ADD_FRIEND_RULES.md`), or siloed **legacy** paths | Server validates offer / confirm / redeem; no unauthenticated remote bypass. |
| R2 | Users can unfriend at any time | Remove symmetric friendship edges and revoke privileged access. |
| R3 | Only friends can view each other's profiles | If users are not friends, they cannot view username, email, profile picture, bio, or any profile details. Enforced by Firestore rules and query shape. |
| R4 | Only friends can message each other | 1:1 requires friendship; groups must satisfy R19. |
| R5 | Only friends can share stories | Share targets constrained to friends. |
| R6 | Shared stories are pushed into friends' feed | Fan-out to eligible friends. |
| R7 | Stories expire after 24 hours and are deleted | Delete docs and media. |
| R8 | Story tags are `friends_only` and `sharable` | Pinned stories are always non-sharable. |
| R9 | Story comments are visible only to story creator | Creator-only read access. |
| R10 | Communication is E2E encrypted | At minimum 1:1 + groups. |
| R11 | Vulnerable accounts use 3-way friendship handshake | Vulnerable user + guardian + prospective friend. |
| R12 | Guardians (max 5) require ratification | Initial tap + secondary guardian ratification flow. |
| R13 | No friends-of-friends visibility | No FOF discovery or mutual graph browsing. |
| R14 | Up to 5 pinned profile stories | User-curated, non-sharable slots. |
| R15 | New friends receive pinned stories in feed | Friendship-triggered fan-out of non-empty pins. |
| R16 | One account per phone number | Verified phone maps to one uid only. |
| R17 | One account per email | Email maps to one uid only. |
| R23 | One account per username | Username maps to one uid only. |
| R18 | Guardians can remove vulnerable status | Any guardian can initiate; all other guardians approve asynchronously. |
| R19 | Group chats require pairwise friendship | Every pair in a group must have active friendship edge. |
| R20 | Feed supports explicit ordering modes | Named user-facing modes (e.g. `new`, `hot`, `popular`) instead of opaque-only ranking. |
| R21 | Fresh OTP required for next sign-in after sign-out | After sign-out on a device, next sign-in (same or different account) must complete OTP re-verification. |
| R22 | One active signed-in device per user | New sign-in invalidates prior active user sessions on other devices. |
| R24 | Permanent posts exist until deleted by author | No automatic expiry; deletion removes from feeds and profile. |
| R25 | Only friends receive posts in the main feed | Same friendship gate as stories; fan-out to eligible friends when published. |
| R26 | Posts appear on the author's profile | Profile shows a grid of posts below the bio (see §3.8). |
| R27 | Post feed items are durable | Storage and Firestore models distinguish `posts` from ephemeral `stories`. |
| R28 | Profile post grid layout | Fixed **3 columns** × *N* rows; one cell per post, ordered consistently (e.g. newest first). |
| R29 | Post grid thumbnails by media type | Photo/carousel: small image preview; video: poster/thumbnail image; text-only: miniature of feed card, fit to cell width. |
| R30 | Video post thumbnail selection on publish | At upload/publish time, user is prompted to choose a thumbnail; **Skip** uses the first frame as default poster. |
| R31 | Presence reflects active app usage only | A user is online only while the app is foreground-active and sending fresh heartbeats; background/closed app must age to offline quickly. |

---

## 3. Feature details

### 3.1 Story tags

- `friends_only`: no re-share in app; screenshot/screen-recording mitigations where possible.
- `sharable`: can be re-shared and captured.

### 3.2 Vulnerable accounts and guardians

- `accountType`: `standard` or `vulnerable`.
- Up to 5 guardians per vulnerable account.
- New vulnerable friendships require 3-party validation (R11).
- Guardian adds use a ratification step (R12).
- Guardians may remove vulnerable status with all other guardians approving (R18).

### 3.3 End-to-end encryption

- Store message ciphertext in backend.
- 1:1 can use ratcheting protocol.
- Groups need group-key protocol with re-key on membership changes.

### 3.4 Pinned profile stories

- Up to 5 slots.
- Always non-sharable.
- User can swap current story into any slot.
- Friendship creation triggers pin fan-out to new friend feed.

### 3.5 Account identity rules

- Unique username, email, and phone constraints.
- `usernameIndex`, `emailIndex`, and `phoneIndex` enforcement patterns.
- After sign-out, next sign-in requires OTP.
- One-active-device session policy with prior-session revocation on new sign-in.

### 3.6 Group chats

- Member set must remain a full friend-clique.
- Group create/add validates all pairs.
- If unfriend breaks clique, ejected members are removed for the broken connection and the group creator is notified.

### 3.7 Feed ordering

- Transparent modes with user control.
- Example modes: `new`, `hot`, `popular`.
- Applies to friends feed, not a global public explore feed by default.
- **MVP+:** The same friends feed surfaces **stories/reels** (ephemeral) and **posts** (permanent). Ordering rules apply to the combined or tabbed presentation as implemented; posts do not auto-expire.

### 3.8 Permanent posts and profile grid (MVP+)

- **Lifecycle:** A post is created when the user publishes it. It remains visible to friends and on the author's profile until the user deletes it.
- **Feed:** Friends see posts from people they are friends with at view time (subject to normal friendship and block rules). New posts appear in the general friends feed when published (fan-out or query shape TBD).
- **Profile:** Below the bio, the author's posts appear as a **grid**: **3 columns** and as many **rows** as needed. One tile per post.
- **Tile content (thumbnail rules):**
  - **Image, or series of images:** Show a small preview of the image (or primary/cover image for multi-image posts per product choice).
  - **Video:** Default poster is a still from the **start of the video** (first frame). **On publish**, the user is prompted to **choose a custom thumbnail**; they may **skip**, in which case the first-frame still is stored and used.
  - **Text-only (no media):** The grid cell shows a **reduced miniature** of how the post appears on the feed—same typography/layout intent, **scaled to fit the tile width** (readability at small size).
- **Relationship to stories/reels:** Stories/reels remain **ephemeral** (e.g. 24h) with existing pin rules; **posts** are a separate content type with permanent retention until deleted.

---

## 4. Scope and assumptions

| Area | Choice |
|------|--------|
| Backend | Firebase Firestore + Cloud Storage + Cloud Functions |
| Mobile | React Native (Expo) |
| Auth | Username + email/password + phone OTP |
| Social graph | Private by default |
| Messaging | E2E for 1:1 and groups |

---

## 5. High-level architecture

- **Client app:** Auth, **NFC Add Friend** (default PIN pair; BLE siloed), profile/friends, 1:1 and group messaging, stories/feed.
- **Cloud Functions:** **Friend pairing** (NFC PIN pair + legacy BLE / voucher callables), friendship writes, guardian workflows, group-clique validation, ejection+creator notifications on broken group connections, feed fan-out, story expiry deletion, **post fan-out and post deletion**, identity/session checks.
- **Firestore:** Users, friendships, conversations/messages, stories/feed items, **posts and post feed references**, guardian workflow state.
- **Storage:** Story media and cleanup lifecycle; **post media (images, video, generated thumbnails/posters)** with lifecycle tied to post deletion.

---

## 6. Core user flows

1. Sign up with username, email/password, and phone OTP.
2. If vulnerable account, run bootstrap + guardian setup.
3. Add friends only via **in-person NFC PIN pair** (4-digit, server-reserved); legacy BLE/NFC voucher paths siloed.
4. Message only friends (1:1 or group satisfying pairwise friendship).
5. Share/view stories with tag rules and 24h expiry.
6. **(MVP+)** Create/view/delete permanent posts; see friends' posts in feed; browse a friend's post grid on profile.
7. Manage pinned profile stories and new-friend pin fan-out.
8. Unfriend flow updates direct and group communication permissions, including ejection of broken connections from group chats and creator notification.
9. Sign-out requires OTP on next sign-in and enforces one-active-device session per user.

---

## 7. Data model (initial sketch)

- `users/{uid}`: `username`, profile fields (`displayName`, `profilePictureUrl`, optional `bio`), account type, guardian refs, pin refs.
- `friendships/{id}`: pair + status + timestamps.
- `guardianRatifications/{id}` and `vulnerableRemovalRequests/{id}`.
- `stories/{id}` and `feedItems/{id}` (ephemeral story feed entries).
- **`posts/{postId}` (MVP+):** `authorId`, `createdAt`, `updatedAt`, text body, media refs (image list and/or video), **`thumbnailUrl` or poster** for video (first frame or user-selected), **`feedPreview`** or render hints for text-only grid tiles, visibility (`friends` aligned with R25), deletion timestamp or soft-delete.
- **`postFeedItems/{id}` or fan-out collection (MVP+):** per-recipient or inverted index for friends feed queries; removed on unfriend or post delete as needed.
- `conversations/{id}` (`direct` or `group`) + `messages/{id}` ciphertext payloads.
- `usernameIndex/{normalizedUsername}`, `emailIndex/{normalizedEmail}`, and `phoneIndex/{e164}`.
- `deviceSessionState/{deviceId}` and `activeUserSessions/{uid}` for OTP-after-sign-out and one-device session enforcement.

---

## 8. Security and privacy notes

- Non-friends cannot communicate.
- Non-friends cannot read profile identity fields (`username`, `email`, `profilePictureUrl`, `bio`) or any profile details.
- Enforce access primarily in Firestore rules and server-side validation.
- E2E for message content.
- Pairing replay resistance via short-lived, one-time **PIN reservation / session** tokens (NFC PIN path; legacy BLE/voucher same idea).
- Screenshot/recording prevention is best-effort only.
- Passwords are never stored in plaintext in app-managed collections.

---

## 9. Open product decisions

1. Unfriend behavior for historical messages.
2. Exact group behavior when pairwise friendship breaks.
3. Exact formulas/time windows for `hot` and `popular`.
4. Single-guardian edge case for vulnerable removal.
5. Recovery and support policy for phone-number reuse.
6. Session-revocation UX wording when a new device login invalidates old sessions.
7. **MVP+ posts:** Fan-out vs pull model for friends feed; whether multi-image posts show first image only or a collage in the grid; edit-after-publish for posts; comments/reactions on posts (out of scope until specified).
8. **MVP+ video:** Exact thumbnail picker UX (frame scrubber vs single time pick) and max video length/storage limits.

---

## 10. Implementation phases

| Phase | Deliverables |
|-------|--------------|
| P0 Foundation | App shell, Firebase setup, auth, base rules, post-sign-out OTP policy, and one-active-device session enforcement |
| P1 Friends | **NFC PIN** friendship, friend list, unfriend; BLE siloed |
| P2 Messaging | 1:1 E2E chat |
| P3 Group chat | Group creation/add with pairwise-friend validation |
| P4 Stories/feed | Story share, tags, fan-out, 24h expiry, pins |
| P4+ Posts (MVP+) | Permanent posts, friends feed integration, profile 3-column grid, thumbnails (image / video with optional poster / text miniature), publish-time video thumbnail prompt |
| P5 Vulnerable features | 3-way friendships, guardian ratification/removal |
| P6 Hardening | Security audits, replay tests, load/perf validation |

---

## 11. Traceability matrix (high level)

| Spec | Rules | Functions | Client |
|------|-------|-----------|--------|
| R1/R11 friendship | Friendship writes restricted | Session / voucher validation | NFC PIN add flow (+ siloed BLE) |
| R4/R10 messaging | Membership + ciphertext fields | Optional message triggers | 1:1 + group chat UI |
| R19 group clique | Group member write constraints | Pairwise validator | Group composer |
| R5-R8 stories | Story/feed access constraints | Fan-out + expiry | Story + feed UI |
| R24-R30 posts | Post author + friend read/delete rules | Post fan-out + media cleanup | Post composer, feed, profile grid |
| R14/R15 pins | Pin fields and non-reshare rules | Friendship-trigger fan-out | Profile pin UI |
| R16/R17/R23/R21/R22 identity/session | Unique username/email/phone + OTP/session policies | Index checks + OTP/session revocation helpers | Auth + sign-in UX |
| R18 vulnerable removal | Guardian approval writes | Finalize status change | Guardian approval UI |

---

## 12. Success criteria

- Friendship creation cannot happen without **in-person** pairing validation (**NFC PIN pair** or siloed legacy paths).
- Non-friends cannot access friend-only profile/messaging/story capabilities.
- Non-friends cannot view username, email, profile picture, bio, or any profile details of another user.
- Group operations enforce pairwise friendship.
- If friendship break violates a group clique, broken connections are ejected and creator is notified.
- Message content remains ciphertext in backend.
- Story lifecycle/tag behaviors and pin fan-out behave as specified.
- **(MVP+)** Posts persist until deleted; friends see posts in feed; profile grid matches §3.8 thumbnail rules including video thumbnail prompt at publish.
- Unique username/email/phone constraints are enforced.
- After sign-out, next sign-in requires OTP; only one device can remain actively signed in per user.

---

## 13. Internal deploy note (Firestore)

When encrypted message sync (`listEncryptedMessages`) is in use, deploy **Firestore indexes** from `backend/firestore.indexes.json` (e.g. `firebase deploy --only firestore:indexes` from repo root) in addition to Cloud Functions. That file defines a **single-field collection-group** index via `fieldOverrides` on `messages.participantUids` (`array-contains`); do not model that as a one-field composite index (deploy will fail with HTTP 400).

---

Document version: 1.8 (MVP+: permanent posts + profile grid)

