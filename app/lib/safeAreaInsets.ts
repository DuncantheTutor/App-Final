import { Platform, Dimensions } from "react-native";

const ANDROID_NAV_MIN = 28;
const IOS_NAV_MIN = 12;
const FOOTER_EXTRA = 8;

/** Minimum nav / gesture bar inset (some Android builds report `insets.bottom === 0`). */
export function androidNavInset(insetsBottom: number): number {
  const nav = Math.max(insetsBottom, 0);
  const min = Platform.OS === "android" ? ANDROID_NAV_MIN : IOS_NAV_MIN;
  return Math.max(nav, min);
}

/** Bottom padding for sticky footers (Publish, Send, profile bars) above Android nav/gesture bar. */
export function stickyFooterPadding(insetsBottom: number): number {
  return androidNavInset(insetsBottom) + FOOTER_EXTRA;
}

/** Photo/video editor primary CTAs (Continue / Post) — extra lift on gesture-nav Android. */
export function photoEditorFooterPadding(insetsBottom: number): number {
  const nav = androidNavInset(insetsBottom);
  const extra = Platform.OS === "android" ? 22 : 14;
  return nav + extra;
}

/** Composer / input bar bottom inset when keyboard is closed. */
export function composerBottomPadding(insetsBottom: number, keyboardVisible: boolean): number {
  if (keyboardVisible) return 4;
  return stickyFooterPadding(insetsBottom);
}

/**
 * Bottom inset for fixed bottom composers on flex layouts (auth, modals, publish).
 * iOS: minimal gap — `KeyboardAvoidingView` lifts the layout.
 * Android flex roots: lift by full `keyboardHeight`.
 *
 * When `overlayRootShrinksForKeyboard` is true (chat `absoluteFill` + `androidAbsoluteOverlayKeyboardBottom`),
 * the parent already lifted — use only the minimal open-keyboard gap.
 */
export function keyboardComposerBottomPadding(
  insetsBottom: number,
  keyboardVisible: boolean,
  keyboardHeight = 0,
  overlayRootShrinksForKeyboard = false
): number {
  if (!keyboardVisible) return stickyFooterPadding(insetsBottom);
  if (overlayRootShrinksForKeyboard) return composerBottomPadding(insetsBottom, true);
  if (Platform.OS === "android" && keyboardHeight > 0) {
    return Math.max(4, keyboardHeight);
  }
  return composerBottomPadding(insetsBottom, true);
}

/** Shrink `absoluteFill` chat (and similar) roots above the keyboard on Android edge-to-edge. */
export function androidAbsoluteOverlayKeyboardBottom(
  keyboardVisible: boolean,
  keyboardHeight: number
): number {
  if (Platform.OS !== "android" || !keyboardVisible || keyboardHeight <= 0) return 0;
  return keyboardHeight;
}

/** Visible keyboard overlap — `screenY` is more reliable than `height` on edge-to-edge Android. */
export function keyboardOverlapFromEvent(e: {
  endCoordinates: { height: number; screenY: number };
}): number {
  const { height, screenY } = e.endCoordinates;
  if (Platform.OS === "android") {
    const screenH = Dimensions.get("screen").height;
    const fromScreenY = Math.round(screenH - screenY);
    if (fromScreenY > 0) return Math.max(fromScreenY, height);
  }
  return height;
}

/** iOS-only KAV — Android absolute overlays use `androidAbsoluteOverlayKeyboardBottom`. */
export function composerKeyboardAvoidanceEnabled(
  keyboardVisible: boolean,
  overlaySuppressesKeyboardAvoidance: boolean
): boolean {
  return Platform.OS === "ios" && keyboardVisible && !overlaySuppressesKeyboardAvoidance;
}

/** Spacer height below fixed home bars (Chats **Start Chat** dead zone). */
export function navDeadZoneHeight(insetsBottom: number): number {
  return androidNavInset(insetsBottom);
}

/** Bottom offset for absolutely positioned full-width primary bars (Feed **New post**). */
export function fabBottomOffset(insetsBottom: number): number {
  return stickyFooterPadding(insetsBottom);
}

/** Scroll `contentContainerStyle.paddingBottom` when there is no overlapping fixed footer. */
export function scrollPageBottomPadding(insetsBottom: number, extra = 16): number {
  return stickyFooterPadding(insetsBottom) + extra;
}

/**
 * Scroll clearance on Home lists whose bottom edge is covered by a full-width primary bar
 * (**New post** FAB / **Start Chat**) plus Android gesture/nav inset.
 */
export function homeBottomActionClearance(insetsBottom: number): number {
  const nav = androidNavInset(insetsBottom);
  const primaryBarLiftPx = 10;
  const primaryBarHeightPx = 56;
  const scrollPastLastRowPx = 28;
  return nav + primaryBarLiftPx + primaryBarHeightPx + scrollPastLastRowPx;
}
