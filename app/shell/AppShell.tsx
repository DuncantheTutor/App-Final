/**
 * App shell: routing and screen composition only.
 * Feature behavior lives in messaging / feed / session / addFriend controllers.
 */
export { useAppNavigation, type AppNavigation } from "./useAppNavigation";
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
export type { HomeNavIconHighlight, HomeTab, ViewState } from "./types";
