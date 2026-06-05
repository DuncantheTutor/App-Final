# Run MVP Locally and On Phone

This guide covers:

1. Testing the MVP on laptop using "fake mobiles"
2. Running the MVP on your real phone

**Before every two-phone test:** read **[DEPLOY_AND_REBUILD.md](./DEPLOY_AND_REBUILD.md)** — it states exactly when to run `firebase deploy --only functions` vs `npm run apk:release`.

---

## 1) Test on laptop ("fake mobiles")

### Firebase credentials (required once per machine)

This repo does **not** commit Google API keys. Before `npm run android` or `npm run apk:release`:

1. Copy **`.env.example`** → **`.env`** and set **`EXPO_PUBLIC_FIREBASE_API_KEY`** (Firebase console → Project settings → Your apps → Web app → API key).
2. Copy **`android/app/google-services.json.example`** → **`android/app/google-services.json`**, or download the real file from Firebase console (Project settings → Android app `com.duncanharper42.appv2build2` → **google-services.json**).

Without these files, Auth/Firestore and FCM push builds will fail at runtime or build time.

### Option A: Android emulator (recommended on Windows)

1. Install Android Studio (includes Android Emulator + AVD Manager).
2. Create at least one virtual device (for example Pixel 7).
3. Start emulator from AVD Manager.
4. In this project folder, run:

```bash
npm install
npm run android
```

Expo will open the app in the running emulator.

After pulling **photo crop (expo-dynamic-image-crop)** changes, run **`npm install`** then a **native rebuild** (`npm run android` or `npm run apk:debug`) so `react-native-gesture-handler` and the crop module link; `index.tsx` already imports gesture-handler first. See **`OPEN_SOURCE_LICENSES.md`** for attribution.

After pulling **BLE Add Friend** changes, run a **native rebuild** once (`npm run android` / `expo run:android` or `npx expo prebuild` if you manage `android/` locally) so `react-native-ble-plx` and `react-native-ble-advertiser` link; **BLE does not run in Expo Go**. Against **production** Firebase, deploy pairing callables: **`registerNfcPinPairOffer`**, **`cancelNfcPinPairOffer`**, **`getNfcPinPairOfferStatus`**, **`previewNfcPinPairOffer`**, **`confirmNfcPinPairOffer`** (`npm run deploy:full:powershell` or `firebase deploy --only functions` from the repo root). **Also deploy Firestore indexes** after encrypted messaging changes so `listEncryptedMessages` works: `firebase deploy --only firestore:indexes` (see `backend/firestore.indexes.json`). The current Add Friend UI uses **Show QR / Read QR** with final identity confirmation and GPS/Wi-Fi proximity checks. Legacy BLE callables remain in the codebase but are not used by the default Add Friend UI.

`npm run apk:release` / `apk:debug` automatically runs `scripts/patch-ble-advertiser-sdk.mjs` first so `react-native-ble-advertiser`’s `compileSdkVersion` meets AGP (avoids “compileSdkVersion to 30 or above” if `postinstall` did not run).

Regular `apk:release` only produces **`app-release.apk`**. If you explicitly want an extra install artifact named **`app-demo-release.apk`** (same binary, for QA labeling), run **`npm run apk:release:demo`**.

Debug builds (`apk:debug`) use the debug application id suffix and bundle the **same MainApp** as release (square feed media, chat UX, etc.). Run **`npm run apk:debug:demo`** only when you need the offline **AppDemo** QA binary (fake friends); that script also copies **`app-demo-debug.apk`** beside **`app-debug.apk`**.

### Option B: Multiple fake phones at once

You can run multiple clients from one Metro server:

- Start dev server:

```bash
npm start
```

- Open one client in Android emulator (`a` in terminal)
- Open another client in web (`w` in terminal)
- Or run two Android emulators and connect both

This is useful for testing chat flow as different "users" on one laptop.

### Option C: Browser responsive testing (quick UI checks)

```bash
npm run web
```

Then use browser device toolbar (mobile viewport sizes) for fast layout checks.

---

## 2) Run on your real phone

### Fastest path: Expo Go

1. Install **Expo Go** on your phone.
2. Make sure phone and laptop are on the same Wi-Fi.
3. In this project folder:

```bash
npm start
```

4. Scan the QR code from terminal/Expo devtools in Expo Go.

### If same-Wi-Fi does not work (hotspot/corporate network)

Use tunnel mode:

```bash
npm run start:tunnel
```

Then scan the QR code.

---

## Useful commands

```bash
npm run typecheck
npm run android
npm run web
npm run start:tunnel
```

**Internal release APK:** `npm run apk:release` → `android/app/build/outputs/apk/release/app-release.apk`. Versioning and Play internal-track notes: **`Planning/RELEASE_NOTES.md`**.

---

## Notes

- This MVP currently uses mock/in-memory data in `App.tsx`.
- For app-store style installable builds (APK/IPA), next step is EAS Build (`eas build`), which is separate from Expo Go testing.

## Push notifications (chat messages)

The app already registers a device push token on sign-in (`registerOsPushToken`) and the backend sends a push to other participants on every new message (`notifyConversationParticipantsPush`). For pushes to actually reach a **standalone APK**, complete one of these (a credentials step — code alone can't do it):

- **Direct FCM (wired — recommended):** the Gradle build is already configured. The Google Services classpath is in `android/build.gradle`, and `android/app/build.gradle` *conditionally* applies `com.google.gms.google-services` **only when `android/app/google-services.json` exists** (so builds without it still succeed). `expo-notifications` already bundles `firebase-messaging`. To turn push on:
  1. Firebase console → project `nfc-app-7095e` → Project Settings → add/select the Android app with package `com.duncanharper42.appv2build2` → **download `google-services.json`**.
  2. Save it to **`android/app/google-services.json`**.
  3. **Rebuild the release APK** (`npm run apk:release`) — the Google Services plugin only applies when that file exists at build time.
  4. On **Android 13+**, the app declares **`POST_NOTIFICATIONS`**; grant it when prompted (or in System Settings → Notifications).
  5. Install the new APK on test phones. The client registers a native FCM device token; the backend delivers via `admin.messaging()`.
  (`app.json` `expo.android.googleServicesFile` is also set for any future `expo prebuild`.)
- **Expo push (alternative):** add an EAS project id so `getExpoPushTokenAsync` can mint a token. Run `eas init` (writes `expo.extra.eas.projectId` into `app.json`) and upload your **FCM server credentials** to Expo (`eas credentials`). The token will start with `ExponentPushToken[...]`.

Notes:
- In **Expo Go** push behaves differently and is not representative — test push on a real APK/EAS build.
- Android shows messages on the high-importance **`messages`** channel (heads-up + sound + vibration), created on first launch.
- Tapping a chat notification deep-links to the conversation; per-chat mute (`conversations.mutedBy`) suppresses pushes server-side. Message text is **not** included in the payload (E2EE) — the body is a generic "New message".

