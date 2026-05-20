# Messaging bug audit (May 2026)

Post modular refactor + legacy `draft-*` removal. Use with `FEATURE_TEST_SCENARIOS.md` on two physical devices after **functions deploy + release APK**.

## Architecture (current)

| Module | Responsibility |
|--------|----------------|
| `app/messaging/sync.ts` | Callable pull + Firestore message listener |
| `app/messaging/decodeIncoming.ts` | Single decrypt/map path for pull + listener |
| `app/messaging/send.ts` | Encrypt + `upsertConversation` + `sendEncryptedMessage` |
| `app/messaging/localChatId.ts` | `dm_*`, `grp_*`, `bc_*` ids (no new `draft-*`) |
| `app/messaging/legacyChatMigration.ts` | One-time local upgrade of old `draft-*` rows |
| `app/messaging/openDirectChat.ts` | Open/create 1:1 with canonical `dm_*` only |
| `app/boot/useInitialServerSync.ts` | One-shot friends + message pull |
| `app/friends/roster.ts` | Friendship snapshot listener |
| `app/presence/heartbeat.ts` | Presence tick |
| `app/chat/useActiveChatMessages.ts` | Active thread message list + join cutoff |

`MainApp.tsx` remains the UI shell (feed, settings, navigation, composer).

## Local chat id rules (after cleanup)

| Thread type | Local id |
|-------------|----------|
| 1:1 DM | `dm_{u_a}__{u_b}` (sorted app uids) |
| Group | `grp_{hash(memberIds)}` |
| Broadcast | `bc_{hash(memberIds)}` |
| **Removed** | `draft-{timestamp}` for new chats |

Friend row ids stay `f_*` (UI keys only). Server identity is `u_*` on `friend.backendUid`.

## Issues fixed in this pass

1. **No new per-device `draft-*` DMs** — prevents split Firestore `enc_draft-*` threads.
2. **Boot message pull deduplicated** — uses same `pullEncryptedMessagesIncremental` as foreground/chat polling.
3. **DM open requires linked `u_*`** — alert instead of silent pending chat when friend has no backend uid.
4. **Legacy migration on sign-in** — rewrites old `draft-*` chats/messages to `dm_*` / `grp_*` / `bc_*`.
5. **Hide tombstone** — no longer hides unrelated `enc_{legacyId}` when canonical exists.

## Open risks (verify on device)

| # | Risk | Symptom | Mitigation |
|---|------|---------|------------|
| R1 | Stale Firestore `enc_draft-*` / `enc_dm_*` data | Old messages missing or duplicate threads | Reset Firestore dev data OR delete orphan `conversations` docs |
| R2 | `registerFirebaseAuthUid` / device session | Send fails or listener silent | Clear app data; one active device per account; deploy latest functions |
| R3 | Friendship docs without `participantAuthUids` | Friends list empty until boot `listMyFriends` | Boot sync + listener; deploy functions |
| R4 | Group `grp_*` ids are device-local hash | Two devices may use different local ids for same group until server group-id story exists | Accept for MVP; groups are secondary to 1:1 |
| R5 | `MainApp.tsx` still hosts feed/profile listeners | Harder to maintain | Next extract: `app/feed/`, `app/profile/` |
| R6 | Inbound payload still carries `chatId` | Wrong row if sender on old APK | `resolveIncomingDirectChatId` maps using sender `u_*` |

## Recommended test matrix (two phones, clean Firestore)

1. A and B sign in, add friend, open DM from friends list → chat id starts with `dm_`.
2. A sends → stays visible, B receives within ~5s (chat open or app foreground).
3. B sees A online in friends list while A is foregrounded.
4. Delete chat on both sides, re-open DM → new thread, no ghost messages from old `enc_*` if data was wiped.
5. Create 3-person group → id starts with `grp_`, messages sync for members with keys.

## Firebase reset (dev)

Firestore: delete `conversations`, `friendships`, `presence`, `userFirebaseAuthMap`, `firebaseAuthToAppUid`, `users` (or use a fresh project).

Auth: delete test users.

Phones: uninstall app or clear storage, install latest APK.

```powershell
cd backend\functions; npm run build; cd ..\..
firebase deploy --only functions
npm run apk:release
```
