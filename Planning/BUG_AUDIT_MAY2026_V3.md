# Bug audit pass (May 2026, v3)

Code-review findings and fixes in this workspace. Use with `FEATURE_TEST_SCENARIOS.md` and `DEPLOY_AND_REBUILD.md`.

## Fixed in this pass

| # | Issue | Severity | Files |
|---|--------|----------|--------|
| 1 | `getUserKeyBackup` called without `deviceId` → restore always failed on reinstall | Critical | `app/lib/e2eeKeyBackup.ts`, `MainApp.tsx` |
| 2 | Failed key decrypt still generated new keys and overwrote cloud backup | Critical | `e2eeKeyBackup.ts` (`KeyRestoreResult`), `MainApp.tsx` |
| 3 | Partial outbound send marked entire batch failed while some messages were on server | High | `app/messaging/send.ts`, `useOutgoingMessages.ts` |
| 4 | Message/post watermark advanced past decrypt failures → items never retried incrementally | High | `sync.ts`, `pullEncryptedPosts.ts`, `MainApp.tsx` (feed listener) |
| 5 | Stale listener generation dropped metadata-only patches (reactions/unsend) | Medium | `sync.ts` |
| 6 | `resolveConversationId(string)` missed live/canonical DM rows | Medium | `useMessagingSync.ts` |
| 7 | Chat pagination used view `chatId` instead of payload-resolved thread id | Medium | `MainApp.tsx` |
| 8 | Unsend metadata used string chat id without chat row lookup | Medium | `MainApp.tsx` |

## Open / monitor (not fixed here)

| # | Issue | Severity | Notes |
|---|--------|----------|--------|
| O1 | Boot 20s timeout can release listener while pull still running | Medium | `useInitialServerSync.ts` — race on watermark; mitigated by decode-failure watermark guard |
| O2 | Accounts that already rotated keys before fixes cannot decrypt old ciphertext | High | Data loss; need fresh backups on fixed build |
| O3 | `AppDemo.tsx` diverges from production (no restore, missing deviceId on some calls) | Low | Demo tree only |
| O4 | One permanently corrupt message blocks incremental watermark forever | Low | Full sync every 6h posts / boot `forceFull` still recovers |

## Deploy

```powershell
firebase deploy --only functions
npm run apk:release
```

Both phones need the same release APK after functions deploy.
