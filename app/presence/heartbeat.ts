import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import { PRESENCE_HEARTBEAT_MS, PRESENCE_ONLINE_WINDOW_MS } from "../theme/preludeConstants";
import type { Friend } from "../domain/types";
import type { BackendSession } from "../messaging/types";

export function collectFriendPresenceUids(params: {
  allFriends: Friend[];
  friendIdToBackendUid: Record<string, string>;
  sessionUid: string;
}): string[] {
  const { allFriends, friendIdToBackendUid, sessionUid } = params;
  return allFriends
    .map((friend) => {
      const direct = friend.backendUid?.trim();
      if (direct?.startsWith("u_")) return direct;
      const mapped = friendIdToBackendUid[friend.id]?.trim();
      return mapped?.startsWith("u_") ? mapped : "";
    })
    .filter((uid): uid is string => uid.startsWith("u_") && uid !== sessionUid);
}

/** Publish this device's active presence (must run even with zero friends). */
export async function publishActivePresence(session: BackendSession, now: number): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await callEmulatorFunction("setMyPresence", {
        uid: session.uid,
        deviceId: session.deviceId,
        state: "active",
        heartbeatAtMs: now,
      });
      return;
    } catch (err) {
      if (attempt >= 2) {
        logAppError("presence.heartbeat", err, { uid: session.uid, attempt });
      } else {
        await new Promise<void>((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
}

export async function pollFriendPresence(params: {
  session: BackendSession;
  friendUids: string[];
  now: number;
}): Promise<Record<string, boolean>> {
  const { session, friendUids, now } = params;
  if (friendUids.length === 0) return {};
  const res = await callEmulatorFunction<{
    byUid?: Record<string, { state?: string; heartbeatAtMs?: number; online?: boolean } | null>;
  }>("getFriendPresence", {
    uid: session.uid,
    deviceId: session.deviceId,
    friendUids,
  });
  const byUid = res.byUid ?? {};
  const nextOnline: Record<string, boolean> = {};
  for (const uid of friendUids) {
    const presence = byUid[uid];
    if (typeof presence?.online === "boolean") {
      nextOnline[uid] = presence.online;
      continue;
    }
    const heartbeatAtMs = Number(presence?.heartbeatAtMs ?? 0);
    nextOnline[uid] =
      presence?.state === "active" &&
      Number.isFinite(heartbeatAtMs) &&
      now - heartbeatAtMs <= PRESENCE_ONLINE_WINDOW_MS;
  }
  return nextOnline;
}

/** @deprecated Use publishActivePresence + pollFriendPresence */
export async function runPresenceHeartbeatTick(params: {
  session: BackendSession;
  friendUids: string[];
  now: number;
}): Promise<Record<string, boolean>> {
  const { session, friendUids, now } = params;
  await publishActivePresence(session, now);
  return pollFriendPresence({ session, friendUids, now });
}

export async function setBackgroundPresence(session: BackendSession): Promise<void> {
  await callEmulatorFunction("setMyPresence", {
    uid: session.uid,
    deviceId: session.deviceId,
    state: "background",
    heartbeatAtMs: Date.now(),
  });
}

export { PRESENCE_HEARTBEAT_MS };
