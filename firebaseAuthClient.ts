import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { Platform } from "react-native";

type ExpoExtra = {
  firebase?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    appId?: string;
    storageBucket?: string;
  };
  useFirebaseEmulators?: boolean;
  firebaseAuthEmulatorUrl?: string;
  /** Host only; port defaults to Storage emulator 9199 */
  firebaseStorageEmulatorHost?: string;
  /** Host only; port defaults to Firestore emulator 8080 */
  firebaseFirestoreEmulatorHost?: string;
};

function extras(): ExpoExtra {
  const fromExpoConfig = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
  const fromManifest = (((Constants as unknown as { manifest?: { extra?: ExpoExtra } }).manifest?.extra ??
    {}) as ExpoExtra);
  const fromManifest2 = (((Constants as unknown as { manifest2?: { extra?: { expoClient?: { extra?: ExpoExtra } } } })
    .manifest2?.extra?.expoClient?.extra ?? {}) as ExpoExtra);
  const e = { ...fromManifest2, ...fromManifest, ...fromExpoConfig } as ExpoExtra;
  return e;
}

const extra = extras();
const projectId = extra.firebase?.projectId ?? "nfc-app-7095e";
const apiKey = extra.firebase?.apiKey?.trim() ?? "";
if (!apiKey) {
  throw new Error(
    "Missing Firebase API key. Copy .env.example to .env and set EXPO_PUBLIC_FIREBASE_API_KEY (Firebase console → Project settings → Web app)."
  );
}
const app: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp({
      apiKey,
      authDomain: extra.firebase?.authDomain ?? "nfc-app-7095e.firebaseapp.com",
      projectId,
      appId: extra.firebase?.appId ?? "1:127071681912:web:8f54fb23c26731decc5c8d",
      storageBucket: extra.firebase?.storageBucket ?? `${projectId}.firebasestorage.app`,
    });

function createFirebaseAuth(): Auth {
  if (Platform.OS === "web") {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/already-initialized") {
      return getAuth(app);
    }
    throw e;
  }
}

export const firebaseAuth = createFirebaseAuth();

let firebaseStorageSingleton: FirebaseStorage | null = null;
let storageEmulatorConnected = false;

/** Same Firebase app as Auth; Storage emulator wired when `useFirebaseEmulators` is true. */
export function getFirebaseStorage(): FirebaseStorage {
  if (!firebaseStorageSingleton) {
    firebaseStorageSingleton = getStorage(app);
    if (extra.useFirebaseEmulators && !storageEmulatorConnected) {
      const host = extra.firebaseStorageEmulatorHost ?? "127.0.0.1";
      connectStorageEmulator(firebaseStorageSingleton, host, 9199);
      storageEmulatorConnected = true;
    }
  }
  return firebaseStorageSingleton;
}

let firestoreSingleton: Firestore | null = null;
let firestoreEmulatorConnected = false;

/**
 * Same Firebase app as Auth. Firestore is initialized lazily — push-based
 * message delivery (`MainApp.tsx`) uses this to register an `onSnapshot`
 * listener on the `messages` collection group filtered by the caller's
 * Firebase Auth UID. The emulator host is configurable; the port matches
 * the default `firebase.json` Firestore emulator (8080).
 *
 * `initializeFirestore` (not `getFirestore`) is used so RN-specific
 * long-polling fallbacks can be enabled here if a future build needs them.
 * Long-polling is left off by default — modern Hermes + RN handles streaming
 * fine on Android, and `onSnapshot` works without extra settings.
 */
export function getFirestoreDb(): Firestore {
  if (!firestoreSingleton) {
    // On React Native + Hermes the default WebChannel streaming transport is
    // brittle (it relies on streaming XHR which doesn't behave reliably under
    // Hermes/Android), so we force long-polling. `onSnapshot` still pushes
    // updates within ~hundreds of ms — there is no perceptible delay versus
    // WebChannel — and the connection is far more resilient on flaky mobile
    // networks. See:
    //   https://firebase.google.com/docs/firestore/manage-data/enable-offline#configure_offline_persistence
    firestoreSingleton = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
    if (extra.useFirebaseEmulators && !firestoreEmulatorConnected) {
      const host = extra.firebaseFirestoreEmulatorHost ?? "127.0.0.1";
      connectFirestoreEmulator(firestoreSingleton, host, 8080);
      firestoreEmulatorConnected = true;
    }
  }
  return firestoreSingleton;
}

export { app };

if (extra.useFirebaseEmulators) {
  const url = extra.firebaseAuthEmulatorUrl ?? "http://127.0.0.1:9099";
  connectAuthEmulator(firebaseAuth, url, { disableWarnings: true });
}
