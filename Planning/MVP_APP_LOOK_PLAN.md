# MVP APP LOOK PLAN - Messaging MVP UI

> **Canonical implementation:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` only. Export Cursor chats periodically; see `PLANNING.md` §0.

This document defines the visual and UI structure plan for the app look and interaction layout.

---

## 1. Visual design goals

- Keep the interface clean, readable, and fast to scan.
- Prioritize messaging actions and friend presence visibility.
- Maintain strong contrast and accessibility in both light and dark modes.
- Use one consistent accent color for interactive emphasis.

---

## 2. Required UI structure

The main messaging screen must include all of the following:

1. **Current Chats section**
   - Shows existing 1:1 and group conversations.
   - Each row shows chat name, last message preview, timestamp, and unread indicator.
   - Chat rows are plain list rows on background (no card containers).
   - If multi-user chat has designated chat picture/name, show those.
   - If multi-user chat has no designated picture, use app logo placeholder `^`.
   - If friend represented in the chat row is online, show online marker on that chat avatar.

2. **Start Chat button**
   - Primary action button fixed at the bottom of the screen.
   - Opens chat composer flow from friends list.
   - Friends list in composer supports search.
   - User can select one friend to start 1:1, or keep adding for group.
   - After first friend is selected, additional selectable users are limited to mutual friends of all currently selected participants.
   - User must press explicit "Create chat" to finalize.
   - At `Create chat`:
     - If selected participants already have an existing chat, open that chat (no duplicate created).
     - Otherwise create a draft chat visible only to creator.
   - Default naming on create:
     - One selected friend: chat is named after that friend.
     - Multiple selected friends: chat is named from participant names until user renames it.
   - New draft chat is saved permanently only after creator sends the first message.
   - If creator leaves/discards before sending first message, keep the draft for creator-only resume; recipients still cannot see it.

3. **Online friend profiles at top of screen**
   - Horizontal top strip (stories-style row) showing profile images of online friends.
   - Top strip shows online friends in interaction-priority order:
     - prioritize online friends not present in the first visible home chat rows,
     - then include remaining online friends by most interactions to least.
   - If no online friends outside visible chat rows, still show online friends ordered by interactions.
   - Row is horizontally scrollable.
   - Sorted by interaction priority (most relevant first).
   - Tapping a profile picture **in this strip** opens a **new or existing 1:1 chat** with that friend (not the profile screen).

4. **Top-right controls**
   - `Settings` button (currently only light/dark toggle).
   - `Profile` (person icon) button next to settings.
   - Tapping person icon opens **full-screen My Profile** (photo upload + bio).
   - User can edit their profile picture and bio from this screen.
   - `Logout` button.

---

## 3. Screen composition (default chat home)

- **Top area**
  - Icon-only `Settings`, `Profile`, and `Logout` controls (no words).
  - Horizontal row of online friend profile pictures directly below header.

- **Middle area**
  - Most recent chats list (newest activity first), beginning **directly under** the online-friends strip with **no** large empty vertical band between strip and first row.
  - No `Current Chats` label text; spacing alone separates sections.

- **Bottom area**
  - Persistent `Start Chat` CTA sits **above** an inert bottom strip that matches the theme background (white/black) and fills the **system bottom inset** so no interactive UI sits in the gesture/nav zone.
  - Start Chat includes mail icon.
  - No always-visible friends list on home; friends list appears inside Start Chat flow.

---

## 4. Theming and color system

The app must support two core themes:

1. **Light mode**
   - Background: white.
   - Text: black.
   - Cards/surfaces: light neutral shades.

2. **Dark mode**
   - Background: black.
   - Text: white.
   - Cards/surfaces: dark neutral shades.

3. **Highlight color**
   - Approved accent/highlight options for active controls, focus states, and key CTAs:
     - **Green** (`#0C8579`)
     - **Hot pink** (`#E91E8C`)
   - **Online / presence indicators** use a **bright online green** distinct from whichever UI accent is selected so “online” remains visually unambiguous.

---

## 5. Component-level visual guidance

- **Chat row**
  - Avatar/profile image on left.
  - Row uses an invisible tap-card area for opening chat.
  - Name + last message.
  - Timestamp + unread badge on right.
  - Online dot uses **bright green** when user is online (not pthalo).
  - Tapping a friend's profile picture opens that friend's profile.
  - Tapping anywhere else on the row's invisible tap-card opens the chat screen.

- **Online profile strip**
  - Circular profile pictures.
  - Optional green ring/dot for online state.
  - Horizontal scroll when friend count exceeds width.
  - Order by most messages exchanged to least.

- **Start Chat button**
  - High-emphasis CTA using the selected accent (green or hot pink).
  - Includes mail icon + label.
  - Positioned with bottom safe-area inset so it does not overlap OS gesture/nav bars.

