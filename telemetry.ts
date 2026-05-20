import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { callEmulatorFunction } from "./backendBridge";

const TELEMETRY_DEVICE_KEY = "app.telemetry.device.v1";
const TELEMETRY_FLUSH_INTERVAL_MS = 400;
const TELEMETRY_MAX_QUEUE = 80;

type TelemetryType = "event" | "error";

type TelemetryItem = {
  type: TelemetryType;
  name: string;
  message?: string;
  details?: Record<string, unknown>;
  ts: number;
};

let telemetryUid = "";
let telemetryBackendDeviceId = "";
let telemetryLocalDeviceId = "";
let flushInFlight = false;
const queue: TelemetryItem[] = [];

function randomTelemetryDeviceId(): string {
  return `tl_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
}

async function ensureLocalTelemetryDeviceId(): Promise<string> {
  if (telemetryLocalDeviceId) return telemetryLocalDeviceId;
  try {
    const existing = (await AsyncStorage.getItem(TELEMETRY_DEVICE_KEY))?.trim();
    if (existing) {
      telemetryLocalDeviceId = existing;
      return existing;
    }
  } catch {
    /* ignore */
  }
  const next = randomTelemetryDeviceId();
  telemetryLocalDeviceId = next;
  try {
    await AsyncStorage.setItem(TELEMETRY_DEVICE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}

function baseDetails(): Record<string, unknown> {
  const expo =
    (Constants.expoConfig?.extra as { firebase?: { projectId?: string } } | undefined)?.firebase ?? {};
  return {
    platform: Platform.OS,
    projectId: expo.projectId ?? "nfc-app-7095e",
    expoSlug: Constants.expoConfig?.slug ?? "",
    appVersion:
      Constants.expoConfig?.version ??
      (Constants.manifest as { version?: string } | null)?.version ??
      "",
  };
}

function enqueue(item: TelemetryItem): void {
  if (queue.length >= TELEMETRY_MAX_QUEUE) queue.shift();
  queue.push(item);
  void flushQueue();
}

async function flushQueue(): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const localDeviceId = await ensureLocalTelemetryDeviceId();
      try {
        await callEmulatorFunction("logClientTelemetry", {
          uid: telemetryUid || undefined,
          deviceId: telemetryBackendDeviceId || localDeviceId,
          type: next.type,
          name: next.name,
          message: next.message,
          details: {
            ...baseDetails(),
            ...(next.details ?? {}),
            clientTs: next.ts,
          },
        });
      } catch {
        // Drop this item so a bad network cannot block the queue indefinitely.
      }
      await new Promise<void>((resolve) => setTimeout(resolve, TELEMETRY_FLUSH_INTERVAL_MS));
    }
  } finally {
    flushInFlight = false;
    if (queue.length > 0) void flushQueue();
  }
}

/**
 * Call whenever backend session identity changes so telemetry rows correlate with `uid` / device lock.
 */
export function setTelemetryContext(input: { uid?: string | null; deviceId?: string | null }): void {
  telemetryUid = String(input.uid ?? "").trim();
  telemetryBackendDeviceId = String(input.deviceId ?? "").trim();
}

/**
 * Central hook for observability: console + asynchronous backend ingestion.
 */
export function logAppEvent(name: string, details?: Record<string, unknown>): void {
  const line = details ? `${name} ${JSON.stringify(details)}` : name;
  // eslint-disable-next-line no-console
  console.log(`[app-event] ${line}`);
  enqueue({ type: "event", name, details, ts: Date.now() });
}

export function logAppError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  const msg = err instanceof Error ? err.message : String(err);
  const line = extra ? `${scope}: ${msg} ${JSON.stringify(extra)}` : `${scope}: ${msg}`;
  // eslint-disable-next-line no-console
  console.warn(`[app-error] ${line}`);
  enqueue({ type: "error", name: scope, message: msg, details: extra, ts: Date.now() });
}
