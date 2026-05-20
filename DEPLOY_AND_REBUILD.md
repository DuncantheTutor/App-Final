# When to redeploy functions vs rebuild the APK

Use this every time you pull changes or an agent says “deploy” / “rebuild”. Paths assume repo root: `C:\Users\dunca\OneDrive\Desktop\App FInal V3`.

## Quick decision

| You changed | Redeploy Cloud Functions? | Rebuild + install APK? |
|-------------|---------------------------|-------------------------|
| Only `app/`, `e2eeCrypto.ts`, `backendBridge.ts`, styles, assets | **No** | **Yes** — `npm run apk:release` |
| Only `backend/functions/` (new/changed callables) | **Yes** — `firebase deploy --only functions` | **No** (unless the app calls a **new** function name the old APK doesn’t know) |
| Only `backend/firestore.rules` or `firestore.indexes.json` | **Yes** — rules/indexes deploy (see below) | **No** |
| Only `Planning/` docs | **No** | **No** |
| Client **and** backend (typical feature) | **Yes** | **Yes** |
| Native deps (`package.json`, `android/`, new Expo modules) | **If** new callables were added | **Yes** — often `npm run android` or full release APK |

**Rule of thumb:** If the phone must run new **JavaScript/TypeScript app code**, rebuild the APK. If the server must expose new **HTTP/callable APIs or Firestore rules**, deploy functions/rules. When in doubt, do **both** for two-phone tests.

---

## Commands (copy-paste)

From repo root:

```powershell
# Backend callables only
firebase deploy --only functions

# Firestore (when rules or indexes changed)
firebase deploy --only firestore:rules,firestore:indexes

# Full backend surface (common for messaging/feed work)
firebase deploy --only functions,firestore:rules,firestore:indexes

# Or project script
npm run deploy:full:powershell

# Release APK (physical devices)
npm run apk:release
# Output: android\app\build\outputs\apk\release\app-release.apk
```

Install on each test phone (overwrite or uninstall first if testing reinstall).

**Expo Go / `npm start`:** UI-only tweaks can be tested without APK; **anything native, E2EE, push, NFC/BLE, or production Firebase callables** needs a **dev build or release APK**, not Expo Go alone.

---

## What lives where

| Layer | Location | Updated by |
|-------|----------|------------|
| App UI + sync + E2EE client | `app/`, `e2eeCrypto.ts`, `index.tsx` | **APK rebuild** |
| Callable API names | `contracts/firebaseCallableNames.ts` + app call sites | **APK** if new names; **functions** if implementation changed |
| Cloud Functions | `backend/functions/src/` | **`firebase deploy --only functions`** |
| Firestore security / indexes | `backend/firestore.rules`, `firestore.indexes.json` | **`firebase deploy --only firestore:...`** |
| On-device cache (chats/posts between restarts) | AsyncStorage in app | **APK** (behavior); data cleared on **uninstall** |
| Reinstall recovery (keys + timeline snapshot) | Functions + app | **Both** (see below) |

---

## Current feature: reinstall recovery (May 2026)

Requires **both**:

1. **Functions** — `putUserKeyBackup`, `getUserKeyBackup`, `putUserSocialSnapshot`, `getUserSocialSnapshot`  
   ```powershell
   firebase deploy --only functions
   ```

2. **APK** — restore order fix, snapshot upload/restore, boot post+message pull  
   ```powershell
   npm run apk:release
   ```

**Test flow:** deploy functions → install new APK → sign in ~1 min (creates backups) → uninstall → reinstall → sign in. Timeline should appear in seconds.

---

## When only one side is needed (examples)

**APK only**

- Feed layout, reactions UI, voice note UX, profile picture cache
- Client-only bug fixes in `MainApp.tsx`
- `e2eeCrypto.ts` decrypt/encrypt **logic** with **no** new callables

**Functions only**

- Server-side validation, friendship checks, push payload text
- Fixing an existing callable’s bug **without** changing its name or request/response shape the app already sends

**Functions + APK**

- New callable the app must call (e.g. key/snapshot backup)
- `claimDeviceSession` / username behavior
- `participantAuthUids` / live message listener (rules + indexes + client)
- Anything that says “Requires deploy + APK” in `Planning/CHANGELOG.md`

---

## Two-phone testing checklist

For each release you care about on **both** phones:

1. [ ] `firebase deploy --only functions` (and rules/indexes if that release touched them)  
2. [ ] `npm run apk:release` on the same commit  
3. [ ] Install **the same** `app-release.apk` on **both** devices  
4. [ ] If testing reinstall: use new APK for ≥1 min before uninstall so cloud backups exist  

---

## Agents / changelog convention

When documenting work, use explicit lines:

- `**Deploy:** firebase deploy --only functions`  
- `**APK:** npm run apk:release on both phones`  
- `**Deploy + APK:**` when both apply  

See `Planning/CHANGELOG.md` [Unreleased] for feature-specific notes.
