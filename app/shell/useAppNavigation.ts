import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { ViewState } from "../domain/types";
import { homeNavIconHighlight as computeHomeNavIconHighlight } from "./routes";
import type { HomeNavIconHighlight, HomeTab } from "./types";

export type AppNavigation = {
  view: ViewState;
  setView: Dispatch<SetStateAction<ViewState>>;
  viewRef: MutableRefObject<ViewState>;
  homeTab: HomeTab;
  setHomeTab: Dispatch<SetStateAction<HomeTab>>;
  homeNavIconHighlight: HomeNavIconHighlight;
  goHome: (tab?: HomeTab) => void;
  openHomeChatsFromNav: () => void;
  openHomeFeedFromNav: () => void;
  goToSettings: () => void;
  goToAddFriend: () => void;
  goToMyProfile: () => void;
  goToPublishPost: () => void;
  goToOpenSourceLicenses: () => void;
  goToFriendsListFromHome: () => void;
};

export function useAppNavigation(
  initialView: ViewState = { screen: "home" },
  initialHomeTab: HomeTab = "feed"
): AppNavigation {
  const [view, setView] = useState<ViewState>(initialView);
  const viewRef = useRef<ViewState>(view);
  viewRef.current = view;
  const [homeTab, setHomeTab] = useState<HomeTab>(initialHomeTab);

  const homeNavIconHighlight = useMemo(
    () => computeHomeNavIconHighlight(view, homeTab),
    [view, homeTab]
  );

  const goHome = useCallback((tab?: HomeTab) => {
    if (tab) setHomeTab(tab);
    setView({ screen: "home" });
  }, []);

  const openHomeChatsFromNav = useCallback(() => {
    goHome("chats");
  }, [goHome]);

  const openHomeFeedFromNav = useCallback(() => {
    goHome("feed");
  }, [goHome]);

  const goToSettings = useCallback(() => {
    setView({ screen: "settings" });
  }, []);

  const goToAddFriend = useCallback(() => {
    setView({ screen: "addFriend" });
  }, []);

  const goToMyProfile = useCallback(() => {
    setView({ screen: "myProfile" });
  }, []);

  const goToPublishPost = useCallback(() => {
    setView({ screen: "publishPost" });
  }, []);

  const goToOpenSourceLicenses = useCallback(() => {
    setView({ screen: "openSourceLicenses" });
  }, []);

  const goToFriendsListFromHome = useCallback(() => {
    if (viewRef.current.screen === "friendsList") return;
    setView({ screen: "friendsList", returnTo: "home" });
  }, []);

  return {
    view,
    setView,
    viewRef,
    homeTab,
    setHomeTab,
    homeNavIconHighlight,
    goHome,
    openHomeChatsFromNav,
    openHomeFeedFromNav,
    goToSettings,
    goToAddFriend,
    goToMyProfile,
    goToPublishPost,
    goToOpenSourceLicenses,
    goToFriendsListFromHome,
  };
}
