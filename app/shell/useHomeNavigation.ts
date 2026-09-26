import { useCallback, useMemo, useRef } from "react";

import { createMainNavSwipePan } from "./mainNavSwipe";
import { mainNavSurfaceFromView, type MainNavSurface } from "./mainNavOrder";
import { useMainNavSlide } from "./useMainNavSlide";
import type { AppNavigation } from "./useAppNavigation";

/** Home-bar targets, the follow-the-finger swipe, and which home column is sliding. */
export function useHomeNavigation(params: {
  view: AppNavigation["view"];
  viewRef: AppNavigation["viewRef"];
  homeTab: AppNavigation["homeTab"];
  windowWidth: number;
  safeTop: number;
  setFriendsListSearch: (value: string) => void;
  goToFriendsListFromHome: AppNavigation["goToFriendsListFromHome"];
  goToAddFriend: AppNavigation["goToAddFriend"];
  goToSettings: AppNavigation["goToSettings"];
  goToMyProfile: AppNavigation["goToMyProfile"];
  openHomeChatsFromNav: AppNavigation["openHomeChatsFromNav"];
  openHomeFeedFromNav: AppNavigation["openHomeFeedFromNav"];
}) {
  const {
    view,
    viewRef,
    homeTab,
    windowWidth,
    safeTop,
    setFriendsListSearch,
    goToFriendsListFromHome,
    goToAddFriend,
    goToSettings,
    goToMyProfile,
    openHomeChatsFromNav,
    openHomeFeedFromNav,
  } = params;

  const openFriendsListFromHome = useCallback(() => {
    setFriendsListSearch("");
    goToFriendsListFromHome();
  }, [goToFriendsListFromHome, setFriendsListSearch]);

  const openAddFriendFromHome = goToAddFriend;
  const openSettingsScreen = goToSettings;
  const openMyProfile = goToMyProfile;
  const homeTabRef = useRef(homeTab);
  homeTabRef.current = homeTab;
  const feedCarouselTouchRef = useRef(false);

  const goToMainNavSurface = useCallback(
    (surface: MainNavSurface) => {
      switch (surface) {
        case "myProfile":
          openMyProfile();
          break;
        case "friendsList":
          openFriendsListFromHome();
          break;
        case "chats":
          openHomeChatsFromNav();
          break;
        case "feed":
          openHomeFeedFromNav();
          break;
        case "addFriend":
          openAddFriendFromHome();
          break;
        case "settings":
          openSettingsScreen();
          break;
      }
    },
    [
      openAddFriendFromHome,
      openFriendsListFromHome,
      openHomeChatsFromNav,
      openHomeFeedFromNav,
      openMyProfile,
      openSettingsScreen,
    ]
  );

  const {
    incoming: mainNavIncoming,
    isSurfaceVisible,
    slideStyle: mainNavSlideStyle,
    onDragMove,
    onDragRelease,
    isHomeToHome,
  } = useMainNavSlide({
    getCurrent: () => mainNavSurfaceFromView(viewRef.current, homeTabRef.current),
    goToSurface: goToMainNavSurface,
    getWidth: () => windowWidth,
  });

  const mainNavSwipePan = useMemo(
    () =>
      createMainNavSwipePan({
        getSurface: () => mainNavSurfaceFromView(viewRef.current, homeTabRef.current),
        getMinPageY: () => safeTop + 52,
        getChatsOnlineStripMaxY: () => safeTop + 148,
        isCarouselTouch: () => feedCarouselTouchRef.current,
        onMove: onDragMove,
        onRelease: onDragRelease,
      }),
    [onDragMove, onDragRelease, safeTop, viewRef]
  );

  const currentMainNav = mainNavSurfaceFromView(view, homeTab);
  const incomingMainNav = mainNavIncoming?.surface ?? null;
  const homeColumnSlideSurface: MainNavSurface | null = isHomeToHome
    ? null
    : isSurfaceVisible("chats") && currentMainNav === "chats"
      ? "chats"
      : isSurfaceVisible("feed") && currentMainNav === "feed"
        ? "feed"
        : isSurfaceVisible("chats")
          ? "chats"
          : isSurfaceVisible("feed")
            ? "feed"
            : null;

  return {
    openFriendsListFromHome,
    openAddFriendFromHome,
    openSettingsScreen,
    openMyProfile,
    feedCarouselTouchRef,
    mainNavSlideStyle,
    mainNavSwipePan,
    isSurfaceVisible,
    isHomeToHome,
    incomingMainNav,
    currentMainNav,
    homeColumnSlideSurface,
  };
}
