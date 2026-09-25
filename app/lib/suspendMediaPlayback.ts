type Listener = () => void;

const listeners = new Set<Listener>();

/** Ask in-flight video loads and inline players to stop (scroll, swipe, or a new tile). */
export function suspendMediaPlayback() {
  listeners.forEach((listener) => listener());
}

export function subscribeSuspendMediaPlayback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
