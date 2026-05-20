# Real OTP Sign-In Commands

> **Canonical app path:** `C:\Users\dunca\OneDrive\Desktop\App FInal V3`. Export Cursor chats periodically; see `Planning/PLANNING.md` §0.

Run these exact commands in PowerShell from the **App Final V3 repository root** (not inside `Planning/`).

```powershell
cd "C:\Users\dunca\OneDrive\Desktop\App FInal V3"
```

---

## A) Spark-safe commands (no Blaze required)

Use this path if your Firebase project is still on Spark.

### 1) Install dependencies

```powershell
npm install
npm --prefix backend\functions install
```

### 2) Validate Firebase project selection

```powershell
npx firebase use
```

### 3) Build functions locally (no deploy)

```powershell
npm --prefix backend\functions run build
```

### 4) Deploy only Firestore rules

```powershell
npx firebase deploy --only firestore:rules
```

### 5) Build installable Android APK (local Gradle)

```powershell
npm run apk:release
```

Use `npm run apk:debug` for a debug-signed APK if release signing is not configured.

### 6) Optional local checks

```powershell
npm run typecheck
npm run start
```

---

## B) Blaze-required commands (full live backend path)

Use this after upgrading Firebase project billing to Blaze.

### 1) Install dependencies

```powershell
npm install
npm --prefix backend\functions install
```

### 2) Validate Firebase project selection

```powershell
npx firebase use
```

### 3) Build backend functions

```powershell
npm --prefix backend\functions run build
```

### 4) Deploy functions and Firestore rules

```powershell
npx firebase deploy --only functions,firestore:rules
```

### 5) Build installable Android APK

```powershell
npm run apk:release
```

When the build finishes, install the APK on your device from the output path shown by the Gradle script (or use your usual artifact location).
