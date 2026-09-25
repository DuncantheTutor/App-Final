import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import type { Friend, PendingDraft, ViewState } from "../domain/types";
import { refreshFriendProfilesFromServer } from "../friends/refreshFriendProfiles";
import type { BackendSession } from "../messaging/types";
import { DEMO_OFFLINE_MODE } from "../theme/preludeConstants";

type OpenFriendProfileDeps = {
  view: ViewState;
  friendMap: Record<string, Friend>;
  resolvePd: (friendId: string) => { canOpenProfile: boolean };
  friendHasCachedProfile: (friendId: string) => boolean;
  getBackendSession: () => BackendSession | null;
  waitForBackendSession: (timeoutMs: number) => Promise<BackendSession | null>;
  addedFriendsFromRitualRef: MutableRefObject<Friend[]>;
  replaceFriendsIfChanged: (friends: Friend[]) => void;
  setChatOverflowOpen: Dispatch<SetStateAction<boolean>>;
  setView: Dispatch<SetStateAction<ViewState>>;
};

/** Open a friend profile from home, a chat, or the friends list. Recreated each render. */
export function createOpenFriendProfileActions(deps: OpenFriendProfileDeps) {
  const {
    view,
    friendMap,
    resolvePd,
    friendHasCachedProfile,
    getBackendSession,
    waitForBackendSession,
    addedFriendsFromRitualRef,
    replaceFriendsIfChanged,
    setChatOverflowOpen,
    setView,
  } = deps;

  const refreshFriendProfileInBackground = () => {
    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    void refreshFriendProfilesFromServer(session, addedFriendsFromRitualRef.current).then(
      (refreshed) => {
        replaceFriendsIfChanged(refreshed);
      }
    );
  };

  const confirmProfileReachable = async (friendId: string): Promise<boolean> => {
    const backendUid = friendMap[friendId]?.backendUid?.trim();
    if (DEMO_OFFLINE_MODE || !backendUid?.startsWith("u_")) return true;
    let session = getBackendSession();
    if (!session) session = await waitForBackendSession(3000);
    if (!session) {
      Alert.alert("Profile unavailable", "You need an internet connection to load this profile.");
      return false;
    }
    try {
      const res = await callEmulatorFunction<{
        profiles?: Record<string, { username?: string } | null>;
      }>("getUserProfiles", {
        uid: session.uid,
        deviceId: session.deviceId,
        targetUids: [backendUid],
      });
      if (!res.profiles?.[backendUid]) {
        Alert.alert("Profile unavailable", "Could not load this profile right now.");
        return false;
      }
    } catch {
      Alert.alert("Profile unavailable", "You need an internet connection to load this profile.");
      return false;
    }
    return true;
  };

  const openFriendProfile = async (
    friendId: string,
    from: "home" | "chat",
    options?: { returnChatId?: string; returnPendingDraft?: PendingDraft }
  ) => {
    if (!resolvePd(friendId).canOpenProfile) return;
    const cached = friendHasCachedProfile(friendId);
    if (!cached && !(await confirmProfileReachable(friendId))) return;
    setChatOverflowOpen(false);
    setView({
      screen: "friendProfile",
      friendId,
      returnTo: from,
      returnChatId: from === "chat" ? options?.returnChatId : undefined,
      returnPendingDraft: from === "chat" ? options?.returnPendingDraft : undefined,
    });
    refreshFriendProfileInBackground();
  };

  const openFriendProfileFromFriendsList = async (friendId: string) => {
    if (view.screen !== "friendsList") return;
    if (!resolvePd(friendId).canOpenProfile) return;
    const cached = friendHasCachedProfile(friendId);
    if (!cached && !(await confirmProfileReachable(friendId))) return;
    const friendsList = view;
    setChatOverflowOpen(false);
    setView({
      screen: "friendProfile",
      friendId,
      returnTo: "friendsList",
      friendsListRestore: {
        returnTo: friendsList.returnTo,
        returnChatId: friendsList.returnChatId,
        returnPendingDraft: friendsList.returnPendingDraft,
      },
    });
    refreshFriendProfileInBackground();
  };

  return { openFriendProfile, openFriendProfileFromFriendsList };
}
