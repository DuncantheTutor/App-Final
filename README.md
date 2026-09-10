# Erdos

Canonical React Native (Expo) app and Firebase backend for this product line.

- **App code:** repository root (`App.tsx`, `index.tsx`, shared modules, `android/`, etc.).
- **Backend:** `backend/functions`, `backend/firestore.rules`, `backend/storage.rules`.
- **Planning and specs:** [`Planning/`](Planning/README.md) (requirements, parity checklists, changelog, chat exports).
- **Git remote:** [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final) (initialize and push from this folder when ready).
- **Install id:** `com.duncanharper42.appv2build2` until you register `com.erdos.app` on Firebase project `nfc-app-7095e` (do not create a new project).

Open **`C:\Users\dunca\OneDrive\Desktop\Erdos`** in Cursor as the project root. See `Planning/PLANNING.md` §0 for agent continuity and canonical-path rules.

The previous tree `C:\Users\dunca\OneDrive\Desktop\App FInal V3` is a read-only archive.

Quick start: `RUN_MVP_LOCALLY_AND_ON_PHONE.md`.

First time in this folder, run `npm install` in a normal PowerShell window, then `npm run apk:release`. This APK updates the existing `com.duncanharper42.appv2build2` install.
