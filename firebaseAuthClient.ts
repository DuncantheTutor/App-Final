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

const DEBUG_INGEST_PATH = "/ingest/81185788-3701-4c9e-b62c-43aa972e97d1";
const DEBUG_INGEST_ORIGINS = ["http://127.0.0.1:7751", "http://192.168.0.12:7751"];

/** Debug-session ingest (folded). Posts to loopback and LAN so a physical phone can reach the host. */
export function debugSessionLog(
  location: string,
  message: string,
  hypothesisId: string,
  data: Record<string, unknown>
): void {
  // #region agent log
  const body = JSON.stringify({
    sessionId: "cf73d6",
    runId: "pre-fix",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  });
  const headers = { "Content-Type": "application/json", "X-Debug-Session-Id": "cf73d6" };
  const origins = [...DEBUG_INGEST_ORIGINS];
  const expoHost = String(Constants.expoConfig?.hostUri ?? "").split(":")[0]?.trim();
  if (expoHost && expoHost !== "127.0.0.1" && expoHost !== "localhost") {
    origins.push(`http://${expoHost}:7751`);
  }
  for (const origin of [...new Set(origins)]) {
    fetch(`${origin}${DEBUG_INGEST_PATH}`, { method: "POST", headers, body }).catch(() => {});
  }
  // #endregion
}

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
  const persistenceFnType = typeof getReactNativePersistence;
  if (Platform.OS === "web") {
    const auth = getAuth(app);
    // #region agent log
    debugSessionLog("firebaseAuthClient.ts:createFirebaseAuth", "auth init web getAuth", "H2", {
      platform: Platform.OS,
      persistenceFnType,
      path: "getAuth",
    });
    // #endregion
    return auth;
  }
  try {
    const auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
    // #region agent log
    debugSessionLog(
      "firebaseAuthClient.ts:createFirebaseAuth",
      "auth init initializeAuth persistence",
      "H2",
      { platform: Platform.OS, persistenceFnType, path: "initializeAuth" }
    );
    // #endregion
    return auth;
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/already-initialized") {
      const auth = getAuth(app);
      // #region agent log
      debugSessionLog(
        "firebaseAuthClient.ts:createFirebaseAuth",
        "auth init already-initialized fallback getAuth",
        "H4",
        { platform: Platform.OS, persistenceFnType, path: "getAuth-fallback", code }
      );
      // #endregion
      return auth;
    }
    throw e;
  }
}

/** True when Firebase has rehydrated the persisted session from AsyncStorage. */
export function hasPersistedFirebaseUser(): boolean {
  return Boolean(firebaseAuth.currentUser?.email?.trim());
}

export const firebaseAuth = createFirebaseAuth();

void (async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter(
      (k) => k.includes("firebase:authUser") || k.includes("firebase:auth")
    );
    // #region agent log
    debugSessionLog("firebaseAuthClient.ts:storageProbe", "AsyncStorage firebase auth keys", "H2", {
      authKeyCount: authKeys.length,
      keyPrefixes: authKeys.map((k) => k.slice(0, 48)),
      hasCurrentUserNow: Boolean(firebaseAuth.currentUser),
    });
    // #endregion
    const ready = (
      firebaseAuth as Auth & { authStateReady?: () => Promise<void> }
    ).authStateReady;
    if (typeof ready === "function") {
      await ready.call(firebaseAuth);
      // #region agent log
      debugSessionLog("firebaseAuthClient.ts:authStateReady", "authStateReady resolved", "H1", {
        hasCurrentUser: Boolean(firebaseAuth.currentUser),
        hasEmail: Boolean(firebaseAuth.currentUser?.email?.trim()),
      });
      // #endregion
    }
  } catch {
    /* ignore debug probe */
  }
})();

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
