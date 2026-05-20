# MVP+ Plan — Messaging + Permanent Friends Feed

> **Canonical implementation:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3` only. Export Cursor chats periodically; see `PLANNING.md` §0.

This document defines **MVP+**: the existing **MVP messaging app** (see `MVP_FINAL_PLAN.md`) plus **permanent posts** and a **friends feed**, aligned with the permanent-feed requirements in `PLANNING.md` (§3.8, R24–R30). It does **not** include ephemeral stories/reels, pinned profile stories, guardians/vulnerable flows, or other full-product scope from `PLANNING.md` unless listed here.

> Putting the social back in social media.

---

## 1. Codebase baseline

| Item | Detail |
|------|--------|
| **Source app** | MVP implementation copied from **App V2 Build2** |
| **MVP+ working tree** | **`App V2 Build3`** (folder name on disk; same code base as Build2 at split) |
| **Verification** | On split, top-level app sources matched Build2 (same file sizes and SHA256 for `App.tsx`, `PhotoEditorModal.tsx`, `package.json`, `app.json`, `index.tsx`, and other tracked root files). |

MVP+ work proceeds in **Build3**; messaging behavior should stay consistent with `MVP_FINAL_PLAN.md` unless this document explicitly extends it.

---

## 2. Product objective

Ship everything the **MVP** already promises (NFC friends, 1:1/group/broadcast chat, profiles, sessions, themes, etc.) **and** add:

- Keep approved UI accent options consistent with MVP: **green** (`#0C8579`) and **hot pink** (`#E91E8C`), with online presence using a distinct bright-online-green.

- **Permanent posts** authored by the user, visible to **friends only**, until **deleted by the author**.
- A **friends feed** where users see friends’ posts (ordering: start with **reverse-chronological “new”** unless otherwise specified below).
- Each user’s **profile** shows their own posts in a **grid below the bio** (see §4).

**Not in MVP+ scope:** 24h stories, reels, story pins, story comments, vulnerable/guardian flows, public explore feeds, or opaque recommendation engines.

---

## 3. Hard rules (MVP+ feed and posts)

These align with `PLANNING.md` R24–R30 for the permanent-feed slice only.

| ID | Rule |
|----|------|
| **P1** | A post exists until the **author deletes** it (no automatic expiry). |
| **P2** | Only **friends** see another user’s posts in the feed and on that user’s profile (same friendship gate as messaging; unfriend removes visibility). |
| **P3** | New posts are delivered into the **friends feed** when published (implementation: fan-out collection, query-by-friend, or hybrid—see §7). |
| **P4** | Post content is **durable** in storage/Firestore; distinguish **`posts`** from any future ephemeral content types. |
| **P5** | **Profile grid:** **3 columns** × *N* rows below the bio; one cell per post; consistent order (default: **newest first**). |
| **P6** | **Grid thumbnails:** **Image** (or multi-image): small preview / cover image per product choice. **Video:** poster image; default **first frame**; on publish, user may **choose a thumbnail** or **Skip** to keep first frame. **Text-only:** miniature of the **feed card** appearance, **fit to cell width**. |
| **P7** | **Ordering:** MVP+ feed uses explicit **“new”** (newest first) unless extended later; no hidden “For You” requirement in MVP+. |

---

## 4. Feature specification (posts)

### 4.1 Composer / publish

- User can create a post with **text**, **image(s)**, and/or **video** (exact combinations and limits TBD; start from MVP chat media patterns where practical).
- **Video:** before publish, prompt: **Choose thumbnail** (frame selection) or **Skip** → store poster = **first frame** (or derived still).
- Publish writes post document + media to Storage; triggers friend visibility (fan-out or visibility query).

### 4.2 Friends feed (read)

- Scrollable list of **friends’ posts** (and optionally **own** posts inline or in profile only—**open:** show self in feed or profile-only).
- Each item shows full post for reading (text + media); interactions beyond delete (likes/comments) are **out of scope** unless added in a later revision.

### 4.3 Profile

- Below **bio**: **3-column** grid of **that user’s** posts.
- Tapping a cell opens post detail (or inline expansion—implementation choice).
- **Own profile:** user can **delete** their posts (hard delete or soft-delete + cleanup Storage).

### 4.4 Delete

- Author-only delete removes post from profile, feed projections, and Storage blobs.

---

## 5. Relationship to full `PLANNING.md`

| Full doc area | MVP+ stance |
|---------------|-------------|
| Ephemeral **stories/reels**, 24h expiry, pins | **Not in MVP+** |
| **Permanent posts**, profile grid, thumbnails R24–R30 | **In MVP+** (this doc) |
| **R20** feed modes (`hot`, `popular`) | **Defer:** MVP+ implements **new** only unless specified later |
| E2E messaging | **Unchanged** from MVP |
| NFC-only friending | **Unchanged** |

---

## 6. UX placement (initial)

**Decision (implemented):** Use stack navigation with `Connect` as the signed-in landing screen, explicit `Go to Feed` entry action, and a top action strip on Home (`New post`, `Messages`, `Profile`). No tab/segmented feed switch is used in the current MVP+ implementation.

Minimum expectation:

- User can reach **Friends feed** from signed-in home without leaving the friend-gated shell.
- User can reach **own profile** (existing MVP path) and see the **post grid** when implementation lands.

---

## 7. Data & backend (sketch)

MVP+ introduces post persistence; messaging collections stay as in MVP.

- **`posts/{postId}`** — `authorId`, `createdAt`, `updatedAt`, text body, image URLs (array), optional video URL, **`posterUrl`** (video), visibility (`friends`), optional **`textPreviewLayout`** or rendered bitmap for text-only grid tile if needed, delete marker or tombstone.
- **Feed visibility** — choose one: (a) **fan-out** `feedItems/{uid}/items` per friend, (b) **query posts where authorId in friendIds**, or (c) hybrid. Unfriend must stop showing posts (rules + client).
- **Storage** — post images/video/posters; **delete** removes objects when post deleted.

Firebase **Firestore rules** and optional **Cloud Functions** must enforce friend-only read and author-only write/delete for posts.

---

## 8. Implementation phases (suggested)

| Phase | Deliverable |
|-------|-------------|
| **M+0** | Project rename/package identity for Build3 if needed; no behavior change vs MVP |
| **M+1** | Firestore/Storage models + rules for `posts`; author create/delete; no feed UI yet |
| **M+2** | Friends feed UI (newest first) + basic post card (text + image + video playback) |
| **M+3** | Profile grid 3×N + thumbnails (image / video poster / text miniature) |
| **M+4** | Video thumbnail picker + skip → first frame |
| **M+5** | Unfriend/remove visibility, Storage cleanup on delete, polish + `npm run typecheck` |

---

## 9. Success criteria

- Messaging and NFC/friend rules behave as in **MVP_FINAL_PLAN.md** for unchanged flows.
- Friends see each other’s posts in the feed after publish; non-friends do not.
- Posts remain until deleted; after delete, post disappears from feed and profile and media is cleaned up.
- Profile shows a 3-column grid below bio with correct thumbnail rules (§3, P6).
- Video publish flow offers thumbnail selection with Skip → first frame.

---

## 10. Traceability

| This doc | `PLANNING.md` |
|----------|----------------|
| §3 P1–P7 | R24–R30, §3.8 (posts only; stories excluded) |
| Messaging | `MVP_FINAL_PLAN.md` |

---

Document version: 1.0
