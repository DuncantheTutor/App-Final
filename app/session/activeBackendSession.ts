import type { BackendSession } from "../messaging/types";

let active: BackendSession | null = null;

export function setActiveBackendSession(session: BackendSession | null): void {
  active = session;
}

export function readActiveBackendSession(): BackendSession | null {
  return active;
}
