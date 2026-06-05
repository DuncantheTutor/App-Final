import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, TextInput } from "react-native";

import { scrollInputAboveKeyboard } from "./keyboardInputScroll";

/** Keep a TextInput visible just above the keyboard inside a vertical ScrollView. */
export function useScrollPinnedInput(params: {
  scrollRef: RefObject<ScrollView | null>;
  inputRef: RefObject<TextInput | null>;
  keyboardVisible: boolean;
  keyboardHeight: number;
  enabled?: boolean;
}) {
  const { scrollRef, inputRef, keyboardVisible, keyboardHeight, enabled = true } = params;
  const scrollYRef = useRef(0);

  const pinOnFocus = useCallback(() => {
    if (!enabled) return;
    const run = () =>
      scrollInputAboveKeyboard(scrollRef, inputRef, keyboardHeight, scrollYRef.current);
    if (keyboardHeight > 0) {
      run();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [enabled, scrollRef, inputRef, keyboardHeight]);

  useEffect(() => {
    if (!enabled || !keyboardVisible || keyboardHeight <= 0) return;
    pinOnFocus();
  }, [enabled, keyboardVisible, keyboardHeight, pinOnFocus]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  return { onScroll, pinOnFocus };
}
