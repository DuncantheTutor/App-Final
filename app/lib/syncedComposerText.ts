import type { MutableRefObject } from "react";

/** Keep ref + state aligned for controlled chat/post composers. */
export function writeComposerText(
  ref: MutableRefObject<string>,
  setState: (text: string) => void,
  text: string
): void {
  ref.current = text;
  setState(text);
}

export function readComposerTextTrimmed(ref: MutableRefObject<string>): string {
  return ref.current.trim();
}

/**
 * Defer work until after the native TextInput commits the last keystroke.
 * Prefer `requestAnimationFrame` on RN — avoids microtask ordering bugs that
 * have been linked to send-button crashes on some Android builds.
 */
export function afterComposerInputSettled(run: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return;
  }
  setTimeout(run, 0);
}
