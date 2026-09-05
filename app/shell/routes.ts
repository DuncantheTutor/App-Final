import type { PendingDraft, ViewState } from "../domain/types";
import type { HomeNavIconHighlight, HomeTab } from "./types";

export function activeScreen(view: ViewState): ViewState["screen"] {
  return view.screen;
}

export function activeChatIdFromView(view: ViewState): string | null {
  return view.screen === "chat" && "chatId" in view ? view.chatId : null;
}

export function pendingDraftFromView(view: ViewState): PendingDraft | null {
  return view.screen === "chat" && "pendingDraft" in view ? view.pendingDraft : null;
}

export function isHomeScreen(view: ViewState): boolean {
  return view.screen === "home";
}

export function isChatThreadScreen(view: ViewState): boolean {
  return view.screen === "chat" || view.screen === "chatSharedMedia";
}

export function homeNavIconHighlight(view: ViewState, homeTab: HomeTab): HomeNavIconHighlight {
  const screen = view.screen;
  const onHome = screen === "home";
  return {
    createPost: screen === "publishPost",
    settings: screen === "settings",
    chats: onHome && homeTab === "chats",
    feed: onHome && homeTab === "feed",
    myProfile: screen === "myProfile",
    friendsList: screen === "friendsList",
    addFriend: screen === "addFriend",
  };
}

export function viewFromChatReturn(params: {
  returnChatId?: string;
  returnPendingDraft?: PendingDraft;
}): ViewState {
  if (params.returnPendingDraft) return { screen: "chat", pendingDraft: params.returnPendingDraft };
  if (params.returnChatId) return { screen: "chat", chatId: params.returnChatId };
  return { screen: "home" };
}

export function viewAfterLeavingFriendsList(
  view: Extract<ViewState, { screen: "friendsList" }>
): ViewState {
  if (view.returnTo === "chat") {
    return viewFromChatReturn({
      returnChatId: view.returnChatId,
      returnPendingDraft: view.returnPendingDraft,
    });
  }
  return { screen: "home" };
}

export function viewAfterLeavingFriendProfile(
  view: Extract<ViewState, { screen: "friendProfile" }>
): ViewState {
  if (view.returnTo === "friendsList" && view.friendsListRestore) {
    return {
      screen: "friendsList",
      returnTo: view.friendsListRestore.returnTo,
      returnChatId: view.friendsListRestore.returnChatId,
      returnPendingDraft: view.friendsListRestore.returnPendingDraft,
    };
  }
  if (view.returnTo === "chat") {
    return viewFromChatReturn({
      returnChatId: view.returnChatId,
      returnPendingDraft: view.returnPendingDraft,
    });
  }
  return { screen: "home" };
}

/**
 * Next view for a simple hardware-back pop.
 * Returns null when the caller must run extra teardown (chat, publish, add-friend).
 */
export function viewAfterHardwareBack(view: ViewState): ViewState | null {
  if (view.screen === "chatSharedMedia") return { screen: "chat", chatId: view.chatId };
  if (view.screen === "openSourceLicenses") return { screen: "settings" };
  if (view.screen === "settings") return { screen: "home" };
  if (view.screen === "friendsList") return viewAfterLeavingFriendsList(view);
  if (view.screen === "friendProfile") return viewAfterLeavingFriendProfile(view);
  if (view.screen === "myProfile") return { screen: "home" };
  return null;
}
