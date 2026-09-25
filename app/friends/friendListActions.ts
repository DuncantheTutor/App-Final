import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert, Platform } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import { logAppError } from "../../telemetry";
import type { Chat, Friend, Post } from "../domain/types";
import {
  collectDirectChatIdsToLockForFriend,
  mergeIdentityLockedChatIds,
} from "../lib/identityLockedChats";
import { writePostsSharedWithFriends } from "../lib/postsSharedWithFriendsPersistence";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE, FEED_MUTE_CHOICES } from "../theme/preludeConstants";

type FriendListActionDeps = {
  friendMap: Record<string, Friend>;
  friendMapRef: MutableRefObject<Record<string, Friend>>;
  friendIdToBackendUid: Record<string, string>;
  chatsRef: MutableRefObject<Chat[]>;
  getBackendSession: () => BackendSession | null;
  unfriendLocally: (friendId: string, otherUid?: string | null) => void;
  setIdentityLockedChatIds: Dispatch<SetStateAction<string[]>>;
  postsSharedWithFriendsRef: MutableRefObject<Set<string>>;
  sharePostsBackfillStartedRef: MutableRefObject<Set<string>>;
  sessionEmailRef: MutableRefObject<string | null>;
  setFeedMutedUntilByFriendId: Dispatch<SetStateAction<Record<string, number | null>>>;
  isFriendFeedMuted: (friendId: string) => boolean;
  confirmDeletePost: (post: Post) => void;
  findOrCreateChatWithFriend: (friendId: string) => void;
};

/** Unfriend confirmation, feed mute, and the friends-list long-press menu. Recreated each render. */
export function createFriendListActions(deps: FriendListActionDeps) {
  const {
    friendMap,
    friendMapRef,
    friendIdToBackendUid,
    chatsRef,
    getBackendSession,
    unfriendLocally,
    setIdentityLockedChatIds,
    postsSharedWithFriendsRef,
    sharePostsBackfillStartedRef,
    sessionEmailRef,
    setFeedMutedUntilByFriendId,
    isFriendFeedMuted,
    confirmDeletePost,
    findOrCreateChatWithFriend,
  } = deps;

  const confirmUnfriendFriend = (friendId: string, name: string) => {
    Alert.alert("Unfriend?", `Remove ${name} from your friends list?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unfriend",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const session = getBackendSession();
            const friendRow = friendMap[friendId];
            const otherUid = friendRow?.backendUid?.trim();
            unfriendLocally(friendId, otherUid);
            const chatIdsToLock = collectDirectChatIdsToLockForFriend(
              chatsRef.current ?? [],
              friendId,
              {
                friendBackendUid: otherUid,
                sessionAppUid: session?.uid ?? null,
                friendMap: friendMapRef.current,
                friendIdToBackendUid,
              }
            );
            if (chatIdsToLock.length > 0) {
              setIdentityLockedChatIds((cur) => mergeIdentityLockedChatIds(cur, chatIdsToLock));
            }
            if (!DEMO_OFFLINE_MODE && session && otherUid) {
              try {
                await callEmulatorFunction<{ ok?: boolean }>("removeFriendship", {
                  uid: session.uid,
                  deviceId: session.deviceId,
                  otherUid,
                });
              } catch (e) {
                logAppError("unfriend.removeFriendship", e, { friendId });
                const detail = e instanceof Error ? e.message.trim() : String(e ?? "");
                Alert.alert(
                  "Couldn't unfriend",
                  detail && detail.length < 200 ? detail : "Check your connection and try again."
                );
              }
            }
            if (otherUid?.startsWith("u_")) {
              postsSharedWithFriendsRef.current.delete(otherUid);
              sharePostsBackfillStartedRef.current.delete(otherUid);
              const email = sessionEmailRef.current?.trim().toLowerCase();
              if (email) {
                void writePostsSharedWithFriends(email, postsSharedWithFriendsRef.current);
              }
            }
          })();
        },
      },
    ]);
  };

  const setFeedMuteForFriend = (friendId: string, durationMs: number | null) => {
    setFeedMutedUntilByFriendId((current) => ({
      ...current,
      [friendId]: durationMs === null ? null : Date.now() + durationMs,
    }));
  };

  const clearFeedMuteForFriend = (friendId: string) => {
    setFeedMutedUntilByFriendId((current) => {
      if (!(friendId in current)) return current;
      const next = { ...current };
      delete next[friendId];
      return next;
    });
  };

  const openFeedMutePicker = (friend: Friend) => {
    const currentlyMuted = isFriendFeedMuted(friend.id);
    const cancelButton = { text: "Cancel", style: "cancel" as const };
    const actionButtons = [
      {
        text: "Mute for 24 hours",
        onPress: () => setFeedMuteForFriend(friend.id, FEED_MUTE_CHOICES[0].durationMs),
      },
      {
        text: "Mute for 1 week",
        onPress: () => setFeedMuteForFriend(friend.id, FEED_MUTE_CHOICES[1].durationMs),
      },
      { text: "Mute until unmuted", onPress: () => setFeedMuteForFriend(friend.id, null) },
      ...(currentlyMuted
        ? [{ text: "Unmute feed", onPress: () => clearFeedMuteForFriend(friend.id) }]
        : []),
    ];
    /** Android Alert only reliably surfaces a few actions — keep Cancel visible first. iOS: Cancel last (standard). */
    const buttons =
      Platform.OS === "android" ? [cancelButton, ...actionButtons] : [...actionButtons, cancelButton];
    Alert.alert(
      `Feed settings: ${friend.displayName}`,
      "Choose how long to mute this friend in feed.",
      buttons,
      Platform.OS === "android" ? { cancelable: true } : undefined
    );
  };

  const openFeedPostActions = (post: Post) => {
    if (post.authorId === CURRENT_USER_ID) {
      Alert.alert("Post options", undefined, [
        { text: "Delete post", style: "destructive", onPress: () => confirmDeletePost(post) },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    const friend = friendMap[post.authorId];
    if (!friend) return;
    openFeedMutePicker(friend);
  };

  const handleFriendsListFriendLongPress = (friend: Friend) => {
    if (isFriendFeedMuted(friend.id)) {
      Alert.alert(
        friend.displayName,
        "Unmute this friend in your feed?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Unmute feed", onPress: () => clearFeedMuteForFriend(friend.id) },
        ]
      );
      return;
    }
    Alert.alert(friend.displayName, undefined, [
      { text: "Start chat", onPress: () => findOrCreateChatWithFriend(friend.id) },
      { text: "Mute feed", onPress: () => openFeedMutePicker(friend) },
      {
        text: "Unfriend",
        style: "destructive",
        onPress: () => confirmUnfriendFriend(friend.id, friend.displayName),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return {
    confirmUnfriendFriend,
    openFeedMutePicker,
    openFeedPostActions,
    handleFriendsListFriendLongPress,
  };
}