- **Start Chat composer**
  - Step 1: select first friend.
  - Friend picker includes search.
  - Step 2+: selectable list narrows to mutual friends of all selected participants.
  - `Create chat` first checks for existing participant-set chat; if found, open it.
  - If no existing chat is found, `Create chat` creates a draft conversation visible only to creator.
  - On create, default name = friend name (1:1) or participant-name list (group), unless user sets custom name.
  - Draft becomes visible to recipients only after first sent message; if user exits before first message, keep draft for creator-only resume.

- **Profile-picture interaction rule**
  - **Online strip:** opens **chat** (new or existing 1:1) with that friend.
  - **Chat row and message avatars:** open that friend's **full-screen profile** (large hero image, name, bio, **Start chat** at bottom).

- **Friend profile screen**
  - Full screen (not a small modal): hero image, display name, bio, optional presence text.
  - Bottom **Start chat** opens existing participant-set chat or creates/opens draft per messaging rules.

- **Chat screen overflow**
  - Header uses an overflow control (three dots / similar) instead of a persistent search field.
  - Menu entries: **View chat members**, **Search in chat** (reveals search field when chosen), **Shared media** (gallery placeholder acceptable in MVP).

---

## 6. Interaction behavior

- Online status should update in near real time for:
  - Current chats participant indicators first (for friends currently visible in chat rows),
  - Top online profile strip for remaining online friends not currently visible in chats.

- Tapping an online friend profile picture in top strip opens **chat** with that friend (not the profile screen).

- Start Chat flow behavior:
  1. User taps `Start Chat`.
  2. Searches/selects first friend.
  3. Optional additional members list updates to mutual-friend intersection as each member is added.
  4. User taps `Create chat`; if a matching participant chat already exists, open it.
  5. If no matching chat exists, create a creator-only draft chat and apply default naming (friend name for 1:1, participant names for multi-member) unless user sets custom name.
  6. Draft becomes visible to recipients only when first message is sent.
  7. If creator exits before sending first message, draft chat is kept for creator-only resume.

- Home to chat navigation behavior:
  1. Tapping any chat row opens that chat on a new chat screen.
  2. Home screen does not include a message input field.
  3. Chat screen is the only place with bottom message input + send action.

- Chat screen behavior:
  1. Chat name appears at top with back affordance and **overflow menu** (members / search / shared media). Header row sits **below** the system status bar (top safe inset applied on the conversation surface, not only on a padded app root, so controls are not covered on Android).
  2. Full message history is vertically scrollable (not just last message preview).
  3. **Scroll model:** newest messages at the **bottom** of the history (above the composer); user scrolls **upward** to read older messages—standard chat pattern (e.g. inverted list with newest-first data).
  4. Each message shows sender profile picture, sender name, and day/time sent.
  5. Chat history search is started from overflow (**Search in chat**), not shown by default.
  6. Bottom message field opens keyboard; the **composer row stays above the soft keyboard** while typing so the user can always see what they type (`KeyboardAvoidingView` / padding behavior, correct `keyboardVerticalOffset` on iOS, Android resize mode as configured).
  7. **Send actions:** the keyboard IME **send** action (checkmark / send on the keyboard) submits the message via `onSubmitEditing`; the optional on-screen control uses the **same send icon** as the rest of the chat UI for consistency.
  8. Message area must not use flex-grow tricks that create a huge empty region above the message thread.

---

## 7. Accessibility and readability baseline

- Ensure text contrast is readable in both themes.
- Provide minimum touch target sizing for all primary actions.
- Do not rely on color alone for unread/online meaning; pair with iconography or labels.

---

## 8. MVP implementation notes

- Build theming via centralized design tokens (`colors`, `spacing`, `typography`).
- Keep layout responsive for small and large phones.
- Start with one unified chat home screen before adding advanced navigation complexity.
- **Safe area:** For full-screen overlays (conversation, friend profile, My Profile), apply **top** inset on the overlay container so headers clear the status bar when using absolute positioning.
- **Home list:** Use a bounded flex column (`minHeight: 0` on flex children where needed) and avoid `flexGrow` on list **content** that would insert blank space between the online strip and the first chat row. The **online-friends row** should use a **horizontally scrolling** list with a **fixed or max bounded height** (and `flexGrow: 0`) so it does not expand vertically and push the chat list down. Keep avatars **slightly tighter** (narrower item width, smaller margins) than the main chat rows to reduce dead space.
- **Conversation list:** Prefer bottom-anchored message scrolling (inverted list or equivalent); avoid `flexGrow: 1` on message list scroll content unless paired with correct justification—prefer tight content height to the messages.

