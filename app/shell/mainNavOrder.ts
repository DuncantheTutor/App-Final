import type { ViewState } from "../domain/types";
import type { HomeTab } from "./types";

/** Left-to-right order of the main top-nav destinations (excluding New post / Logout). */
export const MAIN_NAV_ORDER = [
  "myProfile",
  "friendsList",
  "chats",
  "feed",
  "addFriend",
  "settings",
] as const;

export type MainNavSurface = (typeof MAIN_NAV_ORDER)[number];

export function mainNavSurfaceFromView(view: ViewState, homeTab: HomeTab): MainNavSurface | null {
  switch (view.screen) {
    case "myProfile":
      return "myProfile";
    case "friendsList":
      return "friendsList";
    case "addFriend":
      return "addFriend";
    case "settings":
      return "settings";
    case "home":
      return homeTab === "chats" ? "chats" : "feed";
    default:
      return null;
  }
}

export function neighborMainNav(current: MainNavSurface, direction: -1 | 1): MainNavSurface | null {
  const index = MAIN_NAV_ORDER.indexOf(current);
  const next = index + direction;
  if (next < 0 || next >= MAIN_NAV_ORDER.length) return null;
  return MAIN_NAV_ORDER[next];
}
