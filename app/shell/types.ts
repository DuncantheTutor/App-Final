import type { ViewState } from "../domain/types";

export type HomeTab = "chats" | "feed";

export type HomeNavIconHighlight = {
  createPost: boolean;
  settings: boolean;
  chats: boolean;
  feed: boolean;
  myProfile: boolean;
  friendsList: boolean;
  addFriend: boolean;
};

export type { ViewState };
