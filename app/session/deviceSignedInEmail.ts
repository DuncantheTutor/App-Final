import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEVICE_SIGNED_IN_EMAIL_KEY } from "./firebaseAuthPersistence";

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return email.includes("@") ? email : null;
}

/** Remember who is signed in on this device. Cleared only by Logout. */
export async function writeDeviceSignedInEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await AsyncStorage.setItem(DEVICE_SIGNED_IN_EMAIL_KEY, normalized);
}

export async function clearDeviceSignedInEmail(): Promise<void> {
  await AsyncStorage.removeItem(DEVICE_SIGNED_IN_EMAIL_KEY);
}

export async function readDeviceSignedInEmail(): Promise<string | null> {
  try {
    return normalizeEmail(await AsyncStorage.getItem(DEVICE_SIGNED_IN_EMAIL_KEY));
  } catch {
    return null;
  }
}

/** Email inside Firebase Auth's own AsyncStorage record, when that record is still present. */
export async function readFirebasePersistedAuthEmail(): Promise<string | null> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKey = keys.find((key) => key.includes("firebase:authUser"));
    if (!authKey) return null;
    const raw = await AsyncStorage.getItem(authKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string };
    return normalizeEmail(parsed.email);
  } catch {
    return null;
  }
}
