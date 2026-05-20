import { Platform } from "react-native";

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

/** Composer / input bar bottom inset when keyboard is closed. */
export function composerBottomPadding(insetsBottom: number, keyboardVisible: boolean): number {
  if (keyboardVisible) return 4;
  return stickyFooterPadding(insetsBottom);
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
