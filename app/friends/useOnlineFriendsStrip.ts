import { useMemo } from "react";
import type { ViewStyle } from "react-native";

import type { Chat, Friend } from "../domain/types";
import {
  CURRENT_USER_ID,
  ONLINE_STRIP_EDGE_PAD,
  ONLINE_VISIBLE_SLOTS,
  VISIBLE_CHAT_PRIORITY_COUNT,
} from "../theme/preludeConstants";

export type OnlineStripLayout = {
  avail: number;
  slotWidth: number;
  avatarSize: number;
};

/** Online friends for the home strip: people in the top chats first, then by message count. */
export function useOnlineFriendsStrip(params: {
  allFriends: Friend[];
  unfriendedIds: string[];
  visibleSortedChats: Chat[];
  windowWidth: number;
}): {
  prioritizedOnlineFriends: Friend[];
  onlineStripLayout: OnlineStripLayout;
  onlineStripContentStyle: ViewStyle;
} {
  const { allFriends, unfriendedIds, visibleSortedChats, windowWidth } = params;

  const prioritizedOnlineFriends = useMemo(() => {
    const online = allFriends.filter((friend) => friend.online && !unfriendedIds.includes(friend.id));
    const topVisibleChatFriendIds = new Set<string>();
    visibleSortedChats.slice(0, VISIBLE_CHAT_PRIORITY_COUNT).forEach((chat) => {
      chat.memberIds.forEach((id) => {
        if (id !== CURRENT_USER_ID) {
          topVisibleChatFriendIds.add(id);
        }
      });
    });
    return [...online].sort((a, b) => {
      const aPriority = topVisibleChatFriendIds.has(a.id) ? 1 : 0;
      const bPriority = topVisibleChatFriendIds.has(b.id) ? 1 : 0;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.messageCount - a.messageCount;
    });
  }, [visibleSortedChats, unfriendedIds, allFriends]);

  const onlineStripLayout = useMemo(() => {
    const avail = windowWidth - ONLINE_STRIP_EDGE_PAD * 2;
    const slotWidth = avail / ONLINE_VISIBLE_SLOTS;
    /** Large within each equal slot; clip view hides column 7+ without extra gaps. */
    const avatarSize = Math.min(46, Math.max(34, Math.floor(slotWidth * 0.88)));
    return { avail, slotWidth, avatarSize };
  }, [windowWidth]);

  const onlineStripContentStyle = useMemo((): ViewStyle => {
    const base: ViewStyle = {
      paddingTop: 4,
      paddingBottom: 6,
      alignItems: "center",
    };
    const n = prioritizedOnlineFriends.length;
    const { avail, slotWidth } = onlineStripLayout;
    if (n === 0) {
      return { ...base, flexGrow: 1, paddingHorizontal: ONLINE_STRIP_EDGE_PAD };
    }
    if (n <= ONLINE_VISIBLE_SLOTS) {
      const extra = (avail - n * slotWidth) / 2;
      return {
        ...base,
        paddingLeft: extra,
        paddingRight: extra,
      };
    }
    /** More than six: no horizontal padding — equal slots; 7th starts at clip edge. */
    return { ...base };
  }, [prioritizedOnlineFriends.length, onlineStripLayout]);

  return { prioritizedOnlineFriends, onlineStripLayout, onlineStripContentStyle };
}
