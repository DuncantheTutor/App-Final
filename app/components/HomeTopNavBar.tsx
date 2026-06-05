import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";



import type { ThemePalette } from "../domain/types";



export type HomeNavHighlight = {

  createPost: boolean;

  settings: boolean;

  myProfile: boolean;

  friendsList: boolean;

  chats: boolean;

  feed: boolean;

  addFriend: boolean;

};



/** Unread counts to surface as red badges on the relevant nav icons. */
export type HomeNavBadges = {
  /** Number of chats with unread messages. */
  chats?: number;
  /** Posts on your profile with unseen friend reactions. */
  feed?: number;
};

type Props = {

  theme: ThemePalette;

  styles: Record<string, object>;

  highlight: HomeNavHighlight;

  badges?: HomeNavBadges;

  onOpenCreatePost: () => void;

  onOpenSettings: () => void;

  onOpenMyProfile: () => void;

  onOpenFriendsList: () => void;

  onOpenHomeChats: () => void;

  onOpenHomeFeed: () => void;

  onOpenAddFriend: () => void;

  onLogout: () => void;

};



export function HomeTopNavBar({

  theme,

  styles,

  highlight,

  badges,

  onOpenCreatePost,

  onOpenSettings,

  onOpenMyProfile,

  onOpenFriendsList,

  onOpenHomeChats,

  onOpenHomeFeed,

  onOpenAddFriend,

  onLogout,

}: Props) {

  const accent = theme.accent;

  const pill = (active: boolean) => (active ? (styles.homeModeIconActive as object) : null);



  const navItems: Array<{

    key: string;

    onPress: () => void;

    label: string;

    icon: ReactNode;

    badge?: number;

  }> = [

    {

      key: "create",

      onPress: onOpenCreatePost,

      label: "New post",

      icon: (

        <Ionicons

          name={highlight.createPost ? "create" : "create-outline"}

          size={22}

          color={accent}

        />

      ),

    },

    {

      key: "profile",

      onPress: onOpenMyProfile,

      label: "My profile",

      icon: (

        <Ionicons

          name={highlight.myProfile ? "person-circle" : "person-circle-outline"}

          size={24}

          color={accent}

        />

      ),

    },

    {

      key: "friends",

      onPress: onOpenFriendsList,

      label: "Friends list",

      icon: (

        <Ionicons

          name={highlight.friendsList ? "people" : "people-outline"}

          size={22}

          color={accent}

        />

      ),

    },

    {

      key: "chats",

      onPress: onOpenHomeChats,

      label: "Open chats",

      badge: badges?.chats,

      icon: (

        <Ionicons

          name={highlight.chats ? "chatbubbles" : "chatbubbles-outline"}

          size={21}

          color={accent}

        />

      ),

    },

    {

      key: "feed",

      onPress: onOpenHomeFeed,

      label: "Open feed",

      badge: badges?.feed,

      icon: (

        <Ionicons

          name={highlight.feed ? "newspaper" : "newspaper-outline"}

          size={21}

          color={accent}

        />

      ),

    },

    {

      key: "addFriend",

      onPress: onOpenAddFriend,

      label: "Add friend",

      icon: (

        <Ionicons

          name={highlight.addFriend ? "person-add" : "person-add-outline"}

          size={22}

          color={accent}

        />

      ),

    },

    {

      key: "settings",

      onPress: onOpenSettings,

      label: "Settings",

      icon: (

        <Ionicons

          name={highlight.settings ? "settings" : "settings-outline"}

          size={22}

          color={accent}

        />

      ),

    },

  ];



  return (

    <View style={styles.homeTopBar as object}>

      <View style={navStyles.iconRow}>

        {navItems.map((item) => (

          <Pressable

            key={item.key}

            onPress={item.onPress}

            style={[

              styles.iconButton as object,

              navStyles.iconSlot,

              pill(

                item.key === "create"

                  ? highlight.createPost

                  : item.key === "profile"

                    ? highlight.myProfile

                    : item.key === "friends"

                      ? highlight.friendsList

                      : item.key === "chats"

                        ? highlight.chats

                        : item.key === "feed"

                          ? highlight.feed

                          : item.key === "addFriend"

                            ? highlight.addFriend

                            : highlight.settings

              ),

            ]}

            accessibilityLabel={item.label}

            accessibilityHint={

              item.key === "friends" ? "Opens your friends list. You can also swipe right on the chat list." : undefined

            }

          >

            {item.icon}

            {item.badge && item.badge > 0 ? (

              <View style={navStyles.badge} accessibilityLabel={`${item.badge} unread`}>

                <Text style={navStyles.badgeText} numberOfLines={1}>

                  {item.badge > 99 ? "99+" : item.badge}

                </Text>

              </View>

            ) : null}

          </Pressable>

        ))}

      </View>

      <Pressable onPress={onLogout} style={[styles.iconButton as object, navStyles.iconSlot]} accessibilityLabel="Logout">

        <Ionicons name="log-out-outline" size={22} color={accent} />

      </Pressable>

    </View>

  );

}



const navStyles = StyleSheet.create({

  iconRow: {

    flex: 1,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-evenly",

    minWidth: 0,

  },

  iconSlot: {

    minWidth: 40,

    alignItems: "center",

    justifyContent: "center",

  },

  badge: {

    position: "absolute",

    top: 2,

    right: 4,

    minWidth: 16,

    height: 16,

    paddingHorizontal: 3,

    borderRadius: 8,

    backgroundColor: "#FF3B30",

    alignItems: "center",

    justifyContent: "center",

  },

  badgeText: {

    color: "#FFFFFF",

    fontSize: 10,

    fontWeight: "700",

    lineHeight: 13,

  },

});


