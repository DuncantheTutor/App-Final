import type { RefObject } from "react";
import { Dimensions } from "react-native";
import type { ScrollView, TextInput } from "react-native";

/** Scroll so a field at `contentY` inside the scroll content sits near the top (above the keyboard). */
export function scrollScrollViewToContentY(
  scrollRef: RefObject<ScrollView | null>,
  contentY: number,
  topMargin = 12
): void {
  requestAnimationFrame(() => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, contentY - topMargin),
      animated: true,
    });
  });
}

/** Extra scroll content padding while the keyboard is open. */
export function keyboardScrollPadding(keyboardHeight: number, extra = 24): number {
  return keyboardHeight + extra;
}

/**
 * Scroll a vertical ScrollView so the focused input sits above the keyboard
 * (restores naturally when the keyboard closes because scroll offset is unchanged).
 */
export function scrollInputAboveKeyboard(
  scrollRef: RefObject<ScrollView | null>,
  inputRef: RefObject<TextInput | null>,
  keyboardHeight: number,
  currentScrollY: number,
  margin = 12
): void {
  if (keyboardHeight <= 0) return;
  const scroll = scrollRef.current;
  const input = inputRef.current;
  if (!scroll || !input) return;

  input.measureInWindow((_x: number, inputY: number, _w: number, inputH: number) => {
    const windowH = Dimensions.get("window").height;
    const keyboardTop = windowH - keyboardHeight;
    const inputBottom = inputY + inputH;
    const overflow = inputBottom + margin - keyboardTop;
    if (overflow <= 0) return;
    scroll.scrollTo({ y: currentScrollY + overflow, animated: true });
  });
}
