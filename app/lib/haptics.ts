import { useEffect, useState } from "react";
import { AppState, NativeModules, Platform, Vibration } from "react-native";

type ErdosHapticSettingsNative = {
  isSystemHapticEnabled: () => Promise<boolean>;
};

const native = NativeModules.ErdosHapticSettings as ErdosHapticSettingsNative | undefined;

let userEnabled = true;
let systemEnabled = true;
const listeners = new Set<() => void>();
let appStateBound = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function bindAppStateOnce() {
  if (appStateBound) return;
  appStateBound = true;
  AppState.addEventListener("change", (next) => {
    if (next === "active") void refreshSystemHapticEnabled();
  });
}

export function areHapticsEffective(): boolean {
  return userEnabled && systemEnabled;
}

export function getUserHapticsEnabled(): boolean {
  return userEnabled;
}

export function getSystemHapticsEnabled(): boolean {
  return systemEnabled;
}

export function setUserHapticsEnabled(next: boolean) {
  if (userEnabled === next) return;
  userEnabled = next;
  notify();
}

export async function refreshSystemHapticEnabled(): Promise<boolean> {
  bindAppStateOnce();
  if (Platform.OS !== "android" || typeof native?.isSystemHapticEnabled !== "function") {
    systemEnabled = true;
    notify();
    return true;
  }
  try {
    systemEnabled = Boolean(await native.isSystemHapticEnabled());
  } catch {
    systemEnabled = true;
  }
  notify();
  return systemEnabled;
}

export function subscribeHapticSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Light tick for submit / nav presses. No-ops if the user or OS has haptics off. */
export function playPressHaptic() {
  if (!areHapticsEffective()) return;
  try {
    if (Platform.OS === "android") Vibration.vibrate(18);
    else Vibration.vibrate();
  } catch {
    /* best-effort */
  }
}

/** Patterned buzz (add-friend celebration). Respects the same gates as press ticks. */
export function playHapticPattern(pattern: number | number[]) {
  if (!areHapticsEffective()) return;
  try {
    if (Platform.OS !== "android" && typeof pattern === "number") {
      Vibration.vibrate();
      return;
    }
    Vibration.vibrate(pattern);
  } catch {
    /* best-effort */
  }
}

export function useHapticSettings() {
  const [snapshot, setSnapshot] = useState(() => ({
    userEnabled,
    systemEnabled,
    effective: userEnabled && systemEnabled,
  }));

  useEffect(() => {
    const sync = () => {
      setSnapshot({
        userEnabled,
        systemEnabled,
        effective: userEnabled && systemEnabled,
      });
    };
    const unsub = subscribeHapticSettings(sync);
    void refreshSystemHapticEnabled();
    return unsub;
  }, []);

  return {
    userEnabled: snapshot.userEnabled,
    systemEnabled: snapshot.systemEnabled,
    effective: snapshot.effective,
    setUserEnabled: setUserHapticsEnabled,
  };
}

bindAppStateOnce();
void refreshSystemHapticEnabled();
