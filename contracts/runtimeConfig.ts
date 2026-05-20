/** Defaults aligned with `app.json` → `expo.extra.firebase` and `backendBridge.ts`. */
export type RuntimeConfig = {
  firebaseProjectId: string;
  firebaseRegion: string;
  useEmulator: boolean;
  functionsEmulatorHost: string;
  functionsEmulatorPort: number;
};

export const runtimeConfig: RuntimeConfig = {
  firebaseProjectId: "nfc-app-7095e",
  firebaseRegion: "us-central1",
  useEmulator: false,
  functionsEmulatorHost: "127.0.0.1",
  functionsEmulatorPort: 5001,
};
