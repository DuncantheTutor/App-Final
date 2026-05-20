import type { Persistence } from "firebase/auth";

/** AsyncStorage shape used by Firebase Auth RN persistence. */
type FirebaseRnAsyncStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

declare module "firebase/auth" {
  /** Persist auth tokens in AsyncStorage (required for session survival after app kill on RN). */
  export function getReactNativePersistence(storage: FirebaseRnAsyncStorage): Persistence;
}
