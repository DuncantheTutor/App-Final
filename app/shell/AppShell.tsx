/**
 * App shell: routing and screen composition only.
 * Feature behavior lives in messaging / feed / session / friends / addFriend controllers.
 */
export { useAppNavigation, type AppNavigation } from "./useAppNavigation";
export { useMainNavSlide, isHomeTabPair } from "./useMainNavSlide";
export {
  activeChatIdFromView,
  activeScreen,
  homeNavIconHighlight,
  isChatThreadScreen,
  isHomeScreen,
  pendingDraftFromView,
  viewAfterHardwareBack,
  viewAfterLeavingFriendProfile,
  viewAfterLeavingFriendsList,
  viewFromChatReturn,
} from "./routes";
export {
  createMainNavSwipePan,
} from "./mainNavSwipe";
export {
  mainNavSurfaceFromView,
  neighborMainNav,
  MAIN_NAV_ORDER,
  type MainNavSurface,
} from "./mainNavOrder";
export type { HomeNavIconHighlight, HomeTab, ViewState } from "./types";
