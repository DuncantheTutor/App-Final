/** Ciphertext held until the friend list for this sign-in is known. */
export type HeldInboundMessage = {
  messageId: string;
  conversationId: string;
  senderUid: string;
  ciphertext: string;
  nonce: string;
  envelope: string;
  createdAtMs?: number;
  reactions?: Record<string, string>;
  editedAt?: number | null;
  unsentAt?: number | null;
};

const MAX_HELD = 32;

let rosterReady = false;
const held: HeldInboundMessage[] = [];
const readyListeners = new Set<() => void>();
const flagListeners = new Set<(ready: boolean) => void>();

function notifyRosterFlag(): void {
  for (const listener of flagListeners) listener(rosterReady);
}

export function isFriendRosterReady(): boolean {
  return rosterReady;
}

/** First confirmed friend list this sign-in (including a real empty list). */
export function markFriendRosterReady(): void {
  if (rosterReady) {
    if (held.length > 0) {
      for (const listener of readyListeners) listener();
    }
    return;
  }
  rosterReady = true;
  notifyRosterFlag();
  for (const listener of readyListeners) listener();
}

export function resetFriendRosterGate(): void {
  rosterReady = false;
  held.length = 0;
  notifyRosterFlag();
}

export function subscribeFriendRosterFlag(listener: (ready: boolean) => void): () => void {
  flagListeners.add(listener);
  return () => {
    flagListeners.delete(listener);
  };
}

export function subscribeFriendRosterReady(listener: () => void): () => void {
  readyListeners.add(listener);
  if (rosterReady && held.length > 0) listener();
  return () => {
    readyListeners.delete(listener);
  };
}

export function holdInboundMessage(item: HeldInboundMessage): void {
  const key = `${item.conversationId}:${item.messageId}`;
  if (held.some((row) => `${row.conversationId}:${row.messageId}` === key)) return;
  if (held.length >= MAX_HELD) held.shift();
  held.push(item);
  if (rosterReady) {
    for (const listener of readyListeners) listener();
  }
}

export function takeHeldInboundMessages(): HeldInboundMessage[] {
  const copy = held.slice();
  held.length = 0;
  return copy;
}
