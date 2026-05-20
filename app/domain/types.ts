import type { VideoTextOverlayData } from "../../PhotoEditorModal";

export type Friend = {
  id: string;
  /** Real backend UID for prototype/live users; omitted for legacy seeded friends. */
  backendUid?: string;
  displayName: string;
  online: boolean;
  profilePictureUrl: string;
  bio: string;
  messageCount: number;
};

export type Chat = {
  id: string;
  memberIds: string[];
  name: string;
  profilePicture?: string;
  kind?: "standard" | "broadcast";
  createdBy?: string;
  isCustomName: boolean;
  isDraft: boolean;
  visibleToRecipients: boolean;
  updatedAt: number;
  /** Unsent composer text for draft chats (persisted when leaving via Save draft). */
  draftComposerText?: string;
  /** Broadcast recipients (excluding self). */
  broadcastRecipientIds?: string[];
  /** Per-member epoch (ms): only messages at/after this time are visible to that member. */
  memberJoinedAt?: Record<string, number>;
  /** When true, this chat should not surface app notifications (e.g. push / badges). */
  mutedForNotifications?: boolean;
  /** Server-backed group admin uids (creator is admin by default). */
  adminIds?: string[];
  /** Per-participant read watermark (ms). */
  readBy?: Record<string, { lastReadAtMs: number; lastReadMessageId?: string }>;
};

/** Ephemeral new-chat screen before any character is typed (no row in chat list yet). */
export type PendingDraft = {
  memberIds: string[];
  name: string;
  profilePicture?: string;
  kind?: "standard" | "broadcast";
  createdBy?: string;
  broadcastRecipientIds?: string[];
  /**
   * Standard group (2+ others): `'members'` = header uses live tombstone-aware member names;
   * `'custom'` = user set a composer title — keep stored `name`.
   */
  standardGroupTitle?: "members" | "custom";
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
  kind?: "text" | "photo" | "video" | "voice" | "gif";
  mediaUri?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  durationSec?: number;
  replyToMessageId?: string;
  editedAt?: number;
  unsentAt?: number;
  reactions?: Record<string, string>;
  /** For broadcast chats: identifies the private thread friend. */
  broadcastThreadFriendId?: string;
  /** Owner-side hidden message (excluded from owner timeline when true). */
  hiddenFromOwner?: boolean;
  /** Text layers drawn on outgoing video (normalized positions). */
  videoTextOverlays?: VideoTextOverlayData[];
  /** Outgoing encrypted pipe: set while callable runs; `sent` after server accepts (release builds). */
  deliveryStatus?: "sending" | "sent";
};

export type Post = {
  id: string;
  authorId: string;
  createdAt: number;
  text?: string;
  imageUris?: string[];
  videoUri?: string;
  /** For video posts: chosen thumbnail or default first-frame poster. */
  videoPosterUri?: string;
  deletedAt?: number;
  /** userId → emoji; only friends (and you) are shown in the feed UI. */
  feedReactions?: Record<string, string>;
  comments?: PostComment[];
};

export type PostComment = {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  reactions?: Record<string, string>;
  thread?: PostCommentThreadMessage[];
};

export type PostCommentThreadMessage = {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  reactions?: Record<string, string>;
};

export type EncryptedSyncChannelState = "idle" | "syncing" | "ok" | "error";

export type SavedBroadcastGroup = {
  id: string;
  name: string;
  memberIds: string[];
};

export type ThemePalette = {
  background: string;
  text: string;
  subtleText: string;
  divider: string;
  accent: string;
  danger: string;
  /** Own-message bubble fill (matches accent strength in dark mode). */
  mineBubbleBackground: string;
  mineBubbleText: string;
  mineBubbleReplyMuted: string;
  replyContextMineBg: string;
  /** Inline reply preview when the quoted message was yours vs someone else’s. */
  replyQuotedFromSelfBg: string;
  replyQuotedFromSelfBorder: string;
  replyQuotedFromSelfLabel: string;
  replyQuotedFromSelfBody: string;
  replyQuotedFromOtherBg: string;
  replyQuotedFromOtherBorder: string;
  replyQuotedFromOtherLabel: string;
  replyQuotedFromOtherBody: string;
  /** Composer “replying to…” strip when target is yours vs theirs. */
  replyBannerQuotingSelfBg: string;
  replyBannerQuotingOtherBg: string;
  /** While composing a reply, the target message row uses this wash (muted echo of that bubble). */
  replyTargetEchoMineBg: string;
  replyTargetEchoOtherBg: string;
};

export type ColorThemeId = "green" | "pink";

export type FriendsListRestore = {
  returnTo: "home" | "chat";
  returnChatId?: string;
  returnPendingDraft?: PendingDraft;
};

export type ViewState =
  | { screen: "home" }
  | { screen: "chat"; chatId: string }
  | { screen: "chat"; pendingDraft: PendingDraft }
  | {
      screen: "friendProfile";
      friendId: string;
      returnTo: "home" | "chat" | "friendsList";
      returnChatId?: string;
      returnPendingDraft?: PendingDraft;
      friendsListRestore?: FriendsListRestore;
    }
  | { screen: "myProfile" }
  | { screen: "settings" }
  | {
      screen: "friendsList";
      returnTo: "home" | "chat";
      returnChatId?: string;
      returnPendingDraft?: PendingDraft;
    }
  | { screen: "addFriend" }
  | { screen: "publishPost" }
  | { screen: "chatSharedMedia"; chatId: string };

export type MockSessionClaimResult = "claimed" | "already-owned" | "locked" | "error";

export type MockAuthAccount = {
  email: string;
  password: string;
  username: string;
  phoneNumber: string;
  bio: string;
  profilePictureUrl: string | null;
  /**
   * When set, only these seed friend ids (`f1`…`f20`) appear in lists; others are treated as unfriended.
   * Omit for the default “all seed friends” graph.
   */
  seedFriendIds?: string[];
};

/** Add Friend: host shares 6-digit code; joiner scans and picks matching code (or manual session id). */
export type InPersonPairingRole = "share" | "join";
export type PairingProximityEvidence = {
  lat: number | null;
  lng: number | null;
  horizontalAccuracyM: number | null;
  locationTimestampMs: number | null;
  isWifiConnected: boolean;
  localIp: string | null;
};
