import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as NavigationBar from "expo-navigation-bar";
import { Audio, ResizeMode, Video } from "expo-av";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ExpoLocation from "expo-location";
import * as ExpoNetwork from "expo-network";
import * as VideoThumbnails from "expo-video-thumbnails";
import Constants from "expo-constants";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
  type ScrollView,
} from "react-native";
import { FlatListUntilScroll, ScrollViewUntilScroll } from "./ScrollUntilScroll";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import {
  PhotoEditorModal,
  type PhotoEditorResult,
  type VideoTextOverlayData,
} from "./PhotoEditorModal";
import LottieView from "lottie-react-native";

import {
  backendUidForEmail,
  backendUidForFriendId,
  callEmulatorFunction,
  getOrCreateBackendDeviceId,
} from "./backendBridge";
import { logAppError, logAppEvent, setTelemetryContext } from "./telemetry";
import {
  hasReadSmsPermission,
  requestReadSmsPermissionIfNeeded,
  startAndroidOtpAssist,
} from "./otpSmsAssist";
import { firebaseAuth } from "./firebaseAuthClient";
import { resolveParticipantDisplay } from "./app/lib/participantDisplay";
import {
  decryptPayloadForRecipient,
  ensureLocalKeyBundle,
  encryptPayloadForRecipients,
} from "./e2eeCrypto";
import { cancelInPersonPairingHardware } from "./addFriend/inPersonPairingGateway";
import {
  readAddFriendNdefPayload,
  writeAddFriendNdefPayload,
} from "./addFriend/nfc/handshake";
import { encodeNfcPinPairNdefPayload, parsePinFromNfcPairPlaintext } from "./addFriend/nfcPinTransport/pinPairProtocol";

type Friend = {
  id: string;
  /** Real backend UID for prototype/live users; omitted for legacy seeded friends. */
  backendUid?: string;
  displayName: string;
  online: boolean;
  profilePictureUrl: string;
  bio: string;
  messageCount: number;
};

type Chat = {
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
};

/** Ephemeral new-chat screen before any character is typed (no row in chat list yet). */
type PendingDraft = {
  memberIds: string[];
  name: string;
  profilePicture?: string;
  kind?: "standard" | "broadcast";
  createdBy?: string;
  broadcastRecipientIds?: string[];
};

type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
  kind?: "text" | "photo" | "video" | "voice";
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
  /** Demo/local send path: immediate `sent`; mirrors release UI (`App.tsx`). */
  deliveryStatus?: "sending" | "sent";
};

type Post = {
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

type PostComment = {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  reactions?: Record<string, string>;
  thread?: PostCommentThreadMessage[];
};

type PostCommentThreadMessage = {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  reactions?: Record<string, string>;
};

type EncryptedSyncChannelState = "idle" | "syncing" | "ok" | "error";

type SavedBroadcastGroup = {
  id: string;
  name: string;
  memberIds: string[];
};

type ThemePalette = {
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

type ColorThemeId = "green" | "pink";

type FriendsListRestore = {
  returnTo: "home" | "chat";
  returnChatId?: string;
  returnPendingDraft?: PendingDraft;
};

type ViewState =
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
  | {
      screen: "friendsList";
      returnTo: "home" | "chat";
      returnChatId?: string;
      returnPendingDraft?: PendingDraft;
    }
  | { screen: "addFriend" }
  | { screen: "publishPost" };

/** Cold start: hide auth/main UI until Firebase initial auth resolves and this minimum elapses. */
const APP_BOOT_SPLASH_MIN_MS = 500;
/** Shown on the boot splash under the tBH mark until you wire a real product name. */
const PLACEHOLDER_APP_PRODUCT_NAME = "Your network name";

function lastViewStorageKey(email: string): string {
  return `app:lastView:v1:${email.trim().toLowerCase()}`;
}

function lastHomeTabStorageKey(email: string): string {
  return `app:lastHomeTab:v1:${email.trim().toLowerCase()}`;
}

function parsePendingDraftPayload(value: unknown): PendingDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.memberIds) || !o.memberIds.every((id): id is string => typeof id === "string")) {
    return undefined;
  }
  if (typeof o.name !== "string") return undefined;
  const pending: PendingDraft = {
    memberIds: o.memberIds,
    name: o.name,
    profilePicture: typeof o.profilePicture === "string" ? o.profilePicture : undefined,
  };
  if (o.kind === "standard" || o.kind === "broadcast") pending.kind = o.kind;
  if (typeof o.createdBy === "string") pending.createdBy = o.createdBy;
  if (Array.isArray(o.broadcastRecipientIds)) {
    pending.broadcastRecipientIds = o.broadcastRecipientIds.filter(
      (id): id is string => typeof id === "string"
    );
  }
  return pending;
}

function parseFriendsListRestorePayload(value: unknown, chatIds: Set<string>): FriendsListRestore | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const returnTo = o.returnTo === "chat" ? "chat" : "home";
  const returnChatId = typeof o.returnChatId === "string" ? o.returnChatId : undefined;
  if (returnTo === "chat" && returnChatId && !chatIds.has(returnChatId)) return undefined;
  const returnPendingDraft = parsePendingDraftPayload(o.returnPendingDraft);
  return { returnTo, returnChatId, returnPendingDraft };
}

function parseStoredViewState(raw: string, chatIds: Set<string>): ViewState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const screen = o.screen;
  if (screen === "home") return { screen: "home" };
  if (screen === "myProfile") return { screen: "myProfile" };
  if (screen === "addFriend") return { screen: "addFriend" };
  if (screen === "publishPost") return { screen: "home" };
  if (screen === "friendsList") {
    const returnTo = o.returnTo === "chat" ? "chat" : "home";
    const returnChatId = typeof o.returnChatId === "string" ? o.returnChatId : undefined;
    if (returnTo === "chat" && returnChatId && !chatIds.has(returnChatId)) {
      return { screen: "friendsList", returnTo: "home" };
    }
    const returnPendingDraft = parsePendingDraftPayload(o.returnPendingDraft);
    return { screen: "friendsList", returnTo, returnChatId, returnPendingDraft };
  }
  if (screen === "chat") {
    if (typeof o.chatId === "string" && chatIds.has(o.chatId)) {
      return { screen: "chat", chatId: o.chatId };
    }
    const pendingDraft = parsePendingDraftPayload(o.pendingDraft);
    if (pendingDraft && pendingDraft.memberIds.length > 0) {
      return { screen: "chat", pendingDraft };
    }
    return null;
  }
  if (screen === "friendProfile") {
    const friendId = typeof o.friendId === "string" ? o.friendId : "";
    if (!friendId) return null;
    const returnTo =
      o.returnTo === "chat" || o.returnTo === "friendsList" || o.returnTo === "home" ? o.returnTo : "home";
    const returnChatId = typeof o.returnChatId === "string" ? o.returnChatId : undefined;
    if (returnTo === "chat" && returnChatId && !chatIds.has(returnChatId)) {
      return { screen: "friendProfile", friendId, returnTo: "home" };
    }
    const returnPendingDraft = parsePendingDraftPayload(o.returnPendingDraft);
    const friendsListRestore = parseFriendsListRestorePayload(o.friendsListRestore, chatIds);
    return {
      screen: "friendProfile",
      friendId,
      returnTo,
      returnChatId: returnTo === "chat" ? returnChatId : undefined,
      returnPendingDraft: returnTo === "chat" ? returnPendingDraft : undefined,
      friendsListRestore: returnTo === "friendsList" ? friendsListRestore : undefined,
    };
  }
  return null;
}

const CURRENT_USER_ID = "me";
const DEMO_OFFLINE_MODE = true;
const DEMO_USER_A_QR_PIN = "4242";
/** Primary UI accent — blue-teal. */
const ACCENT_GREEN = "#0C8579";
/** Hot pink accent (paired with same light/dark structure as green). */
const ACCENT_PINK = "#E91E8C";
/** Bright “online” green — distinct from UI accent. */
const ONLINE_GREEN = "#22E55E";
const VISIBLE_CHAT_PRIORITY_COUNT = 4;

/** Chat bubble main text size (px). */
const CHAT_BUBBLE_BODY_SIZE = 15;
/**
 * One vertical rhythm unit ≈ x-height of lowercase text at `CHAT_BUBBLE_BODY_SIZE`
 * (bubble padding and gaps between reply strip and main text use whole/half steps).
 */
const CHAT_XH = Math.round(CHAT_BUBBLE_BODY_SIZE * 0.53);
const CHAT_XH_HALF = Math.round(CHAT_XH / 2);

/** Darken a `#RRGGBB` accent for fills/borders (multiplies RGB channels). */
function multiplyHexColor(hex: string, factor: number): string {
  const raw = hex.trim().replace("#", "");
  if (raw.length !== 6) return hex;
  const r = Math.min(255, Math.round(parseInt(raw.slice(0, 2), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(raw.slice(2, 4), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(raw.slice(4, 6), 16) * factor));
  return `#${[r, g, b]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Blend `#RRGGBB` toward white for a lighter accent tint (e.g. switch tracks on accent screens). */
function blendAccentTowardWhite(hex: string, t: number): string {
  const raw = hex.trim().replace("#", "");
  if (raw.length !== 6) return hex;
  const clampT = Math.min(1, Math.max(0, t));
  const blend = (c: number) => Math.round(c + (255 - c) * clampT);
  const r = blend(parseInt(raw.slice(0, 2), 16));
  const g = blend(parseInt(raw.slice(2, 4), 16));
  const b = blend(parseInt(raw.slice(4, 6), 16));
  return `#${[r, g, b]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

const DEMO_FIRST_NAMES = [
  "Maya", "Liam", "Noah", "Zara", "Ari", "Eva", "Omar", "Kai", "Luna", "Theo",
  "Ivy", "Nico", "Rose", "Jude", "Ben", "Skye", "Reid", "Nina", "Caleb", "Mila",
  "Tariq", "Sia", "Wyatt", "Leah", "Jonah", "Ava", "Rami", "Elle", "Micah", "Poppy",
];
const DEMO_LAST_NAMES = [
  "Patel", "Carter", "Nguyen", "Silva", "Jordan", "Khan", "Reyes", "Walker", "Bennett", "Ali",
  "Brooks", "Diaz", "Choi", "Hughes", "King", "Ahmed", "Lopez", "Morris", "Scott", "Young",
];
const FRIEND_NAMES = Array.from({ length: 200 }, (_, i) => {
  const first = DEMO_FIRST_NAMES[i % DEMO_FIRST_NAMES.length] ?? `Friend${i + 1}`;
  const last = DEMO_LAST_NAMES[Math.floor(i / DEMO_FIRST_NAMES.length) % DEMO_LAST_NAMES.length] ?? "Taylor";
  return `${first} ${last}`;
});

const friendIds = Array.from({ length: FRIEND_NAMES.length }, (_, i) => `f${i + 1}`);

const FRIEND_LINKS: Record<string, string[]> = (() => {
  const links: Record<string, string[]> = {};
  for (const id of friendIds) {
    if (id === "f1") {
      links[id] = friendIds.filter((x) => x !== "f1");
    } else {
      const i = parseInt(id.slice(1), 10) - 1;
      const total = friendIds.length;
      const n = new Set<string>([
        "f1",
        friendIds[(i - 1 + total) % total],
        friendIds[(i + 1) % total],
      ]);
      n.delete(id);
      links[id] = [...n];
    }
  }
  /** Seed group chats require every member to be a friend of every other member (composer rules). */
  const seedGroupCliques = [
    ["f2", "f3"],
    ["f5", "f6", "f7"],
    ["f9", "f10"],
    ["f12", "f13"],
  ];
  for (const group of seedGroupCliques) {
    for (const a of group) {
      for (const b of group) {
        if (a === b) continue;
        if (!links[a].includes(b)) links[a].push(b);
      }
    }
  }
  return links;
})();

/** Rotating fake bios for seed friends (demo / test scenarios). */
const FAKE_BIOS = [
  "Weekend hikes, weekday spreadsheets. Always up for live music.",
  "Film cameras, pour-over coffee, and terrible puns.",
  "Training for a half marathon — slowly, but honestly.",
  "Home cook; still can't nail sourdough. Send tips.",
  "Design by day, synth jams by night.",
  "Dog parent. My camera roll is 90% the same good boy.",
  "Reading three books at once. Finishing none with grace.",
  "Beach person stuck in a city. Planning the escape.",
  "Volunteer at the shelter. Foster fails are a feature.",
  "Climbing gym regular. Finger strength > grip on reality.",
  "Plant mom. The fiddle-leaf is fine. Probably.",
  "Retro games & pixel art. Nostalgia is a lifestyle.",
  "Yoga when I remember. Coffee when I don't.",
  "Street photography on slow Sundays.",
  "Learning Spanish through bad TV subtitles.",
  "Cycling to work unless it's raining — then it's the bus.",
  "Board games, sharp cheddar, mild competitiveness.",
  "Aspiring minimalist. Amazon disagrees.",
  "Jazz vinyl collector. Neighbors have opinions.",
  "Night owl. Morning meetings are a personal attack.",
  "Sketchbook in every bag. Most pages are coffee rings.",
  "Sourdough starter named Steve. Steve is dramatic.",
  "Trail running: fewer people, more mud.",
  "Indie films & oversized hoodies.",
  "Tea > coffee, but don't make it a whole thing.",
  "Learning to DJ. Crowds are still theoretical.",
  "Cat person who dogs also like. Diplomatic.",
  "Zero-inbox is a myth. Inbox zero-ish is the goal.",
  "Camping once a season to remember why hotels exist.",
  "Local trivia night champion (one time, but it counts).",
];

const FRIENDS: Friend[] = FRIEND_NAMES.map((name, i) => ({
  id: `f${i + 1}`,
  displayName: name,
  online: i % 3 !== 2,
  profilePictureUrl: `https://picsum.photos/seed/demo-friend-${i + 1}/400/400`,
  bio: FAKE_BIOS[i % FAKE_BIOS.length],
  messageCount: Math.max(3, 72 - i * 2),
}));

function friendNameById(friendId: string): string {
  const idx = Number(friendId.replace(/^f/i, "")) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx >= FRIEND_NAMES.length) return friendId;
  return FRIEND_NAMES[idx] ?? friendId;
}

function cloneFriendLinks(src: Record<string, string[]>): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const k of Object.keys(src)) o[k] = [...src[k]];
  return o;
}

function buildDemoPostsForFriends(friendIds: string[]): Post[] {
  const now = Date.now();
  const out: Post[] = [];
  const reactionPool = ["👍", "❤️", "🔥", "👏", "😂", "😍"] as const;
  let idx = 0;
  for (const fid of friendIds) {
    for (let i = 0; i < 5; i += 1) {
      idx += 1;
      const r1 = friendIds[(idx + 1) % friendIds.length];
      const r2 = friendIds[(idx + 7) % friendIds.length];
      const r3 = friendIds[(idx + 13) % friendIds.length];
      out.push({
        id: `demo-post-${fid}-${i + 1}`,
        authorId: fid,
        createdAt: now - idx * 3_600_000,
        text: `${friendNameById(fid)}: update ${i + 1}`,
        imageUris: [`https://picsum.photos/seed/${fid}-post-${i + 1}/900/900`],
        feedReactions: {
          ...(r1 ? { [r1]: reactionPool[idx % reactionPool.length] } : {}),
          ...(r2 ? { [r2]: reactionPool[(idx + 2) % reactionPool.length] } : {}),
          ...(r3 ? { [r3]: reactionPool[(idx + 4) % reactionPool.length] } : {}),
        },
        comments: [],
      });
    }
  }
  return out;
}

function buildDemoChatsAndMessages(friendIds: string[]): { chats: Chat[]; messages: Message[] } {
  const now = Date.now();
  const chats: Chat[] = [];
  const messages: Message[] = [];
  let msgIdx = 0;
  const directIds = friendIds.slice(0, 100);
  for (const fid of directIds) {
    const chatId = `demo-dm-${fid}`;
    chats.push({
      id: chatId,
      memberIds: [CURRENT_USER_ID, fid],
      name: friendNameById(fid),
      isCustomName: false,
      isDraft: false,
      visibleToRecipients: true,
      updatedAt: now - msgIdx * 40_000,
    });
    const baseCount = msgIdx < 50 ? 2 : 1;
    for (let i = 0; i < baseCount; i += 1) {
      msgIdx += 1;
      messages.push({
        id: `demo-msg-${chatId}-${i + 1}`,
        chatId,
        senderId: i % 2 === 0 ? fid : CURRENT_USER_ID,
        text:
          i % 2 === 0
            ? `Hey, it's ${friendNameById(fid)} — you free later?`
            : `Yep ${friendNameById(fid)}, let's do it.`,
        createdAt: now - msgIdx * 70_000,
        reactions:
          i === 0
            ? {
                [CURRENT_USER_ID]: "👍",
                [fid]: "❤️",
              }
            : undefined,
      });
    }
  }

  const groupSets: Array<{ ids: string[]; name: string }> = [
    { ids: friendIds.slice(0, 4), name: "Weekend Hike Crew" },
    { ids: friendIds.slice(4, 8), name: "Project Squad" },
    { ids: friendIds.slice(8, 12), name: "Coffee & Catchup" },
    { ids: friendIds.slice(12, 16), name: "Game Night" },
  ].filter((g) => g.ids.length >= 3);
  groupSets.forEach((group, i) => {
    const chatId = `demo-group-${i + 1}`;
    chats.push({
      id: chatId,
      memberIds: [CURRENT_USER_ID, ...group.ids],
      name: group.name,
      kind: "standard",
      isCustomName: true,
      isDraft: false,
      visibleToRecipients: true,
      updatedAt: now - i * 55_000,
    });
    msgIdx += 1;
    messages.push({
      id: `demo-msg-${chatId}-1`,
      chatId,
      senderId: group.ids[0],
      text: `${friendNameById(group.ids[0])} created ${group.name}.`,
      createdAt: now - msgIdx * 70_000,
      reactions: {
        [CURRENT_USER_ID]: "🎉",
      },
    });
  });

  const broadcasts: Array<{ id: string; name: string; recipients: string[]; opener: string }> = [
    {
      id: "demo-broadcast-1",
      name: "Campus Announcements",
      recipients: friendIds.slice(0, 6),
      opener: "Tomorrow's meet-up is at 6:30 PM.",
    },
    {
      id: "demo-broadcast-2",
      name: "Photography Updates",
      recipients: friendIds.slice(6, 12),
      opener: "Golden-hour walk starts in 20 minutes.",
    },
    {
      id: "demo-broadcast-3",
      name: "Five-a-side Football",
      recipients: friendIds.slice(12, 18),
      opener: "Pitch booking confirmed for Saturday.",
    },
  ];
  broadcasts.forEach((b, i) => {
    chats.push({
      id: b.id,
      memberIds: [CURRENT_USER_ID, ...b.recipients],
      name: b.name,
      kind: "broadcast",
      createdBy: CURRENT_USER_ID,
      broadcastRecipientIds: b.recipients,
      isCustomName: true,
      isDraft: false,
      visibleToRecipients: true,
      updatedAt: now - (i + 1) * 45_000,
    });
    msgIdx += 1;
    messages.push({
      id: `demo-msg-${b.id}-1`,
      chatId: b.id,
      senderId: CURRENT_USER_ID,
      text: b.opener,
      createdAt: now - msgIdx * 70_000,
      reactions: {
        ...(b.recipients[0] ? { [b.recipients[0]]: "👍" } : {}),
        ...(b.recipients[1] ? { [b.recipients[1]]: "🔥" } : {}),
      },
    });
  });

  return { chats, messages };
}

function addUndirectedEdge(
  links: Record<string, string[]>,
  a: string,
  b: string
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...links };
  const ensure = (id: string) => {
    if (!next[id]) next[id] = [];
  };
  ensure(a);
  ensure(b);
  if (!next[a].includes(b)) next[a] = [...next[a], b];
  if (!next[b].includes(a)) next[b] = [...next[b], a];
  return next;
}

const ADD_FRIEND_HOLD_MS = 150;

/** Shown before any broadcast message that all recipients can see (no private thread). */
const BROADCAST_EVERYONE_SEND_TITLE = "Broadcast";
const BROADCAST_EVERYONE_SEND_MESSAGE =
  "This is a Broadcast, this message will be seen by everyone in the Broadcast, do you still want to send?";

const NOW = Date.now();

const INITIAL_CHATS: Chat[] = [
  {
    id: "c1",
    memberIds: [CURRENT_USER_ID, "f1"],
    name: "Maya",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 2,
  },
  {
    id: "c2",
    memberIds: [CURRENT_USER_ID, "f2", "f3"],
    name: "Liam, Noah",
    profilePicture: "🌊",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 25,
  },
  {
    id: "c3",
    memberIds: [CURRENT_USER_ID, "f4"],
    name: "Zara",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 60 * 3,
  },
  {
    id: "c4",
    /** Eva & Omar only — keeps chat visible on Beta (f11–f15 not friends) while f5 has separate DM `c12`. */
    memberIds: [CURRENT_USER_ID, "f6", "f7"],
    name: "Weekend crew",
    profilePicture: "🎯",
    isCustomName: true,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 55,
  },
  {
    id: "c12",
    memberIds: [CURRENT_USER_ID, "f5"],
    name: "Ari",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 18,
  },
  {
    id: "c5",
    memberIds: [CURRENT_USER_ID, "f8"],
    name: "Kai",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 60 * 8,
  },
  {
    id: "c6",
    memberIds: [CURRENT_USER_ID, "f9", "f10"],
    name: "Luna, Theo",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 120,
  },
  {
    id: "c7",
    memberIds: [CURRENT_USER_ID, "f11"],
    name: "Ivy",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 200,
  },
  {
    id: "c8",
    memberIds: [CURRENT_USER_ID, "f12", "f13"],
    name: "Nico, Rose",
    profilePicture: "🧩",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 10,
  },
  {
    id: "c9",
    memberIds: [CURRENT_USER_ID, "f14"],
    name: "Jude",
    isCustomName: false,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: NOW - 1000 * 60 * 5,
  },
  {
    id: "c10",
    memberIds: [CURRENT_USER_ID, "f15"],
    name: "Ben",
    isCustomName: false,
    isDraft: true,
    visibleToRecipients: false,
    updatedAt: NOW - 1000 * 60 * 400,
    draftComposerText: "Hey — still free to catch up this week?",
  },
  {
    id: "c11",
    memberIds: [CURRENT_USER_ID, "f16", "f17", "f18"],
    name: "Broadcast (3)",
    profilePicture: "📣",
    kind: "broadcast",
    createdBy: CURRENT_USER_ID,
    isCustomName: true,
    isDraft: false,
    visibleToRecipients: true,
    broadcastRecipientIds: ["f16", "f17", "f18"],
    updatedAt: NOW - 1000 * 60 * 14,
  },
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m1",
    chatId: "c1",
    senderId: "f1",
    text: "Hey! Are we still meeting today?",
    createdAt: NOW - 1000 * 60 * 50,
    reactions: {
      me: "👍",
      f2: "👍",
      f3: "❤️",
    },
  },
  {
    id: "m2",
    chatId: "c1",
    senderId: CURRENT_USER_ID,
    text: "Yep, 7pm works great.",
    createdAt: NOW - 1000 * 60 * 45,
    reactions: {
      f1: "🔥",
      f4: "🔥",
      f5: "😂",
    },
  },
  {
    id: "m3",
    chatId: "c1",
    senderId: "f1",
    text: "Perfect, see you soon.",
    createdAt: NOW - 1000 * 60 * 3,
  },
  {
    id: "m4",
    chatId: "c2",
    senderId: "f3",
    text: "Movie or dinner first?",
    createdAt: NOW - 1000 * 60 * 40,
  },
  {
    id: "m5",
    chatId: "c2",
    senderId: "f2",
    text: "Dinner first please.",
    createdAt: NOW - 1000 * 60 * 35,
    reactions: {
      f3: "👍",
      me: "👍",
      f6: "👍",
      f7: "😂",
    },
  },
  {
    id: "m6",
    chatId: "c2",
    senderId: CURRENT_USER_ID,
    text: "Let's do dinner then cinema.",
    createdAt: NOW - 1000 * 60 * 28,
  },
  {
    id: "m7",
    chatId: "c3",
    senderId: "f4",
    text: "Sent you the doc.",
    createdAt: NOW - 1000 * 60 * 60 * 2,
  },
  {
    id: "m7b",
    chatId: "c3",
    senderId: CURRENT_USER_ID,
    text: "Received — I'll review tonight. Thanks Zara.",
    createdAt: NOW - 1000 * 60 * 60 * 2 + 120_000,
  },
  {
    id: "m12a",
    chatId: "c12",
    senderId: "f5",
    text: "Still good for a quick sync tomorrow?",
    createdAt: NOW - 1000 * 60 * 22,
  },
  {
    id: "m12b",
    chatId: "c12",
    senderId: CURRENT_USER_ID,
    text: "Yes — 9am your time works for me.",
    createdAt: NOW - 1000 * 60 * 20,
  },
  {
    id: "m12c",
    chatId: "c12",
    senderId: "f5",
    text: "Perfect. I'll send a calendar ping.",
    createdAt: NOW - 1000 * 60 * 19,
  },
  {
    id: "m8",
    chatId: "c4",
    senderId: "f6",
    text: "Who's driving?",
    createdAt: NOW - 1000 * 60 * 50,
  },
  {
    id: "m9",
    chatId: "c4",
    senderId: CURRENT_USER_ID,
    text: "I can pick everyone up.",
    createdAt: NOW - 1000 * 60 * 48,
    reactions: {
      f6: "❤️",
      f7: "👏",
    },
  },
  {
    id: "m10",
    chatId: "c5",
    senderId: "f8",
    text: "Ping me when you're free.",
    createdAt: NOW - 1000 * 60 * 60 * 7,
  },
  {
    id: "m11",
    chatId: "c6",
    senderId: "f9",
    text: "Luna — did you see the invite?",
    createdAt: NOW - 1000 * 60 * 130,
  },
  {
    id: "m12",
    chatId: "c6",
    senderId: "f10",
    text: "Yes, I'm in.",
    createdAt: NOW - 1000 * 60 * 125,
  },
  {
    id: "m13",
    chatId: "c7",
    senderId: "f11",
    text: "Thanks for the intro!",
    createdAt: NOW - 1000 * 60 * 195,
  },
  {
    id: "m14",
    chatId: "c8",
    senderId: "f12",
    text: "Shared media goes here in the real app.",
    createdAt: NOW - 1000 * 60 * 12,
  },
  {
    id: "m15",
    chatId: "c9",
    senderId: CURRENT_USER_ID,
    text: "See you at the gate.",
    createdAt: NOW - 1000 * 60 * 4,
    reactions: {
      f14: "👍",
      f12: "😢",
    },
  },
  {
    id: "m16",
    chatId: "c11",
    senderId: CURRENT_USER_ID,
    text: "Quick update: venue moved to Studio 3.",
    createdAt: NOW - 1000 * 60 * 15,
    kind: "text",
  },
  {
    id: "m19",
    chatId: "c11",
    senderId: "f16",
    text: "Thanks! I can still make it.",
    createdAt: NOW - 1000 * 60 * 13,
    kind: "text",
    broadcastThreadFriendId: "f16",
    replyToMessageId: "m16",
  },
  {
    id: "m20",
    chatId: "c11",
    senderId: CURRENT_USER_ID,
    text: "Perfect - see you by 7:45.",
    createdAt: NOW - 1000 * 60 * 12,
    kind: "text",
    broadcastThreadFriendId: "f16",
    replyToMessageId: "m19",
  },
  {
    id: "m21",
    chatId: "c11",
    senderId: "f16",
    text: "Great, thanks for confirming.",
    createdAt: NOW - 1000 * 60 * 11,
    kind: "text",
    broadcastThreadFriendId: "f16",
    replyToMessageId: "m20",
  },
];

/** Extra long threads for scroll testing (c1 and c2). */
const SCROLL_TEST_MESSAGES: Message[] = (() => {
  const out: Message[] = [];
  const lines = [
    "Quick check-in on timing.",
    "Running 5 min late — traffic.",
    "No worries, I'll grab a table.",
    "Order drinks without me?",
    "Still good for the 7:15 show?",
    "Yep, tickets are in my wallet.",
    "Can you send the parking pin?",
    "Sent — level B, near the elevator.",
    "Perfect, see you inside.",
    "Bringing the umbrella just in case.",
    "Forecast says it might drizzle.",
    "I'll wear layers.",
    "Snack before or after?",
    "Let's do a light bite before.",
    "Reservation is under your name.",
    "Great — I'll confirm when I'm parked.",
    "Ping me if the line is long.",
    "Will do — standing near the host.",
    "They seated us by the window.",
    "On my way up from the garage.",
    "Elevator is slow tonight.",
    "Take your time — water's here.",
    "Thanks — almost there.",
    "This playlist is perfect.",
    "Agreed — save it for the road trip.",
    "Weekend plans still fuzzy?",
    "Leaning hike if weather holds.",
    "Backup is museum + coffee.",
    "Either works for me.",
    "I'll check the trail conditions.",
    "Sounds good — text when you know.",
    "Movie runtime might be tight.",
    "We can swap to the late show.",
    "I'll look at seats now.",
    "Grabbed aisle seats row F.",
    "Legend — transferring my half.",
  ];
  for (let i = 0; i < lines.length; i++) {
    const sender = i % 2 === 0 ? "f1" : CURRENT_USER_ID;
    out.push({
      id: `c1-scroll-${i}`,
      chatId: "c1",
      senderId: sender,
      text: lines[i] ?? `Message ${i}`,
      createdAt: NOW - 1000 * 60 * (90 - i),
    });
  }
  const groupLines = [
    "Who's bringing the board games?",
    "I can bring Codenames.",
    "I'll bring snacks — savory + sweet.",
    "I'll grab cups and napkins.",
    "Venmo link for pizza?",
    "Split four ways works.",
    "Anyone vegetarian?",
    "Two veggie — rest mixed.",
    "I'll place the order at 6.",
    "Pickup or delivery?",
    "Delivery — less driving.",
    "ETA 6:40 per the app.",
    "I'll buzz everyone when it lands.",
    "Dining room or kitchen table?",
    "Kitchen — more space.",
    "I'll clear the counter.",
    "Ice? We’re low.",
    "On my list — bag from the store.",
    "Playlist or quiet background?",
    "Low-key jazz playlist?",
    "Works — not too loud.",
    "Kids asleep upstairs by 8?",
    "We'll keep volume sensible.",
    "Cleanup rotation?",
    "I'll start dishes — rotate next time.",
    "Thanks everyone — see you soon.",
  ];
  for (let j = 0; j < groupLines.length; j++) {
    const senders = ["f2", "f3", CURRENT_USER_ID];
    out.push({
      id: `c2-scroll-${j}`,
      chatId: "c2",
      senderId: senders[j % senders.length] ?? CURRENT_USER_ID,
      text: groupLines[j] ?? `Group ${j}`,
      createdAt: NOW - 1000 * 60 * (70 - j),
    });
  }
  return out;
})();

const ALL_INITIAL_MESSAGES = [...INITIAL_MESSAGES, ...SCROLL_TEST_MESSAGES];

const INITIAL_POSTS: Post[] = [
  {
    id: "p1",
    authorId: "f1",
    createdAt: NOW - 1000 * 60 * 15,
    text: "Coffee walk? Found a tiny bakery that does unreal cardamom buns.",
    feedReactions: {
      f2: "❤️",
      f3: "👍",
      f4: "🔥",
      f5: "😊",
    },
  },
  {
    id: "p2",
    authorId: "f6",
    createdAt: NOW - 1000 * 60 * 60 * 3,
    imageUris: ["https://picsum.photos/seed/mvpplus-1/1200/1200"],
    text: "Sunday light hit different.",
    feedReactions: { f1: "😍", f8: "❤️", f10: "👏" },
  },
  {
    id: "p3",
    authorId: "f3",
    createdAt: NOW - 1000 * 60 * 60 * 20,
    imageUris: [
      "https://picsum.photos/seed/mvpplus-2/1200/1200",
      "https://picsum.photos/seed/mvpplus-3/1200/1200",
    ],
    text: "Two frames from the hike.",
    feedReactions: { f1: "🥾", f2: "❤️", f4: "🔥", f5: "👍" },
  },
  {
    id: "p4",
    authorId: CURRENT_USER_ID,
    createdAt: NOW - 1000 * 60 * 60 * 30,
    text: "MVP+ day 1: feed first, polish later.",
    feedReactions: { f2: "👍", f4: "🎉" },
  },
  {
    id: "p5",
    authorId: "f8",
    createdAt: NOW - 1000 * 60 * 60 * 34,
    imageUris: ["https://picsum.photos/seed/mvpplus-4/1280/900"],
    text: "Blue hour by the river.",
    feedReactions: { f6: "😮", f14: "❤️" },
  },
  {
    id: "p6",
    authorId: "f10",
    createdAt: NOW - 1000 * 60 * 60 * 38,
    imageUris: [
      "https://picsum.photos/seed/mvpplus-5/1000/1400",
      "https://picsum.photos/seed/mvpplus-6/1400/1000",
      "https://picsum.photos/seed/mvpplus-7/1080/1920",
    ],
    text: "Three from today - swipe through.",
    feedReactions: { f3: "❤️", f20: "🔥", f8: "😍" },
  },
  {
    id: "p7",
    authorId: "f12",
    createdAt: NOW - 1000 * 60 * 60 * 41,
    text: "Quiet one today. Anyone up for coffee tomorrow morning?",
    feedReactions: { f7: "☕", f18: "👍" },
  },
  {
    id: "p8",
    authorId: "f14",
    createdAt: NOW - 1000 * 60 * 60 * 46,
    imageUris: ["https://picsum.photos/seed/mvpplus-8/1600/900"],
    text: "Testing wide images in feed.",
    feedReactions: { f4: "📷", f12: "❤️" },
  },
  {
    id: "p9",
    authorId: "f2",
    createdAt: NOW - 1000 * 60 * 60 * 50,
    imageUris: [
      "https://picsum.photos/seed/mvpplus-9/900/1600",
      "https://picsum.photos/seed/mvpplus-10/1200/1200",
    ],
    text: "New mural route.",
    feedReactions: { f1: "🎨", f3: "👀", f4: "❤️", f5: "🔥" },
  },
  {
    id: "p10",
    authorId: "f4",
    createdAt: NOW - 1000 * 60 * 60 * 56,
    videoUri: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    videoPosterUri: "https://picsum.photos/seed/mvpplus-video/1280/720",
    text: "Video post sample for feed QA.",
    feedReactions: { f1: "▶️", f2: "😂", f3: "👍", f5: "❤️" },
  },
  {
    id: "p13",
    authorId: "f5",
    createdAt: NOW - 1000 * 60 * 90,
    text: "Notes from the studio — shipping a small batch this week.",
    feedReactions: { f1: "👍", f2: "☕", f3: "❤️", f4: "🎉" },
  },
  {
    id: "p11",
    authorId: "f18",
    createdAt: NOW - 1000 * 60 * 60 * 61,
    imageUris: ["https://picsum.photos/seed/mvpplus-11/1024/768"],
    feedReactions: { f8: "❤️", f4: "👏" },
  },
  {
    id: "p12",
    authorId: "f20",
    createdAt: NOW - 1000 * 60 * 60 * 66,
    text: "Text-only post to test spacing and readability across themes.",
    feedReactions: { f3: "📖", f6: "💬" },
  },
];

const LIGHT_THEME_GREEN: ThemePalette = {
  background: "#FFFFFF",
  text: "#111111",
  subtleText: "#666D72",
  divider: "#DCE0E3",
  accent: ACCENT_GREEN,
  danger: "#C94848",
  mineBubbleBackground: `${ACCENT_GREEN}24`,
  mineBubbleText: "#111111",
  mineBubbleReplyMuted: "#4A5560",
  replyContextMineBg: "#E4EFED",
  replyQuotedFromSelfBg: "#D8EDE9",
  replyQuotedFromSelfBorder: ACCENT_GREEN,
  replyQuotedFromSelfLabel: "#0A6B62",
  replyQuotedFromSelfBody: "#4A5560",
  replyQuotedFromOtherBg: "#E3E8EC",
  replyQuotedFromOtherBorder: "#8B9A99",
  replyQuotedFromOtherLabel: "#4A5560",
  replyQuotedFromOtherBody: "#666D72",
  replyBannerQuotingSelfBg: "#E4EFED",
  replyBannerQuotingOtherBg: "#EEF1F3",
  /** Muted wash of own bubble colour — inline reply quotes + row highlight. */
  replyTargetEchoMineBg: "#E0F0ED",
  /** Muted wash of other bubble (white) — inline reply quotes + row highlight. */
  replyTargetEchoOtherBg: "#E3E8EC",
};

const DARK_THEME_GREEN: ThemePalette = {
  background: "#000000",
  text: "#F6F7F8",
  subtleText: "#A2AAB0",
  divider: "#2B3134",
  accent: ACCENT_GREEN,
  danger: "#E26C6C",
  mineBubbleBackground: ACCENT_GREEN,
  mineBubbleText: "#FFFFFF",
  mineBubbleReplyMuted: "rgba(255,255,255,0.78)",
  replyContextMineBg: "rgba(255,255,255,0.14)",
  replyQuotedFromSelfBg: "rgba(12,133,121,0.38)",
  replyQuotedFromSelfBorder: ACCENT_GREEN,
  replyQuotedFromSelfLabel: "rgba(255,255,255,0.95)",
  replyQuotedFromSelfBody: "rgba(255,255,255,0.78)",
  replyQuotedFromOtherBg: "#2C3136",
  replyQuotedFromOtherBorder: "rgba(255,255,255,0.35)",
  replyQuotedFromOtherLabel: "rgba(255,255,255,0.82)",
  replyQuotedFromOtherBody: "rgba(255,255,255,0.65)",
  replyBannerQuotingSelfBg: "rgba(12,133,121,0.35)",
  replyBannerQuotingOtherBg: "rgba(255,255,255,0.06)",
  /** Muted accent (your bubble) — friend quoting you. */
  replyTargetEchoMineBg: "rgba(12,133,121,0.28)",
  /** Muted grey lift from black — you quoting their bubble. */
  replyTargetEchoOtherBg: "#2C3136",
};

const LIGHT_THEME_PINK: ThemePalette = {
  background: "#FFFFFF",
  text: "#111111",
  subtleText: "#666D72",
  divider: "#DCE0E3",
  accent: ACCENT_PINK,
  danger: "#C94848",
  mineBubbleBackground: `${ACCENT_PINK}24`,
  mineBubbleText: "#111111",
  mineBubbleReplyMuted: "#5A4A58",
  replyContextMineBg: "#F8E6F0",
  replyQuotedFromSelfBg: "#F8E0F0",
  replyQuotedFromSelfBorder: ACCENT_PINK,
  replyQuotedFromSelfLabel: "#9C1460",
  replyQuotedFromSelfBody: "#5A4A58",
  replyQuotedFromOtherBg: "#E3E8EC",
  replyQuotedFromOtherBorder: "#9A8A96",
  replyQuotedFromOtherLabel: "#4A5560",
  replyQuotedFromOtherBody: "#666D72",
  replyBannerQuotingSelfBg: "#F8E6F0",
  replyBannerQuotingOtherBg: "#EEF1F3",
  replyTargetEchoMineBg: "#F3E4EE",
  replyTargetEchoOtherBg: "#E3E8EC",
};

const DARK_THEME_PINK: ThemePalette = {
  background: "#000000",
  text: "#F6F7F8",
  subtleText: "#A2AAB0",
  divider: "#2B3134",
  accent: ACCENT_PINK,
  danger: "#E26C6C",
  mineBubbleBackground: ACCENT_PINK,
  mineBubbleText: "#FFFFFF",
  mineBubbleReplyMuted: "rgba(255,255,255,0.78)",
  replyContextMineBg: "rgba(255,255,255,0.14)",
  replyQuotedFromSelfBg: "rgba(233,30,140,0.38)",
  replyQuotedFromSelfBorder: ACCENT_PINK,
  replyQuotedFromSelfLabel: "rgba(255,255,255,0.95)",
  replyQuotedFromSelfBody: "rgba(255,255,255,0.78)",
  replyQuotedFromOtherBg: "#2C3136",
  replyQuotedFromOtherBorder: "rgba(255,255,255,0.35)",
  replyQuotedFromOtherLabel: "rgba(255,255,255,0.82)",
  replyQuotedFromOtherBody: "rgba(255,255,255,0.65)",
  replyBannerQuotingSelfBg: "rgba(233,30,140,0.38)",
  replyBannerQuotingOtherBg: "rgba(255,255,255,0.06)",
  replyTargetEchoMineBg: "rgba(233,30,140,0.28)",
  replyTargetEchoOtherBg: "#2C3136",
};

const normalizeSet = (memberIds: string[]) => [...memberIds].sort().join("|");
const POSTS_STORAGE_KEY = "mvpplus.posts.v1";
const postsStorageKeyForEmail = (email: string) => `${POSTS_STORAGE_KEY}:${email.trim().toLowerCase()}`;
const socialMessagingStorageKeyForEmail = (email: string) =>
  `mvpplus.messaging.v1:${email.trim().toLowerCase()}`;
const APPEARANCE_PREFS_STORAGE_KEY = "mvpplus.appearance.v1";
const SESSION_LOCK_TOKEN_STORAGE_KEY = "mvpplus.session_lock_token.v1";
const sessionLockStorageKeyForEmail = (email: string) =>
  `${SESSION_LOCK_TOKEN_STORAGE_KEY}:${email.trim().toLowerCase()}`;

/**
 * Single active session per email (mock): **Required** — Firebase **Realtime Database** root URL via
 * `expo.extra.mockSessionRtdbUrl` in app.json and/or `EXPO_PUBLIC_MOCK_SESSION_RTDB_URL`. There is no
 * purely-local fallback: two phones cannot share state without network.
 * REST only (no SDK). Dev rules example:
 * `{ "rules": { "mock_sessions_v1": { ".read": true, ".write": true } } }` — tighten before prod.
 */
const MOCK_SESSION_POLL_MS = 2500;
const MOCK_SESSION_RTDB_SEGMENT = "mock_sessions_v1";

function getMockSessionSyncUrl(): string {
  const fromExpoConfig = (
    Constants.expoConfig as { extra?: { mockSessionRtdbUrl?: string } } | null
  )?.extra?.mockSessionRtdbUrl;
  const fromLegacyManifest = (
    Constants.manifest as { extra?: { mockSessionRtdbUrl?: string } } | null
  )?.extra?.mockSessionRtdbUrl;
  const fromEnv =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_MOCK_SESSION_RTDB_URL
      ? process.env.EXPO_PUBLIC_MOCK_SESSION_RTDB_URL
      : "";
  return String(fromExpoConfig ?? fromLegacyManifest ?? fromEnv ?? "")
    .trim()
    .replace(/\/$/, "");
}

function isMockSessionSyncConfigured(): boolean {
  return getMockSessionSyncUrl().length > 0;
}

function mockSessionRtdbPathKey(email: string): string {
  return encodeURIComponent(email.toLowerCase()).replace(/%/g, "_");
}

function profileUsernameStorageKey(email: string): string {
  return `app.profile.username.v1.${email.trim().toLowerCase()}`;
}

function emailLocalPartGuess(email: string): string {
  return (email.split("@")[0] ?? "").trim().toLowerCase();
}

function generateMockSessionToken(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Poll while signed in iff RTDB is configured (required for login, so normally always on). */
function shouldPollMockSession(): boolean {
  return false;
}

async function fetchLedgerTokenFromRtdb(email: string): Promise<string | null> {
  const base = getMockSessionSyncUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/${MOCK_SESSION_RTDB_SEGMENT}/${mockSessionRtdbPathKey(email)}.json`);
    if (res.status === 404) return "";
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw || raw === "null") return "";
    const data = JSON.parse(raw) as { t?: string };
    return typeof data.t === "string" ? data.t : "";
  } catch {
    return null;
  }
}

async function fetchLedgerTokenWithEtag(email: string): Promise<{ token: string; etag: string } | null> {
  const base = getMockSessionSyncUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/${MOCK_SESSION_RTDB_SEGMENT}/${mockSessionRtdbPathKey(email)}.json`, {
      headers: { "X-Firebase-ETag": "true" },
    });
    if (!res.ok) return null;
    const etag = res.headers.get("etag") ?? "";
    const raw = await res.text();
    if (!etag) return null;
    if (!raw || raw === "null") return { token: "", etag };
    const data = JSON.parse(raw) as { t?: string };
    return { token: typeof data.t === "string" ? data.t : "", etag };
  } catch {
    return null;
  }
}

type MockSessionClaimResult = "claimed" | "already-owned" | "locked" | "error";

async function claimMockSessionLedger(email: string, token: string): Promise<MockSessionClaimResult> {
  const base = getMockSessionSyncUrl();
  if (!base) return "claimed";
  try {
    const existingWithEtag = await fetchLedgerTokenWithEtag(email);
    if (!existingWithEtag) return "error";
    const existing = existingWithEtag.token;
    // Another active device owns this session lock until it logs out.
    if (existing && existing !== token) return "locked";
    const res = await fetch(
      `${base}/${MOCK_SESSION_RTDB_SEGMENT}/${mockSessionRtdbPathKey(email)}.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", "if-match": existingWithEtag.etag },
        body: JSON.stringify({ t: token, at: Date.now() }),
      }
    );
    if (!res.ok) return "error";
    const verify = await fetchLedgerTokenFromRtdb(email);
    if (verify === token) {
      return existing === token ? "already-owned" : "claimed";
    }
    return "error";
  } catch {
    return "error";
  }
}

async function revokeMockSessionLedger(email: string): Promise<void> {
  const base = getMockSessionSyncUrl();
  if (!base) return;
  try {
    await fetch(`${base}/${MOCK_SESSION_RTDB_SEGMENT}/${mockSessionRtdbPathKey(email)}.json`, {
      method: "DELETE",
    });
  } catch {
    /* ignore */
  }
}

async function readStoredSessionLockToken(email: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(sessionLockStorageKeyForEmail(email));
    return String(raw ?? "").trim();
  } catch {
    return "";
  }
}

async function writeStoredSessionLockToken(email: string, token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(sessionLockStorageKeyForEmail(email), token);
  } catch {
    /* ignore */
  }
}

async function clearStoredSessionLockToken(email: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(sessionLockStorageKeyForEmail(email));
  } catch {
    /* ignore */
  }
}

async function readLedgerSessionToken(email: string, canonicalMine: string): Promise<string> {
  const remote = await fetchLedgerTokenFromRtdb(email);
  if (remote === null) return canonicalMine;
  return remote;
}
const FEED_MUTE_CHOICES = [
  { label: "24 hours", durationMs: 24 * 60 * 60 * 1000 },
  { label: "1 week", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { label: "1 month", durationMs: 30 * 24 * 60 * 60 * 1000 },
] as const;

type MockAuthAccount = {
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

const DEMO_SHARED_FRIEND_IDS = Array.from({ length: 40 }, (_, i) => `f${i + 1}`);
const DEMO_USER_A_ONLY_FRIEND_IDS = Array.from({ length: 60 }, (_, i) => `f${i + 41}`);
const DEMO_USER_B_ONLY_FRIEND_IDS = Array.from({ length: 60 }, (_, i) => `f${i + 101}`);
const DEMO_USER_A_FRIEND_IDS = [...DEMO_SHARED_FRIEND_IDS, ...DEMO_USER_A_ONLY_FRIEND_IDS];
const DEMO_USER_B_FRIEND_IDS = [...DEMO_SHARED_FRIEND_IDS, ...DEMO_USER_B_ONLY_FRIEND_IDS];

function buildDemoOfflineAccount(username: "User A" | "User B"): MockAuthAccount {
  const isA = username === "User A";
  return {
    email: isA ? "usera@demo.local" : "userb@demo.local",
    password: isA ? "1234" : "5678",
    username,
    phoneNumber: isA ? "+440000000001" : "+440000000002",
    bio: isA ? "Demo mode account A" : "Demo mode account B",
    profilePictureUrl: isA
      ? "https://picsum.photos/seed/demo-user-a/400/400"
      : "https://picsum.photos/seed/demo-user-b/400/400",
    seedFriendIds: isA ? DEMO_USER_A_FRIEND_IDS : DEMO_USER_B_FRIEND_IDS,
  };
}

const DEMO_OFFLINE_ACCOUNTS: MockAuthAccount[] = [
  buildDemoOfflineAccount("User A"),
  buildDemoOfflineAccount("User B"),
];

const formatDayTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${time}`;
};

const getMessagePreviewBody = (m: Message) => {
  const t = m.text?.trim();
  if (t) return t;
  if (m.kind === "photo") return "Photo";
  if (m.kind === "video") return "Video";
  if (m.kind === "voice") return "Voice message";
  return "";
};

/** Group `profilePicture` is usually an emoji; treat common URI schemes as uploaded images. */
const isLikelyChatProfileImageUri = (value: string | undefined | null): boolean => {
  const s = value?.trim() ?? "";
  return /^(file:|https?:|content:)/i.test(s);
};

/** Home list preview: in group/broadcast chats, prefix last message with sender ("You" for self). */
const buildHomeChatPreview = (
  chat: Chat,
  lastMessage: Message | undefined,
  friendLookup: Record<string, Friend>,
  unfriendedIds: string[]
) => {
  const counterpartIds = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
  const showSender = counterpartIds.length > 1 || chat.kind === "broadcast";
  if (lastMessage) {
    const body = getMessagePreviewBody(lastMessage);
    const displayBody = body || "Message";
    if (!showSender) return displayBody;
    const prefix =
      lastMessage.senderId === CURRENT_USER_ID
        ? "You: "
        : `${resolveParticipantDisplay(lastMessage.senderId, friendLookup, unfriendedIds).displayName}: `;
    return `${prefix}${displayBody}`;
  }
  if (chat.draftComposerText?.trim()) {
    return showSender ? `You: ${chat.draftComposerText}` : chat.draftComposerText;
  }
  return "No messages yet";
};

const isPostAlive = (post: Post) => !post.deletedAt;

const getPostThumbnailUri = (post: Post): string | undefined => {
  if (post.imageUris?.[0]) return post.imageUris[0];
  if (post.videoPosterUri) return post.videoPosterUri;
  if (post.videoUri) return post.videoUri;
  return undefined;
};

function chunkBy<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😢", "🔥", "👏"];
const AUTO_REPLY_LINES = [
  "Got it, thanks!",
  "Sounds good to me.",
  "On it — will reply soon.",
  "Perfect timing.",
  "Thanks for the update.",
  "Yep, let's do that.",
];
const AUTO_REPLY_MIN_DELAY_MS = 5 * 1000;
const AUTO_REPLY_MAX_DELAY_MS = DEMO_OFFLINE_MODE ? 2 * 60 * 1000 : 5 * 60 * 1000;
const REACTION_LAYOUT_STEP_PX = 20;
/** Horizontal inset from screen edges inside the full-bleed online friends strip. */
const ONLINE_STRIP_EDGE_PAD = 14;
/** How many friend slots fit across the screen before horizontal scrolling. */
const ONLINE_VISIBLE_SLOTS = 6;
/** Back (38) + gap + header avatar (34) — matches right rail so the title centers on screen. */
const CHAT_HEADER_SIDE_RAIL_WIDTH = 38 + 8 + 34;

/** Background link delay (no dedicated handshake UI). */
const ADD_FRIEND_HANDSHAKE_MS = 750;
/** Max time to wait for an NDEF read after the hold completes (native only). */
const ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS = 45000;
/** Peak opacity of the dark scrim over the friend photo during celebration (fades to 0). */
const ADD_FRIEND_OVERLAY_DIM_START = 0.62;
/** Dim + confetti + “now friends” title fade duration. */
const ADD_FRIEND_PROFILE_FADE_MS = 1500;
/** After the fade, keep the profile + name visible before returning to the button. */
const ADD_FRIEND_PROFILE_SOLO_MS = 1000;
/** After releasing before the handshake completes, ignore new presses until this elapses (hold retry gate). */
const ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS = 1000;
const ADD_FRIEND_PROTOCOL_MAX_ATTEMPTS = 3;
const ADD_FRIEND_PROTOCOL_RETRY_BASE_MS = 200;
const ADD_FRIEND_QR_VISIBLE_MS = 4_000;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- bundled Lottie (from Downloads / project assets)
const ADD_FRIEND_CONFETTI_JSON = require("./assets/confetti.json");

/** `displayedProfileId` when hold completes with no pair result — shows failed pairing UI. */
const ADD_FRIEND_HANDSHAKE_FAILURE_ID = "__handshake_no_pair_failure__";

/** Add Friend: host shares 6-digit code; joiner scans and picks matching code (or manual session id). */
type InPersonPairingRole = "share" | "join";
type PairingProximityEvidence = {
  lat: number | null;
  lng: number | null;
  horizontalAccuracyM: number | null;
  locationTimestampMs: number | null;
  isWifiConnected: boolean;
  localIp: string | null;
};

function AddFriendScreen(props: {
  theme: ThemePalette;
  isDarkMode: boolean;
  safeTop: number;
  bottomInset: number;
  navHighlight: {
    chats: boolean;
    feed: boolean;
    myProfile: boolean;
    friendsList: boolean;
    addFriend: boolean;
  };
  styles: Record<string, object>;
  onOpenSettings: () => void;
  onOpenMyProfile: () => void;
  onOpenFriendsList: () => void;
  onOpenAddFriend: () => void;
  onOpenHomeChats: () => void;
  onOpenHomeFeed: () => void;
  onLogout: () => void;
  /** False until device session is claimed — pairing callables need uid + deviceId. */
  pairingBackendReady: boolean;
  /** Register a random 4-digit PIN until server accepts (reserves offer server-side). Returns PIN or null. */
  onPairingRegisterPinWithRetry: () => Promise<string | null>;
  /** Issuer: poll until joiner confirms with same PIN, then hydrate joiner profile. */
  onPairingAwaitPinRedeem: (pin: string) => Promise<Friend | null>;
  /** Joiner: QR scan — PIN + proximity (`confirmNfcPinPairOffer`), returns hydrated issuer. */
  onPairingConfirmPinRead: (pin: string) => Promise<Friend | null>;
  /** Read QR flow: request/confirm foreground location permission for GPS proximity path. */
  onEnsurePairingLocationPermission: () => Promise<boolean>;
  /** Issuer cancel: release server PIN reservation. */
  onPairingCancelPinOffer: (pin: string) => Promise<void>;
}) {
  const {
    theme,
    isDarkMode,
    safeTop,
    bottomInset,
    navHighlight,
    styles,
    onOpenSettings,
    onOpenMyProfile,
    onOpenFriendsList,
    onOpenAddFriend,
    onOpenHomeChats,
    onOpenHomeFeed,
    onLogout,
    pairingBackendReady,
    onPairingRegisterPinWithRetry,
    onPairingAwaitPinRedeem,
    onPairingConfirmPinRead,
    onEnsurePairingLocationPermission,
    onPairingCancelPinOffer,
  } = props;
  const onAccentLabel = isDarkMode ? "rgba(0,0,0,0.90)" : "rgba(255,255,255,0.96)";
  const onAccentMuted = isDarkMode ? "rgba(0,0,0,0.58)" : "rgba(255,255,255,0.72)";
  const onAccentActivePill = isDarkMode ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.22)";
  const switchTrackOff = isDarkMode
    ? multiplyHexColor(theme.accent, 0.42)
    : blendAccentTowardWhite(theme.accent, 0.38);
  const switchTrackOn = isDarkMode
    ? multiplyHexColor(theme.accent, 0.58)
    : blendAccentTowardWhite(theme.accent, 0.52);
  const switchThumbSolid = isDarkMode ? "#111111" : "#FFFFFF";
  const { height: windowHeight, width: screenWidth } = useWindowDimensions();
  type Phase = "idle" | "handshake" | "awaitPairing" | "confirmFriend" | "profileOverlay" | "profileSolo";
  const [phase, setPhase] = useState<Phase>("idle");
  /** Friend shown in the post-ritual profile. */
  const [displayedProfileId, setDisplayedProfileId] = useState<string | null>(null);
  const [displayedProfileFriend, setDisplayedProfileFriend] = useState<Friend | null>(null);
  /** True while `ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS` runs after an aborted hold (drives muted button). */
  const [pairingHoldCooldown, setPairingHoldCooldown] = useState(false);
  const [inPersonPairingRole, setInPersonPairingRole] = useState<InPersonPairingRole>("share");
  const [pairingStatusLabel, setPairingStatusLabel] = useState("");
  const [pendingVerifiedFriend, setPendingVerifiedFriend] = useState<Friend | null>(null);
  const [pendingVerifiedPin, setPendingVerifiedPin] = useState<string | null>(null);
  const [pendingVerifiedSource, setPendingVerifiedSource] = useState<"share" | "join" | null>(null);
  const [activeQrPayload, setActiveQrPayload] = useState<string | null>(null);
  const [scannerBusy, setScannerBusy] = useState(false);
  const scannerBusyRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  /** Active 4-digit PIN for issuer (never shown in UI); used for cancel + poll. */
  const hostActivePinRef = useRef<string | null>(null);
  const qrHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostAwaitSessionRef = useRef(0);
  const qrScanAttemptSeqRef = useRef(0);
  const pressStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pairingHoldCooldownUntilRef = useRef(0);
  const pairingHoldCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ritualDoneRef = useRef(false);
  const pairingHandshakeCancelledRef = useRef(false);
  const lastSuccessfulHandshakeRoleRef = useRef<"initiator" | "responder" | null>(null);

  useEffect(() => {
    return () => {
      if (pairingHoldCooldownTimerRef.current != null) {
        clearTimeout(pairingHoldCooldownTimerRef.current);
        pairingHoldCooldownTimerRef.current = null;
      }
      if (qrHideTimerRef.current != null) {
        clearTimeout(qrHideTimerRef.current);
        qrHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (inPersonPairingRole === "join" && !cameraPermission?.granted) {
      void requestCameraPermission();
    }
    if (inPersonPairingRole === "join") {
      setActiveQrPayload(null);
    }
  }, [inPersonPairingRole, cameraPermission?.granted, requestCameraPermission]);

  /** Avoid showing a celebration layer from stale state if the screen remounts oddly (e.g. dev Strict Mode). */
  useEffect(() => {
    setPhase("idle");
    setDisplayedProfileId(null);
    setDisplayedProfileFriend(null);
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
    ritualDoneRef.current = false;
    pairingHandshakeCancelledRef.current = false;
  }, []);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const friendAddedOpacity = useRef(new Animated.Value(0)).current;

  const isHandshakeFailureCelebration = displayedProfileId === ADD_FRIEND_HANDSHAKE_FAILURE_ID;

  const profileFriend = useMemo(
    () => (isHandshakeFailureCelebration ? null : displayedProfileFriend),
    [displayedProfileFriend, isHandshakeFailureCelebration]
  );

  const buttonSize = Math.min(screenWidth - 20, screenWidth * 0.94);
  const addFriendButtonFill = multiplyHexColor(theme.accent, 0.8);
  const addFriendButtonBorder = isDarkMode ? multiplyHexColor(theme.accent, 0.62) : "rgba(255,255,255,0.95)";
  const addFriendButtonChrome = {
    backgroundColor: addFriendButtonFill,
    borderWidth: 2,
    borderColor: addFriendButtonBorder,
  };
  const addFriendButtonLabelColor = isDarkMode ? "#111111" : "rgba(255,255,255,0.96)";

  const stopHoldLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pressStartRef.current = null;
  }, []);

  const runAfterHandshake = useCallback(() => {
    const fid = displayedProfileFriend?.id ?? "";
    if (fid) {
      void (async () => {
        try {
          const { sound } = await Audio.Sound.createAsync(
            {
              uri: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3",
            },
            { shouldPlay: true, volume: 0.65 }
          );
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              void sound.unloadAsync();
            }
          });
        } catch {
          // ignore
        }
      })();
    }

    setPhase("profileOverlay");
    dimOpacity.setValue(ADD_FRIEND_OVERLAY_DIM_START);
    friendAddedOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(dimOpacity, {
        toValue: 0,
        duration: ADD_FRIEND_PROFILE_FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(friendAddedOpacity, {
        toValue: 0,
        duration: ADD_FRIEND_PROFILE_FADE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPhase("profileSolo");
      setTimeout(() => {
        ritualDoneRef.current = false;
        setDisplayedProfileId(null);
        setDisplayedProfileFriend(null);
        setPhase("idle");
      }, ADD_FRIEND_PROFILE_SOLO_MS);
    });
  }, [dimOpacity, friendAddedOpacity, displayedProfileFriend]);

  const summarizeHandshakeError = useCallback((err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err ?? "");
    const lower = raw.toLowerCase();
    if (lower.includes("unauthenticated")) return "auth-required";
    if (lower.includes("permission-denied")) return "permission-denied";
    if (lower.includes("deadline-exceeded") || lower.includes("expired")) return "session-expired";
    if (lower.includes("not-found")) return "session-not-found";
    if (lower.includes("failed-precondition")) return "state-conflict";
    if (lower.includes("invalid-argument")) return "invalid-payload";
    return "unknown";
  }, []);

  const clearQrHideTimer = useCallback(() => {
    if (qrHideTimerRef.current != null) {
      clearTimeout(qrHideTimerRef.current);
      qrHideTimerRef.current = null;
    }
  }, []);

  const parseQrPayloadPin = useCallback((raw: string): string | null => {
    const t = raw.trim();
    if (!t) return null;
    if (/^\d{4}$/.test(t)) return t;
    const m = t.match(/^AFQR1\|(\d{4})$/i);
    return m?.[1] ?? null;
  }, []);

  const qrPayloadFingerprint = useCallback((raw: string): string => {
    const t = raw.trim();
    if (!t) return "empty";
    let checksum = 0;
    for (let i = 0; i < t.length; i += 1) checksum = (checksum + t.charCodeAt(i)) % 9973;
    return `${t.length}:${checksum}`;
  }, []);

  const beginPresenterQrOffer = useCallback(async () => {
    pairingHandshakeCancelledRef.current = false;
    if (!pairingBackendReady) {
      setPairingStatusLabel("Account session is not ready yet. Wait a few seconds after sign-in, then try again.");
      return;
    }

    setPairingStatusLabel("QR: preparing…");
    setPhase("awaitPairing");
    const stale = hostActivePinRef.current;
    hostActivePinRef.current = null;
    if (stale) await onPairingCancelPinOffer(stale).catch(() => {});
    clearQrHideTimer();

    const pin = await onPairingRegisterPinWithRetry();
    if (!pin) {
      setPhase("idle");
      setPairingStatusLabel("QR: could not reserve a code. Check network and try again.");
      return;
    }

    const sessionId = Date.now();
    hostAwaitSessionRef.current = sessionId;
    hostActivePinRef.current = pin;
    setActiveQrPayload(`AFQR1|${pin}`);
    setPairingStatusLabel("QR visible. Ask your friend to scan now.");
    setPhase("idle");
    qrHideTimerRef.current = setTimeout(() => {
      setActiveQrPayload(null);
      setPairingStatusLabel("QR hidden. Tap Show QR Code to mint a new one.");
      qrHideTimerRef.current = null;
    }, ADD_FRIEND_QR_VISIBLE_MS);

    const friend = await onPairingAwaitPinRedeem(pin);
    if (hostAwaitSessionRef.current !== sessionId) return;
    hostActivePinRef.current = null;
    if (friend) {
      setActiveQrPayload(null);
      clearQrHideTimer();
      setPendingVerifiedFriend(friend);
      setPendingVerifiedPin(pin);
      setPendingVerifiedSource("share");
      setPairingStatusLabel("QR verified. Confirm this friend.");
      setPhase("confirmFriend");
      return;
    }
    setPairingStatusLabel("Pairing: no one confirmed before this offer expired. Tap Show QR Code to try again.");
  }, [
    pairingBackendReady,
    onPairingCancelPinOffer,
    clearQrHideTimer,
    onPairingRegisterPinWithRetry,
    onPairingAwaitPinRedeem,
  ]);

  const onPressShowQrCode = useCallback(() => {
    void beginPresenterQrOffer().catch((err) => {
      const reason = summarizeHandshakeError(err);
      const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
      setPhase("idle");
      setPairingStatusLabel(detail && detail.length < 220 ? `QR: ${detail}` : `QR: error (${reason}).`);
      setActiveQrPayload(null);
    });
  }, [beginPresenterQrOffer, summarizeHandshakeError]);

  const onQrScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const payloadFingerprint = qrPayloadFingerprint(result.data ?? "");
      logAppEvent("pairing.qr.scan.callback", {
        phase,
        role: inPersonPairingRole,
        scannerBusyRef: scannerBusyRef.current,
        scannerBusyState: scannerBusy,
        payloadFingerprint,
      });
      if (inPersonPairingRole !== "join") {
        logAppEvent("pairing.qr.scan.ignored", { reason: "wrong_role", payloadFingerprint, phase });
        return;
      }
      if (scannerBusyRef.current) {
        logAppEvent("pairing.qr.scan.ignored", { reason: "busy_lock", payloadFingerprint, phase });
        return;
      }
      if (phase !== "idle") {
        logAppEvent("pairing.qr.scan.ignored", { reason: "wrong_phase", payloadFingerprint, phase });
        return;
      }
      scannerBusyRef.current = true;
      qrScanAttemptSeqRef.current += 1;
      const scanAttemptId = `scan-${Date.now()}-${qrScanAttemptSeqRef.current}`;
      logAppEvent("pairing.qr.scan.lock_acquired", { scanAttemptId, payloadFingerprint });
      const pin = parseQrPayloadPin(result.data ?? "");
      if (!pin) {
        logAppEvent("pairing.qr.scan.ignored", { reason: "invalid_payload", scanAttemptId, payloadFingerprint });
        setPairingStatusLabel("QR scan: invalid code. Ask your friend to tap Show QR Code and try again.");
        scannerBusyRef.current = false;
        logAppEvent("pairing.qr.scan.lock_released", { scanAttemptId, reason: "invalid_payload" });
        return;
      }
      setScannerBusy(true);
      setPairingStatusLabel("QR scan: processing…");
      logAppEvent("pairing.qr.scan.ui_processing", { scanAttemptId });
      void (async () => {
        try {
          setPhase("awaitPairing");
          setPairingStatusLabel("Verifying QR and proximity…");
          logAppEvent("pairing.qr.scan.proximity.start", { scanAttemptId });
          const scannedFriend = await onPairingConfirmPinRead(pin);
          if (!scannedFriend) {
            setPairingStatusLabel("Add friend failed");
            setPhase("idle");
            logAppEvent("pairing.qr.scan.proximity.miss", { scanAttemptId });
            return;
          }
          logAppEvent("pairing.qr.scan.proximity.ok", { scanAttemptId });
          setPendingVerifiedFriend(scannedFriend);
          setPendingVerifiedPin(pin);
          setPendingVerifiedSource("join");
          setPairingStatusLabel("QR verified. Confirm this friend.");
          setPhase("confirmFriend");
        } catch (err) {
          const reason = summarizeHandshakeError(err);
          const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
          setPairingStatusLabel(
            detail && detail.length < 180 ? `Add friend failed: ${detail}` : `Add friend failed (${reason}).`
          );
          setPhase("idle");
          logAppEvent("pairing.qr.scan.failed", { scanAttemptId, stage: "exception", reason });
        } finally {
          scannerBusyRef.current = false;
          setScannerBusy(false);
          logAppEvent("pairing.qr.scan.lock_released", { scanAttemptId, phaseAfter: phase });
        }
      })();
    },
    [
      inPersonPairingRole,
      scannerBusy,
      phase,
      parseQrPayloadPin,
      qrPayloadFingerprint,
      onPairingConfirmPinRead,
      summarizeHandshakeError,
    ]
  );

  const confirmVerifiedFriend = useCallback(async () => {
    if (!pendingVerifiedFriend || !pendingVerifiedSource) return;
    if (pendingVerifiedSource === "share") {
      setDisplayedProfileId(pendingVerifiedFriend.id);
      setDisplayedProfileFriend(pendingVerifiedFriend);
      setPendingVerifiedFriend(null);
      setPendingVerifiedPin(null);
      setPendingVerifiedSource(null);
      setPairingStatusLabel("Pairing: friend added.");
      runAfterHandshake();
      return;
    }
    const pin = pendingVerifiedPin?.trim() ?? "";
    if (!pin) {
      setPairingStatusLabel("QR scan: missing verification code. Scan again.");
      setPendingVerifiedFriend(null);
      setPendingVerifiedSource(null);
      setPhase("idle");
      return;
    }
    setPhase("awaitPairing");
    setDisplayedProfileId(pendingVerifiedFriend.id);
    setDisplayedProfileFriend(pendingVerifiedFriend);
    setPairingStatusLabel("Pairing: friend added.");
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
    runAfterHandshake();
  }, [
    pendingVerifiedFriend,
    pendingVerifiedPin,
    pendingVerifiedSource,
    runAfterHandshake,
  ]);

  const cancelVerifiedFriend = useCallback(() => {
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
    setPairingStatusLabel("QR scan: cancelled.");
    setPhase("idle");
  }, []);

  const runInPersonPairingThenCelebrate = useCallback(
    async () => {
      const nfcAttemptId = `nfc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pairingHandshakeCancelledRef.current = false;
      logAppEvent("pairing.in_person.start", { role: inPersonPairingRole });
      logAppEvent("pairing.nfc.pin.attempt.start", { nfcAttemptId, role: inPersonPairingRole });
      if (Platform.OS === "web") {
        logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "unsupported_web" });
        setPairingStatusLabel("In-person pairing is not available on web.");
        setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
        setDisplayedProfileFriend(null);
        runAfterHandshake();
        return;
      }

      if (!pairingBackendReady) {
        logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "backend_not_ready" });
        setPairingStatusLabel(
          "Account session is not ready yet. Wait a few seconds after sign-in, then hold Add Friend+ again."
        );
        setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
        setDisplayedProfileFriend(null);
        runAfterHandshake();
        return;
      }

      if (inPersonPairingRole === "share") {
        setPhase("awaitPairing");
        setPairingStatusLabel("Pairing: preparing…");
        hostActivePinRef.current = null;
        try {
          logAppEvent("pairing.nfc.pin.register.start", { nfcAttemptId });
          const pin = await onPairingRegisterPinWithRetry();
          logAppEvent("pairing.nfc.pin.register.result", { nfcAttemptId, ok: !!pin });
          if (pairingHandshakeCancelledRef.current) {
            logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_register" });
            ritualDoneRef.current = false;
            setPhase("idle");
            return;
          }
          if (!pin) {
            setPairingStatusLabel("Pairing: could not reserve a session. Check network and try again.");
            setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
            setDisplayedProfileFriend(null);
            runAfterHandshake();
            return;
          }
          hostActivePinRef.current = pin;
          setPairingStatusLabel(
            "Ask your friend to choose Join and hold their phone. Then hold both phones together while this phone sends the pairing signal."
          );
          const ndefPayload = encodeNfcPinPairNdefPayload(pin);
          logAppEvent("pairing.nfc.pin.write.start", {
            nfcAttemptId,
            payloadLen: ndefPayload.length,
          });
          const written = await writeAddFriendNdefPayload(ndefPayload, ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS);
          logAppEvent("pairing.nfc.pin.write.result", { nfcAttemptId, written });
          if (pairingHandshakeCancelledRef.current) {
            logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_write" });
            await onPairingCancelPinOffer(pin).catch(() => {});
            hostActivePinRef.current = null;
            ritualDoneRef.current = false;
            setPhase("idle");
            return;
          }
          if (!written) {
            await onPairingCancelPinOffer(pin).catch(() => {});
            hostActivePinRef.current = null;
            setPairingStatusLabel("Pairing: NFC send failed. Turn NFC on, try again, and keep phones close.");
            setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
            setDisplayedProfileFriend(null);
            runAfterHandshake();
            return;
          }
          setPairingStatusLabel("Pairing: waiting for your friend to confirm…");
          logAppEvent("pairing.nfc.pin.await_redeem.start", { nfcAttemptId });
          const friend = await onPairingAwaitPinRedeem(pin);
          logAppEvent("pairing.nfc.pin.await_redeem.result", {
            nfcAttemptId,
            accepted: !!friend,
            friendId: friend?.id ?? null,
          });
          if (pairingHandshakeCancelledRef.current) {
            logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_await_redeem" });
            await onPairingCancelPinOffer(pin).catch(() => {});
            ritualDoneRef.current = false;
            setPhase("idle");
            hostActivePinRef.current = null;
            return;
          }
          hostActivePinRef.current = null;
          if (friend) {
            logAppEvent("pairing.in_person.accepted", { friendId: friend.id });
            logAppEvent("pairing.nfc.pin.attempt.ok", { nfcAttemptId, friendId: friend.id });
            setPairingStatusLabel("Pairing: friend added.");
            setDisplayedProfileId(friend.id);
            setDisplayedProfileFriend(friend);
            lastSuccessfulHandshakeRoleRef.current = "initiator";
          } else {
            logAppEvent("pairing.in_person.failed", { reason: "share_timeout" });
            logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "share_timeout" });
            await onPairingCancelPinOffer(pin).catch(() => {});
            setPairingStatusLabel(
              "Pairing: no one confirmed before this offer expired. Try again with your friend on Join."
            );
            setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
            setDisplayedProfileFriend(null);
          }
        } catch (err) {
          const reason = summarizeHandshakeError(err);
          logAppError("pairing.in_person.share", err, { reason });
          logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "share_exception", reason });
          const detail = err instanceof Error ? err.message.trim() : String(err ?? "");
          setPairingStatusLabel(
            detail && detail.length < 240 ? `Pairing: ${detail}` : `Pairing: error (${reason}).`
          );
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          setDisplayedProfileFriend(null);
          const p = hostActivePinRef.current;
          hostActivePinRef.current = null;
          if (p) await onPairingCancelPinOffer(p).catch(() => {});
        }
        runAfterHandshake();
        return;
      }

      /* join */
      setPhase("awaitPairing");
      setPairingStatusLabel("Pairing: hold near your friend’s phone (they choose Share first)…");
      try {
        logAppEvent("pairing.nfc.pin.read.start", { nfcAttemptId });
        const plain = await readAddFriendNdefPayload(ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS, "receive");
        logAppEvent("pairing.nfc.pin.read.result", {
          nfcAttemptId,
          hasPayload: !!plain,
          payloadLen: plain?.length ?? 0,
        });
        if (pairingHandshakeCancelledRef.current) {
          logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_read" });
          ritualDoneRef.current = false;
          setPhase("idle");
          return;
        }
        const pin = plain ? parsePinFromNfcPairPlaintext(plain) : null;
        if (!pin) {
          setPairingStatusLabel("Pairing: could not read a valid 4-digit code. Try Join again, Receive side first.");
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          setDisplayedProfileFriend(null);
          runAfterHandshake();
          return;
        }
        setPairingStatusLabel("Pairing: confirming…");
        logAppEvent("pairing.nfc.pin.confirm.start", { nfcAttemptId });
        const friend = await onPairingConfirmPinRead(pin);
        logAppEvent("pairing.nfc.pin.confirm.result", {
          nfcAttemptId,
          accepted: !!friend,
          friendId: friend?.id ?? null,
        });
        if (pairingHandshakeCancelledRef.current) {
          logAppEvent("pairing.nfc.pin.attempt.cancelled", { nfcAttemptId, stage: "after_confirm" });
          ritualDoneRef.current = false;
          setPhase("idle");
          return;
        }
        if (friend) {
          logAppEvent("pairing.in_person.join.accepted", { friendId: friend.id });
          logAppEvent("pairing.nfc.pin.attempt.ok", { nfcAttemptId, friendId: friend.id });
          setDisplayedProfileId(friend.id);
          setDisplayedProfileFriend(friend);
          lastSuccessfulHandshakeRoleRef.current = "responder";
          runAfterHandshake();
        } else {
          logAppEvent("pairing.in_person.join.failed", { reason: "rejected" });
          logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "join_rejected" });
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          setDisplayedProfileFriend(null);
          runAfterHandshake();
        }
      } catch (err) {
        const reason = summarizeHandshakeError(err);
        logAppError("pairing.in_person.join", err, { reason });
        logAppEvent("pairing.nfc.pin.attempt.failed", { nfcAttemptId, stage: "join_exception", reason });
        setPairingStatusLabel(`Pairing: join failed (${reason}).`);
        setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
        setDisplayedProfileFriend(null);
        runAfterHandshake();
      }
    },
    [
      inPersonPairingRole,
      pairingBackendReady,
      onPairingRegisterPinWithRetry,
      onPairingAwaitPinRedeem,
      onPairingConfirmPinRead,
      onPairingCancelPinOffer,
      runAfterHandshake,
      summarizeHandshakeError,
    ]
  );

  const tickHold = useCallback(() => {
    const start = pressStartRef.current;
    if (start == null) return;
    const elapsed = Date.now() - start;
    const local = Math.min(1, elapsed / ADD_FRIEND_HOLD_MS);
    if (local >= 1) {
      if (ritualDoneRef.current) return;
      ritualDoneRef.current = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pressStartRef.current = null;
      if (Platform.OS === "android") {
        Vibration.vibrate(60);
      } else {
        Vibration.vibrate();
      }
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        useNativeDriver: true,
      }).start();
      setPhase("handshake");
      setTimeout(() => {
        if (Platform.OS === "web") {
          setDisplayedProfileFriend(null);
          setDisplayedProfileId(ADD_FRIEND_HANDSHAKE_FAILURE_ID);
          runAfterHandshake();
        } else {
          void runInPersonPairingThenCelebrate();
        }
      }, ADD_FRIEND_HANDSHAKE_MS);
      return;
    }
    rafRef.current = requestAnimationFrame(tickHold);
  }, [runAfterHandshake, runInPersonPairingThenCelebrate, scaleAnim]);

  const onPressIn = () => {
    if (phase !== "idle" || ritualDoneRef.current) return;
    if (Date.now() < pairingHoldCooldownUntilRef.current) return;
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      friction: 6,
      useNativeDriver: true,
    }).start();
    pressStartRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tickHold);
  };

  const onPressOut = () => {
    if (phase !== "idle") return;
    const holdHadStarted = pressStartRef.current != null;
    const completedOrPendingRitual = ritualDoneRef.current;
    stopHoldLoop();
    if (!completedOrPendingRitual) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
    if (holdHadStarted && !completedOrPendingRitual) {
      if (pairingHoldCooldownTimerRef.current != null) {
        clearTimeout(pairingHoldCooldownTimerRef.current);
        pairingHoldCooldownTimerRef.current = null;
      }
      pairingHoldCooldownUntilRef.current = Date.now() + ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS;
      setPairingHoldCooldown(true);
      pairingHoldCooldownTimerRef.current = setTimeout(() => {
        pairingHoldCooldownUntilRef.current = 0;
        setPairingHoldCooldown(false);
        pairingHoldCooldownTimerRef.current = null;
      }, ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS);
    }
  };

  const showProfileLayer = phase === "profileOverlay" || phase === "profileSolo";
  const showDimAndLabel = phase === "profileOverlay";
  const showMainButton = phase === "idle" || phase === "handshake";
  const showPairingWait = phase === "awaitPairing";
  const showFriendConfirm = phase === "confirmFriend" && !!pendingVerifiedFriend;
  const cancelPairingHandshake = useCallback(async () => {
    pairingHandshakeCancelledRef.current = true;
    await cancelInPersonPairingHardware();
    const p = hostActivePinRef.current;
    hostActivePinRef.current = null;
    if (p) await onPairingCancelPinOffer(p).catch(() => {});
    setPairingStatusLabel("Pairing: cancelled.");
    ritualDoneRef.current = false;
    setDisplayedProfileId(null);
    setDisplayedProfileFriend(null);
    setPendingVerifiedFriend(null);
    setPendingVerifiedPin(null);
    setPendingVerifiedSource(null);
    setPhase("idle");
  }, [onPairingCancelPinOffer]);

  return (
    <View
      style={[
        styles.addFriendRoot as object,
        { paddingTop: safeTop, paddingBottom: bottomInset + 12, backgroundColor: theme.accent },
      ]}
    >
      <View style={[styles.homeTopBar as object, { marginBottom: 10 }]}>
        <View style={styles.homeTopLeftIcons as object}>
          <Pressable onPress={onOpenSettings} style={styles.iconButton as object} accessibilityLabel="Settings">
            <Ionicons name="settings-outline" size={22} color={onAccentLabel} />
          </Pressable>
          <Pressable
            onPress={onOpenMyProfile}
            style={[
              styles.iconButton as object,
              navHighlight.myProfile ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="My profile"
          >
            <Ionicons
              name={navHighlight.myProfile ? "person-circle" : "person-circle-outline"}
              size={24}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenFriendsList}
            style={[
              styles.iconButton as object,
              navHighlight.friendsList ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Friends list"
          >
            <Ionicons
              name={navHighlight.friendsList ? "people" : "people-outline"}
              size={22}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenHomeChats}
            style={[
              styles.iconButton as object,
              navHighlight.chats ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Open chats"
          >
            <Ionicons
              name={navHighlight.chats ? "chatbubbles" : "chatbubbles-outline"}
              size={21}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenHomeFeed}
            style={[
              styles.iconButton as object,
              navHighlight.feed ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Open feed"
          >
            <Ionicons
              name={navHighlight.feed ? "newspaper" : "newspaper-outline"}
              size={21}
              color={onAccentLabel}
            />
          </Pressable>
          <Pressable
            onPress={onOpenAddFriend}
            style={[
              styles.iconButton as object,
              navHighlight.addFriend ? { backgroundColor: onAccentActivePill } : null,
            ]}
            accessibilityLabel="Add friend"
          >
            <Ionicons
              name={navHighlight.addFriend ? "person-add" : "person-add-outline"}
              size={22}
              color={onAccentLabel}
            />
          </Pressable>
        </View>
        <Pressable onPress={onLogout} style={styles.iconButton as object} accessibilityLabel="Logout">
          <Ionicons name="log-out-outline" size={22} color={onAccentLabel} />
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
          marginBottom: 6,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name="qr-code-outline"
            size={20}
            color={inPersonPairingRole === "share" ? onAccentLabel : onAccentMuted}
          />
          <Text
            style={{
              color: inPersonPairingRole === "share" ? onAccentLabel : onAccentMuted,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Show QR
          </Text>
        </View>
        <Switch
          accessibilityLabel="Add Friend: show QR or read QR"
          value={inPersonPairingRole === "join"}
          onValueChange={(v) => setInPersonPairingRole(v ? "join" : "share")}
          disabled={phase !== "idle"}
          trackColor={{ false: switchTrackOff, true: switchTrackOn }}
          thumbColor={switchThumbSolid}
          ios_backgroundColor={switchTrackOff}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name="scan-outline"
            size={20}
            color={inPersonPairingRole === "join" ? onAccentLabel : onAccentMuted}
          />
          <Text
            style={{
              color: inPersonPairingRole === "join" ? onAccentLabel : onAccentMuted,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Read QR
          </Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {showProfileLayer && displayedProfileId && (profileFriend || isHandshakeFailureCelebration) ? (
          <View
            style={[
              styles.addFriendProfileFullScreen as object,
              styles.addFriendProfileBleed as object,
              { width: screenWidth, flex: 1, backgroundColor: theme.accent },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.addFriendProfileImageOnlyWrap as object,
                {
                  backgroundColor: theme.accent,
                  width: screenWidth,
                  flex: 1,
                  minHeight: 0,
                  position: "relative",
                },
              ]}
            >
              {(() => {
                const safeH = Math.max(1, windowHeight);
                const photoFrameH = Math.min(
                  Math.round(screenWidth * 0.92),
                  Math.round(safeH * 0.56)
                );
                const celebrationTitle = profileFriend
                  ? `You're now friends with\n${profileFriend.displayName}!`
                  : isHandshakeFailureCelebration
                    ? "Handshake failed"
                    : "";
                const soloSubtitle = profileFriend
                  ? profileFriend.displayName
                  : isHandshakeFailureCelebration
                    ? "No friend was added. Use Show QR on one phone and Read QR on the other, then scan again."
                    : "";
                return (
                  <>
                    <View
                      collapsable={false}
                      style={[
                        StyleSheet.absoluteFillObject,
                        styles.addFriendCelebrationBase as object,
                        { backgroundColor: theme.accent },
                      ]}
                    >
                      <View style={styles.addFriendCelebrationHeroInner as object}>
                        <View
                          style={[
                            styles.addFriendCelebrationPhotoFrame as object,
                            {
                              height: photoFrameH,
                              backgroundColor: theme.background,
                            },
                          ]}
                        >
                          {profileFriend ? (
                            <Image
                              source={{ uri: profileFriend.profilePictureUrl }}
                              style={{
                                width: "100%",
                                height: photoFrameH,
                              }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={{
                                width: "100%",
                                height: photoFrameH,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name="close-circle"
                                size={Math.min(140, photoFrameH * 0.45)}
                                color={theme.danger}
                              />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.addFriendProfileSoloName as object,
                            styles.addFriendCelebrationNameOnAccent as object,
                            { color: onAccentLabel },
                          ]}
                          numberOfLines={3}
                        >
                          {soloSubtitle}
                        </Text>
                      </View>
                    </View>
                    {showDimAndLabel ? (
                      <>
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.addFriendCelebrationDim as object,
                            { backgroundColor: "#000000", opacity: dimOpacity },
                          ]}
                        />
                        {profileFriend ? (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              StyleSheet.absoluteFillObject,
                              styles.addFriendCelebrationLottieWrap as object,
                              { opacity: friendAddedOpacity },
                            ]}
                          >
                            <LottieView
                              source={ADD_FRIEND_CONFETTI_JSON}
                              autoPlay
                              loop={false}
                              resizeMode="cover"
                              style={StyleSheet.absoluteFillObject}
                            />
                          </Animated.View>
                        ) : null}
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFillObject,
                            styles.addFriendCelebrationTitleWrap as object,
                            {
                              justifyContent: "center",
                              alignItems: "center",
                              paddingHorizontal: 20,
                            },
                          ]}
                        >
                          <Animated.Text
                            style={[
                              styles.addFriendNowFriendsTitle as object,
                              {
                                color: profileFriend ? onAccentLabel : isDarkMode ? "rgba(0,0,0,0.88)" : "#7A1515",
                                opacity: friendAddedOpacity,
                              },
                            ]}
                          >
                            {celebrationTitle}
                          </Animated.Text>
                        </Animated.View>
                      </>
                    ) : null}
                  </>
                );
              })()}
            </View>
          </View>
        ) : null}

        {showPairingWait ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
            }}
          >
            <ActivityIndicator size="large" color={onAccentLabel} />
            <Text
              style={{
                marginTop: 18,
                color: onAccentLabel,
                fontSize: 18,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              Add friend
            </Text>
            <Text
              style={{
                marginTop: 10,
                color: onAccentMuted,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Keep this screen open while we verify your QR add-friend request.
            </Text>
            <Text
              style={{
                marginTop: 10,
                color: onAccentMuted,
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {pairingStatusLabel}
            </Text>
            <Pressable
              onPress={() => void cancelPairingHandshake()}
              style={{
                marginTop: 22,
                paddingVertical: 12,
                paddingHorizontal: 22,
                borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: onAccentMuted,
                backgroundColor: isDarkMode ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.2)",
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel pairing"
            >
              <Text style={{ color: onAccentLabel, fontSize: 16, fontWeight: "500" }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {showFriendConfirm ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
              gap: 16,
            }}
          >
            <View
              style={[
                styles.addFriendCelebrationPhotoFrame as object,
                {
                  height: Math.min(Math.round(screenWidth * 0.92), Math.round(windowHeight * 0.56)),
                  width: "100%",
                  maxWidth: 420,
                  backgroundColor: theme.background,
                },
              ]}
            >
              {pendingVerifiedFriend?.profilePictureUrl ? (
                <Image
                  source={{ uri: pendingVerifiedFriend.profilePictureUrl }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-circle-outline" size={96} color={onAccentMuted} />
                </View>
              )}
            </View>
            <Text style={{ color: onAccentLabel, fontSize: 22, fontWeight: "700", textAlign: "center" }}>
              {pendingVerifiedFriend?.displayName ?? "Friend"}
            </Text>
            <Text style={{ color: onAccentMuted, fontSize: 14, textAlign: "center" }}>
              Do you still want to add this person as a friend?
            </Text>
            <View style={{ width: "100%", maxWidth: 420, flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={cancelVerifiedFriend}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: addFriendButtonBorder,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: onAccentLabel, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmVerifiedFriend()}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: addFriendButtonBorder,
                  backgroundColor: addFriendButtonFill,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: addFriendButtonLabelColor, fontSize: 16, fontWeight: "700" }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showMainButton && inPersonPairingRole === "share" ? (
          <View
            style={{
              flex: 1,
              paddingHorizontal: 18,
              paddingBottom: 18,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", width: "100%" }}>
              {activeQrPayload ? (
                <View
                  style={{
                    borderRadius: 18,
                    padding: 14,
                    backgroundColor: isDarkMode ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.28)",
                    borderWidth: 2,
                    borderColor: isDarkMode ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.7)",
                  }}
                >
                  <View style={{ backgroundColor: "#FFFFFF", padding: 10, borderRadius: 12 }}>
                    <QRCode value={activeQrPayload} size={Math.min(220, screenWidth * 0.56)} />
                  </View>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={onPressShowQrCode}
              disabled={pairingHoldCooldown || phase !== "idle"}
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: addFriendButtonBorder,
                backgroundColor: addFriendButtonFill,
                paddingVertical: 13,
                alignItems: "center",
                opacity: pairingHoldCooldown || phase !== "idle" ? 0.45 : 1,
              }}
            >
              <Text style={{ color: addFriendButtonLabelColor, fontSize: 16, fontWeight: "700" }}>
                Show QR Code
              </Text>
            </Pressable>
          </View>
        ) : null}
        {showMainButton && inPersonPairingRole === "join" ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 18 }}>
            {!cameraPermission?.granted ? (
              <View
                style={{
                  width: "100%",
                  borderRadius: 18,
                  padding: 18,
                  backgroundColor: isDarkMode ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.28)",
                  borderWidth: 1,
                  borderColor: isDarkMode ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.64)",
                  alignItems: "center",
                }}
              >
                <Ionicons name="camera-outline" size={34} color={onAccentLabel} />
                <Text style={{ marginTop: 10, color: onAccentLabel, fontSize: 16, fontWeight: "600" }}>
                  Camera access needed
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    color: onAccentMuted,
                    textAlign: "center",
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  Allow camera access to read your friend&apos;s QR code.
                </Text>
                <Pressable
                  onPress={() => void requestCameraPermission()}
                  style={{
                    marginTop: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: onAccentMuted,
                  }}
                >
                  <Text style={{ color: onAccentLabel, fontSize: 15, fontWeight: "600" }}>Allow camera</Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={{
                  width: "100%",
                  maxWidth: 420,
                  aspectRatio: 0.82,
                  borderRadius: 22,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: addFriendButtonBorder,
                  backgroundColor: isDarkMode ? "#0B0B0B" : "#111111",
                }}
              >
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scannerBusy ? undefined : onQrScanned}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.2)",
                  }}
                >
                  <View
                    style={{
                      width: "72%",
                      aspectRatio: 1,
                      borderRadius: 16,
                      borderWidth: 3,
                      borderColor: isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.96)",
                      backgroundColor: "transparent",
                    }}
                  />
                  {scannerBusy ? (
                    <View
                      style={{
                        marginTop: 18,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: "rgba(0,0,0,0.58)",
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 13,
                          fontWeight: "700",
                          letterSpacing: 0.2,
                        }}
                      >
                        Processing scan...
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
            <Text
              style={{
                marginTop: 8,
                color: onAccentMuted,
                fontSize: 12,
                textAlign: "center",
                paddingHorizontal: 12,
              }}
            >
              {pairingStatusLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function App() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [colorThemeId, setColorThemeId] = useState<ColorThemeId>("green");
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(APPEARANCE_PREFS_STORAGE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const o = JSON.parse(raw) as { isDarkMode?: unknown; colorThemeId?: unknown };
        if (typeof o.isDarkMode === "boolean") setIsDarkMode(o.isDarkMode);
        if (o.colorThemeId === "green" || o.colorThemeId === "pink") setColorThemeId(o.colorThemeId);
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    void AsyncStorage.setItem(APPEARANCE_PREFS_STORAGE_KEY, JSON.stringify({ isDarkMode, colorThemeId })).catch(
      () => {}
    );
  }, [isDarkMode, colorThemeId]);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const backendAuthUidRef = useRef<string | null>(null);
  const backendDeviceIdRef = useRef<string | null>(null);
  const recipientKeyCacheRef = useRef<Record<string, string>>({});
  const [backendSessionReady, setBackendSessionReady] = useState(false);
  const [encryptedSyncState, setEncryptedSyncState] = useState<{
    profile: EncryptedSyncChannelState;
    posts: EncryptedSyncChannelState;
    messages: EncryptedSyncChannelState;
    lastSuccessAt: number | null;
  }>({
    profile: "idle",
    posts: "idle",
    messages: "idle",
    lastSuccessAt: null,
  });
  /** Mock single-device session: see `claimMockSessionLedger` / polling below. */
  const sessionTokenRef = useRef<string | null>(null);
  const sessionEmailRef = useRef<string | null>(null);
  const sessionConflictNoticeAtRef = useRef(0);
  /** Latest `logout` so session-retry alerts can offer Logout before `logout` is defined in source order. */
  const logoutRef = useRef<() => void>(() => {});
  const [authMode, setAuthMode] = useState<"login" | "loginOtp" | "signup" | "signupOtp">("login");
  const authModeRef = useRef(authMode);
  authModeRef.current = authMode;
  const [loginEmail, setLoginEmail] = useState(DEMO_OFFLINE_MODE ? "User A" : "");
  const [loginPassword, setLoginPassword] = useState(DEMO_OFFLINE_MODE ? "1234" : "");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupPasswordVisible, setSignupPasswordVisible] = useState(false);
  const [signupPasswordConfirmVisible, setSignupPasswordConfirmVisible] = useState(false);
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPhoneNumber, setSignupPhoneNumber] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const loginOtpRef = useRef("");
  const signupOtpRef = useRef("");
  loginOtpRef.current = loginOtp;
  signupOtpRef.current = signupOtp;
  const [issuedOtpCode, setIssuedOtpCode] = useState<string | null>(null);
  const [issuedOtpForEmail, setIssuedOtpForEmail] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<"chats" | "feed">("feed");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatComposerOpen, setChatComposerOpen] = useState(false);
  const [broadcastPickerOpen, setBroadcastPickerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"standard" | "broadcast">("standard");
  const [selectedComposerIds, setSelectedComposerIds] = useState<string[]>([]);
  const [composerCustomTitle, setComposerCustomTitle] = useState("");
  const [createTitleEditOpen, setCreateTitleEditOpen] = useState(false);
  const [createTitleDraft, setCreateTitleDraft] = useState("");
  const [createGroupPictureUri, setCreateGroupPictureUri] = useState<string | null>(null);
  const [pendingStandardGroupCreateAfterTitle, setPendingStandardGroupCreateAfterTitle] = useState(false);
  const [savedBroadcastGroups, setSavedBroadcastGroups] = useState<SavedBroadcastGroup[]>([
    { id: "bg-1", name: "Family Core", memberIds: ["f2", "f3", "f5", "f6"] },
    { id: "bg-2", name: "Project Leads", memberIds: ["f16", "f17", "f18"] },
  ]);
  const [selectedBroadcastGroupId, setSelectedBroadcastGroupId] = useState<string | null>(null);
  const [broadcastGroupDropdownOpen, setBroadcastGroupDropdownOpen] = useState(false);
  const [saveBroadcastGroupPromptOpen, setSaveBroadcastGroupPromptOpen] = useState(false);
  const [broadcastGroupNameDraft, setBroadcastGroupNameDraft] = useState("");
  const [pendingBroadcastCreateIds, setPendingBroadcastCreateIds] = useState<string[] | null>(null);
  const [saveBroadcastGroupNameModalOpen, setSaveBroadcastGroupNameModalOpen] = useState(false);
  const [composerSearch, setComposerSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatSearchVisible, setChatSearchVisible] = useState(false);
  const [friendsListSearch, setFriendsListSearch] = useState("");
  const [demoPendingAddableQueue, setDemoPendingAddableQueue] = useState<string[]>([]);
  const [unfriendedIds, setUnfriendedIds] = useState<string[]>(() => FRIENDS.map((f) => f.id));
  const [chatOverflowOpen, setChatOverflowOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [messageActionsOpen, setMessageActionsOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [messageActionTargetId, setMessageActionTargetId] = useState<string | null>(null);
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedBroadcastThreadFriendId, setSelectedBroadcastThreadFriendId] = useState<
    string | null
  >(null);
  const [voiceRecordStartedAt, setVoiceRecordStartedAt] = useState<number | null>(null);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<{ uri: string; durationSec: number } | null>(
    null
  );
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [photoEditorMediaType, setPhotoEditorMediaType] = useState<"photo" | "video">("photo");
  const [photoEditorTarget, setPhotoEditorTarget] = useState<"chat" | "post" | "profile">("chat");
  const [photoEditorAsset, setPhotoEditorAsset] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [queuedPostPhotoAssets, setQueuedPostPhotoAssets] = useState<
    Array<{ uri: string; width: number; height: number }>
  >([]);
  const [playingVideoMessageId, setPlayingVideoMessageId] = useState<string | null>(null);
  const [previewVoicePlaying, setPreviewVoicePlaying] = useState(false);
  const [playingVoiceMessageId, setPlayingVoiceMessageId] = useState<string | null>(null);
  const [editChatMetaOpen, setEditChatMetaOpen] = useState(false);
  const [editChatPictureOpen, setEditChatPictureOpen] = useState(false);
  const [chatTitleDraft, setChatTitleDraft] = useState("");
  const [chatPictureDraft, setChatPictureDraft] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [shouldFocusChatInput, setShouldFocusChatInput] = useState(false);
  const chatInputRef = useRef<TextInput | null>(null);
  const [myProfilePictureUrl, setMyProfilePictureUrl] = useState<string | null>(null);
  const [myBio, setMyBio] = useState("");
  /** When your bio has text, show read-only styling until long-press to edit (empty bio stays in the editor). */
  const [myBioTextEntryOpen, setMyBioTextEntryOpen] = useState(true);
  const bioInputRef = useRef<TextInput | null>(null);
  const [fullScreenPost, setFullScreenPost] = useState<Post | null>(null);
  const [postFullscreenThreadReplyKey, setPostFullscreenThreadReplyKey] = useState<string | null>(null);
  const [shouldFocusPostCommentInput, setShouldFocusPostCommentInput] = useState(false);
  const postCommentInputRef = useRef<TextInput | null>(null);
  const [reactionDetailPost, setReactionDetailPost] = useState<Post | null>(null);
  const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<string, string>>({});
  const [threadDraftByChainKey, setThreadDraftByChainKey] = useState<Record<string, string>>({});
  const [expandedCommentChainsByPost, setExpandedCommentChainsByPost] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [postDraftText, setPostDraftText] = useState("");
  const [postDraftImageUris, setPostDraftImageUris] = useState<string[]>([]);
  const [postDraftVideoUri, setPostDraftVideoUri] = useState<string | null>(null);
  const [feedMutedUntilByFriendId, setFeedMutedUntilByFriendId] = useState<
    Record<string, number | null>
  >({});
  const [view, setView] = useState<ViewState>({ screen: "home" });
  const viewRef = useRef<ViewState>(view);
  viewRef.current = view;
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [friendLinksState, setFriendLinksState] = useState<Record<string, string[]>>(() =>
    cloneFriendLinks(FRIEND_LINKS)
  );
  const [addedFriendsFromRitual, setAddedFriendsFromRitual] = useState<Friend[]>([]);
  const autoReplyTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const messageSoundRef = useRef<Audio.Sound | null>(null);

  const theme = useMemo(() => {
    if (colorThemeId === "pink") {
      return isDarkMode ? DARK_THEME_PINK : LIGHT_THEME_PINK;
    }
    return isDarkMode ? DARK_THEME_GREEN : LIGHT_THEME_GREEN;
  }, [isDarkMode, colorThemeId]);

  const appBootAuthResolvedRef = useRef(false);
  const [appBootAuthResolved, setAppBootAuthResolved] = useState(false);
  const markAppBootAuthResolved = useCallback(() => {
    if (appBootAuthResolvedRef.current) return;
    appBootAuthResolvedRef.current = true;
    setAppBootAuthResolved(true);
  }, []);

  const [appBootMinMsElapsed, setAppBootMinMsElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAppBootMinMsElapsed(true), APP_BOOT_SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      autoReplyTimersRef.current.forEach((timer) => clearTimeout(timer));
      autoReplyTimersRef.current = [];
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      if (previewSoundRef.current) {
        void previewSoundRef.current.unloadAsync();
        previewSoundRef.current = null;
      }
      if (messageSoundRef.current) {
        void messageSoundRef.current.unloadAsync();
        messageSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const addFriend = view.screen === "addFriend";
    const rootBg = addFriend ? theme.accent : theme.background;
    void SystemUI.setBackgroundColorAsync(rootBg);
    if (Platform.OS === "android") {
      void NavigationBar.setBackgroundColorAsync(rootBg);
      void NavigationBar.setButtonStyleAsync(
        addFriend ? (isDarkMode ? "dark" : "light") : isDarkMode ? "light" : "dark"
      );
    }
  }, [view.screen, theme.accent, theme.background, isDarkMode]);

  /** Android edge-to-edge can report `insets.top` as 0; combine with status bar height. */
  const safeTop = Math.max(
    insets.top,
    Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true)
    );
    /** `keyboardDidHide` avoids leftover padding from KeyboardAvoidingView (bar stuck too high). */
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!fullScreenPost || !shouldFocusPostCommentInput) return;
    const t = setTimeout(() => {
      postCommentInputRef.current?.focus();
      setShouldFocusPostCommentInput(false);
    }, 120);
    return () => clearTimeout(t);
  }, [fullScreenPost, shouldFocusPostCommentInput]);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  const closeFullscreenPost = useCallback(() => {
    setFullScreenPost(null);
    setPostFullscreenThreadReplyKey(null);
    setShouldFocusPostCommentInput(false);
    Keyboard.dismiss();
  }, []);

  const openPostViewerFromFeed = useCallback((post: Post) => {
    setFullScreenPost(post);
    setPostFullscreenThreadReplyKey(null);
    setShouldFocusPostCommentInput(false);
  }, []);

  const openPostCommentComposerFromFeed = useCallback((post: Post) => {
    setFullScreenPost(post);
    setPostFullscreenThreadReplyKey(null);
    setShouldFocusPostCommentInput(true);
  }, []);

  const openPostThreadReplyFromFeed = useCallback((post: Post, anchorCommentId: string) => {
    setFullScreenPost(post);
    setPostFullscreenThreadReplyKey(`${post.id}:${anchorCommentId}`);
    setShouldFocusPostCommentInput(true);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (authMode !== "loginOtp" && authMode !== "signupOtp") return;

    let cancelled = false;
    const promptTimer = setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        if (await hasReadSmsPermission()) return;
        Alert.alert(
          "SMS auto-fill (optional)",
          "Allow reading recent SMS to suggest your 6-digit code. You can always type it manually. SMS Retriever can still deliver codes on some devices without this permission.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Allow", onPress: () => void requestReadSmsPermissionIfNeeded() },
          ]
        );
      })();
    }, 800);

    const stop = startAndroidOtpAssist(
      (code) => {
        if (authModeRef.current === "loginOtp") setLoginOtp(code);
        else if (authModeRef.current === "signupOtp") setSignupOtp(code);
      },
      {
        shouldApplyCode: () => {
          if (authModeRef.current === "loginOtp") return !loginOtpRef.current.trim();
          if (authModeRef.current === "signupOtp") return !signupOtpRef.current.trim();
          return false;
        },
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(promptTimer);
      stop();
    };
  }, [authMode]);

  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void AsyncStorage.setItem(postsStorageKeyForEmail(email), JSON.stringify(posts)).catch(() => {
      logAppError("posts.persist", new Error("write failed"), { email });
    });
  }, [posts, signedIn]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void AsyncStorage.setItem(
      socialMessagingStorageKeyForEmail(email),
      JSON.stringify({ chats, messages })
    ).catch(() => {
      logAppError("messaging.persist", new Error("write failed"), { email });
    });
  }, [chats, messages, signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void AsyncStorage.setItem(lastViewStorageKey(email), JSON.stringify(view)).catch(() => {
      /* ignore */
    });
    if (view.screen === "home") {
      void AsyncStorage.setItem(lastHomeTabStorageKey(email), homeTab).catch(() => {
        /* ignore */
      });
    }
  }, [view, signedIn, homeTab]);

  useEffect(() => {
    const timer = setInterval(() => {
      setFeedMutedUntilByFriendId((current) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, number | null> = {};
        for (const [friendId, until] of Object.entries(current)) {
          if (until === null || until > now) {
            next[friendId] = until;
          } else {
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const allFriends = useMemo(
    () => [...FRIENDS, ...addedFriendsFromRitual],
    [addedFriendsFromRitual]
  );

  const friendMap = useMemo(() => {
    const acc = FRIENDS.reduce<Record<string, Friend>>((a, friend) => {
      a[friend.id] = friend;
      return a;
    }, {});
    for (const f of addedFriendsFromRitual) {
      acc[f.id] = f;
    }
    return acc;
  }, [addedFriendsFromRitual]);

  const visibleFriendIds = useMemo(
    () => allFriends.filter((f) => !unfriendedIds.includes(f.id)).map((f) => f.id),
    [allFriends, unfriendedIds]
  );
  const demoActiveInboundFriendIds = useMemo(
    () => (DEMO_OFFLINE_MODE ? visibleFriendIds.slice(0, 5) : []),
    [visibleFriendIds]
  );

  const friendIdToBackendUid = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of allFriends) {
      out[friend.id] = friend.backendUid ?? backendUidForFriendId(friend.id);
    }
    return out;
  }, [allFriends]);

  const backendUidToFriendId = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of allFriends) {
      out[friend.backendUid ?? backendUidForFriendId(friend.id)] = friend.id;
    }
    return out;
  }, [allFriends]);

  const getBackendSession = useCallback(() => {
    const uid = backendAuthUidRef.current;
    const deviceId = backendDeviceIdRef.current;
    if (!backendSessionReady || !uid || !deviceId) return null;
    return { uid, deviceId };
  }, [backendSessionReady]);

  const resolveRecipientEncryptionKeys = useCallback(
    async (recipientUids: string[]) => {
      const session = getBackendSession();
      if (!session) throw new Error("Backend session not ready.");
      const uniqueRecipients = [...new Set(recipientUids)].filter(Boolean);
      const ownBundle = await ensureLocalKeyBundle(session.uid);
      recipientKeyCacheRef.current[session.uid] = ownBundle.encryptionPublicKey;

      const missingFriendUids = uniqueRecipients.filter(
        (uid) => uid !== session.uid && !recipientKeyCacheRef.current[uid]
      );
      if (missingFriendUids.length > 0) {
        const res = await callEmulatorFunction<{
          keyBundles?: Record<string, { encryptionPublicKey?: string } | null>;
        }>("getFriendKeyBundles", {
          uid: session.uid,
          friendUids: missingFriendUids,
        });
        const bundles = res.keyBundles ?? {};
        for (const [uid, bundle] of Object.entries(bundles)) {
          const key = bundle?.encryptionPublicKey;
          if (key) recipientKeyCacheRef.current[uid] = key;
        }
      }

      const out: Record<string, string> = {};
      for (const uid of uniqueRecipients) {
        const key = recipientKeyCacheRef.current[uid];
        if (!key) throw new Error(`Missing encryption key for recipient ${uid}`);
        out[uid] = key;
      }
      return out;
    },
    [getBackendSession]
  );

  useEffect(() => {
    const session = getBackendSession();
    if (!session) return;
    const friendUids = visibleFriendIds.map((id) => friendIdToBackendUid[id] ?? backendUidForFriendId(id));
    void callEmulatorFunction("seedDemoFriendships", {
      uid: session.uid,
      deviceId: session.deviceId,
      friendUids,
    }).catch(() => {
      // Keep local UX running even if backend bridge is offline.
    });
  }, [visibleFriendIds, getBackendSession, friendIdToBackendUid]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const recipientUids = [
      session.uid,
      ...visibleFriendIds.map((id) => friendIdToBackendUid[id] ?? backendUidForFriendId(id)),
    ];
    const payload = {
      bio: myBio,
      profilePictureUrl: myProfilePictureUrl,
      updatedAt: Date.now(),
    };
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const keyMap = await resolveRecipientEncryptionKeys(recipientUids);
          const encrypted = await encryptPayloadForRecipients(session.uid, payload, keyMap);
          await callEmulatorFunction("putEncryptedProfile", {
            uid: session.uid,
            deviceId: session.deviceId,
            ...encrypted,
          });
        } catch {
          // Do not block local profile editing on backend sync failure.
        }
      })();
    }, 450);
    return () => clearTimeout(timer);
  }, [
    signedIn,
    myBio,
    myProfilePictureUrl,
    visibleFriendIds,
    getBackendSession,
    resolveRecipientEncryptionKeys,
    friendIdToBackendUid,
  ]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const tick = async () => {
      setEncryptedSyncState((current) => ({ ...current, profile: "syncing" }));
      try {
        const res = await callEmulatorFunction<{
          profile: { ciphertext: string; nonce: string; envelope: string } | null;
        }>("getEncryptedProfile", {
          uid: session.uid,
          deviceId: session.deviceId,
          targetUid: session.uid,
        });
        if (!res.profile) return;
        const plain = await decryptPayloadForRecipient<{
          bio?: string;
          profilePictureUrl?: string | null;
        }>(session.uid, res.profile.ciphertext, res.profile.nonce, res.profile.envelope);
        if (typeof plain.bio === "string") setMyBio(plain.bio);
        if (typeof plain.profilePictureUrl === "string" || plain.profilePictureUrl === null) {
          setMyProfilePictureUrl(plain.profilePictureUrl ?? null);
        }
        setEncryptedSyncState((current) => ({ ...current, profile: "ok", lastSuccessAt: Date.now() }));
      } catch {
        setEncryptedSyncState((current) => ({ ...current, profile: "error" }));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => clearInterval(id);
  }, [signedIn, getBackendSession]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const tick = async () => {
      setEncryptedSyncState((current) => ({ ...current, posts: "syncing" }));
      try {
        const res = await callEmulatorFunction<{
          items: Array<{
            postId: string;
            ownerUid: string;
            ciphertext: string;
            nonce: string;
            envelope: string;
          }>;
        }>("listEncryptedPosts", {
          uid: session.uid,
          deviceId: session.deviceId,
          limit: 400,
        });
        if (!Array.isArray(res.items)) return;
        const decoded: Post[] = [];
        for (const item of res.items) {
          try {
            const plain = await decryptPayloadForRecipient<{
              postId: string;
              authorId?: string;
              createdAt?: number;
              text?: string | null;
              imageUris?: string[] | null;
              videoUri?: string | null;
              videoPosterUri?: string | null;
            }>(session.uid, item.ciphertext, item.nonce, item.envelope);
            decoded.push({
              id: plain.postId || item.postId,
              authorId:
                plain.authorId ??
                (item.ownerUid === session.uid
                  ? CURRENT_USER_ID
                  : backendUidToFriendId[item.ownerUid] ?? item.ownerUid),
              createdAt: plain.createdAt ?? Date.now(),
              text: plain.text ?? undefined,
              imageUris: plain.imageUris ?? undefined,
              videoUri: plain.videoUri ?? undefined,
              videoPosterUri: plain.videoPosterUri ?? undefined,
            });
          } catch {
            // Skip malformed/decrypt-failed post.
          }
        }
        const backendIds = new Set(decoded.map((p) => p.id));
        setPosts((current) => {
          const now = Date.now();
          const optimisticLocalOnly = current.filter(
            (post) => !backendIds.has(post.id) && post.authorId === CURRENT_USER_ID && now - post.createdAt < 90_000
          );
          return [...decoded, ...optimisticLocalOnly].sort((a, b) => b.createdAt - a.createdAt);
        });
        setEncryptedSyncState((current) => ({ ...current, posts: "ok", lastSuccessAt: Date.now() }));
      } catch {
        setEncryptedSyncState((current) => ({ ...current, posts: "error" }));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 6000);
    return () => clearInterval(id);
  }, [signedIn, getBackendSession, backendUidToFriendId]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const knownChatIds = new Set(chats.map((chat) => chat.id));
    const tick = async () => {
      setEncryptedSyncState((current) => ({ ...current, messages: "syncing" }));
      try {
        const res = await callEmulatorFunction<{
          items: Array<{
            messageId: string;
            conversationId: string;
            senderUid: string;
            ciphertext: string;
            nonce: string;
            envelope: string;
          }>;
        }>("listEncryptedMessages", {
          uid: session.uid,
          deviceId: session.deviceId,
          limit: 700,
        });
        if (!Array.isArray(res.items)) return;
        const decoded: Message[] = [];
        for (const item of res.items) {
          try {
            const plain = await decryptPayloadForRecipient<{
              messageId: string;
              chatId: string;
              senderId?: string;
              text: string;
              createdAt: number;
              kind?: "text" | "photo" | "video" | "voice";
              mediaUri?: string | null;
              replyToMessageId?: string | null;
              broadcastThreadFriendId?: string | null;
            }>(session.uid, item.ciphertext, item.nonce, item.envelope);
            const resolvedChatId = plain.chatId || item.conversationId.replace(/^enc_/, "");
            if (!knownChatIds.has(resolvedChatId)) continue;
            decoded.push({
              id: plain.messageId || item.messageId,
              chatId: resolvedChatId,
              senderId:
                plain.senderId ??
                (item.senderUid === session.uid
                  ? CURRENT_USER_ID
                  : backendUidToFriendId[item.senderUid] ?? item.senderUid),
              text: plain.text,
              createdAt: plain.createdAt ?? Date.now(),
              kind: plain.kind ?? "text",
              mediaUri: plain.mediaUri ?? undefined,
              replyToMessageId: plain.replyToMessageId ?? undefined,
              broadcastThreadFriendId: plain.broadcastThreadFriendId ?? undefined,
            });
          } catch {
            // Skip malformed/decrypt-failed message.
          }
        }
        const backendIds = new Set(decoded.map((m) => m.id));
        setMessages((current) => {
          const now = Date.now();
          const optimisticLocalOnly = current.filter(
            (message) =>
              !backendIds.has(message.id) &&
              message.senderId === CURRENT_USER_ID &&
              now - message.createdAt < 120_000
          );
          return [...decoded, ...optimisticLocalOnly].sort((a, b) => {
            if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
            return a.id.localeCompare(b.id);
          });
        });
        setEncryptedSyncState((current) => ({ ...current, messages: "ok", lastSuccessAt: Date.now() }));
      } catch {
        setEncryptedSyncState((current) => ({ ...current, messages: "error" }));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 4500);
    return () => clearInterval(id);
  }, [signedIn, getBackendSession, backendUidToFriendId, chats]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    void (async () => {
      try {
        const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
          uid: session.uid,
        });
        const friendUids = (friendsRes.friendUids ?? []).filter(Boolean);
        if (friendUids.length === 0) return;
        const profilesRes = await callEmulatorFunction<{
          profiles?: Record<string, { username?: string; bio?: string; profilePictureUrl?: string | null } | null>;
        }>("getUserProfiles", {
          uid: session.uid,
          targetUids: friendUids,
        });
        const profiles = profilesRes.profiles ?? {};
        const mapped: Friend[] = friendUids.map((uid) => {
          const profile = profiles[uid] ?? {};
          const friendId = backendUidForFriendId(uid);
          return {
            id: friendId,
            backendUid: uid,
            displayName: profile?.username?.trim() || "",
            online: true,
            profilePictureUrl: profile?.profilePictureUrl || "",
            bio: profile?.bio || "",
            messageCount: 0,
          };
        }).filter((f) => {
          // Exclude legacy/demo placeholder records that don't have a real profile.
          const hasProfileIdentity = f.displayName.trim().length > 0;
          const looksLikeLegacySeed = (f.backendUid ?? "").startsWith("f_");
          return hasProfileIdentity && !looksLikeLegacySeed;
        });
        setAddedFriendsFromRitual((current) => {
          const existing = new Set(current.map((f) => f.id));
          const additions = mapped.filter((f) => !existing.has(f.id));
          return additions.length ? [...current, ...additions] : current;
        });
        setFriendLinksState((current) => {
          let next = current;
          for (const f of mapped) {
            next = addUndirectedEdge(next, CURRENT_USER_ID, f.id);
          }
          return next;
        });
      } catch {
        // Ignore hydration failures in prototype mode.
      }
    })();
  }, [signedIn, getBackendSession]);

  /** Top icon strip: only the screen you’re on is highlighted (friend profile / chat: none). */
  const homeNavIconHighlight = useMemo(() => {
    const screen = view.screen;
    const onHome = screen === "home";
    return {
      chats: onHome && homeTab === "chats",
      feed: onHome && homeTab === "feed",
      myProfile: screen === "myProfile",
      friendsList: screen === "friendsList",
      addFriend: screen === "addFriend",
    };
  }, [view.screen, homeTab]);

  const isFriendFeedMuted = useCallback(
    (friendId: string) => {
      const until = feedMutedUntilByFriendId[friendId];
      if (until === undefined) return false;
      if (until === null) return true;
      return until > Date.now();
    },
    [feedMutedUntilByFriendId]
  );

  const sortedVisiblePosts = useMemo(
    () =>
      [...posts]
        .filter(isPostAlive)
        .sort((a, b) => b.createdAt - a.createdAt),
    [posts]
  );

  const feedPosts = useMemo(
    () =>
      sortedVisiblePosts.filter(
        (post) =>
          post.authorId === CURRENT_USER_ID ||
          (visibleFriendIds.includes(post.authorId) && !isFriendFeedMuted(post.authorId))
      ),
    [sortedVisiblePosts, visibleFriendIds, isFriendFeedMuted]
  );

  const myProfilePosts = useMemo(
    () => sortedVisiblePosts.filter((post) => post.authorId === CURRENT_USER_ID),
    [sortedVisiblePosts]
  );

  const myProfileMediaPosts = useMemo(
    () => myProfilePosts.filter((post) => (post.imageUris?.length ?? 0) > 0),
    [myProfilePosts]
  );

  const friendProfilePosts = useMemo(() => {
    if (view.screen !== "friendProfile") return [];
    return sortedVisiblePosts.filter((post) => post.authorId === view.friendId);
  }, [sortedVisiblePosts, view]);

  const friendProfileMediaPosts = useMemo(
    () => friendProfilePosts.filter((post) => (post.imageUris?.length ?? 0) > 0),
    [friendProfilePosts]
  );

  const postGridLayout = useMemo(() => {
    const cols = 3;
    const gap = 2;
    const inner = windowWidth - 28;
    const cell = Math.floor((inner - gap * (cols - 1)) / cols);
    return { cols, gap, cell };
  }, [windowWidth]);

  const joinCutoffForViewer = (chat: Chat | null | undefined) =>
    chat?.memberJoinedAt?.[CURRENT_USER_ID] ?? 0;

  const lastMessageByChatId = useMemo(() => {
    const result: Record<string, Message | undefined> = {};
    for (const message of messages) {
      if (message.hiddenFromOwner) continue;
      const chat = chats.find((c) => c.id === message.chatId);
      if (message.createdAt < joinCutoffForViewer(chat ?? null)) continue;
      const current = result[message.chatId];
      if (!current || current.createdAt < message.createdAt) {
        result[message.chatId] = message;
      }
    }
    return result;
  }, [messages, chats]);

  const sortedChats = useMemo(() => {
    const mine = chats.filter((c) => c.memberIds.includes(CURRENT_USER_ID));
    return [...mine].sort((a, b) => {
      const aTs = lastMessageByChatId[a.id]?.createdAt ?? a.updatedAt;
      const bTs = lastMessageByChatId[b.id]?.createdAt ?? b.updatedAt;
      return bTs - aTs;
    });
  }, [chats, lastMessageByChatId]);

  /** Chats whose participants (except you) are still “friends” for this account (see `unfriendedIds`). */
  const visibleSortedChats = useMemo(() => {
    return sortedChats.filter((c) => {
      const others = c.memberIds.filter((id) => id !== CURRENT_USER_ID);
      return others.every((id) => {
        if (!id.startsWith("f")) return true;
        return !unfriendedIds.includes(id);
      });
    });
  }, [sortedChats, unfriendedIds]);

  const pendingDraft =
    view.screen === "chat" && "pendingDraft" in view ? view.pendingDraft : null;

  const resolvedChat = useMemo(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return null;
    return chats.find((c) => c.id === view.chatId) ?? null;
  }, [chats, view]);

  const messageById = useMemo(
    () =>
      messages.reduce<Record<string, Message>>((acc, message) => {
        acc[message.id] = message;
        return acc;
      }, {}),
    [messages]
  );

  const activeChatKind = (resolvedChat?.kind ?? pendingDraft?.kind ?? "standard") as
    | "standard"
    | "broadcast";
  const chatScreenTitle = pendingDraft?.name ?? resolvedChat?.name ?? "Chat";
  const broadcastMemberCount =
    resolvedChat?.kind === "broadcast"
      ? resolvedChat.broadcastRecipientIds?.length ??
        resolvedChat.memberIds.filter((id) => id !== CURRENT_USER_ID).length
      : 0;
  const chatScreenTitleWithCount =
    resolvedChat?.kind === "broadcast" && (resolvedChat.createdBy ?? CURRENT_USER_ID) === CURRENT_USER_ID
      ? `${chatScreenTitle} (${broadcastMemberCount})`
      : chatScreenTitle;
  const activeCounterpartIds = (resolvedChat?.memberIds ?? pendingDraft?.memberIds ?? []).filter(
    (id) => id !== CURRENT_USER_ID
  );
  const canEditActiveGroupMeta =
    !!resolvedChat &&
    (resolvedChat.createdBy ?? CURRENT_USER_ID) === CURRENT_USER_ID &&
    (activeChatKind === "broadcast" || activeCounterpartIds.length > 1);
  const activeHeaderPicture =
    resolvedChat?.profilePicture ??
    pendingDraft?.profilePicture ??
    (activeChatKind === "broadcast" ? "📣" : activeCounterpartIds.length > 1 ? "^" : "");

  const messageActionTarget = messageActionTargetId ? messageById[messageActionTargetId] : undefined;
  const replyTargetMessage = replyTargetMessageId ? messageById[replyTargetMessageId] : undefined;
  const editingMessage = editingMessageId ? messageById[editingMessageId] : undefined;
  const selectedBroadcastGroup = selectedBroadcastGroupId
    ? savedBroadcastGroups.find((group) => group.id === selectedBroadcastGroupId)
    : undefined;

  const buildComposerHeaderTitle = () => {
    if (composerMode === "broadcast") {
      return composerCustomTitle.trim() || "Broadcast";
    }
    if (composerCustomTitle.trim()) {
      return composerCustomTitle.trim();
    }
    if (selectedComposerIds.length === 0) return "Start Chat";
    return buildDefaultChatName(selectedComposerIds);
  };

  const eligibleFriendsToAdd = useMemo(() => {
    if (!resolvedChat || resolvedChat.kind === "broadcast" || resolvedChat.isDraft) return [];
    const chat = resolvedChat;
    const memberSet = new Set(chat.memberIds);
    const peers = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    return allFriends.filter((friend) => {
      if (unfriendedIds.includes(friend.id)) return false;
      if (memberSet.has(friend.id)) return false;
      return peers.every((pid) => (friendLinksState[pid] ?? []).includes(friend.id));
    });
  }, [resolvedChat, unfriendedIds, allFriends, friendLinksState]);

  const filteredFriendsToAdd = useMemo(() => {
    const q = addMemberSearch.trim().toLowerCase();
    if (!q) return eligibleFriendsToAdd;
    return eligibleFriendsToAdd.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [eligibleFriendsToAdd, addMemberSearch]);

  const activeChatMessages = useMemo(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return [];
    const chatId = view.chatId;
    const chat = chats.find((c) => c.id === chatId);
    const cutoff = joinCutoffForViewer(chat ?? null);
    const all = messages
      .filter((message) => message.chatId === chatId)
      .filter((message) => !message.hiddenFromOwner)
      .filter((message) => message.createdAt >= cutoff)
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
        return a.id.localeCompare(b.id);
      });
    const query = chatSearch.trim().toLowerCase();
    if (!query) return all;
    return all.filter((message) => message.text.toLowerCase().includes(query));
  }, [chatSearch, chats, messages, view]);

  /** Newest first — required for `inverted` FlatList (latest sits at bottom, scroll up for older). */
  const invertedChatMessages = useMemo(
    () => [...activeChatMessages].reverse(),
    [activeChatMessages]
  );

  /**
   * Start Chat modal: selected members are pinned to the top (always visible).
   * Search filters only the unselected pool. Standard mode applies mutual-friendship rules dynamically.
   */
  const availableComposerFriends = useMemo(() => {
    const base = allFriends.filter((f) => !unfriendedIds.includes(f.id));
    const q = composerSearch.trim().toLowerCase();
    const nameMatches = (f: Friend) =>
      !q || f.displayName.toLowerCase().includes(q);

    const selectedRows = selectedComposerIds
      .map((id) => base.find((f) => f.id === id))
      .filter((f): f is Friend => !!f);

    const linkedToAllSelected = (candidateId: string, selection: string[]) => {
      if (selection.length === 0) return true;
      return selection.every((sid) => (friendLinksState[sid] ?? []).includes(candidateId));
    };

    if (composerMode === "broadcast") {
      const rest = base
        .filter((f) => !selectedComposerIds.includes(f.id))
        .filter(nameMatches)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return [...selectedRows, ...rest];
    }

    const rest = base
      .filter((f) => !selectedComposerIds.includes(f.id))
      .filter((f) => linkedToAllSelected(f.id, selectedComposerIds))
      .filter(nameMatches)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return [...selectedRows, ...rest];
  }, [composerMode, composerSearch, selectedComposerIds, unfriendedIds, allFriends, friendLinksState]);

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

  const allFriendsSortedAlphabetically = useMemo(
    () =>
      allFriends
        .filter((f) => !unfriendedIds.includes(f.id))
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [unfriendedIds, allFriends]
  );

  const friendsListFiltered = useMemo(() => {
    const q = friendsListSearch.trim().toLowerCase();
    if (!q) return allFriendsSortedAlphabetically;
    return allFriendsSortedAlphabetically.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [allFriendsSortedAlphabetically, friendsListSearch]);

  const onlineStripLayout = useMemo(() => {
    const avail = windowWidth - ONLINE_STRIP_EDGE_PAD * 2;
    const slotWidth = avail / ONLINE_VISIBLE_SLOTS;
    /** Large within each equal slot; clip view hides column 7+ without extra gaps. */
    const avatarSize = Math.min(46, Math.max(34, Math.floor(slotWidth * 0.88)));
    return { avail, slotWidth, avatarSize };
  }, [windowWidth]);

  const onlineStripContentStyle = useMemo(() => {
    const base = {
      paddingTop: 4,
      paddingBottom: 6,
      alignItems: "center" as const,
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

  const resetLocalSocialStateForSignedOut = useCallback(() => {
    const allSeedIds = FRIENDS.map((f) => f.id);
    setChats([]);
    setMessages([]);
    setPosts([]);
    setUnfriendedIds(allSeedIds);
    setFriendLinksState(cloneFriendLinks(FRIEND_LINKS));
    setAddedFriendsFromRitual([]);
    setFeedMutedUntilByFriendId({});
    setMyBio("");
    setMyBioTextEntryOpen(true);
    setMyProfilePictureUrl(null);
    void AsyncStorage.removeItem(POSTS_STORAGE_KEY);
  }, []);

  const resetLocalStateForCurrentUser = useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    resetLocalSocialStateForSignedOut();
    setView({ screen: "home" });
    setHomeTab("feed");
    if (email) {
      void AsyncStorage.removeItem(postsStorageKeyForEmail(email));
      void AsyncStorage.removeItem(socialMessagingStorageKeyForEmail(email));
    }
    logAppEvent("local_state.reset_current_user", { email: email ?? "" });
  }, [resetLocalSocialStateForSignedOut]);

  const initializeBackendSessionForAccount = useCallback(async (account: MockAuthAccount) => {
    const uid = backendUidForEmail(account.email);
    const deviceId = await getOrCreateBackendDeviceId();
    const ownBundle = await ensureLocalKeyBundle(uid);
    await callEmulatorFunction("claimDeviceSession", {
      uid,
      deviceId,
    });

    const emailGuess = emailLocalPartGuess(account.email);
    let resolvedUsername =
      account.username.trim() || emailGuess.slice(0, 1).toUpperCase() + emailGuess.slice(1) || "User";
    let resolvedBio = (account.bio || "").trim() || `${resolvedUsername}' profile.`;
    let resolvedPicture: string | null = account.profilePictureUrl ?? null;
    try {
      const persistedUsername = (await AsyncStorage.getItem(profileUsernameStorageKey(account.email)))?.trim() ?? "";
      let self: { username?: string; bio?: string; profilePictureUrl?: string | null } | null | undefined = null;
      try {
        const profilesRes = await callEmulatorFunction<{
          profiles?: Record<string, { username?: string; bio?: string; profilePictureUrl?: string | null } | null>;
        }>("getUserProfiles", {
          uid,
          targetUids: [uid],
        });
        self = profilesRes.profiles?.[uid] ?? null;
      } catch {
        /* first claim */
      }
      if (persistedUsername) {
        resolvedUsername = persistedUsername;
      } else if (self) {
        const su = (self.username ?? "").trim();
        if (su && su.toLowerCase() !== "friend") {
          resolvedUsername = su;
        }
      }
      if (self) {
        const sb = (self.bio ?? "").trim();
        if (sb) resolvedBio = sb;
        if (typeof self.profilePictureUrl === "string" && self.profilePictureUrl.trim()) {
          resolvedPicture = self.profilePictureUrl.trim();
        }
      }
    } catch {
      /* keep defaults */
    }
    void AsyncStorage.setItem(profileUsernameStorageKey(account.email), resolvedUsername).catch(() => {});

    await callEmulatorFunction("publishUserKeyBundle", {
      uid,
      deviceId,
      keyVersion: ownBundle.keyVersion,
      encryptionPublicKey: ownBundle.encryptionPublicKey,
      identitySigningPublicKey: ownBundle.identitySigningPublicKey,
    });
    await callEmulatorFunction("upsertUserProfile", {
      uid,
      deviceId,
      username: resolvedUsername,
      bio: resolvedBio,
      profilePictureUrl: resolvedPicture,
      phoneNumber: account.phoneNumber,
    });
    backendAuthUidRef.current = uid;
    backendDeviceIdRef.current = deviceId;
    setTelemetryContext({ uid, deviceId });
    recipientKeyCacheRef.current = { [uid]: ownBundle.encryptionPublicKey };
    setBackendSessionReady(true);
    setEncryptedSyncState({ profile: "syncing", posts: "syncing", messages: "syncing", lastSuccessAt: null });
  }, []);

  const retryInitializeBackendForAccount = useCallback(
    async (account: MockAuthAccount) => {
      try {
        await initializeBackendSessionForAccount(account);
        setEncryptedSyncState({ profile: "syncing", posts: "syncing", messages: "syncing", lastSuccessAt: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? "");
        Alert.alert(
          "Still offline",
          msg.length > 0 && msg.length < 160 ? msg : "Could not reach the server yet. Try again when you have a connection."
        );
      }
    },
    [initializeBackendSessionForAccount]
  );

  const isRestoringAuthRef = useRef(false);
  const signedInRef = useRef(false);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  const applySignedInAccount = useCallback(
    async (account: MockAuthAccount) => {
      const allSeedIds = FRIENDS.map((f) => f.id);
      const hasSeedGraph = !!(account.seedFriendIds && account.seedFriendIds.length > 0);
      const demoGraph = DEMO_OFFLINE_MODE && hasSeedGraph ? buildDemoChatsAndMessages(account.seedFriendIds ?? []) : null;
      let nextChats: Chat[] = demoGraph ? demoGraph.chats : hasSeedGraph ? INITIAL_CHATS : [];
      let nextMessages: Message[] = demoGraph ? demoGraph.messages : hasSeedGraph ? ALL_INITIAL_MESSAGES : [];
      const nextUnfriendedIds =
        account.seedFriendIds && account.seedFriendIds.length > 0
          ? allSeedIds.filter((id) => !account.seedFriendIds!.includes(id))
          : allSeedIds;
      const emailKey = account.email.trim().toLowerCase();

      let restoredView: ViewState = { screen: "home" };
      let restoredHomeTab: "feed" | "chats" = "feed";
      let nextPosts: Post[] =
        DEMO_OFFLINE_MODE && hasSeedGraph
          ? buildDemoPostsForFriends(account.seedFriendIds ?? [])
          : hasSeedGraph
            ? INITIAL_POSTS
            : [];
      try {
        const [rawView, rawTab, rawPosts, rawSocial] = await Promise.all([
          AsyncStorage.getItem(lastViewStorageKey(emailKey)),
          AsyncStorage.getItem(lastHomeTabStorageKey(emailKey)),
          AsyncStorage.getItem(postsStorageKeyForEmail(emailKey)),
          AsyncStorage.getItem(socialMessagingStorageKeyForEmail(emailKey)),
        ]);
        if (!hasSeedGraph && !demoGraph && rawSocial) {
          try {
            const parsedSocial = JSON.parse(rawSocial) as { chats?: unknown; messages?: unknown };
            if (Array.isArray(parsedSocial.chats)) {
              nextChats = parsedSocial.chats as Chat[];
            }
            if (Array.isArray(parsedSocial.messages)) {
              nextMessages = parsedSocial.messages as Message[];
            }
          } catch {
            /* ignore */
          }
        }
        const chatIdSet = new Set(nextChats.map((c) => c.id));
        if (rawView) {
          const parsed = parseStoredViewState(rawView, chatIdSet);
          if (parsed) restoredView = parsed;
        }
        if (rawTab === "chats" || rawTab === "feed") {
          restoredHomeTab = rawTab;
        }
        if (!hasSeedGraph && rawPosts) {
          try {
            const parsedPosts = JSON.parse(rawPosts) as Post[];
            if (Array.isArray(parsedPosts)) {
              nextPosts = parsedPosts;
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        // ignore malformed or missing storage
      }

      // Prevent data bleed across accounts: reset local social timeline state on every sign-in.
      setChats(nextChats);
      setMessages(nextMessages);
      setPosts(nextPosts);
      setUnfriendedIds(nextUnfriendedIds);
      setFriendLinksState(cloneFriendLinks(FRIEND_LINKS));
      setAddedFriendsFromRitual([]);
      setFeedMutedUntilByFriendId({});
      setMyBio(account.bio);
      setMyBioTextEntryOpen(!account.bio.trim());
      setMyProfilePictureUrl(account.profilePictureUrl);

      // Stay in the app shell while the backend session is (re)claimed — Firebase already persisted the user.
      setSignedIn(true);
      signedInRef.current = true;
      setAuthMode("login");
      setView(restoredView);
      setHomeTab(restoredView.screen === "home" ? restoredHomeTab : "feed");
      if (DEMO_OFFLINE_MODE) {
        const queue = account.username === "User A" ? DEMO_USER_A_ONLY_FRIEND_IDS.slice(0, 20) : DEMO_USER_B_ONLY_FRIEND_IDS.slice(0, 20);
        setDemoPendingAddableQueue(queue);
      }

      if (DEMO_OFFLINE_MODE) {
        backendAuthUidRef.current = `demo-${account.username.toLowerCase().replace(/\s+/g, "-")}`;
        backendDeviceIdRef.current = "demo-offline-device";
        setTelemetryContext({ uid: backendAuthUidRef.current, deviceId: backendDeviceIdRef.current });
        setBackendSessionReady(true);
        setEncryptedSyncState({ profile: "ok", posts: "ok", messages: "ok", lastSuccessAt: Date.now() });
        return;
      }

      try {
        await initializeBackendSessionForAccount(account);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? "");
        backendAuthUidRef.current = null;
        backendDeviceIdRef.current = null;
        setTelemetryContext({ uid: null, deviceId: null });
        setBackendSessionReady(false);
        setEncryptedSyncState({ profile: "error", posts: "error", messages: "error", lastSuccessAt: null });
        const retry = () => void retryInitializeBackendForAccount(account);
        const buttons = [
          { text: "Retry", onPress: retry },
          { text: "Logout", style: "destructive" as const, onPress: () => logoutRef.current() },
        ];
        if (/already active on another device|active session belongs to a different device|permission-denied/i.test(message)) {
          Alert.alert(
            "Session in use",
            "This account may be active on another device. Retry here, or tap Logout to sign out on this phone.",
            buttons
          );
        } else {
          Alert.alert(
            "Connection issue",
            "Could not reach the server. You remain signed in on this device — use Retry when you have a signal, or Logout to use a different account.",
            buttons
          );
        }
      }
    },
    [initializeBackendSessionForAccount, retryInitializeBackendForAccount]
  );

  const applySignedInAccountRef = useRef(applySignedInAccount);
  applySignedInAccountRef.current = applySignedInAccount;

  useEffect(() => {
    if (DEMO_OFFLINE_MODE) {
      markAppBootAuthResolved();
      return () => {};
    }
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user?.email) {
        if (signedInRef.current) {
          const navEmail = sessionEmailRef.current;
          if (navEmail) {
            void AsyncStorage.removeItem(lastViewStorageKey(navEmail)).catch(() => {
              /* ignore */
            });
            void AsyncStorage.removeItem(lastHomeTabStorageKey(navEmail)).catch(() => {
              /* ignore */
            });
          }
          sessionEmailRef.current = null;
          sessionTokenRef.current = null;
          resetLocalSocialStateForSignedOut();
          signedInRef.current = false;
          isRestoringAuthRef.current = false;
          backendAuthUidRef.current = null;
          backendDeviceIdRef.current = null;
          setTelemetryContext({ uid: null, deviceId: null });
          setBackendSessionReady(false);
          setSignedIn(false);
          setView({ screen: "home" });
          setAuthMode("login");
          setEncryptedSyncState({ profile: "idle", posts: "idle", messages: "idle", lastSuccessAt: null });
        }
        markAppBootAuthResolved();
        return;
      }
      if (signedInRef.current || isRestoringAuthRef.current) return;
      isRestoringAuthRef.current = true;
      const restoredEmail = user.email;
      void (async () => {
        try {
          if (!restoredEmail) return;
          const email = restoredEmail.trim().toLowerCase();
          sessionEmailRef.current = email;
          const account: MockAuthAccount = {
            email,
            password: "",
            username: email.split("@")[0] ?? "User",
            phoneNumber: "",
            bio: "New profile.",
            profilePictureUrl: null,
          };
          logAppEvent("auth.restore_session", { email });
          await applySignedInAccountRef.current(account);
        } catch {
          Alert.alert("Session error", "Could not restore your signed-in session. Please try again.");
        } finally {
          isRestoringAuthRef.current = false;
          markAppBootAuthResolved();
        }
      })();
    });
    return () => unsub();
  }, [resetLocalSocialStateForSignedOut, markAppBootAuthResolved]);

  const logout = () => {
    const email = sessionEmailRef.current;
    if (email) {
      void AsyncStorage.removeItem(lastViewStorageKey(email)).catch(() => {
        /* ignore */
      });
      void AsyncStorage.removeItem(lastHomeTabStorageKey(email)).catch(() => {
        /* ignore */
      });
    }
    resetLocalSocialStateForSignedOut();
    logAppEvent("auth.logout", { email: email ?? "" });
    sessionTokenRef.current = null;
    sessionEmailRef.current = null;
    const releaseUid = backendAuthUidRef.current;
    const releaseDeviceId = backendDeviceIdRef.current;
    if (releaseUid && releaseDeviceId) {
      void callEmulatorFunction("releaseDeviceSession", {
        uid: releaseUid,
        deviceId: releaseDeviceId,
      }).catch(() => {
        /* ignore */
      });
    }
    backendAuthUidRef.current = null;
    backendDeviceIdRef.current = null;
    setTelemetryContext({ uid: null, deviceId: null });
    recipientKeyCacheRef.current = {};
    setBackendSessionReady(false);
    setEncryptedSyncState({ profile: "idle", posts: "idle", messages: "idle", lastSuccessAt: null });
    setSignedIn(false);
    setView({ screen: "home" });
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setMediaModalOpen(false);
    setAuthMode("login");
    setIssuedOtpCode(null);
    setIssuedOtpForEmail(null);
    setSignupOtp("");
    setLoginOtp("");
    if (!DEMO_OFFLINE_MODE) {
      void signOut(firebaseAuth).catch(() => {
        // Ignore sign-out errors in prototype mode.
      });
    }
  };
  logoutRef.current = logout;

  /** Another device replaced this session — clear UI only; do not DELETE the shared ledger (other phone owns it). */
  const logoutFromSessionReplaced = () => {
    const navEmail = sessionEmailRef.current;
    if (navEmail) {
      void AsyncStorage.removeItem(lastViewStorageKey(navEmail)).catch(() => {
        /* ignore */
      });
      void AsyncStorage.removeItem(lastHomeTabStorageKey(navEmail)).catch(() => {
        /* ignore */
      });
    }
    resetLocalSocialStateForSignedOut();
    logAppEvent("auth.session_replaced", {});
    sessionTokenRef.current = null;
    sessionEmailRef.current = null;
    backendAuthUidRef.current = null;
    backendDeviceIdRef.current = null;
    setTelemetryContext({ uid: null, deviceId: null });
    recipientKeyCacheRef.current = {};
    setBackendSessionReady(false);
    setEncryptedSyncState({ profile: "idle", posts: "idle", messages: "idle", lastSuccessAt: null });
    setSignedIn(false);
    setView({ screen: "home" });
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setMediaModalOpen(false);
    setAuthMode("login");
    setIssuedOtpCode(null);
    setIssuedOtpForEmail(null);
    setSignupOtp("");
    setLoginOtp("");
  };

  useEffect(() => {
    if (!signedIn || !shouldPollMockSession()) return;
    const tick = async () => {
      const email = sessionEmailRef.current;
      const mine = sessionTokenRef.current;
      if (!email || !mine) return;
      const remote = await readLedgerSessionToken(email, mine);
      if (remote !== mine) {
        // Product requirement: never sign users out automatically.
        // Keep session alive and show an informational warning at most once per minute.
        const now = Date.now();
        if (now - sessionConflictNoticeAtRef.current > 60_000) {
          sessionConflictNoticeAtRef.current = now;
          Alert.alert(
            "Session notice",
            "Another device appears to have signed in, but you remain signed in on this phone until you press Logout."
          );
        }
      }
    };
    const id = setInterval(() => void tick(), MOCK_SESSION_POLL_MS);
    void tick();
    return () => clearInterval(id);
  }, [signedIn]);

  const completeLoginAfterPassword = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      logAppEvent("auth.login_ok", { email });
    } catch (e) {
      logAppError("auth.login", e, { email });
      const message = e instanceof Error ? e.message : "Could not sign in.";
      Alert.alert("Login failed", message);
      return;
    }
    const account: MockAuthAccount = {
      email,
      password,
      username: email.split("@")[0] ?? "User",
      phoneNumber: "",
      bio: "New profile.",
      profilePictureUrl: null,
    };
    sessionEmailRef.current = account.email;
    await applySignedInAccount(account);
  };

  const login = async () => {
    if (DEMO_OFFLINE_MODE) {
      const username = loginEmail.trim();
      const password = loginPassword;
      const account = DEMO_OFFLINE_ACCOUNTS.find(
        (a) => a.username.toLowerCase() === username.toLowerCase() && a.password === password
      );
      if (!account) {
        Alert.alert("Login failed", "Use User A / 1234 or User B / 5678 in demo mode.");
        return;
      }
      sessionEmailRef.current = account.email;
      await applySignedInAccount(account);
      return;
    }
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) {
      Alert.alert("Login failed", "Enter email and password.");
      return;
    }
    try {
      const res = await callEmulatorFunction<{ debugCode?: string }>("requestEmailOtp", {
        email,
        purpose: "login",
      });
      setIssuedOtpCode(String(res.debugCode ?? ""));
      setIssuedOtpForEmail(email);
      setLoginOtp("");
      setAuthMode("loginOtp");
      Alert.alert("OTP sent", res.debugCode ? `Test OTP for ${email}: ${res.debugCode}` : `OTP sent to ${email}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not request OTP.";
      logAppError("auth.request_login_otp", e, { email });
      if (/wait before requesting another otp|resource-exhausted/i.test(message)) {
        Alert.alert("Please wait", "You can request a new OTP in a few seconds.");
        return;
      }
      Alert.alert("OTP error", message);
      return;
    }
  };

  const completeLoginWithOtp = async () => {
    if (DEMO_OFFLINE_MODE) return;
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    const otp = loginOtp.trim();
    if (!email || !password || !otp) {
      Alert.alert("Missing fields", "Enter email, password, and OTP.");
      return;
    }
    if (issuedOtpForEmail && issuedOtpForEmail !== email) {
      Alert.alert("OTP mismatch", "Request a new OTP for this email.");
      return;
    }
    try {
      await callEmulatorFunction("verifyEmailOtp", {
        email,
        purpose: "login",
        code: otp,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not verify OTP.";
      if (/OTP already used|OTP expired|Incorrect OTP/i.test(message)) {
        setLoginOtp("");
        setAuthMode("login");
        Alert.alert("OTP invalid", "Request a new OTP and try again.");
        return;
      }
      if (/too many otp attempts|resource-exhausted/i.test(message)) {
        setLoginOtp("");
        setAuthMode("login");
        Alert.alert("Too many attempts", "Request a new OTP and try again.");
        return;
      }
      Alert.alert("OTP error", message);
      return;
    }
    await completeLoginAfterPassword(email, password);
  };

  const requestSignupOtp = async () => {
    const email = signupEmail.trim().toLowerCase();
    const phone = signupPhoneNumber.trim();
    if (!email || !phone) {
      Alert.alert("Missing details", "Enter your email and phone number before requesting OTP.");
      return;
    }
    let generated = "";
    try {
      const res = await callEmulatorFunction<{ debugCode?: string }>("requestEmailOtp", {
        email,
        purpose: "signup",
      });
      generated = String(res.debugCode ?? "");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not request OTP.";
      logAppError("auth.request_otp", e, { email });
      if (/wait before requesting another otp|resource-exhausted/i.test(message)) {
        Alert.alert("Please wait", "You can request a new OTP in a few seconds.");
        return;
      }
      Alert.alert("OTP error", message);
      return;
    }
    setIssuedOtpCode(generated);
    setIssuedOtpForEmail(email);
    setSignupOtp("");
    setAuthMode("signupOtp");
    Alert.alert("OTP sent", generated ? `Test OTP for ${email}: ${generated}` : `OTP sent to ${email}.`);
  };

  const startSignup = () => {
    if (DEMO_OFFLINE_MODE) {
      Alert.alert("Demo mode", "Signup is disabled in demo mode. Use User A / 1234 or User B / 5678.");
      return;
    }
    const email = signupEmail.trim().toLowerCase();
    const password = signupPassword;
    const passwordConfirm = signupPasswordConfirm;
    const username = signupUsername.trim();
    const phone = signupPhoneNumber.trim();
    if (!email || !password || !passwordConfirm || !username || !phone) {
      Alert.alert(
        "Missing fields",
        "Complete email, username, phone number, password, and confirm password."
      );
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      Alert.alert("Invalid email", "Use a valid email format, for example name@example.com.");
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert("Passwords do not match", "Re-enter password must match your desired password.");
      return;
    }
    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      Alert.alert(
        "Weak password",
        "Use at least 8 characters, including upper and lower case letters, at least one number, and at least one special character."
      );
      return;
    }
    void requestSignupOtp();
  };

  const completeSignupWithOtp = async () => {
    if (DEMO_OFFLINE_MODE) return;
    const email = signupEmail.trim().toLowerCase();
    const password = signupPassword;
    const username = signupUsername.trim();
    const phone = signupPhoneNumber.trim();
    const otp = signupOtp.trim();
    if (!email || !password || !username || !phone || !otp) {
      Alert.alert("Missing fields", "Complete email, password, username, phone, and OTP.");
      return;
    }
    if (!issuedOtpCode || issuedOtpForEmail !== email) {
      Alert.alert("OTP required", "Request an OTP for this email before signing up.");
      return;
    }
    if (otp !== issuedOtpCode) {
      Alert.alert("Incorrect OTP", "The OTP code does not match.");
      return;
    }
    try {
      await callEmulatorFunction("verifyEmailOtp", {
        email,
        purpose: "signup",
        code: otp,
      });
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not complete signup.";
      logAppError("auth.signup_verify", e, { email });
      if (
        /OTP already used/i.test(message) ||
        /OTP expired/i.test(message) ||
        /Incorrect OTP/i.test(message)
      ) {
        setSignupOtp("");
        setIssuedOtpCode("");
        setIssuedOtpForEmail("");
        setAuthMode("signup");
        Alert.alert("OTP expired", "Your OTP can only be used once. Request a new OTP and try again.");
        return;
      }
      if (/too many otp attempts|resource-exhausted/i.test(message)) {
        setSignupOtp("");
        Alert.alert("Too many attempts", "Request a new OTP and try again.");
        return;
      }
      Alert.alert("Signup failed", message);
      return;
    }
    const account: MockAuthAccount = {
      email,
      password,
      username,
      phoneNumber: phone,
      bio: `${username} test profile.`,
      profilePictureUrl: null,
    };
    sessionEmailRef.current = account.email;
    try {
      await AsyncStorage.setItem(profileUsernameStorageKey(email), username.trim());
    } catch {
      /* ignore */
    }
    await applySignedInAccount(account);
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedComposerIds((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
    if (composerMode === "broadcast") {
      setSelectedBroadcastGroupId(null);
    }
  };

  const toggleSelectAllBroadcast = () => {
    if (selectedComposerIds.length === allFriends.length) {
      setSelectedComposerIds([]);
    } else {
      setSelectedComposerIds(allFriends.map((friend) => friend.id));
    }
    setSelectedBroadcastGroupId(null);
  };

  const applySavedBroadcastGroup = (group: SavedBroadcastGroup) => {
    setSelectedComposerIds(group.memberIds);
    setSelectedBroadcastGroupId(group.id);
    setComposerCustomTitle(group.name);
    setBroadcastGroupDropdownOpen(false);
  };

  const continueToBroadcastDraft = (ids: string[], fallbackName?: string) => {
    const memberIds = [CURRENT_USER_ID, ...ids];
    goToPendingDraftChat({
      memberIds,
      name: composerCustomTitle.trim() || fallbackName || "Broadcast",
      profilePicture: "📣",
      kind: "broadcast",
      createdBy: CURRENT_USER_ID,
      broadcastRecipientIds: ids,
    });
    closeBroadcastPicker();
  };

  const commitSavedBroadcastGroupAndContinue = (
    ids: string[],
    name: string,
    existingGroupId: string | null
  ) => {
    if (existingGroupId) {
      setSavedBroadcastGroups((current) =>
        current.map((g) =>
          g.id === existingGroupId ? { ...g, memberIds: ids, name } : g
        )
      );
      setSelectedBroadcastGroupId(existingGroupId);
    } else {
      const group: SavedBroadcastGroup = {
        id: `bg-${Date.now()}`,
        name,
        memberIds: ids,
      };
      setSavedBroadcastGroups((current) => [group, ...current]);
      setSelectedBroadcastGroupId(group.id);
    }
    setSaveBroadcastGroupNameModalOpen(false);
    setPendingBroadcastCreateIds(null);
    continueToBroadcastDraft(ids, name);
  };

  const handleBroadcastGroupNameConfirm = () => {
    const ids = pendingBroadcastCreateIds;
    if (!ids) return;
    const name = broadcastGroupNameDraft.trim() || "Saved Group";
    const existing = savedBroadcastGroups.find(
      (g) => g.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      Alert.alert("That group name already exists", "Do you want to overwrite?", [
        { text: "No", style: "cancel" },
        {
          text: "Yes",
          onPress: () => commitSavedBroadcastGroupAndContinue(ids, name, existing.id),
        },
      ]);
      return;
    }
    commitSavedBroadcastGroupAndContinue(ids, name, null);
  };

  const closeComposer = () => {
    setChatComposerOpen(false);
    setComposerSearch("");
    setSelectedComposerIds([]);
    setComposerCustomTitle("");
    setCreateGroupPictureUri(null);
    setSelectedBroadcastGroupId(null);
    setBroadcastGroupDropdownOpen(false);
    setComposerMode("standard");
  };

  const buildDefaultChatName = (friendIds: string[]) => {
    if (friendIds.length === 1) {
      return friendMap[friendIds[0]]?.displayName ?? "New Chat";
    }
    return friendIds.map((id) => friendMap[id]?.displayName ?? id).join(", ");
  };

  const openBroadcastPicker = () => {
    setComposerMode("broadcast");
    setBroadcastPickerOpen(true);
    setChatComposerOpen(false);
    setComposerSearch("");
    setComposerCustomTitle("");
    setSelectedBroadcastGroupId(null);
    setBroadcastGroupDropdownOpen(false);
  };

  const closeBroadcastPicker = () => {
    setBroadcastPickerOpen(false);
    setComposerSearch("");
    setSelectedComposerIds([]);
    setComposerCustomTitle("");
    setSelectedBroadcastGroupId(null);
    setBroadcastGroupDropdownOpen(false);
    setComposerMode("standard");
  };

  const goToChat = (chatId: string) => {
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setMediaModalOpen(false);
    setChatSearchVisible(false);
    setChatSearch("");
    setSelectedBroadcastThreadFriendId(null);
    setReplyTargetMessageId(null);
    setEditingMessageId(null);
    const chat = chats.find((c) => c.id === chatId);
    const draftText = chat?.draftComposerText ?? "";
    setChatInput(draftText);
    setShouldFocusChatInput(draftText.trim().length > 0);
    setView({ screen: "chat", chatId });
  };

  const goToPendingDraftChat = (pending: PendingDraft) => {
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setMediaModalOpen(false);
    setChatSearchVisible(false);
    setChatSearch("");
    setSelectedBroadcastThreadFriendId(null);
    setReplyTargetMessageId(null);
    setEditingMessageId(null);
    setChatInput("");
    setShouldFocusChatInput(false);
    setView({ screen: "chat", pendingDraft: pending });
  };

  const createOrOpenChat = (
    modeOverride?: "standard" | "broadcast",
    composerTitleOverride?: string,
    createOptions?: { groupProfilePictureUri?: string | null }
  ) => {
    const mode = modeOverride ?? composerMode;
    const titleFromComposer =
      composerTitleOverride !== undefined ? composerTitleOverride.trim() : composerCustomTitle.trim();
    const groupPicUri = createOptions?.groupProfilePictureUri?.trim() ?? "";
    if (selectedComposerIds.length === 0) return;
    if (mode === "broadcast") {
      const createBroadcastFromSelection = (ids: string[]) => {
        const broadcastTitle = titleFromComposer || "Broadcast";
        const memberIds = [CURRENT_USER_ID, ...ids];
        goToPendingDraftChat({
          memberIds,
          name: broadcastTitle,
          profilePicture: "📣",
          kind: "broadcast",
          createdBy: CURRENT_USER_ID,
          broadcastRecipientIds: ids,
        });
        if (broadcastPickerOpen) {
          closeBroadcastPicker();
        } else {
          closeComposer();
        }
      };

      const selectionHash = normalizeSet(selectedComposerIds);
      const alreadySaved = savedBroadcastGroups.some(
        (group) => normalizeSet(group.memberIds) === selectionHash
      );
      if (selectedComposerIds.length === allFriends.length) {
        createBroadcastFromSelection(selectedComposerIds);
        return;
      }
      if (!alreadySaved && selectedComposerIds.length > 1) {
        setPendingBroadcastCreateIds([...selectedComposerIds]);
        setSaveBroadcastGroupPromptOpen(true);
        return;
      }

      createBroadcastFromSelection(selectedComposerIds);
      return;
    }

    if (mode === "standard" && selectedComposerIds.length > 1) {
      const memberIds = [CURRENT_USER_ID, ...selectedComposerIds];
      const target = normalizeSet(memberIds);
      const existing = chats.find((chat) => normalizeSet(chat.memberIds) === target);

      if (existing) {
        goToChat(existing.id);
        closeComposer();
        return;
      }

      goToPendingDraftChat({
        memberIds,
        name: titleFromComposer || buildDefaultChatName(selectedComposerIds),
        profilePicture:
          selectedComposerIds.length > 1
            ? groupPicUri.length > 0
              ? groupPicUri
              : "^"
            : undefined,
        kind: "standard",
        createdBy: CURRENT_USER_ID,
      });
      closeComposer();
      return;
    }

    if (mode === "standard" && selectedComposerIds.length === 1 && titleFromComposer) {
      const memberIds = [CURRENT_USER_ID, ...selectedComposerIds];
      const target = normalizeSet(memberIds);
      const existing = chats.find((chat) => normalizeSet(chat.memberIds) === target);
      if (existing) {
        goToChat(existing.id);
        closeComposer();
        return;
      }
      goToPendingDraftChat({
        memberIds,
        name: titleFromComposer,
        profilePicture: undefined,
        kind: "standard",
        createdBy: CURRENT_USER_ID,
      });
      closeComposer();
      return;
    }

    const memberIds = [CURRENT_USER_ID, ...selectedComposerIds];
    const target = normalizeSet(memberIds);
    const existing = chats.find((chat) => normalizeSet(chat.memberIds) === target);

    if (existing) {
      goToChat(existing.id);
      closeComposer();
      return;
    }

    goToPendingDraftChat({
      memberIds,
      name: buildDefaultChatName(selectedComposerIds),
      profilePicture:
        selectedComposerIds.length > 1 ? (groupPicUri.length > 0 ? groupPicUri : "^") : undefined,
      kind: "standard",
      createdBy: CURRENT_USER_ID,
    });
    closeComposer();
  };

  const onPressCreateStandardChat = () => {
    if (selectedComposerIds.length === 0) return;
    if (composerMode === "standard" && selectedComposerIds.length > 1) {
      setPendingStandardGroupCreateAfterTitle(true);
      setCreateGroupPictureUri(null);
      setCreateTitleDraft("");
      setCreateTitleEditOpen(true);
      return;
    }
    createOrOpenChat();
  };

  const findOrCreateChatWithFriend = (friendId: string) => {
    const memberIds = [CURRENT_USER_ID, friendId];
    const target = normalizeSet(memberIds);
    const existing = chats.find((chat) => normalizeSet(chat.memberIds) === target);
    if (existing) {
      goToChat(existing.id);
      return;
    }
    goToPendingDraftChat({
      memberIds,
      name: friendMap[friendId]?.displayName ?? "New Chat",
      kind: "standard",
      createdBy: CURRENT_USER_ID,
    });
  };

  const openChatFromHome = (chatId: string) => {
    goToChat(chatId);
  };

  const openFriendProfile = (
    friendId: string,
    from: "home" | "chat",
    options?: { returnChatId?: string; returnPendingDraft?: PendingDraft }
  ) => {
    setChatOverflowOpen(false);
    setView({
      screen: "friendProfile",
      friendId,
      returnTo: from,
      returnChatId: from === "chat" ? options?.returnChatId : undefined,
      returnPendingDraft: from === "chat" ? options?.returnPendingDraft : undefined,
    });
  };

  const openFriendProfileFromFriendsList = (friendId: string) => {
    if (view.screen !== "friendsList") return;
    setChatOverflowOpen(false);
    setView({
      screen: "friendProfile",
      friendId,
      returnTo: "friendsList",
      friendsListRestore: {
        returnTo: view.returnTo,
        returnChatId: view.returnChatId,
        returnPendingDraft: view.returnPendingDraft,
      },
    });
  };

  const openFriendsListFromHome = useCallback(() => {
    const v = viewRef.current;
    if (v.screen === "friendsList") return;
    setFriendsListSearch("");
    setView({ screen: "friendsList", returnTo: "home" });
  }, []);

  const openAddFriendFromHome = useCallback(() => {
    setView({ screen: "addFriend" });
  }, []);

  const hydrateFriendByUid = useCallback(
    async (
      session: { uid: string; deviceId: string },
      friendUid: string,
      opts?: { pairingPin?: string | null }
    ): Promise<Friend | null> => {
      const pin = opts?.pairingPin?.trim() ?? "";
      const profiles = await callEmulatorFunction<{
        profiles?: Record<string, { username?: string; bio?: string; profilePictureUrl?: string | null } | null>;
      }>("getUserProfiles", {
        uid: session.uid,
        targetUids: [friendUid],
        ...(pin.length === 4 && /^\d{4}$/.test(pin) ? { pairingPin: pin } : {}),
      });
      const profile = profiles.profiles?.[friendUid] ?? {};
      const friend: Friend = {
        id: backendUidForFriendId(friendUid),
        backendUid: friendUid,
        displayName: profile?.username?.trim() || `User ${friendUid.slice(0, 6)}`,
        online: true,
        profilePictureUrl: profile?.profilePictureUrl || "",
        bio: profile?.bio || "",
        messageCount: 0,
      };
      setAddedFriendsFromRitual((prev) => (prev.some((f) => f.id === friend.id) ? prev : [...prev, friend]));
      setFriendLinksState((prev) => addUndirectedEdge(prev, CURRENT_USER_ID, friend.id));
      return friend;
    },
    []
  );

  const collectPairingProximityEvidence = useCallback(async (): Promise<PairingProximityEvidence> => {
    let lat: number | null = null;
    let lng: number | null = null;
    let horizontalAccuracyM: number | null = null;
    let locationTimestampMs: number | null = null;
    try {
      const permission = await ExpoLocation.getForegroundPermissionsAsync();
      const granted =
        permission.granted ||
        (await ExpoLocation.requestForegroundPermissionsAsync()).granted;
      if (granted) {
        const pos = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        lat = Number.isFinite(pos.coords.latitude) ? pos.coords.latitude : null;
        lng = Number.isFinite(pos.coords.longitude) ? pos.coords.longitude : null;
        horizontalAccuracyM = Number.isFinite(pos.coords.accuracy ?? NaN) ? (pos.coords.accuracy as number) : null;
        locationTimestampMs = Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now();
      }
    } catch {
      // location is optional for fallback; backend enforces final policy.
    }

    let isWifiConnected = false;
    let localIp: string | null = null;
    try {
      const state = await ExpoNetwork.getNetworkStateAsync();
      isWifiConnected = Boolean(state.isConnected && state.type === ExpoNetwork.NetworkStateType.WIFI);
      localIp = isWifiConnected ? await ExpoNetwork.getIpAddressAsync() : null;
      localIp = localIp?.trim() || null;
    } catch {
      // ignore network evidence failures
    }

    return {
      lat,
      lng,
      horizontalAccuracyM,
      locationTimestampMs,
      isWifiConnected,
      localIp,
    };
  }, []);

  const ensurePairingLocationPermission = useCallback(async (): Promise<boolean> => {
    const current = await ExpoLocation.getForegroundPermissionsAsync();
    if (current.granted) return true;
    const asked = await ExpoLocation.requestForegroundPermissionsAsync();
    return asked.granted;
  }, []);

  const pairingRegisterPinWithRetryParent = useCallback(async (): Promise<string | null> => {
    if (DEMO_OFFLINE_MODE) {
      const email = (sessionEmailRef.current ?? "").trim().toLowerCase();
      if (email === "usera@demo.local") return DEMO_USER_A_QR_PIN;
      return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    }
    const session = getBackendSession();
    if (!session) return null;
    logAppEvent("pairing.session.create", {});
    const proximityEvidence = await collectPairingProximityEvidence();
    const maxAttempts = 48;
    for (let i = 0; i < maxAttempts; i++) {
      const pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      try {
        await callEmulatorFunction<{ ok?: boolean }>("registerNfcPinPairOffer", {
          uid: session.uid,
          deviceId: session.deviceId,
          pin,
          proximityEvidence,
        });
        return pin;
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e ?? "");
        const lower = raw.toLowerCase();
        if (lower.includes("pin unavailable") || lower.includes("failed-precondition")) {
          continue;
        }
        logAppError("pairing.session.create", e, {});
        if (lower.includes("404") || lower.includes("not found") || lower.includes("failed to fetch")) {
          throw new Error(
            "Could not reach pairing service. Deploy latest Cloud Functions (registerNfcPinPairOffer and related) or check network."
          );
        }
        throw e instanceof Error ? e : new Error(String(e));
      }
    }
    return null;
  }, [getBackendSession, collectPairingProximityEvidence]);

  const pairingAwaitPinRedeemParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (DEMO_OFFLINE_MODE) {
        await new Promise<void>((r) => setTimeout(r, 1200));
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        setDemoPendingAddableQueue((q) => q.slice(1));
        const friend = FRIENDS.find((f) => f.id === nextId) ?? null;
        if (!friend) return null;
        setAddedFriendsFromRitual((prev) => (prev.some((f) => f.id === friend.id) ? prev : [...prev, friend]));
        setUnfriendedIds((prev) => prev.filter((id) => id !== friend.id));
        return friend;
      }
      const session = getBackendSession();
      if (!session) return null;
      await new Promise<void>((r) => setTimeout(r, 450));
      const deadline = Date.now() + ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          const res = await callEmulatorFunction<{ status?: string; redeemerUid?: string | null }>(
            "getNfcPinPairOfferStatus",
            {
              uid: session.uid,
              deviceId: session.deviceId,
              pin: pin.trim(),
            }
          );
          if (res.status === "joined" && res.redeemerUid?.trim()) {
            return hydrateFriendByUid(session, res.redeemerUid.trim(), { pairingPin: pin });
          }
        } catch {
          /* Keep polling: undeployed function, network blips, cold start, or not-found race. */
        }
        await new Promise<void>((r) => setTimeout(r, 700));
      }
      return null;
    },
    [getBackendSession, hydrateFriendByUid, demoPendingAddableQueue]
  );

  const pairingConfirmPinReadParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (DEMO_OFFLINE_MODE) {
        const raw = pin.trim();
        if (raw === DEMO_USER_A_QR_PIN) {
          const friend: Friend = {
            id: "demo-user-a",
            backendUid: "demo-user-a",
            displayName: "User A",
            online: true,
            profilePictureUrl: "https://picsum.photos/seed/demo-user-a/400/400",
            bio: "Demo mode account A",
            messageCount: 0,
          };
          setAddedFriendsFromRitual((prev) => (prev.some((f) => f.id === friend.id) ? prev : [...prev, friend]));
          setUnfriendedIds((prev) => prev.filter((id) => id !== friend.id));
          return friend;
        }
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        setDemoPendingAddableQueue((q) => q.slice(1));
        const friend = FRIENDS.find((f) => f.id === nextId) ?? null;
        if (!friend) return null;
        setAddedFriendsFromRitual((prev) => (prev.some((f) => f.id === friend.id) ? prev : [...prev, friend]));
        setUnfriendedIds((prev) => prev.filter((id) => id !== friend.id));
        return friend;
      }
      const session = getBackendSession();
      if (!session) return null;
      const proximityEvidence = await collectPairingProximityEvidence();
      const res = await callEmulatorFunction<{ accepted?: boolean; friendUid?: string }>("confirmNfcPinPairOffer", {
        uid: session.uid,
        deviceId: session.deviceId,
        pin: pin.trim(),
        proximityEvidence,
      });
      const friendUid = res.friendUid?.trim() ?? "";
      if (!res.accepted || !friendUid) return null;
      return hydrateFriendByUid(session, friendUid, { pairingPin: pin });
    },
    [getBackendSession, hydrateFriendByUid, collectPairingProximityEvidence, demoPendingAddableQueue]
  );

  const pairingCancelPinOfferParent = useCallback(async (pin: string): Promise<void> => {
    if (DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session) return;
    try {
      await callEmulatorFunction("cancelNfcPinPairOffer", {
        uid: session.uid,
        deviceId: session.deviceId,
        pin: pin.trim(),
      });
    } catch {
      /* ignore */
    }
  }, [getBackendSession]);

  /**
   * Swipe right on the main chat page (chat list + empty space below the online strip).
   * Uses capture so horizontal intent wins over vertical chat list scroll; excludes the
   * horizontal online strip (pageY) so that strip keeps scrolling normally.
   */
  const homeSwipeOpenFriendsPan = useMemo(() => {
    const minPageY = safeTop + 148;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (evt, g) =>
        evt.nativeEvent.pageY >= minPageY &&
        g.dx > 10 &&
        Math.abs(g.dx) > Math.abs(g.dy) + 4,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 45 && Math.abs(g.dx) > Math.abs(g.dy)) {
          openFriendsListFromHome();
        }
      },
    });
  }, [safeTop, openFriendsListFromHome]);

  const confirmUnfriendFriend = (friendId: string, name: string) => {
    Alert.alert("Unfriend?", `Remove ${name} from your friends list?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unfriend",
        style: "destructive",
        onPress: () =>
          setUnfriendedIds((cur) => (cur.includes(friendId) ? cur : [...cur, friendId])),
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
      ...FEED_MUTE_CHOICES.map((choice) => ({
        text: `Mute for ${choice.label}`,
        onPress: () => setFeedMuteForFriend(friend.id, choice.durationMs),
      })),
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
    Alert.alert(friend.displayName, undefined, [
      { text: "Start chat", onPress: () => findOrCreateChatWithFriend(friend.id) },
      {
        text: isFriendFeedMuted(friend.id) ? "Unmute feed" : "Mute feed",
        onPress: () => {
          if (isFriendFeedMuted(friend.id)) {
            clearFeedMuteForFriend(friend.id);
            return;
          }
          openFeedMutePicker(friend);
        },
      },
      {
        text: "Unfriend",
        style: "destructive",
        onPress: () => confirmUnfriendFriend(friend.id, friend.displayName),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openMyProfile = () => {
    setView({ screen: "myProfile" });
  };

  const pickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    setPhotoEditorTarget("profile");
    setPhotoEditorMediaType("photo");
    setPhotoEditorOpen(true);
    setPhotoEditorAsset(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
    });
    if (result.canceled || !result.assets[0]) {
      setPhotoEditorOpen(false);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("photo");
      setPhotoEditorTarget("chat");
      return;
    }
    const asset = result.assets[0];
    setPhotoEditorAsset({
      uri: asset.uri,
      width: asset.width ?? 1,
      height: asset.height ?? 1,
    });
  };

  const pickCreateGroupPicture = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setCreateGroupPictureUri(result.assets[0].uri);
    }
  };

  const openPostComposer = () => {
    setPostDraftText("");
    setPostDraftImageUris([]);
    setPostDraftVideoUri(null);
    setQueuedPostPhotoAssets([]);
    setView({ screen: "publishPost" });
  };

  const closePublishPostScreen = useCallback(() => {
    setView({ screen: "home" });
    setHomeTab("feed");
  }, []);

  const pickPostPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPostDraftVideoUri(null);
      const normalized = result.assets.map((asset) => ({
        uri: asset.uri,
        width: asset.width ?? 1,
        height: asset.height ?? 1,
      }));
      const [first, ...rest] = normalized;
      if (!first) return;
      setQueuedPostPhotoAssets(rest);
      setPhotoEditorTarget("post");
      setPhotoEditorMediaType("photo");
      setPhotoEditorAsset(first);
      setPhotoEditorOpen(true);
    }
  };

  const pickPostVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPostDraftImageUris([]);
      setPostDraftVideoUri(result.assets[0].uri);
    }
  };

  const finalizeVideoPosterAndPublish = async (mode: "skip" | "pick") => {
    const videoUri = postDraftVideoUri;
    const text = postDraftText.trim();
    if (!videoUri) return;
    let posterUri: string | undefined;
    try {
      if (mode === "skip") {
        const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.85 });
        posterUri = thumb.uri;
      } else {
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
        });
        if (!r.canceled && r.assets[0]) {
          posterUri = r.assets[0].uri;
        } else {
          const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.85 });
          posterUri = thumb.uri;
        }
      }
    } catch {
      try {
        const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0 });
        posterUri = thumb.uri;
      } catch {
        posterUri = undefined;
      }
    }
    const newPost: Post = {
      id: `p-${Date.now()}`,
      authorId: CURRENT_USER_ID,
      createdAt: Date.now(),
      text: text || undefined,
      videoUri: videoUri,
      videoPosterUri: posterUri,
    };
    setPosts((p) => [newPost, ...p]);
    closePublishPostScreen();
    setPostDraftText("");
    setPostDraftImageUris([]);
    setPostDraftVideoUri(null);
  };

  const publishPost = () => {
    const text = postDraftText.trim();
    const hasVideo = !!postDraftVideoUri;
    const hasImages = postDraftImageUris.length > 0;
    if (!text && !hasVideo && !hasImages) {
      Alert.alert("Empty post", "Add text, a photo, or a video.");
      return;
    }
    if (hasVideo) {
      Alert.alert("Video thumbnail", "Choose a thumbnail image, or skip to use the first frame.", [
        { text: "Choose thumbnail", onPress: () => void finalizeVideoPosterAndPublish("pick") },
        { text: "Skip", onPress: () => void finalizeVideoPosterAndPublish("skip") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    const newPost: Post = {
      id: `p-${Date.now()}`,
      authorId: CURRENT_USER_ID,
      createdAt: Date.now(),
      text: text || undefined,
      imageUris: hasImages ? [...postDraftImageUris] : undefined,
    };
    setPosts((p) => [newPost, ...p]);
    closePublishPostScreen();
    setPostDraftText("");
    setPostDraftImageUris([]);
    setPostDraftVideoUri(null);
  };

  const confirmDeletePost = (post: Post) => {
    if (post.authorId !== CURRENT_USER_ID) return;
    Alert.alert("Delete post?", "This removes the post from your feed and profile.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setFullScreenPost((cur) => {
            if (cur?.id === post.id) {
              setPostFullscreenThreadReplyKey(null);
              return null;
            }
            return cur;
          });
          setPosts((list) =>
            list.map((p) => (p.id === post.id ? { ...p, deletedAt: Date.now() } : p))
          );
        },
      },
    ]);
  };

  const handleChatInputChange = (text: string) => {
    if (view.screen === "chat" && "pendingDraft" in view && view.pendingDraft && text.trim().length > 0) {
      const pending = view.pendingDraft;
      const now = Date.now();
      const id = `draft-${now}`;
      const newChat: Chat = {
        id,
        memberIds: pending.memberIds,
        name: pending.name,
        profilePicture: pending.profilePicture,
        kind: pending.kind ?? "standard",
        createdBy: pending.createdBy ?? CURRENT_USER_ID,
        isCustomName: false,
        isDraft: true,
        visibleToRecipients: false,
        updatedAt: now,
        broadcastRecipientIds: pending.broadcastRecipientIds,
      };
      setChats((current) => [newChat, ...current]);
      setView({ screen: "chat", chatId: id });
    }
    setChatInput(text);
  };

  const ensureChatForSend = (): Chat | null => {
    if (view.screen !== "chat") return null;
    if ("chatId" in view) {
      return chats.find((c) => c.id === view.chatId) ?? null;
    }
    const pending = view.pendingDraft;
    const now = Date.now();
    const id = `draft-${now}`;
    const created: Chat = {
      id,
      memberIds: pending.memberIds,
      name: pending.name,
      profilePicture: pending.profilePicture,
      kind: pending.kind ?? "standard",
      createdBy: pending.createdBy ?? CURRENT_USER_ID,
      isCustomName: false,
      isDraft: true,
      visibleToRecipients: false,
      updatedAt: now,
      broadcastRecipientIds: pending.broadcastRecipientIds,
    };
    setChats((current) => [created, ...current]);
    setView({ screen: "chat", chatId: id });
    return created;
  };

  const addAutoReplies = (chat: Chat, latestMessages: Message[]) => {
    const now = Date.now();
    const outgoing = latestMessages.filter((m) => m.senderId === CURRENT_USER_ID);
    if (outgoing.length === 0) return;

    const scheduleReply = (message: Message, delayMs: number) => {
      const timer = setTimeout(() => {
        setMessages((current) => [...current, message]);
        setChats((current) =>
          current.map((c) => (c.id === chat.id ? { ...c, updatedAt: Date.now() } : c))
        );
      }, delayMs);
      autoReplyTimersRef.current.push(timer);
    };

    if ((chat.kind ?? "standard") === "broadcast") {
      const recipients =
        chat.broadcastRecipientIds ?? chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
      for (const outgoingMessage of outgoing) {
        const threadFriendId = outgoingMessage.broadcastThreadFriendId;
        const targets = threadFriendId
          ? [threadFriendId]
          : recipients;
        for (const targetId of targets) {
          if (DEMO_OFFLINE_MODE && !demoActiveInboundFriendIds.includes(targetId)) continue;
          if (Math.random() > (DEMO_OFFLINE_MODE ? 0.5 : 0.68)) continue;
          const delayMs =
            AUTO_REPLY_MIN_DELAY_MS +
            Math.floor(Math.random() * (AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS + 1));
          scheduleReply(
            {
              id: `auto-${now}-${targetId}-${Math.random().toString(36).slice(2, 6)}`,
              chatId: chat.id,
              senderId: targetId,
              text: AUTO_REPLY_LINES[Math.floor(Math.random() * AUTO_REPLY_LINES.length)] ?? "Got it.",
              createdAt: Date.now() + delayMs,
              kind: "text",
              replyToMessageId: outgoingMessage.id,
              broadcastThreadFriendId: targetId,
            },
            delayMs
          );
        }
      }
      return;
    }
    const recipients = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    const candidateRecipients = DEMO_OFFLINE_MODE
      ? recipients.filter((id) => demoActiveInboundFriendIds.includes(id))
      : recipients;
    if (candidateRecipients.length === 0 || Math.random() > (DEMO_OFFLINE_MODE ? 0.5 : 0.7)) return;
    const sender =
      candidateRecipients[Math.floor(Math.random() * candidateRecipients.length)] ?? candidateRecipients[0];
    if (!sender) return;
    const anchor = outgoing[outgoing.length - 1];
    if (!anchor) return;
    const delayMs =
      AUTO_REPLY_MIN_DELAY_MS +
      Math.floor(Math.random() * (AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS + 1));
    const reply: Message = {
      id: `auto-${now}-${sender}-${Math.random().toString(36).slice(2, 6)}`,
      chatId: chat.id,
      senderId: sender,
      text: AUTO_REPLY_LINES[Math.floor(Math.random() * AUTO_REPLY_LINES.length)] ?? "Nice.",
      createdAt: Date.now() + delayMs,
      kind: "text",
      replyToMessageId: anchor.id,
    };
    scheduleReply(reply, delayMs);
  };

  const commitOutgoingMessages = (chat: Chat, outgoingMessages: Message[]) => {
    if (outgoingMessages.length === 0) return;
    const now = Date.now();
    setMessages((current) => [
      ...current,
      ...outgoingMessages.map((m) => ({ ...m, deliveryStatus: "sent" as const })),
    ]);
    setChats((current) =>
      current.map((c) =>
        c.id === chat.id
          ? {
              ...c,
              isDraft: false,
              visibleToRecipients: true,
              updatedAt: now,
              draftComposerText: undefined,
            }
          : c
      )
    );
    addAutoReplies(chat, outgoingMessages);
  };

  const sendPayload = (payload: {
    text: string;
    kind?: "text" | "photo" | "video" | "voice";
    mediaUri?: string;
    mediaWidth?: number;
    mediaHeight?: number;
    durationSec?: number;
    videoTextOverlays?: VideoTextOverlayData[];
  }) => {
    const chat = ensureChatForSend();
    if (!chat) return;

    if (editingMessageId) {
      const trimmed = payload.text.trim();
      if (!trimmed) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === editingMessageId
            ? {
                ...message,
                text: trimmed,
                editedAt: Date.now(),
                kind: payload.kind ?? "text",
                mediaUri: payload.mediaUri,
                durationSec: payload.durationSec,
                videoTextOverlays: payload.videoTextOverlays,
                unsentAt: undefined,
              }
            : message
        )
      );
      setEditingMessageId(null);
      setChatInput("");
      return;
    }

    const now = Date.now();
    const trimmedText = payload.text.trim();
    if (!trimmedText && !payload.mediaUri) return;
    const chatKind = chat.kind ?? "standard";
    if (chatKind === "broadcast") {
      const existingInChat = messages.filter((m) => m.chatId === chat.id);
      const recipients =
        chat.broadcastRecipientIds ?? chat.memberIds.filter((id) => id !== CURRENT_USER_ID);

      const clearComposerAfterSend = () => {
        setChatInput("");
        setReplyTargetMessageId(null);
      };

      const scheduleDemoThreadRepliesToRoot = (rootId: string, t0: number) => {
        recipients.slice(0, Math.max(1, Math.min(2, recipients.length))).forEach((friendId, idx) => {
          const delayMs =
            AUTO_REPLY_MIN_DELAY_MS +
            Math.floor(Math.random() * (AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS + 1));
          const guaranteedReply: Message = {
            id: `br-${t0}-${friendId}-${idx}`,
            chatId: chat.id,
            senderId: friendId,
            text: AUTO_REPLY_LINES[(idx + 1) % AUTO_REPLY_LINES.length] ?? "Got it.",
            createdAt: Date.now() + delayMs,
            kind: "text",
            replyToMessageId: rootId,
            broadcastThreadFriendId: friendId,
          };
          const timer = setTimeout(() => {
            setMessages((current) => [...current, guaranteedReply]);
            setChats((current) =>
              current.map((c) => (c.id === chat.id ? { ...c, updatedAt: Date.now() } : c))
            );
          }, delayMs);
          autoReplyTimersRef.current.push(timer);
        });
      };

      if (existingInChat.length === 0) {
        Alert.alert(BROADCAST_EVERYONE_SEND_TITLE, BROADCAST_EVERYONE_SEND_MESSAGE, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Send",
            onPress: () => {
              const t = Date.now();
              const rootMessage: Message = {
                id: `m-${t}-broadcast-root`,
                chatId: chat.id,
                senderId: CURRENT_USER_ID,
                text: trimmedText,
                createdAt: t,
                kind: payload.kind ?? "text",
                mediaUri: payload.mediaUri,
                mediaWidth: payload.mediaWidth,
                mediaHeight: payload.mediaHeight,
                durationSec: payload.durationSec,
                videoTextOverlays: payload.videoTextOverlays,
              };
              commitOutgoingMessages(chat, [rootMessage]);
              scheduleDemoThreadRepliesToRoot(rootMessage.id, t);
              setSelectedBroadcastThreadFriendId(recipients[0] ?? null);
              clearComposerAfterSend();
            },
          },
        ]);
        return;
      }

      const rt = replyTargetMessage;
      const replyingToOwnGlobalBroadcast =
        !!rt && rt.senderId === CURRENT_USER_ID && !rt.broadcastThreadFriendId;
      const threadFriendId =
        selectedBroadcastThreadFriendId ?? rt?.broadcastThreadFriendId ?? undefined;

      const isPrivateThreadSend = !replyingToOwnGlobalBroadcast && !!threadFriendId;

      if (isPrivateThreadSend) {
        const followUp: Message = {
          id: `m-${now}`,
          chatId: chat.id,
          senderId: CURRENT_USER_ID,
          text: trimmedText,
          createdAt: now,
          kind: payload.kind ?? "text",
          mediaUri: payload.mediaUri,
          mediaWidth: payload.mediaWidth,
          mediaHeight: payload.mediaHeight,
          durationSec: payload.durationSec,
          videoTextOverlays: payload.videoTextOverlays,
          replyToMessageId: rt?.id,
          broadcastThreadFriendId: threadFriendId as string,
        };
        commitOutgoingMessages(chat, [followUp]);
        clearComposerAfterSend();
        return;
      }

      const globalReplyToId = rt && !rt.broadcastThreadFriendId ? rt.id : undefined;
      Alert.alert(BROADCAST_EVERYONE_SEND_TITLE, BROADCAST_EVERYONE_SEND_MESSAGE, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () => {
            const t = Date.now();
            const everyoneMessage: Message = {
              id: `m-${t}`,
              chatId: chat.id,
              senderId: CURRENT_USER_ID,
              text: trimmedText,
              createdAt: t,
              kind: payload.kind ?? "text",
              mediaUri: payload.mediaUri,
              mediaWidth: payload.mediaWidth,
              mediaHeight: payload.mediaHeight,
              durationSec: payload.durationSec,
              videoTextOverlays: payload.videoTextOverlays,
              ...(globalReplyToId ? { replyToMessageId: globalReplyToId } : {}),
            };
            commitOutgoingMessages(chat, [everyoneMessage]);
            setSelectedBroadcastThreadFriendId(null);
            clearComposerAfterSend();
          },
        },
      ]);
      return;
    } else {
      const out: Message = {
        id: `m-${now}`,
        chatId: chat.id,
        senderId: CURRENT_USER_ID,
        text: trimmedText,
        createdAt: now,
        kind: payload.kind ?? "text",
        mediaUri: payload.mediaUri,
        mediaWidth: payload.mediaWidth,
        mediaHeight: payload.mediaHeight,
        durationSec: payload.durationSec,
        videoTextOverlays: payload.videoTextOverlays,
        replyToMessageId: replyTargetMessage?.id,
      };
      commitOutgoingMessages(chat, [out]);
    }

    setChatInput("");
    setReplyTargetMessageId(null);
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    sendPayload({ text: chatInput.trim(), kind: "text" });
  };

  const sendCameraMedia = async (mode: "photo" | "video") => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    setPhotoEditorTarget("chat");
    if (mode === "photo") {
      setPhotoEditorOpen(true);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("photo");
    }
    if (mode === "video") {
      setPhotoEditorOpen(true);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("video");
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:
        mode === "photo" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) {
      if (mode === "photo" || mode === "video") {
        setPhotoEditorOpen(false);
        setPhotoEditorAsset(null);
        setPhotoEditorMediaType("photo");
      }
      return;
    }
    const asset = result.assets[0];
    if (mode === "photo") {
      setPhotoEditorAsset({
        uri: asset.uri,
        width: asset.width ?? 1,
        height: asset.height ?? 1,
      });
      return;
    }
    if (mode === "video") {
      setPhotoEditorAsset({
        uri: asset.uri,
        width: asset.width ?? 1,
        height: asset.height ?? 1,
      });
    }
  };

  const sendGalleryPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    setPhotoEditorTarget("chat");
    setPhotoEditorOpen(true);
    setPhotoEditorAsset(null);
    setPhotoEditorMediaType("photo");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) {
      setPhotoEditorOpen(false);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("photo");
      return;
    }
    const asset = result.assets[0];
    setPhotoEditorAsset({
      uri: asset.uri,
      width: asset.width ?? 1,
      height: asset.height ?? 1,
    });
  };

  const sendGalleryVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    setPhotoEditorTarget("chat");
    setPhotoEditorOpen(true);
    setPhotoEditorAsset(null);
    setPhotoEditorMediaType("video");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.92,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) {
      setPhotoEditorOpen(false);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("photo");
      return;
    }
    const asset = result.assets[0];
    setPhotoEditorAsset({
      uri: asset.uri,
      width: asset.width ?? 1,
      height: asset.height ?? 1,
    });
  };

  const completePhotoEditor = (result: PhotoEditorResult) => {
    if (photoEditorTarget === "profile") {
      setPhotoEditorOpen(false);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("photo");
      setPhotoEditorTarget("chat");
      if (result.mediaKind === "photo") {
        setMyProfilePictureUrl(result.uri);
      }
      return;
    }
    if (photoEditorTarget === "post") {
      if (result.mediaKind === "photo") {
        setPostDraftVideoUri(null);
        setPostDraftImageUris((prev) => [...prev, result.uri]);
      }
      if (queuedPostPhotoAssets.length > 0) {
        const [next, ...rest] = queuedPostPhotoAssets;
        setQueuedPostPhotoAssets(rest);
        setPhotoEditorAsset(next ?? null);
        setPhotoEditorMediaType("photo");
        setPhotoEditorOpen(true);
        return;
      }
      setQueuedPostPhotoAssets([]);
      setPhotoEditorOpen(false);
      setPhotoEditorAsset(null);
      setPhotoEditorMediaType("photo");
      setPhotoEditorTarget(viewRef.current.screen === "publishPost" ? "post" : "chat");
      return;
    }
    setPhotoEditorOpen(false);
    setPhotoEditorAsset(null);
    setPhotoEditorMediaType("photo");
    setPhotoEditorTarget(viewRef.current.screen === "publishPost" ? "post" : "chat");
    if (result.mediaKind === "video") {
      sendPayload({
        text: result.caption,
        kind: "video",
        mediaUri: result.uri,
        mediaWidth: result.width,
        mediaHeight: result.height,
        videoTextOverlays: result.videoTextOverlays,
      });
      return;
    }
    sendPayload({
      text: result.caption,
      kind: "photo",
      mediaUri: result.uri,
      mediaWidth: result.width,
      mediaHeight: result.height,
    });
  };

  const cancelPhotoEditor = () => {
    setPhotoEditorOpen(false);
    setPhotoEditorAsset(null);
    setPhotoEditorMediaType("photo");
    setPhotoEditorTarget(
      photoEditorTarget === "profile"
        ? "chat"
        : viewRef.current.screen === "publishPost"
          ? "post"
          : "chat"
    );
    setQueuedPostPhotoAssets([]);
  };

  const toggleVoiceNote = () => {
    const startRecording = async () => {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      if (previewSoundRef.current) {
        await previewSoundRef.current.unloadAsync();
        previewSoundRef.current = null;
      }
      setPreviewVoicePlaying(false);
      setPendingVoiceNote(null);
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setVoiceRecordStartedAt(Date.now());
    };

    const stopRecording = async () => {
      if (!recordingRef.current || !voiceRecordStartedAt) return;
      const startedAt = voiceRecordStartedAt;
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setVoiceRecordStartedAt(null);
      if (!uri) return;
      setPendingVoiceNote({
        uri,
        durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      });
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    };

    if (!voiceRecordStartedAt) {
      void startRecording();
    } else {
      void stopRecording();
    }
  };

  const togglePendingVoicePreview = async () => {
    if (!pendingVoiceNote) return;
    if (previewVoicePlaying && previewSoundRef.current) {
      await previewSoundRef.current.stopAsync();
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
      setPreviewVoicePlaying(false);
      return;
    }
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: pendingVoiceNote.uri },
      { shouldPlay: true }
    );
    previewSoundRef.current = sound;
    setPreviewVoicePlaying(true);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        void sound.unloadAsync();
        if (previewSoundRef.current === sound) {
          previewSoundRef.current = null;
        }
        setPreviewVoicePlaying(false);
      }
    });
  };

  const discardPendingVoiceNote = async () => {
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    setPreviewVoicePlaying(false);
    setPendingVoiceNote(null);
  };

  const sendPendingVoiceNote = async () => {
    if (!pendingVoiceNote) return;
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    setPreviewVoicePlaying(false);
    sendPayload({
      text: `Voice note (${pendingVoiceNote.durationSec}s)`,
      kind: "voice",
      durationSec: pendingVoiceNote.durationSec,
      mediaUri: pendingVoiceNote.uri,
    });
    setPendingVoiceNote(null);
  };

  const toggleVoiceMessagePlayback = async (message: Message) => {
    if (!message.mediaUri) return;
    if (playingVoiceMessageId === message.id && messageSoundRef.current) {
      await messageSoundRef.current.stopAsync();
      await messageSoundRef.current.unloadAsync();
      messageSoundRef.current = null;
      setPlayingVoiceMessageId(null);
      return;
    }
    if (messageSoundRef.current) {
      await messageSoundRef.current.unloadAsync();
      messageSoundRef.current = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: message.mediaUri },
      { shouldPlay: true }
    );
    messageSoundRef.current = sound;
    setPlayingVoiceMessageId(message.id);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        void sound.unloadAsync();
        if (messageSoundRef.current === sound) {
          messageSoundRef.current = null;
        }
        setPlayingVoiceMessageId(null);
      }
    });
  };

  const leaveChatToHome = () => {
    setView({ screen: "home" });
    setChatSearch("");
    setChatInput("");
    setShouldFocusChatInput(false);
    setChatSearchVisible(false);
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
    setMediaModalOpen(false);
    setReplyTargetMessageId(null);
    setEditingMessageId(null);
    setMessageActionTargetId(null);
    setMessageActionsOpen(false);
    setReactionPickerOpen(false);
    setSelectedBroadcastThreadFriendId(null);
    setPhotoEditorOpen(false);
    setPhotoEditorAsset(null);
    setAddMemberModalOpen(false);
    setAddMemberSearch("");
    setVoiceRecordStartedAt(null);
    setPendingVoiceNote(null);
    setPreviewVoicePlaying(false);
    setPlayingVoiceMessageId(null);
    setPlayingVideoMessageId(null);
    if (previewSoundRef.current) {
      void previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    if (messageSoundRef.current) {
      void messageSoundRef.current.unloadAsync();
      messageSoundRef.current = null;
    }
  };

  /** Remove the current user from a chat or delete it entirely (same rules as leaving from inside the chat). */
  const removeChatForCurrentUser = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    if (chat.kind === "broadcast") {
      setChats((c) => c.filter((x) => x.id !== chatId));
      setMessages((m) => m.filter((msg) => msg.chatId !== chatId));
      return;
    }

    const newMemberIds = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    if (newMemberIds.length < 2) {
      setChats((c) => c.filter((x) => x.id !== chatId));
      setMessages((m) => m.filter((msg) => msg.chatId !== chatId));
    } else {
      const nextJoined = chat.memberJoinedAt
        ? Object.fromEntries(Object.entries(chat.memberJoinedAt).filter(([k]) => k !== CURRENT_USER_ID))
        : undefined;
      setChats((c) =>
        c.map((x) =>
          x.id === chatId
            ? {
                ...x,
                memberIds: newMemberIds,
                memberJoinedAt: nextJoined,
                updatedAt: Date.now(),
              }
            : x
        )
      );
    }
  };

  const leaveChat = () => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    removeChatForCurrentUser(chatId);
    leaveChatToHome();
  };

  const toggleChatMute = (chatId: string) => {
    setChats((current) =>
      current.map((c) =>
        c.id === chatId ? { ...c, mutedForNotifications: !c.mutedForNotifications } : c
      )
    );
  };

  const confirmDeleteChatFromHome = (chatId: string) => {
    Alert.alert(
      "Delete chat?",
      "This removes the chat from your list. In group chats, the conversation can continue for others.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removeChatForCurrentUser(chatId);
            if (view.screen === "chat" && "chatId" in view && view.chatId === chatId) {
              leaveChatToHome();
            }
          },
        },
      ]
    );
  };

  const openChatRowActions = (chat: Chat) => {
    const muted = !!chat.mutedForNotifications;
    Alert.alert(chat.name, undefined, [
      {
        text: muted ? "Unmute notifications" : "Mute notifications",
        onPress: () => toggleChatMute(chat.id),
      },
      {
        text: "Delete chat",
        style: "destructive",
        onPress: () => confirmDeleteChatFromHome(chat.id),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const confirmLeaveChat = () => {
    Alert.alert("Leave chat?", "You will stop receiving messages in this chat.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: leaveChat },
    ]);
  };

  const addMemberToChat = (friendId: string) => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat || chat.kind === "broadcast" || chat.isDraft) return;
    const peers = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    const candidate = allFriends.find((f) => f.id === friendId);
    if (!candidate || chat.memberIds.includes(friendId)) return;
    if (!peers.every((pid) => (friendLinksState[pid] ?? []).includes(friendId))) return;

    const now = Date.now();
    const nextMemberIds = [...chat.memberIds, friendId];
    const counterpartIds = nextMemberIds.filter((id) => id !== CURRENT_USER_ID);
    const newName = chat.isCustomName ? chat.name : buildDefaultChatName(counterpartIds);
    setChats((c) =>
      c.map((x) =>
        x.id === chatId
          ? {
              ...x,
              memberIds: nextMemberIds,
              memberJoinedAt: { ...x.memberJoinedAt, [friendId]: now },
              name: newName,
              updatedAt: now,
            }
          : x
      )
    );
    setAddMemberModalOpen(false);
    setAddMemberSearch("");
  };

  const onBackFromChat = () => {
    if (view.screen !== "chat") return;

    if ("pendingDraft" in view) {
      setChatInput("");
      leaveChatToHome();
      return;
    }

    const chatId = view.chatId;
    const chat = chats.find((c) => c.id === chatId);
    const hasUnsent = chatInput.trim().length > 0 || !!pendingVoiceNote;

    if (chat?.isDraft && hasUnsent) {
      Alert.alert("Save draft?", "You have unsent text in this draft.", [
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            setChats((current) => current.filter((c) => c.id !== chatId));
            setMessages((current) => current.filter((m) => m.chatId !== chatId));
            leaveChatToHome();
          },
        },
        {
          text: "Save draft",
          onPress: () => {
            setChats((current) =>
              current.map((c) =>
                c.id === chatId
                  ? { ...c, draftComposerText: chatInput.trim(), updatedAt: Date.now() }
                  : c
              )
            );
            leaveChatToHome();
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    if (chat?.isDraft && !hasUnsent) {
      const noMessages = messages.every((m) => m.chatId !== chatId);
      if (noMessages) {
        setChats((current) => current.filter((c) => c.id !== chatId));
      }
    }

    leaveChatToHome();
  };

  const openMessageActions = (message: Message) => {
    setMessageActionTargetId(message.id);
    setMessageActionsOpen(true);
  };

  const applyReaction = (emoji: string) => {
    if (!messageActionTargetId) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === messageActionTargetId
          ? {
              ...message,
              reactions: {
                ...(message.reactions ?? {}),
                [CURRENT_USER_ID]: emoji,
              },
            }
          : message
      )
    );
    setReactionPickerOpen(false);
    setMessageActionsOpen(false);
  };

  const unsendTargetMessage = () => {
    if (!messageActionTarget) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === messageActionTarget.id
          ? {
              ...message,
              text: "You unsent a message.",
              kind: "text",
              mediaUri: undefined,
              durationSec: undefined,
              videoTextOverlays: undefined,
              unsentAt: Date.now(),
              editedAt: undefined,
            }
          : message
      )
    );
    setMessageActionsOpen(false);
  };

  const startEditMessage = () => {
    if (!messageActionTarget || messageActionTarget.senderId !== CURRENT_USER_ID) return;
    setEditingMessageId(messageActionTarget.id);
    setChatInput(messageActionTarget.text);
    setMessageActionsOpen(false);
  };

  const startReplyToMessage = () => {
    if (!messageActionTarget) return;
    setReplyTargetMessageId(messageActionTarget.id);
    if (messageActionTarget.broadcastThreadFriendId) {
      setSelectedBroadcastThreadFriendId(messageActionTarget.broadcastThreadFriendId);
    } else {
      setSelectedBroadcastThreadFriendId(null);
    }
    setMessageActionsOpen(false);
  };

  const saveChatTitle = () => {
    if (!resolvedChat || !chatTitleDraft.trim()) return;
    setChats((current) =>
      current.map((chat) =>
        chat.id === resolvedChat.id
          ? { ...chat, name: chatTitleDraft.trim(), isCustomName: true, updatedAt: Date.now() }
          : chat
      )
    );
    setEditChatMetaOpen(false);
  };

  const saveChatPicture = () => {
    if (!resolvedChat || !chatPictureDraft.trim()) return;
    setChats((current) =>
      current.map((chat) =>
        chat.id === resolvedChat.id
          ? { ...chat, profilePicture: chatPictureDraft.trim().slice(0, 2), updatedAt: Date.now() }
          : chat
      )
    );
    setEditChatPictureOpen(false);
  };

  const getPhotoMessageSize = (message: Message) => {
    const maxWidth = 220;
    const fallback = { width: 180, height: 180 };
    if (!message.mediaWidth || !message.mediaHeight || message.mediaWidth <= 0 || message.mediaHeight <= 0) {
      return fallback;
    }
    const width = Math.min(maxWidth, message.mediaWidth);
    const height = Math.max(110, Math.round((width * message.mediaHeight) / message.mediaWidth));
    return { width, height };
  };

  const getReactionEntries = (message: Message) => {
    const counts = Object.values(message.reactions ?? {}).reduce<Record<string, number>>(
      (acc, emoji) => {
        acc[emoji] = (acc[emoji] ?? 0) + 1;
        return acc;
      },
      {}
    );
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const renderAvatar = (
    uri: string | null | undefined,
    fallbackLetter: string,
    size: number,
    style?: object
  ) => {
    const circle = {
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: "hidden" as const,
      backgroundColor: theme.accent,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    };
    if (uri) {
      return (
        <View style={[circle, style]}>
          <Image source={{ uri }} style={{ width: size, height: size }} />
        </View>
      );
    }
    return (
      <View style={[circle, style]}>
        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.38 }}>
          {fallbackLetter}
        </Text>
      </View>
    );
  };

  const postAuthorMeta = (authorId: string) => {
    if (authorId === CURRENT_USER_ID) {
      return { name: "You", avatarUri: myProfilePictureUrl ?? undefined };
    }
    const f = friendMap[authorId];
    return { name: f?.displayName ?? "Friend", avatarUri: f?.profilePictureUrl };
  };

  const feedReactionDetailRows = useMemo(() => {
    if (!reactionDetailPost) return [];
    return Object.entries(reactionDetailPost.feedReactions ?? {})
      .filter(([userId]) => visibleFriendIds.includes(userId))
      .map(([userId, emoji]) => ({
        userId,
        emoji,
        name:
          userId === CURRENT_USER_ID
            ? "You"
            : friendMap[userId]?.displayName ?? "Friend",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reactionDetailPost, visibleFriendIds, friendMap]);

  const toggleReactionMap = (current: Record<string, string> | undefined): Record<string, string> => {
    const next = { ...(current ?? {}) };
    if (next[CURRENT_USER_ID]) {
      delete next[CURRENT_USER_ID];
    } else {
      next[CURRENT_USER_ID] = "👍";
    }
    return next;
  };

  const resolvePostOwnerBackendUid = useCallback(
    (post: Post, sessionDemoUid: string) => {
      if (post.authorId === CURRENT_USER_ID) return sessionDemoUid;
      return friendMap[post.authorId]?.backendUid ?? null;
    },
    [friendMap]
  );

  const hydratePrivateThreadForPost = useCallback(
    async (post: Post) => {
      const session = getBackendSession();
      if (!session) return;
      const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
      if (!postOwnerUid) return;
      const pairFriendUids =
        post.authorId === CURRENT_USER_ID
          ? allFriends.map((f) => f.backendUid).filter((x): x is string => !!x && x !== session.uid)
          : [session.uid];
      const chainResults = await Promise.all(
        pairFriendUids.map(async (friendUid) => {
          const res = await callEmulatorFunction<{
            items?: Array<{
              messageId: string;
              authorUid: string;
              text: string;
              reactions?: Record<string, string>;
              createdAtMs?: number;
            }>;
          }>("listPrivatePostThreadMessages", {
            uid: session.uid,
            deviceId: session.deviceId,
            postId: post.id,
            postOwnerUid,
            friendUid,
          }).catch(() => ({ items: [] }));
          const items = (res.items ?? []).slice().sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
          if (items.length === 0) return null;
          const toLocalId = (uid: string) =>
            uid === session.uid ? CURRENT_USER_ID : backendUidToFriendId[uid] ?? backendUidForFriendId(uid);
          const first = items[0];
          const commentAuthorLocalId = toLocalId(friendUid);
          const firstAuthorLocal = toLocalId(first.authorUid);
          const comment: PostComment = {
            id: first.messageId,
            authorId: commentAuthorLocalId,
            text: first.text,
            createdAt: first.createdAtMs ?? Date.now(),
            reactions: first.reactions ?? {},
            thread: items.slice(1).map((entry) => ({
              id: entry.messageId,
              authorId: toLocalId(entry.authorUid),
              text: entry.text,
              createdAt: entry.createdAtMs ?? Date.now(),
              reactions: entry.reactions ?? {},
            })),
          };
          if (firstAuthorLocal === comment.authorId) return comment;
          // If owner authored first message, keep chronology by shifting first into thread and setting comment shell.
          return {
            ...comment,
            id: `srv_${post.id}_${friendUid}`,
            text: "",
            thread: [
              {
                id: first.messageId,
                authorId: firstAuthorLocal,
                text: first.text,
                createdAt: first.createdAtMs ?? Date.now(),
                reactions: first.reactions ?? {},
              },
              ...(comment.thread ?? []),
            ],
          } as PostComment;
        })
      );
      const comments = chainResults.filter((x): x is PostComment => !!x);
      setPosts((current) =>
        current.map((candidate) => (candidate.id === post.id ? { ...candidate, comments } : candidate))
      );
    },
    [allFriends, backendUidToFriendId, getBackendSession, resolvePostOwnerBackendUid]
  );

  const addCommentToPost = useCallback((postId: string, rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    const post = posts.find((p) => p.id === postId);
    const session = getBackendSession();
    if (!post || !session) return;
    const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
    if (!postOwnerUid || postOwnerUid === session.uid) return;
    void callEmulatorFunction("createPrivatePostThreadMessage", {
      uid: session.uid,
      deviceId: session.deviceId,
      postId,
      postOwnerUid,
      friendUid: session.uid,
      text,
    }).then(() => hydratePrivateThreadForPost(post));
    setCommentDraftByPostId((current) => ({ ...current, [postId]: "" }));
  }, [getBackendSession, hydratePrivateThreadForPost, posts, resolvePostOwnerBackendUid]);

  const addThreadReplyToComment = useCallback((postId: string, commentId: string, rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    const post = posts.find((p) => p.id === postId);
    const session = getBackendSession();
    if (!post || !session) return;
    const comment = (post.comments ?? []).find((c) => c.id === commentId);
    if (!comment) return;
    const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
    if (!postOwnerUid) return;
    const friendUid =
      post.authorId === CURRENT_USER_ID
        ? friendMap[comment.authorId]?.backendUid ?? null
        : session.uid;
    if (!friendUid) return;
    void callEmulatorFunction("createPrivatePostThreadMessage", {
      uid: session.uid,
      deviceId: session.deviceId,
      postId,
      postOwnerUid,
      friendUid,
      text,
    }).then(() => hydratePrivateThreadForPost(post));
    setThreadDraftByChainKey((current) => ({ ...current, [`${postId}:${commentId}`]: "" }));
  }, [friendMap, getBackendSession, hydratePrivateThreadForPost, posts, resolvePostOwnerBackendUid]);

  const submitFullscreenPostComment = useCallback(() => {
    const post = fullScreenPost;
    if (!post) return;
    if (postFullscreenThreadReplyKey) {
      const prefix = `${post.id}:`;
      if (!postFullscreenThreadReplyKey.startsWith(prefix)) return;
      const anchorCommentId = postFullscreenThreadReplyKey.slice(prefix.length);
      if (!anchorCommentId) return;
      const draft = threadDraftByChainKey[postFullscreenThreadReplyKey] ?? "";
      if (!draft.trim()) return;
      addThreadReplyToComment(post.id, anchorCommentId, draft);
      return;
    }
    const topDraft = commentDraftByPostId[post.id] ?? "";
    if (!topDraft.trim()) return;
    addCommentToPost(post.id, topDraft);
  }, [
    fullScreenPost,
    postFullscreenThreadReplyKey,
    threadDraftByChainKey,
    commentDraftByPostId,
    addCommentToPost,
    addThreadReplyToComment,
  ]);

  const toggleCommentReaction = useCallback((postId: string, commentId: string) => {
    const post = posts.find((p) => p.id === postId);
    const session = getBackendSession();
    if (!post || !session) return;
    const comment = (post.comments ?? []).find((c) => c.id === commentId);
    if (!comment) return;
    const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
    if (!postOwnerUid) return;
    const friendUid =
      post.authorId === CURRENT_USER_ID
        ? friendMap[comment.authorId]?.backendUid ?? null
        : session.uid;
    if (!friendUid || comment.id.startsWith("srv_")) return;
    void callEmulatorFunction("togglePrivatePostThreadMessageReaction", {
      uid: session.uid,
      deviceId: session.deviceId,
      postId,
      postOwnerUid,
      friendUid,
      messageId: comment.id,
      emoji: "👍",
    }).then(() => hydratePrivateThreadForPost(post));
  }, [friendMap, getBackendSession, hydratePrivateThreadForPost, posts, resolvePostOwnerBackendUid]);

  const toggleThreadReaction = useCallback((postId: string, commentId: string, threadId: string) => {
    const post = posts.find((p) => p.id === postId);
    const session = getBackendSession();
    if (!post || !session) return;
    const comment = (post.comments ?? []).find((c) => c.id === commentId);
    if (!comment) return;
    const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
    if (!postOwnerUid) return;
    const friendUid =
      post.authorId === CURRENT_USER_ID
        ? friendMap[comment.authorId]?.backendUid ?? null
        : session.uid;
    if (!friendUid) return;
    void callEmulatorFunction("togglePrivatePostThreadMessageReaction", {
      uid: session.uid,
      deviceId: session.deviceId,
      postId,
      postOwnerUid,
      friendUid,
      messageId: threadId,
      emoji: "👍",
    }).then(() => hydratePrivateThreadForPost(post));
  }, [friendMap, getBackendSession, hydratePrivateThreadForPost, posts, resolvePostOwnerBackendUid]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    if (view.screen !== "home") return;
    const tick = async () => {
      const targets = feedPosts.slice(0, 20);
      if (targets.length === 0) return;
      await Promise.all(targets.map((post) => hydratePrivateThreadForPost(post)));
    };
    void tick();
    const id = setInterval(() => void tick(), 7000);
    return () => clearInterval(id);
  }, [signedIn, feedPosts, getBackendSession, hydratePrivateThreadForPost, view.screen]);

  const renderPostGridCell = (post: Post) => {
    const w = postGridLayout.cell;
    const h = w;
    const thumb = getPostThumbnailUri(post);
    const hasMedia = !!(post.imageUris?.length || post.videoUri);
    return (
      <View style={[styles.postGridCell, { width: w, height: h }]}>
        {!hasMedia && post.text?.trim() ? (
          <View style={styles.postGridTextMiniWrap}>
            <Text style={styles.postGridTextMini} numberOfLines={5}>
              {post.text}
            </Text>
          </View>
        ) : thumb ? (
          <View style={StyleSheet.absoluteFillObject}>
            <Image source={{ uri: thumb }} style={styles.postGridImage} resizeMode="cover" />
            {post.videoUri ? (
              <View style={styles.postGridPlayBadge}>
                <Ionicons name="play" size={18} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.postGridEmpty, { width: w, height: h }]}>
            <Feather name="image" size={18} color={theme.subtleText} />
          </View>
        )}
      </View>
    );
  };

  const FeedPostCard = ({
    post,
    inFullscreenModal,
    hideComposers,
    onOpenViewer,
    onOpenCommentComposer,
    onOpenThreadReply,
  }: {
    post: Post;
    inFullscreenModal?: boolean;
    hideComposers?: boolean;
    onOpenViewer?: () => void;
    onOpenCommentComposer?: () => void;
    onOpenThreadReply?: (anchorCommentId: string) => void;
  }) => {
    const meta = postAuthorMeta(post.authorId);
    const canDelete = post.authorId === CURRENT_USER_ID;
    const mediaUris = post.imageUris ?? [];
    const [photoIndex, setPhotoIndex] = useState(0);
    const [aspectByUri, setAspectByUri] = useState<Record<string, number>>({});
    const mediaScrollRef = useRef<ScrollView | null>(null);
    const mediaTallestHeight = useMemo(() => {
      if (mediaUris.length === 0) return windowWidth;
      return mediaUris.reduce((maxHeight, uri) => {
        const ratio = aspectByUri[uri] ?? 1;
        const computedHeight = Math.round(windowWidth / Math.max(0.2, ratio));
        return Math.max(maxHeight, computedHeight);
      }, 0);
    }, [aspectByUri, mediaUris, windowWidth]);

    const friendOnlyReactionEntries = useMemo(() => {
      return Object.entries(post.feedReactions ?? {}).filter(([userId]) =>
        visibleFriendIds.includes(userId)
      );
    }, [post.feedReactions, visibleFriendIds]);

    const aggregatedFeedReactions = useMemo(() => {
      const m = new Map<string, number>();
      for (const [, emoji] of friendOnlyReactionEntries) {
        m.set(emoji, (m.get(emoji) ?? 0) + 1);
      }
      return [...m.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      );
    }, [friendOnlyReactionEntries]);

    const isPostOwnerView = post.authorId === CURRENT_USER_ID;
    const visibleComments = useMemo(() => {
      const comments = post.comments ?? [];
      if (isPostOwnerView) return comments;
      return comments.filter((comment) => comment.authorId === CURRENT_USER_ID);
    }, [post.comments, isPostOwnerView]);

    const chainsByFriend = useMemo(() => {
      const grouped: Record<string, PostComment[]> = {};
      for (const comment of visibleComments) {
        const key = comment.authorId;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(comment);
      }
      return grouped;
    }, [visibleComments]);

    const ownerChainCards = useMemo(() => {
      return Object.entries(chainsByFriend)
        .map(([friendId, comments]) => {
          const newest = [...comments].sort((a, b) => b.createdAt - a.createdAt)[0];
          return {
            friendId,
            count: comments.length,
            newestAt: newest?.createdAt ?? 0,
            newestText: newest?.text ?? "",
          };
        })
        .sort((a, b) => b.newestAt - a.newestAt);
    }, [chainsByFriend]);

    useEffect(() => {
      setPhotoIndex(0);
    }, [post.id]);

    const goToPhoto = (nextIndex: number) => {
      if (mediaUris.length <= 1) return;
      const clamped = Math.max(0, Math.min(nextIndex, mediaUris.length - 1));
      setPhotoIndex(clamped);
      mediaScrollRef.current?.scrollTo({ x: clamped * windowWidth, animated: true });
    };

    const anchorCommentForChain = (friendId: string) => {
      const chain = chainsByFriend[friendId] ?? [];
      const first = [...chain].sort((a, b) => a.createdAt - b.createdAt)[0];
      return first?.id ?? "";
    };

    return (
      <View style={styles.postFeedCard}>
        <Pressable
          onPress={() => {
            if (!inFullscreenModal) {
              onOpenViewer?.();
            }
          }}
          onLongPress={() => {
            if (canDelete) confirmDeletePost(post);
          }}
          delayLongPress={450}
          disabled={inFullscreenModal}
        >
        <View style={styles.postFeedHeaderRow}>
          <Pressable
            onPress={() => {
              if (post.authorId === CURRENT_USER_ID) {
                openMyProfile();
                return;
              }
              if (friendMap[post.authorId]) {
                openFriendProfile(post.authorId, "home");
              }
            }}
            accessibilityLabel={`Open ${meta.name} profile`}
          >
            {renderAvatar(meta.avatarUri, meta.name.slice(0, 1), 34)}
          </Pressable>
          <View style={styles.postFeedHeaderTextCol}>
            <Text style={styles.postFeedAuthor} numberOfLines={1}>
              {meta.name}
            </Text>
            <Text style={styles.postFeedTime}>{formatDayTime(post.createdAt)}</Text>
          </View>
          <Pressable
            style={styles.postFeedHeaderAction}
            onPress={() => openFeedPostActions(post)}
            accessibilityLabel="Post actions"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.subtleText} />
          </Pressable>
        </View>
        {post.text?.trim() ? <Text style={styles.postFeedBody}>{post.text}</Text> : null}

        {mediaUris.length > 0 ? (
          <View style={styles.postFeedMediaWrap}>
            <ScrollViewUntilScroll
              ref={mediaScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.postFeedImageStrip}
              onMomentumScrollEnd={({ nativeEvent }) => {
                const next = Math.round(nativeEvent.contentOffset.x / windowWidth);
                setPhotoIndex(Math.max(0, Math.min(next, mediaUris.length - 1)));
              }}
            >
              {mediaUris.map((uri) => {
                return (
                  <View key={uri} style={{ width: windowWidth, height: mediaTallestHeight }}>
                    <Image
                      source={{ uri }}
                      style={[styles.postFeedImageFullWidth, { height: mediaTallestHeight }]}
                      resizeMode="contain"
                      onLoad={({ nativeEvent }) => {
                        const w = nativeEvent.source?.width ?? 0;
                        const h = nativeEvent.source?.height ?? 0;
                        if (!w || !h) return;
                        const computed = w / h;
                        setAspectByUri((current) =>
                          current[uri] ? current : { ...current, [uri]: computed || 1 }
                        );
                      }}
                    />
                  </View>
                );
              })}
            </ScrollViewUntilScroll>
            {mediaUris.length > 1 ? (
              <>
                <Pressable
                  style={[styles.postCarouselChevron, styles.postCarouselChevronLeft]}
                  onPress={() => goToPhoto(photoIndex - 1)}
                  accessibilityLabel="Previous photo"
                >
                  <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  style={[styles.postCarouselChevron, styles.postCarouselChevronRight]}
                  onPress={() => goToPhoto(photoIndex + 1)}
                  accessibilityLabel="Next photo"
                >
                  <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                </Pressable>
                <View style={styles.postCarouselCountBadge}>
                  <Text style={styles.postCarouselCountText}>
                    {photoIndex + 1}/{mediaUris.length}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {post.videoUri ? (
          <Video
            style={styles.postFeedVideo}
            source={{ uri: post.videoUri }}
            usePoster={!!post.videoPosterUri}
            posterSource={post.videoPosterUri ? { uri: post.videoPosterUri } : undefined}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay={false}
          />
        ) : null}
        {aggregatedFeedReactions.length > 0 ? (
          <Pressable
            onPress={() => setReactionDetailPost(post)}
            style={styles.feedReactionRow}
            accessibilityLabel="View reactions"
            accessibilityRole="button"
          >
            {aggregatedFeedReactions.map(([emoji, count]) => (
              <View key={emoji} style={styles.feedReactionSummaryChip}>
                <Text style={styles.feedReactionSummaryEmoji}>{emoji}</Text>
                {count > 1 ? (
                  <Text style={styles.feedReactionSummaryCount}>{count}</Text>
                ) : null}
              </View>
            ))}
          </Pressable>
        ) : null}
        <View style={styles.feedCommentActionRow}>
          <Ionicons name="chatbubble-outline" size={15} color={theme.subtleText} />
          <Text style={styles.feedCommentActionText}>
            {visibleComments.length > 0 ? `Comments (${visibleComments.length})` : "No comments yet"}
          </Text>
        </View>
        </Pressable>

        {isPostOwnerView ? (
          <View style={styles.privateCommentInlineSection}>
            {ownerChainCards.map((chain) => {
              const expanded = !!expandedCommentChainsByPost[post.id]?.[chain.friendId];
              const chainComments = chainsByFriend[chain.friendId] ?? [];
              const flatThread = chainComments
                .flatMap((comment) => [
                  {
                    id: comment.id,
                    authorId: comment.authorId,
                    text: comment.text,
                    createdAt: comment.createdAt,
                    reactions: comment.reactions,
                    parentCommentId: comment.id,
                  },
                  ...(comment.thread ?? []).map((entry) => ({
                    ...entry,
                    parentCommentId: comment.id,
                  })),
                ])
                .sort((a, b) => a.createdAt - b.createdAt);
              return (
                <View key={`${post.id}:${chain.friendId}`} style={styles.privateCommentCard}>
                  <Pressable
                    style={styles.privateCommentChainHeader}
                    onPress={() =>
                      setExpandedCommentChainsByPost((current) => ({
                        ...current,
                        [post.id]: {
                          ...(current[post.id] ?? {}),
                          [chain.friendId]: !expanded,
                        },
                      }))
                    }
                  >
                    <Text style={styles.privateCommentChainName}>
                      {postAuthorMeta(chain.friendId).name}
                    </Text>
                    <Text style={styles.privateCommentChainPreview} numberOfLines={1}>
                      {chain.newestText}
                    </Text>
                  </Pressable>
                  {expanded ? (
                    <View style={styles.privateCommentThreadPlain}>
                      {flatThread.map((entry) => {
                        const reactionCount = Object.keys(entry.reactions ?? {}).length;
                        return (
                          <View key={entry.id} style={styles.privateCommentPlainRow}>
                            <Text style={styles.privateCommentMeta}>
                              {entry.authorId === CURRENT_USER_ID
                                ? "You"
                                : postAuthorMeta(entry.authorId).name}{" "}
                              · {formatDayTime(entry.createdAt)}
                            </Text>
                            <Text style={styles.privateCommentBody}>{entry.text}</Text>
                            <Pressable
                              style={styles.feedCommentActionButton}
                              onPress={() =>
                                entry.parentCommentId === entry.id
                                  ? toggleCommentReaction(post.id, entry.parentCommentId)
                                  : toggleThreadReaction(post.id, entry.parentCommentId, entry.id)
                              }
                            >
                              <Text style={styles.feedCommentActionText}>
                                👍 {reactionCount > 0 ? reactionCount : ""}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })}
                      {chainComments.length > 0 && (!hideComposers || inFullscreenModal) ? (
                        <Pressable
                          style={styles.postCommentPlaceholderBar}
                          onPress={() =>
                            onOpenThreadReply?.(chainComments[0]?.id ?? anchorCommentForChain(chain.friendId))
                          }
                        >
                          <Text style={styles.postCommentPlaceholderText}>{`Reply to ${postAuthorMeta(chain.friendId).name}...`}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.privateCommentInlineSection}>
            {visibleComments.map((comment) => {
              const flatThread = [
                {
                  id: comment.id,
                  authorId: comment.authorId,
                  text: comment.text,
                  createdAt: comment.createdAt,
                  reactions: comment.reactions,
                  parentCommentId: comment.id,
                },
                ...(comment.thread ?? []).map((entry) => ({ ...entry, parentCommentId: comment.id })),
              ].sort((a, b) => a.createdAt - b.createdAt);
              return (
                <View key={comment.id} style={styles.privateCommentCard}>
                  <View style={styles.privateCommentThreadPlain}>
                    {flatThread.map((entry) => {
                      const reactionCount = Object.keys(entry.reactions ?? {}).length;
                      return (
                        <View key={entry.id} style={styles.privateCommentPlainRow}>
                          <Text style={styles.privateCommentMeta}>
                            {entry.authorId === CURRENT_USER_ID ? "You" : postAuthorMeta(entry.authorId).name} ·{" "}
                            {formatDayTime(entry.createdAt)}
                          </Text>
                          <Text style={styles.privateCommentBody}>{entry.text}</Text>
                          <Pressable
                            style={styles.feedCommentActionButton}
                            onPress={() =>
                              entry.parentCommentId === entry.id
                                ? toggleCommentReaction(post.id, entry.parentCommentId)
                                : toggleThreadReaction(post.id, entry.parentCommentId, entry.id)
                            }
                          >
                            <Text style={styles.feedCommentActionText}>
                              👍 {reactionCount > 0 ? reactionCount : ""}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            {!hideComposers ? (
              <Pressable style={styles.postCommentPlaceholderBar} onPress={() => onOpenCommentComposer?.()}>
                <Text style={styles.postCommentPlaceholderText}>Add comment...</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  const showHome = view.screen === "home";
  const showChatScreen =
    view.screen === "chat" && (pendingDraft !== null || resolvedChat !== null);
  const showCompactComposer = keyboardVisible && !!chatInput.trim();

  useEffect(() => {
    if (!showChatScreen || !shouldFocusChatInput) return;
    const timer = setTimeout(() => {
      chatInputRef.current?.focus();
      setShouldFocusChatInput(false);
    }, 60);
    return () => clearTimeout(timer);
  }, [showChatScreen, shouldFocusChatInput]);

  const showBootSplash = !appBootAuthResolved || !appBootMinMsElapsed;
  if (showBootSplash) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: safeTop }}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View
          style={{
            flex: 1,
            backgroundColor: theme.background,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 28,
          }}
          accessible
          accessibilityLabel="Launching"
        >
          <Text
            style={{
              fontSize: 44,
              fontWeight: "900",
              letterSpacing: 0.5,
              color: theme.accent,
            }}
          >
            tBH
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 17,
              fontWeight: "600",
              textAlign: "center",
              color: theme.text,
            }}
          >
            {PLACEHOLDER_APP_PRODUCT_NAME}
          </Text>
        </View>
      </View>
    );
  }

  if (!signedIn) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: safeTop + 10 }]}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        {authMode === "login" ? (
          <View style={styles.authLoginRoot}>
            <View style={styles.authTopBar}>
              <View style={styles.authTopSideSpacer} />
              {DEMO_OFFLINE_MODE ? (
                <View style={styles.authTopSideSpacer} />
              ) : (
                <Pressable onPress={() => setAuthMode("signup")} style={styles.authTopLinkButton}>
                  <Text style={styles.authTopLinkText}>Sign up</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.authCentered}>
              <View style={styles.authCard}>
                <Text style={styles.authHeading}>{DEMO_OFFLINE_MODE ? "Demo Login" : "Login"}</Text>
                {DEMO_OFFLINE_MODE ? (
                  <Text style={[styles.subtleText, { marginBottom: 8 }]}>Use User A / 1234 or User B / 5678</Text>
                ) : null}
                <TextInput
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  placeholder={DEMO_OFFLINE_MODE ? "Username" : "Email"}
                  autoCapitalize="none"
                  keyboardType={DEMO_OFFLINE_MODE ? "default" : "email-address"}
                  placeholderTextColor={theme.subtleText}
                  style={styles.searchInput}
                />
                <View style={styles.passwordInputRow}>
                  <TextInput
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    placeholder="Password"
                    secureTextEntry={!loginPasswordVisible}
                    placeholderTextColor={theme.subtleText}
                    style={[styles.searchInput, styles.passwordInputField]}
                  />
                  <Pressable
                    onPress={() => setLoginPasswordVisible((v) => !v)}
                    style={styles.passwordVisibilityButton}
                    accessibilityLabel={loginPasswordVisible ? "Hide password" : "Show password"}
                  >
                    <Ionicons
                      name={loginPasswordVisible ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={theme.subtleText}
                    />
                  </Pressable>
                </View>
                <Pressable style={styles.primaryButton} onPress={login}>
                  <Text style={styles.primaryButtonText}>{DEMO_OFFLINE_MODE ? "Login" : "Request OTP"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : authMode === "loginOtp" ? (
          <View style={styles.authLoginRoot}>
            <View style={styles.authTopBar}>
              <Pressable onPress={() => setAuthMode("login")} style={styles.authTopLinkButton}>
                <Ionicons name="arrow-back" size={20} color={theme.text} />
              </Pressable>
              <View style={styles.authTopSideSpacer} />
            </View>
            <View style={styles.authCentered}>
              <View style={styles.authCard}>
                <Text style={styles.authHeading}>Enter OTP</Text>
                <Text style={styles.subtleText}>Enter the OTP sent to {loginEmail.trim()}.</Text>
                <TextInput
                  value={loginOtp}
                  onChangeText={setLoginOtp}
                  placeholder="OTP code"
                  keyboardType="number-pad"
                  placeholderTextColor={theme.subtleText}
                  style={styles.searchInput}
                />
                <Pressable style={styles.primaryButton} onPress={completeLoginWithOtp}>
                  <Text style={styles.primaryButtonText}>Verify and Login</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : authMode === "signup" ? (
          <ScrollViewUntilScroll contentContainerStyle={styles.authCard}>
            <View style={styles.authTopBar}>
              <Pressable onPress={() => setAuthMode("login")} style={styles.authTopLinkButton}>
                <Ionicons name="arrow-back" size={20} color={theme.text} />
              </Pressable>
              <View style={styles.authTopSideSpacer} />
            </View>
            <Text style={styles.authHeading}>Sign Up</Text>
            <TextInput
              value={signupEmail}
              onChangeText={setSignupEmail}
              placeholder="Email (name@example.com)"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={theme.subtleText}
              style={styles.searchInput}
            />
            <TextInput
              value={signupUsername}
              onChangeText={setSignupUsername}
              placeholder="Username"
              autoCapitalize="none"
              placeholderTextColor={theme.subtleText}
              style={styles.searchInput}
            />
            <TextInput
              value={signupPhoneNumber}
              onChangeText={setSignupPhoneNumber}
              placeholder="Phone number"
              keyboardType="phone-pad"
              placeholderTextColor={theme.subtleText}
              style={styles.searchInput}
            />
            <View style={styles.passwordInputRow}>
              <TextInput
                value={signupPassword}
                onChangeText={setSignupPassword}
                placeholder="Desired password"
                secureTextEntry={!signupPasswordVisible}
                placeholderTextColor={theme.subtleText}
                style={[styles.searchInput, styles.passwordInputField]}
              />
              <Pressable
                onPress={() => setSignupPasswordVisible((v) => !v)}
                style={styles.passwordVisibilityButton}
                accessibilityLabel={signupPasswordVisible ? "Hide password" : "Show password"}
              >
                <Ionicons
                  name={signupPasswordVisible ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.subtleText}
                />
              </Pressable>
            </View>
            <Text style={styles.subtleText}>
              Password rules: at least 8 characters with upper/lower case letters, a number, and a special character.
            </Text>
            <View style={styles.passwordInputRow}>
              <TextInput
                value={signupPasswordConfirm}
                onChangeText={setSignupPasswordConfirm}
                placeholder="Re-enter password"
                secureTextEntry={!signupPasswordConfirmVisible}
                placeholderTextColor={theme.subtleText}
                style={[styles.searchInput, styles.passwordInputField]}
              />
              <Pressable
                onPress={() => setSignupPasswordConfirmVisible((v) => !v)}
                style={styles.passwordVisibilityButton}
                accessibilityLabel={signupPasswordConfirmVisible ? "Hide password" : "Show password"}
              >
                <Ionicons
                  name={signupPasswordConfirmVisible ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.subtleText}
                />
              </Pressable>
            </View>
            <Pressable style={styles.primaryButton} onPress={startSignup}>
              <Text style={styles.primaryButtonText}>Create account</Text>
            </Pressable>
          </ScrollViewUntilScroll>
        ) : (
          <View style={styles.authLoginRoot}>
            <View style={styles.authTopBar}>
              <Pressable onPress={() => setAuthMode("signup")} style={styles.authTopLinkButton}>
                <Ionicons name="arrow-back" size={20} color={theme.text} />
              </Pressable>
              <View style={styles.authTopSideSpacer} />
            </View>
            <View style={styles.authCentered}>
              <View style={styles.authCard}>
                <Text style={styles.authHeading}>Enter OTP</Text>
                <Text style={styles.subtleText}>Enter the OTP sent to {signupPhoneNumber.trim()}.</Text>
                <TextInput
                  value={signupOtp}
                  onChangeText={setSignupOtp}
                  placeholder="OTP code"
                  keyboardType="number-pad"
                  placeholderTextColor={theme.subtleText}
                  style={styles.searchInput}
                />
                <Pressable style={styles.primaryButton} onPress={completeSignupWithOtp}>
                  <Text style={styles.primaryButtonText}>Verify OTP</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.screenRoot, { backgroundColor: theme.background }]}>
      <StatusBar
        style={
          view.screen === "addFriend" ? (isDarkMode ? "dark" : "light") : isDarkMode ? "light" : "dark"
        }
      />
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID="bioInputAccessory">
          <View style={styles.inputAccessoryBar}>
            <Pressable
              style={styles.inputAccessoryBarButton}
              onPress={() => {
                Keyboard.dismiss();
              }}
            >
              <Text style={styles.inputAccessoryBarButtonText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      {fullScreenPost ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closeFullscreenPost}
        >
          <KeyboardAvoidingView
            style={[styles.fullScreenPostRoot, { backgroundColor: theme.background }]}
            behavior="padding"
            enabled={keyboardVisible}
            keyboardVerticalOffset={0}
          >
            <View style={{ paddingTop: safeTop, flex: 1 }}>
              {Platform.OS === "ios" ? (
                <InputAccessoryView nativeID="postCommentInputAccessory">
                  <View style={styles.inputAccessoryBar}>
                    <Pressable
                      style={styles.inputAccessoryBarButton}
                      onPress={() => {
                        void submitFullscreenPostComment();
                      }}
                      accessibilityLabel="Send comment"
                    >
                      <Text style={styles.inputAccessoryBarButtonText}>Send</Text>
                    </Pressable>
                    <Pressable
                      style={styles.inputAccessoryBarButton}
                      onPress={() => Keyboard.dismiss()}
                      accessibilityLabel="Dismiss keyboard"
                    >
                      <Text style={styles.inputAccessoryBarButtonText}>Done</Text>
                    </Pressable>
                  </View>
                </InputAccessoryView>
              ) : null}
              <View style={styles.fullScreenPostHeader}>
                <Pressable
                  style={styles.iconButton}
                  onPress={closeFullscreenPost}
                  accessibilityLabel="Close full screen post"
                >
                  <Ionicons name="close" size={26} color={theme.text} />
                </Pressable>
                <Text style={styles.profileHeaderTitle} numberOfLines={1}>
                  Post
                </Text>
                <View style={styles.headerSpacer} />
              </View>
              <ScrollViewUntilScroll
                style={{ flex: 1 }}
                contentContainerStyle={[styles.friendProfileScroll, { paddingBottom: 16 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <FeedPostCard
                  post={fullScreenPost}
                  inFullscreenModal
                  hideComposers
                  onOpenThreadReply={(cid) => {
                    setPostFullscreenThreadReplyKey(`${fullScreenPost.id}:${cid}`);
                    requestAnimationFrame(() => postCommentInputRef.current?.focus());
                  }}
                />
              </ScrollViewUntilScroll>
              {(() => {
                const pc = fullScreenPost;
                const isViewerOwner = pc.authorId === CURRENT_USER_ID;
                const threadDraftKey = postFullscreenThreadReplyKey;
                const composerActive = !isViewerOwner || !!threadDraftKey;
                const commentValue = threadDraftKey
                  ? (threadDraftByChainKey[threadDraftKey] ?? "")
                  : (commentDraftByPostId[pc.id] ?? "");

                const onChangeCommentText = (text: string) => {
                  if (threadDraftKey) {
                    setThreadDraftByChainKey((current) => ({ ...current, [threadDraftKey]: text }));
                  } else {
                    setCommentDraftByPostId((current) => ({ ...current, [pc.id]: text }));
                  }
                };

                return (
                  <View
                    style={[
                      styles.chatComposerStack,
                      {
                        borderTopColor: theme.divider,
                        backgroundColor: theme.background,
                      },
                    ]}
                  >
                    {postFullscreenThreadReplyKey ? (
                      <View style={styles.replyBanner}>
                        <Text style={styles.replyBannerText} numberOfLines={2}>
                          Replying in a private thread
                        </Text>
                        <Pressable
                          onPress={() => setPostFullscreenThreadReplyKey(null)}
                          style={styles.replyBannerClose}
                          accessibilityLabel="Leave thread reply"
                        >
                          <Ionicons name="close" size={16} color={theme.text} />
                        </Pressable>
                      </View>
                    ) : isViewerOwner ? (
                      <View
                        style={[
                          styles.replyBanner,
                          { backgroundColor: theme.replyBannerQuotingOtherBg, borderBottomColor: theme.divider },
                        ]}
                      >
                        <Text style={[styles.replyBannerText, { color: theme.text }]} numberOfLines={2}>
                          Tap Reply on a conversation above — your message sends from this field once a thread is
                          selected.
                        </Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.chatInputBar,
                        {
                          paddingTop: keyboardVisible ? 4 : 8,
                          paddingBottom: keyboardVisible ? 4 : Math.max(insets.bottom, 10),
                        },
                      ]}
                    >
                      <TextInput
                        ref={postCommentInputRef}
                        editable={composerActive}
                        value={composerActive ? commentValue : ""}
                        onChangeText={onChangeCommentText}
                        placeholder={
                          composerActive
                            ? postFullscreenThreadReplyKey
                              ? "Reply…"
                              : "Add comment…"
                            : "Select a thread above…"
                        }
                        placeholderTextColor={theme.subtleText}
                        style={[styles.chatInputMultiline, !composerActive && { opacity: 0.55 }]}
                        multiline
                        textAlignVertical="top"
                        returnKeyType="send"
                        enablesReturnKeyAutomatically
                        blurOnSubmit={false}
                        inputAccessoryViewID={Platform.OS === "ios" ? "postCommentInputAccessory" : undefined}
                        onSubmitEditing={() => {
                          if (composerActive && commentValue.trim()) {
                            void submitFullscreenPostComment();
                          }
                        }}
                      />
                      <Pressable
                        disabled={!composerActive || !commentValue.trim()}
                        style={[styles.sendButtonChat, (!composerActive || !commentValue.trim()) && { opacity: 0.45 }]}
                        onPress={() => void submitFullscreenPostComment()}
                        accessibilityLabel="Send comment"
                      >
                        <Ionicons name="send" size={16} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  </View>
                );
              })()}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}

      {reactionDetailPost ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setReactionDetailPost(null)}
        >
          <View style={styles.reactionDetailModalRoot}>
            <Pressable
              style={styles.reactionDetailModalBackdrop}
              onPress={() => setReactionDetailPost(null)}
              accessibilityLabel="Dismiss"
            />
            <View style={[styles.reactionDetailModalCard, { backgroundColor: theme.background }]}>
              <View style={styles.reactionDetailModalHeader}>
                <Text style={styles.reactionDetailModalTitle}>Reactions</Text>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => setReactionDetailPost(null)}
                  accessibilityLabel="Close reactions"
                >
                  <Ionicons name="close" size={22} color={theme.text} />
                </Pressable>
              </View>
              <FlatListUntilScroll
                data={feedReactionDetailRows}
                keyExtractor={(item) => item.userId}
                keyboardShouldPersistTaps="handled"
                style={styles.reactionDetailModalList}
                contentContainerStyle={
                  feedReactionDetailRows.length === 0 ? styles.reactionDetailModalEmpty : undefined
                }
                ListEmptyComponent={
                  <Text style={styles.subtleText}>No reactions from friends.</Text>
                }
                renderItem={({ item }) => (
                  <View style={styles.reactionDetailModalRow}>
                    <Text style={styles.reactionDetailModalName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.reactionDetailModalEmoji}>{item.emoji}</Text>
                  </View>
                )}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {showHome ? (
        <View style={[styles.homeColumn, { paddingTop: safeTop }]}>
          <View style={styles.homeTopBar}>
            <View style={styles.homeTopLeftIcons}>
              <Pressable
                onPress={() => setSettingsOpen(true)}
                style={styles.iconButton}
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={22} color={theme.accent} />
              </Pressable>
              <Pressable
                onPress={openMyProfile}
                style={[
                  styles.iconButton,
                  homeNavIconHighlight.myProfile ? styles.homeModeIconActive : null,
                ]}
                accessibilityLabel="My profile"
              >
                <Ionicons
                  name={homeNavIconHighlight.myProfile ? "person-circle" : "person-circle-outline"}
                  size={24}
                  color={theme.accent}
                />
              </Pressable>
              <Pressable
                onPress={openFriendsListFromHome}
                style={[
                  styles.iconButton,
                  homeNavIconHighlight.friendsList ? styles.homeModeIconActive : null,
                ]}
                accessibilityLabel="Friends list"
                accessibilityHint="Opens your friends list. You can also swipe right on the chat list."
              >
                <Ionicons
                  name={homeNavIconHighlight.friendsList ? "people" : "people-outline"}
                  size={22}
                  color={theme.accent}
                />
              </Pressable>
              <Pressable
                onPress={() => setHomeTab("chats")}
                style={[
                  styles.iconButton,
                  homeNavIconHighlight.chats ? styles.homeModeIconActive : null,
                ]}
                accessibilityLabel="Open chats"
              >
                <Ionicons
                  name={homeNavIconHighlight.chats ? "chatbubbles" : "chatbubbles-outline"}
                  size={21}
                  color={theme.accent}
                />
              </Pressable>
              <Pressable
                onPress={() => setHomeTab("feed")}
                style={[
                  styles.iconButton,
                  homeNavIconHighlight.feed ? styles.homeModeIconActive : null,
                ]}
                accessibilityLabel="Open feed"
              >
                <Ionicons
                  name={homeNavIconHighlight.feed ? "newspaper" : "newspaper-outline"}
                  size={21}
                  color={theme.accent}
                />
              </Pressable>
              <Pressable
                onPress={openAddFriendFromHome}
                style={[
                  styles.iconButton,
                  homeNavIconHighlight.addFriend ? styles.homeModeIconActive : null,
                ]}
                accessibilityLabel="Add friend"
              >
                <Ionicons
                  name={homeNavIconHighlight.addFriend ? "person-add" : "person-add-outline"}
                  size={22}
                  color={theme.accent}
                />
              </Pressable>
            </View>
            <Pressable onPress={logout} style={styles.iconButton} accessibilityLabel="Logout">
              <Ionicons name="log-out-outline" size={22} color={theme.accent} />
            </Pressable>
          </View>

          {homeTab === "chats" ? (
            <View style={styles.homeMainSwipeLayer} {...homeSwipeOpenFriendsPan.panHandlers}>
              <View style={styles.onlineStripOuter}>
                <View style={styles.onlineStripClip}>
                  <FlatListUntilScroll
                    horizontal
                    data={prioritizedOnlineFriends}
                    keyExtractor={(f) => f.id}
                    showsHorizontalScrollIndicator={false}
                    style={styles.onlineStripList}
                    contentContainerStyle={onlineStripContentStyle}
                    renderItem={({ item: friend }) => (
                      <TouchableOpacity
                        style={[styles.onlineFriendItem, { width: onlineStripLayout.slotWidth }]}
                        onPress={() => findOrCreateChatWithFriend(friend.id)}
                        accessibilityLabel={`Open chat with ${friend.displayName}`}
                      >
                        <View style={styles.profileCircleWrap}>
                          {renderAvatar(
                            friend.profilePictureUrl,
                            friend.displayName.slice(0, 1),
                            onlineStripLayout.avatarSize
                          )}
                        </View>
                        <Text style={styles.onlineFriendName} numberOfLines={1}>
                          {friend.displayName}
                        </Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <Text style={styles.onlineStripEmpty}>No online friends</Text>
                    }
                  />
                </View>
              </View>

              <FlatListUntilScroll
                style={styles.chatListFlex}
                data={sortedChats}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.chatList}
                renderItem={({ item }) => {
                  const counterpartIds = item.memberIds.filter((id) => id !== CURRENT_USER_ID);
                  const showOnline = counterpartIds.some((id) => friendMap[id]?.online);
                  const lastMessage = lastMessageByChatId[item.id];
                  const isGroup = counterpartIds.length !== 1;
                  const primaryFriendId = !isGroup ? counterpartIds[0] : null;
                  const avatarLetter = isGroup ? "^" : friendMap[counterpartIds[0]]?.displayName.slice(0, 1) ?? "^";
                  const avatarUri = !isGroup ? friendMap[counterpartIds[0]]?.profilePictureUrl : undefined;
                  const itemTitle = item.name;
                  return (
                    <View
                      style={[
                        styles.chatRowBlock,
                        item.kind === "broadcast" ? styles.broadcastChatRowBlock : null,
                      ]}
                    >
                      <View
                        style={[styles.chatRow, item.kind === "broadcast" ? styles.broadcastChatRow : null]}
                      >
                        <Pressable
                          style={styles.chatAvatarWrap}
                          onPress={() => {
                            if (primaryFriendId) {
                              openFriendProfile(primaryFriendId, "home");
                            }
                          }}
                          disabled={!primaryFriendId}
                        >
                          {isGroup ? (
                            isLikelyChatProfileImageUri(item.profilePicture) ? (
                              renderAvatar(
                                item.profilePicture,
                                itemTitle.slice(0, 1) || "^",
                                42
                              )
                            ) : (
                              <View style={styles.chatAvatar}>
                                <Text style={styles.chatAvatarText}>{item.profilePicture ?? "^"}</Text>
                              </View>
                            )
                          ) : (
                            renderAvatar(avatarUri, avatarLetter, 42)
                          )}
                          {showOnline ? <View style={styles.onlineDot} /> : null}
                        </Pressable>
                        <TouchableOpacity
                          style={styles.chatTapCard}
                          onPress={() => openChatFromHome(item.id)}
                          onLongPress={() => openChatRowActions(item)}
                          delayLongPress={400}
                          accessibilityLabel={`Open chat ${item.name}`}
                        >
                          <View style={styles.chatTextWrap}>
                            {item.kind === "broadcast" ? (
                              <View style={styles.broadcastBadge}>
                                <Text style={styles.broadcastBadgeText}>Broadcast</Text>
                              </View>
                            ) : null}
                            <View style={styles.chatTitleRow}>
                              <Text
                                style={[
                                  item.kind === "broadcast" ? styles.broadcastChatTitle : styles.chatName,
                                  styles.chatTitleTextFlex,
                                ]}
                                numberOfLines={1}
                              >
                                {itemTitle}
                                {item.isDraft ? " (Draft)" : ""}
                              </Text>
                              {item.mutedForNotifications ? (
                                <Ionicons
                                  name="notifications-off-outline"
                                  size={17}
                                  color={theme.subtleText}
                                  style={styles.chatMutedIcon}
                                />
                              ) : null}
                            </View>
                            <Text style={styles.chatPreview} numberOfLines={1}>
                              {buildHomeChatPreview(item, lastMessage, friendMap, unfriendedIds)}
                            </Text>
                          </View>
                          <Text style={styles.chatTimestamp}>
                            {formatDayTime((lastMessage?.createdAt ?? item.updatedAt) as number)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />

              <View style={styles.homeBottomChrome}>
                <Pressable
                  style={styles.startChatButton}
                  onPress={() => {
                    setComposerMode("standard");
                    setSelectedComposerIds([]);
                    setComposerSearch("");
                    setComposerCustomTitle("");
                    setSelectedBroadcastGroupId(null);
                    setBroadcastGroupDropdownOpen(false);
                    setChatComposerOpen(true);
                  }}
                >
                  <MaterialCommunityIcons name="email-plus-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.startChatButtonText}>Start Chat</Text>
                </Pressable>
                <View
                  style={[
                    styles.bottomDeadZone,
                    {
                      height: Math.max(insets.bottom, 0),
                      backgroundColor: theme.background,
                    },
                  ]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
            </View>
          ) : (
            <>
              <FlatListUntilScroll
                style={[styles.chatListFlex, styles.feedListFullBleed]}
                data={feedPosts}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.feedList,
                  { paddingBottom: Math.max(insets.bottom, 0) + 84 },
                ]}
                ItemSeparatorComponent={() => <View style={styles.feedSeparator} />}
                ListEmptyComponent={<Text style={styles.feedEmpty}>No posts from friends yet.</Text>}
                renderItem={({ item }) => (
                  <FeedPostCard
                    post={item}
                    onOpenViewer={() => openPostViewerFromFeed(item)}
                    onOpenCommentComposer={() => openPostCommentComposerFromFeed(item)}
                    onOpenThreadReply={(cid) => openPostThreadReplyFromFeed(item, cid)}
                  />
                )}
              />
              <Pressable
                style={[styles.feedFabButton, { bottom: Math.max(insets.bottom, 0) + 10 }]}
                onPress={openPostComposer}
              >
                <Ionicons name="create-outline" size={22} color="#FFFFFF" />
                <Text style={styles.startChatButtonText}>New post</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {view.screen === "friendProfile" && friendMap[view.friendId] ? (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 20 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={safeTop}
        >
          <View style={[styles.fullScreen, { paddingTop: safeTop }]}>
            <View style={styles.homeTopBar}>
              <View style={styles.homeTopLeftIcons}>
                <Pressable
                  onPress={() => setSettingsOpen(true)}
                  style={styles.iconButton}
                  accessibilityLabel="Settings"
                >
                  <Ionicons name="settings-outline" size={22} color={theme.accent} />
                </Pressable>
                <Pressable onPress={openMyProfile} style={styles.iconButton} accessibilityLabel="My profile">
                  <Ionicons name="person-circle-outline" size={24} color={theme.accent} />
                </Pressable>
                <Pressable onPress={openFriendsListFromHome} style={styles.iconButton} accessibilityLabel="Friends list">
                  <Ionicons name="people-outline" size={22} color={theme.accent} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHomeTab("chats");
                    setView({ screen: "home" });
                  }}
                  style={styles.iconButton}
                  accessibilityLabel="Open chats"
                >
                  <Ionicons name="chatbubbles-outline" size={21} color={theme.accent} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHomeTab("feed");
                    setView({ screen: "home" });
                  }}
                  style={styles.iconButton}
                  accessibilityLabel="Open feed"
                >
                  <Ionicons name="newspaper-outline" size={21} color={theme.accent} />
                </Pressable>
                <Pressable onPress={openAddFriendFromHome} style={styles.iconButton} accessibilityLabel="Add friend">
                  <Ionicons name="person-add-outline" size={22} color={theme.accent} />
                </Pressable>
              </View>
              <Pressable onPress={logout} style={styles.iconButton} accessibilityLabel="Logout">
                <Ionicons name="log-out-outline" size={22} color={theme.accent} />
              </Pressable>
            </View>
            <ScrollViewUntilScroll
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.friendProfileScroll}
            >
              <View style={styles.friendHeroImageFrame}>
                <Image
                  source={{ uri: friendMap[view.friendId].profilePictureUrl }}
                  style={styles.friendHeroImageFill}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.friendHeroName}>{friendMap[view.friendId].displayName}</Text>
              <Text style={styles.friendHeroBio}>{friendMap[view.friendId].bio}</Text>
              <Text style={styles.friendHeroStatus}>
                {friendMap[view.friendId].online ? "Online" : "Offline"}
              </Text>
              {friendProfileMediaPosts.length > 0 ? (
                <View style={styles.profilePostsSection}>
                  {chunkBy(friendProfileMediaPosts, 3).map((row, ri) => (
                    <View
                      key={`fp-row-${ri}`}
                      style={[styles.postGridRow, { marginBottom: postGridLayout.gap }]}
                    >
                      {row.map((p, ci) => (
                        <Pressable
                          key={p.id}
                          onPress={() => openPostViewerFromFeed(p)}
                          style={{
                            marginRight: ci < row.length - 1 ? postGridLayout.gap : 0,
                          }}
                        >
                          {renderPostGridCell(p)}
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.profilePostsSection}>
                {friendProfilePosts.map((post) => (
                  <FeedPostCard
                    key={`friend-post-${post.id}`}
                    post={post}
                    onOpenViewer={() => openPostViewerFromFeed(post)}
                    onOpenCommentComposer={() => openPostCommentComposerFromFeed(post)}
                    onOpenThreadReply={(cid) => openPostThreadReplyFromFeed(post, cid)}
                  />
                ))}
              </View>
            </ScrollViewUntilScroll>
            <View style={[styles.profileBottomBar, { paddingBottom: insets.bottom + 12 }]}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  findOrCreateChatWithFriend(view.friendId);
                }}
              >
                <Text style={styles.primaryButtonText}>Start chat</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {view.screen === "myProfile" ? (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 20 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={safeTop}
        >
          <View style={[styles.fullScreen, { paddingTop: safeTop }]}>
            <View style={styles.homeTopBar}>
              <View style={styles.homeTopLeftIcons}>
                <Pressable
                  onPress={() => setSettingsOpen(true)}
                  style={styles.iconButton}
                  accessibilityLabel="Settings"
                >
                  <Ionicons name="settings-outline" size={22} color={theme.accent} />
                </Pressable>
                <Pressable
                  onPress={openMyProfile}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.myProfile ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="My profile"
                >
                  <Ionicons
                    name={homeNavIconHighlight.myProfile ? "person-circle" : "person-circle-outline"}
                    size={24}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={openFriendsListFromHome}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.friendsList ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Friends list"
                >
                  <Ionicons
                    name={homeNavIconHighlight.friendsList ? "people" : "people-outline"}
                    size={22}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHomeTab("chats");
                    setView({ screen: "home" });
                  }}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.chats ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Open chats"
                >
                  <Ionicons
                    name={homeNavIconHighlight.chats ? "chatbubbles" : "chatbubbles-outline"}
                    size={21}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHomeTab("feed");
                    setView({ screen: "home" });
                  }}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.feed ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Open feed"
                >
                  <Ionicons
                    name={homeNavIconHighlight.feed ? "newspaper" : "newspaper-outline"}
                    size={21}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={openAddFriendFromHome}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.addFriend ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Add friend"
                >
                  <Ionicons
                    name={homeNavIconHighlight.addFriend ? "person-add" : "person-add-outline"}
                    size={22}
                    color={theme.accent}
                  />
                </Pressable>
              </View>
              <Pressable onPress={logout} style={styles.iconButton} accessibilityLabel="Logout">
                <Ionicons name="log-out-outline" size={22} color={theme.accent} />
              </Pressable>
            </View>
            <ScrollViewUntilScroll
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.friendProfileScroll}
            >
              <Pressable onPress={pickProfileImage}>
                {myProfilePictureUrl ? (
                  <View style={styles.friendHeroImageFrame}>
                    <Image
                      source={{ uri: myProfilePictureUrl }}
                      style={styles.friendHeroImageFill}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View style={[styles.friendHeroImageFrame, styles.myProfilePlaceholder]}>
                    <Ionicons name="camera-outline" size={48} color={theme.subtleText} />
                    <Text style={styles.subtleText}>Tap to choose a profile picture</Text>
                  </View>
                )}
              </Pressable>
              {myBio.trim().length > 0 && !myBioTextEntryOpen ? (
                <Pressable
                  onLongPress={() => {
                    setMyBioTextEntryOpen(true);
                    setTimeout(() => {
                      bioInputRef.current?.focus();
                    }, 80);
                  }}
                  delayLongPress={450}
                  accessibilityLabel="Bio. Long press to edit."
                >
                  <Text style={styles.friendHeroBio}>{myBio}</Text>
                </Pressable>
              ) : (
                <TextInput
                  ref={bioInputRef}
                  value={myBio}
                  onChangeText={(t) => setMyBio(t)}
                  placeholder="Say something about yourself..."
                  placeholderTextColor={theme.subtleText}
                  style={[styles.searchInput, styles.bioInput]}
                  multiline
                  inputAccessoryViewID={Platform.OS === "ios" ? "bioInputAccessory" : undefined}
                  returnKeyType={Platform.OS === "android" ? "done" : "default"}
                  blurOnSubmit={false}
                  onSubmitEditing={() => {
                    if (Platform.OS === "android") Keyboard.dismiss();
                  }}
                  onBlur={() => {
                    if (myBio.trim().length > 0) {
                      setMyBioTextEntryOpen(false);
                    }
                  }}
                />
              )}
              {myProfileMediaPosts.length > 0 ? (
                <View style={styles.profilePostsSection}>
                  {chunkBy(myProfileMediaPosts, 3).map((row, ri) => (
                    <View
                      key={`mp-row-${ri}`}
                      style={[styles.postGridRow, { marginBottom: postGridLayout.gap }]}
                    >
                      {row.map((p, ci) => (
                        <Pressable
                          key={p.id}
                          onPress={() => openPostViewerFromFeed(p)}
                          onLongPress={() => confirmDeletePost(p)}
                          delayLongPress={450}
                          style={{
                            marginRight: ci < row.length - 1 ? postGridLayout.gap : 0,
                          }}
                        >
                          {renderPostGridCell(p)}
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.profilePostsSection}>
                {myProfilePosts.map((post) => (
                  <FeedPostCard
                    key={`my-post-${post.id}`}
                    post={post}
                    onOpenViewer={() => openPostViewerFromFeed(post)}
                    onOpenCommentComposer={() => openPostCommentComposerFromFeed(post)}
                    onOpenThreadReply={(cid) => openPostThreadReplyFromFeed(post, cid)}
                  />
                ))}
              </View>
            </ScrollViewUntilScroll>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {view.screen === "addFriend" ? (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.accent, zIndex: 26 }]}
        >
          <AddFriendScreen
            theme={theme}
            isDarkMode={isDarkMode}
            safeTop={safeTop}
            bottomInset={insets.bottom}
            navHighlight={homeNavIconHighlight}
            styles={styles}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenMyProfile={openMyProfile}
            onOpenFriendsList={openFriendsListFromHome}
            onOpenAddFriend={openAddFriendFromHome}
            onOpenHomeChats={() => {
              setHomeTab("chats");
              setView({ screen: "home" });
            }}
            onOpenHomeFeed={() => {
              setHomeTab("feed");
              setView({ screen: "home" });
            }}
            onLogout={logout}
            pairingBackendReady={backendSessionReady}
            onPairingRegisterPinWithRetry={pairingRegisterPinWithRetryParent}
            onPairingAwaitPinRedeem={pairingAwaitPinRedeemParent}
            onPairingConfirmPinRead={pairingConfirmPinReadParent}
            onEnsurePairingLocationPermission={ensurePairingLocationPermission}
            onPairingCancelPinOffer={pairingCancelPinOfferParent}
          />
        </View>
      ) : null}

      {view.screen === "publishPost" ? (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 27 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={safeTop}
        >
          <View style={{ flex: 1, paddingTop: safeTop, paddingHorizontal: 16, minHeight: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Pressable onPress={closePublishPostScreen} style={styles.iconButton} accessibilityLabel="Back">
                <Ionicons name="arrow-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={[styles.chatScreenTitle, { flex: 1, textAlign: "center", marginRight: 38 }]}>
                New post
              </Text>
            </View>

            <Pressable
              onPress={() => void pickPostPhotos()}
              style={[
                styles.publishMediaSlot,
                { borderColor: theme.divider, backgroundColor: theme.replyBannerQuotingOtherBg },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add photos to post"
            >
              {postDraftImageUris.length === 0 && !postDraftVideoUri ? (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 36 }}>
                  <Ionicons name="image-outline" size={52} color={theme.subtleText} />
                  <Text style={[styles.subtleText, { marginTop: 12, textAlign: "center", paddingHorizontal: 16 }]}>
                    Tap to add photos
                  </Text>
                </View>
              ) : postDraftVideoUri ? (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 28 }}>
                  <Ionicons name="videocam-outline" size={44} color={theme.subtleText} />
                  <Text style={[styles.subtleText, { marginTop: 8 }]}>Video ready — publish to choose thumbnail</Text>
                </View>
              ) : (
                <ScrollViewUntilScroll
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10 }}
                >
                  {postDraftImageUris.map((uri) => (
                    <Image key={uri} source={{ uri }} style={styles.postComposerThumb} />
                  ))}
                </ScrollViewUntilScroll>
              )}
            </Pressable>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12, justifyContent: "center" }}>
              <Pressable style={styles.secondaryButton} onPress={pickPostPhotos}>
                <Text style={styles.secondaryButtonText}>Photos</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={pickPostVideo}>
                <Text style={styles.secondaryButtonText}>Video</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setPostDraftImageUris([]);
                  setPostDraftVideoUri(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Clear</Text>
              </Pressable>
            </View>

            <TextInput
              value={postDraftText}
              onChangeText={setPostDraftText}
              placeholder="Write something…"
              placeholderTextColor={theme.subtleText}
              multiline
              style={[styles.publishPostCaption, { color: theme.text, borderColor: theme.divider }]}
            />

            <View style={[styles.publishPostFooterRow as object, { paddingBottom: insets.bottom + 12 }]}>
              <Pressable style={styles.publishPostCancelButton as object} onPress={closePublishPostScreen}>
                <Text style={styles.publishPostCancelButtonText as object}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.publishPostPublishButton as object} onPress={publishPost}>
                <Text style={styles.publishPostPublishButtonText as object}>Publish</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {view.screen === "friendsList" ? (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 25 }]}
        >
          <View style={[styles.friendsListRoot, { paddingTop: safeTop }]}>
            <View style={styles.homeTopBar}>
              <View style={styles.homeTopLeftIcons}>
                <Pressable
                  onPress={() => setSettingsOpen(true)}
                  style={styles.iconButton}
                  accessibilityLabel="Settings"
                >
                  <Ionicons name="settings-outline" size={22} color={theme.accent} />
                </Pressable>
                <Pressable
                  onPress={openMyProfile}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.myProfile ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="My profile"
                >
                  <Ionicons
                    name={homeNavIconHighlight.myProfile ? "person-circle" : "person-circle-outline"}
                    size={24}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={openFriendsListFromHome}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.friendsList ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Friends list"
                >
                  <Ionicons
                    name={homeNavIconHighlight.friendsList ? "people" : "people-outline"}
                    size={22}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHomeTab("chats");
                    setView({ screen: "home" });
                  }}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.chats ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Open chats"
                >
                  <Ionicons
                    name={homeNavIconHighlight.chats ? "chatbubbles" : "chatbubbles-outline"}
                    size={21}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHomeTab("feed");
                    setView({ screen: "home" });
                  }}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.feed ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Open feed"
                >
                  <Ionicons
                    name={homeNavIconHighlight.feed ? "newspaper" : "newspaper-outline"}
                    size={21}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  onPress={openAddFriendFromHome}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.addFriend ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Add friend"
                >
                  <Ionicons
                    name={homeNavIconHighlight.addFriend ? "person-add" : "person-add-outline"}
                    size={22}
                    color={theme.accent}
                  />
                </Pressable>
              </View>
              <Pressable onPress={logout} style={styles.iconButton} accessibilityLabel="Logout">
                <Ionicons name="log-out-outline" size={22} color={theme.accent} />
              </Pressable>
            </View>
            <TextInput
              value={friendsListSearch}
              onChangeText={setFriendsListSearch}
              placeholder="Search friends..."
              placeholderTextColor={theme.subtleText}
              style={[styles.searchInput, styles.friendsListSearch]}
            />
            <FlatListUntilScroll
              style={styles.friendsListScroll}
              data={friendsListFiltered}
              keyExtractor={(f) => f.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item }) => {
                const mutedInFeed = isFriendFeedMuted(item.id);
                return (
                  <Pressable
                    style={styles.friendsListRow}
                    onPress={() => openFriendProfileFromFriendsList(item.id)}
                    onLongPress={() => handleFriendsListFriendLongPress(item)}
                    accessibilityLabel={`${item.displayName}. Long press for more options.`}
                  >
                    <View style={styles.friendsListAvatarWrap}>
                      {renderAvatar(item.profilePictureUrl, item.displayName.slice(0, 1), 44)}
                      {mutedInFeed ? (
                        <View style={styles.feedMuteBadge}>
                          <Ionicons name="volume-mute" size={12} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.friendsListName} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.subtleText}>
                  {friendsListSearch.trim() ? "No friends match." : "No friends yet."}
                </Text>
              }
            />
          </View>
        </View>
      ) : null}

      {showChatScreen ? (
        <KeyboardAvoidingView
          style={[styles.chatScreen, { paddingTop: safeTop }]}
          behavior="padding"
          enabled={keyboardVisible}
          /** KAV already has `paddingTop: safeTop`; avoid stacking large offsets (gap above keyboard). */
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          {Platform.OS === "ios" ? (
            <InputAccessoryView nativeID="chatInputAccessory">
              <View style={styles.inputAccessoryBar}>
                <Pressable
                  style={styles.inputAccessoryBarButton}
                  onPress={() => {
                    if (chatInput.trim()) {
                      sendMessage();
                    }
                    Keyboard.dismiss();
                  }}
                >
                  <Text style={styles.inputAccessoryBarButtonText}>Send</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          ) : null}
          <View style={styles.chatHeader}>
            <View style={[styles.chatHeaderSideRail, styles.chatHeaderSideRailLeft]}>
              <Pressable style={styles.iconButton} onPress={onBackFromChat}>
                <Ionicons name="chevron-back" size={24} color={theme.accent} />
              </Pressable>
              <Pressable
                disabled={
                  !canEditActiveGroupMeta &&
                  !(
                    activeChatKind === "standard" &&
                    activeCounterpartIds.length === 1 &&
                    !!friendMap[activeCounterpartIds[0] ?? ""]
                  )
                }
                onPress={() => {
                  if (activeChatKind !== "standard" || activeCounterpartIds.length !== 1) return;
                  const friendId = activeCounterpartIds[0];
                  if (!friendId || !friendMap[friendId]) return;
                  if (pendingDraft) {
                    openFriendProfile(friendId, "chat", { returnPendingDraft: pendingDraft });
                  } else if (resolvedChat) {
                    openFriendProfile(friendId, "chat", { returnChatId: resolvedChat.id });
                  }
                }}
                onLongPress={() => {
                  if (!resolvedChat || !canEditActiveGroupMeta) return;
                  setChatPictureDraft(activeHeaderPicture || "📣");
                  setEditChatPictureOpen(true);
                }}
              >
                {activeCounterpartIds.length <= 1 && activeChatKind !== "broadcast" ? (
                  renderAvatar(
                    activeCounterpartIds[0] ? friendMap[activeCounterpartIds[0]]?.profilePictureUrl : undefined,
                    activeCounterpartIds[0]
                      ? (friendMap[activeCounterpartIds[0]]?.displayName.slice(0, 1) ?? "?")
                      : "?",
                    34
                  )
                ) : isLikelyChatProfileImageUri(activeHeaderPicture) ? (
                  renderAvatar(
                    activeHeaderPicture,
                    chatScreenTitle.slice(0, 1) || "^",
                    34
                  )
                ) : (
                  <View style={styles.chatHeaderAvatarBubble}>
                    <Text style={styles.chatHeaderAvatarText}>{activeHeaderPicture || "^"}</Text>
                  </View>
                )}
              </Pressable>
            </View>
            <View style={styles.chatHeaderTitleRail}>
              <Pressable
                style={styles.chatHeaderTitlePressable}
                disabled={!canEditActiveGroupMeta}
                onLongPress={() => {
                  if (!resolvedChat || !canEditActiveGroupMeta) return;
                  setChatTitleDraft(resolvedChat.name);
                  setEditChatMetaOpen(true);
                }}
              >
                <Text
                  style={styles.chatHeaderTitleText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {chatScreenTitleWithCount}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.chatHeaderSideRail, styles.chatHeaderSideRailRight]}>
              <Pressable
                style={styles.iconButton}
                onPress={() => setChatOverflowOpen(true)}
                accessibilityLabel="Chat options"
              >
                <Ionicons name="ellipsis-vertical" size={20} color={theme.accent} />
              </Pressable>
            </View>
          </View>

          {chatSearchVisible ? (
            <TextInput
              value={chatSearch}
              onChangeText={setChatSearch}
              placeholder="Search messages..."
              placeholderTextColor={theme.subtleText}
              style={styles.searchInput}
            />
          ) : null}

          <FlatListUntilScroll
            inverted
            style={{ flex: 1 }}
            data={invertedChatMessages}
            keyExtractor={(item) => item.id}
            extraData={[replyTargetMessageId, messages]}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={null}
            renderItem={({ item }) => {
              const reactionEntries = getReactionEntries(item);
              const reactionTranslateX =
                reactionEntries.length > 1
                  ? -((reactionEntries.length - 1) * REACTION_LAYOUT_STEP_PX) / 2
                  : 0;
              const sender =
                item.senderId === CURRENT_USER_ID
                  ? {
                      displayName: "You",
                      profilePictureUrl: myProfilePictureUrl,
                      letter: "Y",
                    }
                  : {
                      displayName: friendMap[item.senderId]?.displayName ?? "Unknown",
                      profilePictureUrl: friendMap[item.senderId]?.profilePictureUrl,
                      letter: friendMap[item.senderId]?.displayName.slice(0, 1) ?? "?",
                    };
              const isMine = item.senderId === CURRENT_USER_ID;
              const mineDeliveryLabel =
                isMine && !item.unsentAt
                  ? item.deliveryStatus === "sending"
                    ? " • Sending…"
                    : item.deliveryStatus === "sent"
                      ? " • Sent"
                      : ""
                  : "";
              const isReplyTarget =
                replyTargetMessageId !== null && item.id === replyTargetMessageId;
              const replyTargetHighlightStyle = isReplyTarget
                ? [
                    styles.replyTargetRowHalo,
                    {
                      backgroundColor: isMine
                        ? theme.replyTargetEchoMineBg
                        : theme.replyTargetEchoOtherBg,
                    },
                  ]
                : null;
              const quotedMsg = item.replyToMessageId ? messageById[item.replyToMessageId] : undefined;
              const quotedIsMine = quotedMsg ? quotedMsg.senderId === CURRENT_USER_ID : false;
              /** Strip reflects the *quoted* author’s bubble: muted accent (you) vs muted neutral (them). */
              const replyQuotePalette = quotedIsMine
                ? {
                    bg: theme.replyTargetEchoMineBg,
                    border: theme.replyQuotedFromSelfBorder,
                    label: theme.replyQuotedFromSelfLabel,
                    body: theme.replyQuotedFromSelfBody,
                  }
                : {
                    bg: theme.replyTargetEchoOtherBg,
                    border: theme.replyQuotedFromOtherBorder,
                    label: theme.replyQuotedFromOtherLabel,
                    body: theme.replyQuotedFromOtherBody,
                  };

              const isOneToOneChat =
                activeChatKind === "standard" && activeCounterpartIds.length === 1;
              /** DM with a single friend — no sender name above bubbles. */
              const showBubbleSenderName = !isOneToOneChat;
              const showReplyQuoteAttribution = !isOneToOneChat;

              const replyQuoteAttributionText =
                quotedMsg && showReplyQuoteAttribution
                  ? quotedMsg.senderId === CURRENT_USER_ID
                    ? "Replying to you"
                    : `Replying to ${friendMap[quotedMsg.senderId]?.displayName ?? "Unknown"}`
                  : null;

              const messageAvatar = (
                <Pressable
                  style={isMine ? styles.messageAvatarMine : styles.messageAvatarOther}
                  onPress={() => {
                    if (item.senderId !== CURRENT_USER_ID && friendMap[item.senderId]) {
                      if (pendingDraft) {
                        openFriendProfile(item.senderId, "chat", {
                          returnPendingDraft: pendingDraft,
                        });
                      } else if (resolvedChat) {
                        openFriendProfile(item.senderId, "chat", {
                          returnChatId: resolvedChat.id,
                        });
                      }
                    }
                  }}
                  disabled={item.senderId === CURRENT_USER_ID}
                >
                  {renderAvatar(sender.profilePictureUrl, sender.letter, 30)}
                </Pressable>
              );

              const reactionTrayOnCard =
                reactionEntries.length > 0 ? (
                  <View
                    style={[
                      styles.reactionTray,
                      {
                        transform: [{ translateX: reactionTranslateX }],
                      },
                    ]}
                  >
                    {reactionEntries.map(([emoji, count]) => (
                      <View key={emoji} style={styles.reactionChipCompact}>
                        <Text style={styles.reactionChipCompactEmoji}>{emoji}</Text>
                        {count > 1 ? (
                          <View style={styles.reactionCountBubble}>
                            <Text style={styles.reactionCountText}>{count}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null;

              const reactionTrayBelowPhoto =
                reactionEntries.length > 0 ? (
                  <View
                    style={[
                      styles.reactionTrayBelowPhoto,
                      {
                        transform: [{ translateX: reactionTranslateX }],
                      },
                    ]}
                  >
                    {reactionEntries.map(([emoji, count]) => (
                      <View key={emoji} style={styles.reactionChipCompact}>
                        <Text style={styles.reactionChipCompactEmoji}>{emoji}</Text>
                        {count > 1 ? (
                          <View style={styles.reactionCountBubble}>
                            <Text style={styles.reactionCountText}>{count}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null;

              const captionBlock = (
                <>
                  {item.replyToMessageId && messageById[item.replyToMessageId] ? (
                    <View
                      style={[
                        styles.replyQuoteBlock,
                        {
                          backgroundColor: replyQuotePalette.bg,
                          borderLeftColor: replyQuotePalette.border,
                        },
                      ]}
                    >
                      {replyQuoteAttributionText ? (
                        <Text
                          style={[styles.replyQuoteLabel, { color: replyQuotePalette.label }]}
                          numberOfLines={1}
                        >
                          {replyQuoteAttributionText}
                        </Text>
                      ) : null}
                      <Text style={[styles.replyQuoteBody, { color: replyQuotePalette.body }]} numberOfLines={2}>
                        {messageById[item.replyToMessageId]?.text}
                      </Text>
                    </View>
                  ) : null}
                  {item.unsentAt ? (
                    <Text style={isMine ? styles.messageSystemTextMine : styles.messageSystemText}>
                      You unsent a message.
                    </Text>
                  ) : item.text.trim() ? (
                    <Text style={isMine ? styles.messageTextMine : styles.messageText}>{item.text}</Text>
                  ) : null}
                  {reactionTrayOnCard}
                </>
              );

              if (item.kind === "photo" && item.mediaUri) {
                const hasPhotoBubbleContent =
                  !!item.replyToMessageId ||
                  !!item.unsentAt ||
                  item.text.trim().length > 0;
                return (
                  <View
                    style={[
                      isMine ? styles.messageRowMine : styles.messageRowOther,
                      replyTargetHighlightStyle,
                    ]}
                  >
                    {messageAvatar}
                    <View style={isMine ? styles.photoMessageColumnMine : styles.photoMessageColumn}>
                      {showBubbleSenderName ? (
                        <Text style={isMine ? styles.messageSenderOutsideMine : styles.messageSenderOutside}>
                          {sender.displayName}
                        </Text>
                      ) : null}
                      <Pressable
                        style={isMine ? styles.photoMessageStackMine : styles.photoMessageStack}
                        onLongPress={() => openMessageActions(item)}
                        onPress={() => {
                          if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                            setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                          }
                        }}
                      >
                        <Image
                          source={{ uri: item.mediaUri }}
                          style={[styles.photoMessageImageDetached, getPhotoMessageSize(item)]}
                        />
                        {hasPhotoBubbleContent ? (
                          <View
                            style={[
                              styles.messageCard,
                              isMine ? styles.myMessageCard : styles.otherMessageCard,
                              isMine ? styles.photoCaptionCardMine : styles.photoCaptionCard,
                            ]}
                          >
                            {captionBlock}
                          </View>
                        ) : (
                          reactionTrayBelowPhoto
                        )}
                      </Pressable>
                      <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                        {formatDayTime(item.createdAt)}
                        {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                        {mineDeliveryLabel}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (item.kind === "video" && item.mediaUri) {
                const hasVideoBubbleContent =
                  !!item.replyToMessageId ||
                  !!item.unsentAt ||
                  item.text.trim().length > 0;
                const videoSize = getPhotoMessageSize(item);
                return (
                  <View
                    style={[
                      isMine ? styles.messageRowMine : styles.messageRowOther,
                      replyTargetHighlightStyle,
                    ]}
                  >
                    {messageAvatar}
                    <View style={isMine ? styles.photoMessageColumnMine : styles.photoMessageColumn}>
                      {showBubbleSenderName ? (
                        <Text style={isMine ? styles.messageSenderOutsideMine : styles.messageSenderOutside}>
                          {sender.displayName}
                        </Text>
                      ) : null}
                      <Pressable
                        style={isMine ? styles.photoMessageStackMine : styles.photoMessageStack}
                        onLongPress={() => openMessageActions(item)}
                        onPress={() => {
                          if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                            setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                          }
                          setPlayingVideoMessageId((cur) => (cur === item.id ? null : item.id));
                        }}
                      >
                        <View
                          style={[
                            styles.videoMessageWrap,
                            { width: videoSize.width, height: videoSize.height },
                          ]}
                        >
                          <Video
                            source={{ uri: item.mediaUri }}
                            style={[styles.videoMessageVideo, videoSize]}
                            resizeMode={ResizeMode.COVER}
                            shouldPlay={playingVideoMessageId === item.id}
                            isLooping
                            useNativeControls={false}
                          />
                          {item.videoTextOverlays?.map((o) => (
                            <Text
                              key={o.id}
                              pointerEvents="none"
                              style={[
                                styles.videoOverlayText,
                                {
                                  left: o.relX * videoSize.width,
                                  top: o.relY * videoSize.height,
                                  width: o.relW * videoSize.width,
                                  minHeight: o.relH * videoSize.height,
                                  fontSize: Math.max(10, o.relFontSize * videoSize.width),
                                  color: o.color,
                                  fontFamily: o.fontFamily,
                                  fontWeight: o.fontWeight ?? "700",
                                  fontStyle: o.fontStyle ?? "normal",
                                },
                              ]}
                            >
                              {o.text}
                            </Text>
                          ))}
                        </View>
                        {hasVideoBubbleContent ? (
                          <View
                            style={[
                              styles.messageCard,
                              isMine ? styles.myMessageCard : styles.otherMessageCard,
                              isMine ? styles.photoCaptionCardMine : styles.photoCaptionCard,
                            ]}
                          >
                            {captionBlock}
                          </View>
                        ) : (
                          reactionTrayBelowPhoto
                        )}
                      </Pressable>
                      <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                        {formatDayTime(item.createdAt)}
                        {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                        {mineDeliveryLabel}
                      </Text>
                    </View>
                  </View>
                );
              }

              return (
                <View
                  style={[
                    isMine ? styles.messageRowMine : styles.messageRowOther,
                    replyTargetHighlightStyle,
                  ]}
                >
                  {messageAvatar}
                  <View style={isMine ? styles.messageColumnMine : styles.messageColumn}>
                    {showBubbleSenderName ? (
                      <Text style={isMine ? styles.messageSenderOutsideMine : styles.messageSenderOutside}>
                        {sender.displayName}
                      </Text>
                    ) : null}
                    <Pressable
                      style={[
                        styles.messageCard,
                        isMine ? styles.myMessageCard : styles.otherMessageCard,
                      ]}
                      onLongPress={() => openMessageActions(item)}
                      onPress={() => {
                        if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                          setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                        }
                      }}
                    >
                      {item.replyToMessageId && messageById[item.replyToMessageId] ? (
                        <View
                          style={[
                            styles.replyQuoteBlock,
                            {
                              backgroundColor: replyQuotePalette.bg,
                              borderLeftColor: replyQuotePalette.border,
                            },
                          ]}
                        >
                          {replyQuoteAttributionText ? (
                            <Text
                              style={[styles.replyQuoteLabel, { color: replyQuotePalette.label }]}
                              numberOfLines={1}
                            >
                              {replyQuoteAttributionText}
                            </Text>
                          ) : null}
                          <Text style={[styles.replyQuoteBody, { color: replyQuotePalette.body }]} numberOfLines={2}>
                            {messageById[item.replyToMessageId]?.text}
                          </Text>
                        </View>
                      ) : null}
                      {item.unsentAt ? (
                        <Text style={isMine ? styles.messageSystemTextMine : styles.messageSystemText}>
                          You unsent a message.
                        </Text>
                      ) : item.kind === "video" ? (
                        <View style={isMine ? styles.attachmentBubbleMine : styles.attachmentBubble}>
                          <Text style={isMine ? styles.messageTextMine : styles.messageText}>Video clip</Text>
                        </View>
                      ) : item.kind === "voice" ? (
                        <Pressable
                          style={isMine ? styles.attachmentBubbleMine : styles.attachmentBubble}
                          onPress={() => {
                            void toggleVoiceMessagePlayback(item);
                          }}
                        >
                          <View style={styles.voicePlayRow}>
                            <Ionicons
                              name={
                                playingVoiceMessageId === item.id
                                  ? "pause-circle-outline"
                                  : "play-circle-outline"
                              }
                              size={20}
                              color={isMine ? theme.mineBubbleText : theme.accent}
                            />
                            <Text style={isMine ? styles.messageTextMine : styles.messageText}>
                              Voice note ({item.durationSec ?? 0}s)
                            </Text>
                          </View>
                        </Pressable>
                      ) : (
                        <Text style={isMine ? styles.messageTextMine : styles.messageText}>{item.text}</Text>
                      )}
                      {reactionEntries.length > 0 ? (
                        <View
                          style={[
                            styles.reactionTray,
                            {
                              transform: [{ translateX: reactionTranslateX }],
                            },
                          ]}
                        >
                          {reactionEntries.map(([emoji, count]) => (
                            <View key={emoji} style={styles.reactionChipCompact}>
                              <Text style={styles.reactionChipCompactEmoji}>{emoji}</Text>
                              {count > 1 ? (
                                <View style={styles.reactionCountBubble}>
                                  <Text style={styles.reactionCountText}>{count}</Text>
                                </View>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </Pressable>
                    <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                      {formatDayTime(item.createdAt)}
                      {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                      {mineDeliveryLabel}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.subtleText}>
                {chatSearchVisible && chatSearch.trim()
                  ? "No messages match this search."
                  : "No messages yet."}
              </Text>
            }
          />

          {editingMessage ? (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText} numberOfLines={1}>
                Editing message
              </Text>
              <Pressable onPress={() => setEditingMessageId(null)} style={styles.replyBannerClose}>
                <Ionicons name="close" size={16} color={theme.text} />
              </Pressable>
            </View>
          ) : null}

          {activeChatKind === "broadcast" ? (
            <View
              style={[
                styles.broadcastModeHintStrip,
                { backgroundColor: theme.replyBannerQuotingOtherBg, borderBottomColor: theme.divider },
              ]}
            >
              <Text style={[styles.replyBannerText, { color: theme.text }]} numberOfLines={4}>
                {
                  "Broadcast: send from the field to post for everyone (you will be asked to confirm). Tap a friend's message to reply in that private thread only — others cannot see those replies."
                }
              </Text>
            </View>
          ) : null}

          {pendingVoiceNote ? (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText}>
                Voice note ready ({pendingVoiceNote.durationSec}s)
              </Text>
              <View style={styles.voicePreviewActions}>
                <Pressable style={styles.attachButton} onPress={() => void togglePendingVoicePreview()}>
                  <Ionicons
                    name={previewVoicePlaying ? "pause-outline" : "play-outline"}
                    size={18}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable style={styles.attachButton} onPress={() => void discardPendingVoiceNote()}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </Pressable>
                <Pressable style={styles.sendButton} onPress={() => void sendPendingVoiceNote()}>
                  <Ionicons name="send" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.chatComposerStack,
              { borderTopColor: theme.divider, backgroundColor: theme.background },
            ]}
          >
            {replyTargetMessage ? (
              <View
                style={[
                  styles.replyPreviewShell,
                  {
                    backgroundColor:
                      replyTargetMessage.senderId === CURRENT_USER_ID
                        ? theme.replyTargetEchoMineBg
                        : theme.replyTargetEchoOtherBg,
                    borderBottomColor: theme.divider,
                  },
                ]}
              >
                <ScrollViewUntilScroll
                  style={styles.replyPreviewScroll}
                  contentContainerStyle={styles.replyPreviewScrollContent}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                >
                  {(() => {
                    const oneToOne =
                      activeChatKind === "standard" && activeCounterpartIds.length === 1;
                    if (oneToOne) return null;
                    const sid = replyTargetMessage.senderId;
                    const meta =
                      sid === CURRENT_USER_ID
                        ? "Replying to you"
                        : `Replying to ${friendMap[sid]?.displayName ?? "Unknown"}`;
                    return (
                      <Text style={[styles.replyPreviewMeta, { color: theme.subtleText }]}>{meta}</Text>
                    );
                  })()}
                  <Text style={[styles.replyPreviewBody, { color: theme.text }]}>
                    {getMessagePreviewBody(replyTargetMessage)}
                  </Text>
                </ScrollViewUntilScroll>
                <Pressable
                  onPress={() => setReplyTargetMessageId(null)}
                  style={styles.replyPreviewClose}
                  accessibilityLabel="Cancel reply"
                >
                  <Ionicons name="close" size={18} color={theme.text} />
                </Pressable>
              </View>
            ) : null}
            <View
              style={[
                styles.chatInputBar,
                showCompactComposer && styles.chatInputBarCompact,
                {
                  /** Match bottom gap to top gap (above border); when keyboard is open, bottom inset is not needed. */
                  paddingTop: replyTargetMessage
                    ? keyboardVisible
                      ? 2
                      : 4
                    : keyboardVisible
                      ? 4
                      : 8,
                  paddingBottom: keyboardVisible ? 4 : Math.max(insets.bottom, 10),
                },
              ]}
            >
            {!showCompactComposer ? (
              <>
                <Pressable style={styles.attachButtonSmall} onPress={toggleVoiceNote}>
                  <Ionicons
                    name={voiceRecordStartedAt ? "stop-circle-outline" : "mic-outline"}
                    size={16}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable style={styles.attachButtonSmall} onPress={() => sendCameraMedia("photo")}>
                  <Ionicons name="camera-outline" size={16} color={theme.accent} />
                </Pressable>
                <Pressable style={styles.attachButtonSmall} onPress={sendGalleryPhoto}>
                  <Ionicons name="images-outline" size={16} color={theme.accent} />
                </Pressable>
                <Pressable
                  style={styles.attachButtonSmall}
                  onPress={sendGalleryVideo}
                  accessibilityLabel="Pick video from library"
                >
                  <Ionicons name="film-outline" size={16} color={theme.accent} />
                </Pressable>
                <Pressable style={styles.attachButtonSmall} onPress={() => sendCameraMedia("video")}>
                  <Ionicons name="videocam-outline" size={16} color={theme.accent} />
                </Pressable>
              </>
            ) : null}
            <TextInput
              ref={chatInputRef}
              value={chatInput}
              onChangeText={handleChatInputChange}
              placeholder={editingMessage ? "Edit message..." : "Message..."}
              placeholderTextColor={theme.subtleText}
              style={[
                styles.chatInputMultiline,
                showCompactComposer && styles.chatInputMultilineCompact,
              ]}
              multiline
              textAlignVertical="top"
              returnKeyType="send"
              enablesReturnKeyAutomatically
              blurOnSubmit={false}
              inputAccessoryViewID={Platform.OS === "ios" ? "chatInputAccessory" : undefined}
              onSubmitEditing={() => {
                if (chatInput.trim()) {
                  sendMessage();
                }
              }}
            />
            <Pressable
              style={styles.sendButtonChat}
              onPress={sendMessage}
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      <Modal visible={chatComposerOpen} animationType="slide" onRequestClose={closeComposer}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.background }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={insets.top + 8}
        >
        <View style={[styles.modalScreen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.chatScreenTitle}>Start Chat</Text>
            <Pressable onPress={closeComposer} style={styles.iconButton}>
              <Ionicons name="close" size={22} color={theme.accent} />
            </Pressable>
          </View>

          <Pressable style={styles.broadcastOptionRow} onPress={openBroadcastPicker}>
            <Ionicons name="megaphone-outline" size={20} color={theme.accent} />
            <Text style={styles.broadcastOptionText}>Broadcast</Text>
          </Pressable>

          <TextInput
            value={composerSearch}
            onChangeText={setComposerSearch}
            placeholder="Search friends..."
            placeholderTextColor={theme.subtleText}
            style={styles.searchInput}
          />

          <FlatListUntilScroll
            data={availableComposerFriends}
            keyExtractor={(item) => item.id}
            extraData={selectedComposerIds}
            renderItem={({ item }) => {
              const selected = selectedComposerIds.includes(item.id);
              return (
                <TouchableOpacity
                  style={[styles.friendRow, selected ? styles.friendRowSelected : null]}
                  onPress={() => toggleFriendSelection(item.id)}
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${item.displayName}${selected ? ", selected" : ""}. Tap to ${selected ? "remove from" : "add to"} group.`}
                >
                  <View style={styles.friendRowLeft}>
                    {renderAvatar(item.profilePictureUrl, item.displayName.slice(0, 1), 36)}
                    <Text style={styles.chatName}>{item.displayName}</Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                  ) : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.subtleText}>No matching friends.</Text>}
          />

          <Pressable style={styles.primaryButton} onPress={onPressCreateStandardChat}>
            <Text style={styles.primaryButtonText}>Create chat</Text>
          </Pressable>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={broadcastPickerOpen} animationType="slide" onRequestClose={closeBroadcastPicker}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.background }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={insets.top + 8}
        >
        <View style={[styles.modalScreen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.modalHeader}>
            <Pressable
              style={styles.chatHeaderTitlePressable}
              onLongPress={() => {
                setPendingStandardGroupCreateAfterTitle(false);
                setCreateTitleDraft(buildComposerHeaderTitle());
                setCreateTitleEditOpen(true);
              }}
            >
              <Text style={styles.chatScreenTitle}>{buildComposerHeaderTitle()}</Text>
            </Pressable>
            <Pressable onPress={closeBroadcastPicker} style={styles.iconButton}>
              <Ionicons name="close" size={22} color={theme.accent} />
            </Pressable>
          </View>
          <Text style={styles.subtleText}>
            Select friends for a one-to-many broadcast. Replies stay private per friend thread.
          </Text>
          <Pressable
            style={styles.dropdownTrigger}
            onPress={() => setBroadcastGroupDropdownOpen((current) => !current)}
          >
            <Text style={styles.chatName}>
              {selectedBroadcastGroup ? `Group: ${selectedBroadcastGroup.name}` : "Saved groups"}
            </Text>
            <Ionicons
              name={broadcastGroupDropdownOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.subtleText}
            />
          </Pressable>
          {broadcastGroupDropdownOpen ? (
            <View style={styles.dropdownMenu}>
              {savedBroadcastGroups.length === 0 ? (
                <Text style={styles.subtleText}>No saved groups yet.</Text>
              ) : (
                savedBroadcastGroups.map((group) => (
                  <Pressable
                    key={group.id}
                    style={styles.dropdownItem}
                    onPress={() => applySavedBroadcastGroup(group)}
                  >
                    <Text style={styles.chatName}>{group.name}</Text>
                    <Text style={styles.subtleText}>{group.memberIds.length} friends</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
          <Pressable style={styles.secondaryActionRow} onPress={toggleSelectAllBroadcast}>
            <Text style={styles.secondaryButtonText}>
              {selectedComposerIds.length === allFriends.length ? "Clear all" : "Select all"}
            </Text>
          </Pressable>
          <TextInput
            value={composerSearch}
            onChangeText={setComposerSearch}
            placeholder="Search all friends..."
            placeholderTextColor={theme.subtleText}
            style={styles.searchInput}
          />
          <TextInput
            value={composerCustomTitle}
            onChangeText={setComposerCustomTitle}
            placeholder="Broadcast title (optional)"
            placeholderTextColor={theme.subtleText}
            style={styles.searchInput}
          />
          <FlatListUntilScroll
            data={availableComposerFriends}
            keyExtractor={(item) => item.id}
            extraData={selectedComposerIds}
            renderItem={({ item }) => {
              const selected = selectedComposerIds.includes(item.id);
              return (
                <TouchableOpacity
                  style={[styles.friendRow, selected ? styles.friendRowSelected : null]}
                  onPress={() => toggleFriendSelection(item.id)}
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${item.displayName}${selected ? ", selected" : ""}. Tap to ${selected ? "remove from" : "add to"} broadcast.`}
                >
                  <View style={styles.friendRowLeft}>
                    {renderAvatar(item.profilePictureUrl, item.displayName.slice(0, 1), 36)}
                    <Text style={styles.chatName}>{item.displayName}</Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                  ) : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.subtleText}>No matching friends.</Text>}
          />
          <Pressable style={styles.primaryButton} onPress={() => createOrOpenChat("broadcast")}>
            <Text style={styles.primaryButtonText}>Create broadcast</Text>
          </Pressable>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={saveBroadcastGroupPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSaveBroadcastGroupPromptOpen(false);
          setPendingBroadcastCreateIds(null);
        }}
      >
        <View style={styles.settingsOverlay}>
          <View style={[styles.settingsCard, styles.broadcastSaveModalCard]}>
            <Text style={styles.broadcastSavePromptTitle}>
              Save friend selection for future broadcast?
            </Text>
            <View style={styles.broadcastModalActionRow}>
              <Pressable
                style={[styles.broadcastModalBtn, styles.broadcastModalBtnOutline]}
                onPress={() => {
                  const ids = pendingBroadcastCreateIds;
                  setSaveBroadcastGroupPromptOpen(false);
                  setPendingBroadcastCreateIds(null);
                  if (!ids) return;
                  continueToBroadcastDraft(ids);
                }}
              >
                <Text style={styles.broadcastModalBtnOutlineText}>No</Text>
              </Pressable>
              <Pressable
                style={[styles.broadcastModalBtn, styles.broadcastModalBtnPrimary]}
                onPress={() => {
                  setSaveBroadcastGroupPromptOpen(false);
                  setBroadcastGroupNameDraft(composerCustomTitle.trim() || "");
                  setSaveBroadcastGroupNameModalOpen(true);
                }}
              >
                <Text style={styles.broadcastModalBtnPrimaryText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={saveBroadcastGroupNameModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSaveBroadcastGroupNameModalOpen(false);
          setSaveBroadcastGroupPromptOpen(true);
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={insets.top}
        >
          <View style={styles.settingsOverlay}>
            <View style={[styles.settingsCard, styles.broadcastSaveModalCard]}>
              <Text style={styles.broadcastSavePromptTitle}>Name this broadcast group</Text>
              <TextInput
                value={broadcastGroupNameDraft}
                onChangeText={setBroadcastGroupNameDraft}
                placeholder="Group name"
                placeholderTextColor={theme.subtleText}
                style={styles.searchInput}
              />
              <View style={styles.broadcastModalActionRow}>
                <Pressable
                  style={[styles.broadcastModalBtn, styles.broadcastModalBtnOutline]}
                  onPress={() => {
                    setSaveBroadcastGroupNameModalOpen(false);
                    setSaveBroadcastGroupPromptOpen(true);
                  }}
                >
                  <Text style={styles.broadcastModalBtnOutlineText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.broadcastModalBtn, styles.broadcastModalBtnPrimary]}
                  onPress={handleBroadcastGroupNameConfirm}
                >
                  <Text style={styles.broadcastModalBtnPrimaryText}>Continue</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={createTitleEditOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPendingStandardGroupCreateAfterTitle(false);
          setCreateTitleEditOpen(false);
          setCreateGroupPictureUri(null);
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={insets.top}
        >
          <View style={styles.settingsOverlay}>
            {pendingStandardGroupCreateAfterTitle ? (
              <View style={[styles.settingsCard, styles.groupCreateModalCard]}>
                <ScrollViewUntilScroll
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.groupCreateModalScroll}
                >
                  <Text style={styles.groupCreateModalTitle}>New group chat</Text>
                  <Pressable
                    onPress={pickCreateGroupPicture}
                    accessibilityRole="button"
                    accessibilityLabel="Choose group picture"
                    style={styles.groupCreatePhotoPressable}
                  >
                    <View style={styles.groupCreatePhotoCircle}>
                      {createGroupPictureUri ? (
                        <Image
                          source={{ uri: createGroupPictureUri }}
                          style={styles.groupCreatePhotoImage}
                        />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={44} color={theme.subtleText} />
                          <Text style={styles.groupCreatePhotoPrompt}>
                            Tap to add a group picture
                          </Text>
                        </>
                      )}
                    </View>
                  </Pressable>
                  <TextInput
                    value={createTitleDraft}
                    onChangeText={setCreateTitleDraft}
                    placeholder="Group name (not required)"
                    placeholderTextColor={theme.subtleText}
                    style={styles.searchInput}
                  />
                  <View style={styles.broadcastModalActionRow}>
                    <Pressable
                      style={[styles.broadcastModalBtn, styles.broadcastModalBtnOutline]}
                      onPress={() => {
                        setPendingStandardGroupCreateAfterTitle(false);
                        setCreateTitleEditOpen(false);
                        setCreateGroupPictureUri(null);
                      }}
                    >
                      <Text style={styles.broadcastModalBtnOutlineText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.broadcastModalBtn, styles.broadcastModalBtnPrimary]}
                      onPress={() => {
                        const next = createTitleDraft.trim();
                        setComposerCustomTitle(next);
                        setCreateTitleEditOpen(false);
                        setPendingStandardGroupCreateAfterTitle(false);
                        const uri = createGroupPictureUri?.trim() || null;
                        setCreateGroupPictureUri(null);
                        createOrOpenChat(undefined, next, { groupProfilePictureUri: uri });
                      }}
                    >
                      <Text style={styles.broadcastModalBtnPrimaryText}>Create</Text>
                    </Pressable>
                  </View>
                </ScrollViewUntilScroll>
              </View>
            ) : (
              <View style={styles.settingsCard}>
                <Text style={styles.chatScreenTitle}>
                  {composerMode === "broadcast" ? "Broadcast title" : "Group title"}
                </Text>
                <TextInput
                  value={createTitleDraft}
                  onChangeText={setCreateTitleDraft}
                  placeholder="Title"
                  placeholderTextColor={theme.subtleText}
                  style={styles.searchInput}
                />
                <View style={styles.settingsRow}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      setPendingStandardGroupCreateAfterTitle(false);
                      setCreateTitleEditOpen(false);
                      setCreateGroupPictureUri(null);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => {
                      const next = createTitleDraft.trim();
                      setComposerCustomTitle(next);
                      setCreateTitleEditOpen(false);
                    }}
                  >
                    <Text style={styles.primaryButtonText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editChatMetaOpen} transparent animationType="fade" onRequestClose={() => setEditChatMetaOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top}
        >
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsCard}>
            <Text style={styles.chatScreenTitle}>Edit chat title</Text>
            <TextInput
              value={chatTitleDraft}
              onChangeText={setChatTitleDraft}
              placeholder="Chat title"
              placeholderTextColor={theme.subtleText}
              style={styles.searchInput}
            />
            <View style={styles.settingsRow}>
              <Pressable style={styles.secondaryButton} onPress={() => setEditChatMetaOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={saveChatTitle}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editChatPictureOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditChatPictureOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top}
        >
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsCard}>
            <Text style={styles.chatScreenTitle}>Edit chat picture</Text>
            <TextInput
              value={chatPictureDraft}
              onChangeText={setChatPictureDraft}
              placeholder="Emoji or short label"
              placeholderTextColor={theme.subtleText}
              style={styles.searchInput}
            />
            <View style={styles.settingsRow}>
              <Pressable style={styles.secondaryButton} onPress={() => setEditChatPictureOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={saveChatPicture}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={messageActionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageActionsOpen(false)}
      >
        <Pressable style={styles.settingsOverlay} onPress={() => setMessageActionsOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Pressable style={styles.menuRow} onPress={startReplyToMessage}>
              <Feather name="corner-up-left" size={18} color={theme.text} />
              <Text style={styles.menuRowText}>Reply</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setReactionPickerOpen(true);
                setMessageActionsOpen(false);
              }}
            >
              <Feather name="smile" size={18} color={theme.text} />
              <Text style={styles.menuRowText}>React</Text>
            </Pressable>
            {messageActionTarget?.senderId === CURRENT_USER_ID && !messageActionTarget.unsentAt ? (
              <>
                <Pressable style={styles.menuRow} onPress={startEditMessage}>
                  <Feather name="edit-2" size={18} color={theme.text} />
                  <Text style={styles.menuRowText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.menuRow} onPress={unsendTargetMessage}>
                  <Feather name="trash-2" size={18} color={theme.danger} />
                  <Text style={[styles.menuRowText, { color: theme.danger }]}>Unsend</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={reactionPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionPickerOpen(false)}
      >
        <Pressable style={styles.settingsOverlay} onPress={() => setReactionPickerOpen(false)}>
          <Pressable style={styles.settingsCard} onPress={() => {}}>
            <Text style={styles.chatScreenTitle}>React</Text>
            <View style={styles.reactionPickerRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable key={emoji} style={styles.reactionChip} onPress={() => applyReaction(emoji)}>
                  <Text style={styles.reactionChipText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsCard}>
            <Text style={styles.chatScreenTitle}>Settings</Text>
            <View style={styles.settingsRow}>
              <Text style={styles.chatName}>Dark mode</Text>
              <Switch
                value={isDarkMode}
                onValueChange={setIsDarkMode}
                thumbColor="#FFFFFF"
                trackColor={{ false: "#95A1A8", true: theme.accent }}
              />
            </View>
            <Pressable
              style={styles.settingsRow}
              onPress={() => {
                setThemePickerOpen(true);
              }}
            >
              <Text style={styles.chatName}>Colour theme</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.settingsRowHint}>
                  {colorThemeId === "green" ? "Green" : "Hot pink"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={theme.subtleText} />
              </View>
            </Pressable>
            <Pressable
              style={styles.settingsRow}
              onPress={() => {
                Alert.alert(
                  "Reset local app state?",
                  "This clears local chats/feed/friends cache on this device for faster retesting. Your backend account data remains intact.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Reset",
                      style: "destructive",
                      onPress: () => {
                        resetLocalStateForCurrentUser();
                        setSettingsOpen(false);
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={[styles.chatName, { color: theme.danger }]}>Reset local app state</Text>
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={themePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setThemePickerOpen(false)}
      >
        <Pressable style={styles.settingsOverlay} onPress={() => setThemePickerOpen(false)}>
          <Pressable style={styles.settingsCard} onPress={() => {}}>
            <Text style={styles.chatScreenTitle}>Colour theme</Text>
            <Pressable
              style={styles.themePickerOptionRow}
              onPress={() => {
                setColorThemeId("green");
                setThemePickerOpen(false);
              }}
            >
              <Text style={styles.chatName}>Green</Text>
              {colorThemeId === "green" ? (
                <Ionicons name="checkmark" size={22} color={theme.accent} />
              ) : (
                <View style={{ width: 22 }} />
              )}
            </Pressable>
            <Pressable
              style={[styles.themePickerOptionRow, styles.themePickerOptionRowLast]}
              onPress={() => {
                setColorThemeId("pink");
                setThemePickerOpen(false);
              }}
            >
              <Text style={styles.chatName}>Hot pink</Text>
              {colorThemeId === "pink" ? (
                <Ionicons name="checkmark" size={22} color={theme.accent} />
              ) : (
                <View style={{ width: 22 }} />
              )}
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => setThemePickerOpen(false)}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={chatOverflowOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChatOverflowOpen(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setChatOverflowOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setChatOverflowOpen(false);
                setMembersModalOpen(true);
              }}
            >
              <Feather name="users" size={18} color={theme.text} />
              <Text style={styles.menuRowText}>View chat members</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setChatOverflowOpen(false);
                setChatSearchVisible(true);
              }}
            >
              <Feather name="search" size={18} color={theme.text} />
              <Text style={styles.menuRowText}>Search in chat</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setChatOverflowOpen(false);
                setMediaModalOpen(true);
              }}
            >
              <Feather name="image" size={18} color={theme.text} />
              <Text style={styles.menuRowText}>Shared media</Text>
            </Pressable>
            {resolvedChat && resolvedChat.kind !== "broadcast" && !resolvedChat.isDraft ? (
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setChatOverflowOpen(false);
                  setAddMemberSearch("");
                  setAddMemberModalOpen(true);
                }}
              >
                <Feather name="user-plus" size={18} color={theme.text} />
                <Text style={styles.menuRowText}>Add people</Text>
              </Pressable>
            ) : null}
            {resolvedChat && !resolvedChat.isDraft ? (
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setChatOverflowOpen(false);
                  confirmLeaveChat();
                }}
              >
                <Feather name="log-out" size={18} color={theme.danger} />
                <Text style={[styles.menuRowText, { color: theme.danger }]}>Leave chat</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={membersModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMembersModalOpen(false)}
      >
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsCard}>
            <Text style={styles.chatScreenTitle}>Chat members</Text>
            <FlatListUntilScroll
              data={pendingDraft?.memberIds ?? resolvedChat?.memberIds ?? []}
              keyExtractor={(id) => id}
              renderItem={({ item: id }) => {
                if (id === CURRENT_USER_ID) {
                  return (
                    <View style={styles.memberRow}>
                      {renderAvatar(myProfilePictureUrl, "Y", 40)}
                      <Text style={styles.chatName}>You</Text>
                    </View>
                  );
                }
                const f = friendMap[id];
                return (
                  <View style={styles.memberRow}>
                    {f
                      ? renderAvatar(f.profilePictureUrl, f.displayName.slice(0, 1), 40)
                      : null}
                    <Text style={styles.chatName}>{f?.displayName ?? id}</Text>
                  </View>
                );
              }}
            />
            <Pressable style={styles.primaryButton} onPress={() => setMembersModalOpen(false)}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={addMemberModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAddMemberModalOpen(false);
          setAddMemberSearch("");
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={insets.top}
        >
          <View style={styles.settingsOverlay}>
            <View style={[styles.settingsCard, styles.addMemberModalCard]}>
              <Text style={styles.chatScreenTitle}>Add people</Text>
              <Text style={styles.subtleText}>
                Someone can only be added if they are friends with everyone already in this chat. They
                will only see messages sent after they join.
              </Text>
              <TextInput
                value={addMemberSearch}
                onChangeText={setAddMemberSearch}
                placeholder="Search friends..."
                placeholderTextColor={theme.subtleText}
                style={styles.searchInput}
              />
              <FlatListUntilScroll
                data={filteredFriendsToAdd}
                keyExtractor={(item) => item.id}
                style={styles.addMemberList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.friendRow} onPress={() => addMemberToChat(item.id)}>
                    <View style={styles.friendRowLeft}>
                      {renderAvatar(item.profilePictureUrl, item.displayName.slice(0, 1), 36)}
                      <Text style={styles.chatName}>{item.displayName}</Text>
                    </View>
                    <Text style={styles.selectedText}>Add</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.subtleText}>
                    {eligibleFriendsToAdd.length === 0
                      ? "No one else can be added — everyone who fits is already in this chat."
                      : "No matches."}
                  </Text>
                }
              />
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  setAddMemberModalOpen(false);
                  setAddMemberSearch("");
                }}
              >
                <Text style={styles.primaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={mediaModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMediaModalOpen(false)}
      >
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsCard}>
            <Text style={styles.chatScreenTitle}>Shared media</Text>
            <Text style={styles.subtleText}>
              No shared media in this MVP prototype. In production this lists images and files
              exchanged in the chat.
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => setMediaModalOpen(false)}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {photoEditorOpen ? (
        <PhotoEditorModal
          visible={photoEditorOpen}
          onClose={cancelPhotoEditor}
          onComplete={completePhotoEditor}
          assetUri={photoEditorAsset?.uri ?? null}
          assetWidth={photoEditorAsset?.width ?? 0}
          assetHeight={photoEditorAsset?.height ?? 0}
          mediaType={photoEditorMediaType}
          previewSubmitLabel={photoEditorTarget === "profile" ? "Use photo" : "Post"}
          theme={{
            accent: theme.accent,
            background: theme.background,
            text: theme.text,
            subtleText: theme.subtleText,
            divider: theme.divider,
          }}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: 14,
    },
    screenRoot: {
      flex: 1,
      paddingHorizontal: 14,
    },
    homeColumn: {
      flex: 1,
      minHeight: 0,
    },
    /** Fills below the home top bar; swipe-right opens friends (PanResponder). */
    homeMainSwipeLayer: {
      flex: 1,
      minHeight: 0,
    },
    homeBottomChrome: {
      backgroundColor: theme.background,
    },
    homeBottomChromeTransparent: {
      backgroundColor: "transparent",
      marginHorizontal: -14,
      paddingHorizontal: 14,
    },
    bottomDeadZone: {
      backgroundColor: theme.background,
      marginHorizontal: -14,
    },
    chatListFlex: {
      flex: 1,
      minHeight: 0,
    },
    /** Full-bleed wrapper: cancels `screenRoot` horizontal padding for the online strip. */
    onlineStripOuter: {
      marginHorizontal: -14,
      alignSelf: "stretch",
    },
    /**
     * Same width as six equal slots (`windowWidth - 28`). Overflow clips so column 7+ is not visible at scroll 0.
     */
    onlineStripClip: {
      marginHorizontal: ONLINE_STRIP_EDGE_PAD,
      overflow: "hidden",
      height: 78,
    },
    onlineStripList: {
      flexGrow: 0,
      flexShrink: 0,
      height: 78,
    },
    onlineStripEmpty: {
      color: theme.subtleText,
      fontSize: 13,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    fullScreen: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.background,
      zIndex: 20,
      paddingHorizontal: 14,
    },
    center: {
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
    },
    largeText: {
      color: theme.text,
      fontSize: 24,
      fontWeight: "700",
    },
    authModeRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    authModeButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.background,
    },
    authModeButtonActive: {
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}18`,
    },
    authModeButtonText: {
      color: theme.subtleText,
      fontSize: 14,
      fontWeight: "700",
    },
    authModeButtonTextActive: {
      color: theme.accent,
    },
    authCard: {
      gap: 10,
      paddingBottom: 20,
    },
    authLoginRoot: {
      flex: 1,
    },
    authTopBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    authTopSideSpacer: {
      width: 64,
      height: 36,
    },
    authTopLinkButton: {
      minWidth: 64,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    authTopLinkText: {
      color: theme.subtleText,
      fontWeight: "800",
      fontSize: 14,
    },
    authCentered: {
      flex: 1,
      justifyContent: "center",
    },
    authHeading: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 4,
    },
    homeTopBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    homeTopLeftIcons: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    homeModeIconActive: {
      backgroundColor: `${theme.accent}1F`,
    },
    feedListFullBleed: {
      marginHorizontal: -14,
    },
    feedList: {
      paddingTop: 4,
      paddingBottom: 8,
      flexGrow: 1,
    },
    feedEmpty: {
      color: theme.subtleText,
      fontSize: 14,
      textAlign: "center",
      marginTop: 24,
    },
    feedSeparator: {
      height: 10,
    },
    postFeedCard: {
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    postFeedHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    postFeedHeaderTextCol: {
      flex: 1,
      minWidth: 0,
    },
    postFeedHeaderAction: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    postFeedAuthor: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
    },
    postFeedTime: {
      color: theme.subtleText,
      fontSize: 12,
      marginTop: 2,
    },
    postFeedBody: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 8,
    },
    postFeedMediaWrap: {
      marginHorizontal: -14,
      marginBottom: 8,
      backgroundColor: "#000000",
      position: "relative",
    },
    postFeedImageStrip: {
      width: "100%",
    },
    postFeedImageFullWidth: {
      width: "100%",
      backgroundColor: "#000000",
    },
    postFeedVideo: {
      width: "100%" as const,
      height: 260,
      backgroundColor: theme.divider,
      marginBottom: 8,
    },
    feedReactionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
      marginTop: 6,
    },
    feedReactionSummaryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor:
        theme.background === "#000000" ? "rgba(255,255,255,0.08)" : `${theme.divider}cc`,
    },
    feedReactionSummaryEmoji: {
      fontSize: 16,
    },
    feedReactionSummaryCount: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.subtleText,
    },
    feedCommentActionRow: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    feedCommentActionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor:
        theme.background === "#000000" ? "rgba(255,255,255,0.06)" : `${theme.divider}aa`,
    },
    feedCommentActionText: {
      color: theme.subtleText,
      fontSize: 12,
      fontWeight: "600",
    },
    postCommentPlaceholderBar: {
      marginHorizontal: 12,
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor:
        theme.background === "#000000" ? "rgba(255,255,255,0.06)" : `${theme.divider}99`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.divider,
    },
    postCommentPlaceholderText: {
      color: theme.subtleText,
      fontSize: 15,
      fontWeight: "500",
    },
    reactionDetailModalRoot: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 22,
    },
    reactionDetailModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.48)",
    },
    reactionDetailModalCard: {
      maxHeight: "72%",
      borderRadius: 14,
      overflow: "hidden",
      zIndex: 2,
      elevation: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.divider,
    },
    reactionDetailModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.divider,
    },
    reactionDetailModalTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      flex: 1,
    },
    reactionDetailModalList: {
      maxHeight: 360,
    },
    reactionDetailModalEmpty: {
      paddingVertical: 18,
      paddingHorizontal: 14,
    },
    reactionDetailModalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.divider,
    },
    reactionDetailModalName: {
      flex: 1,
      minWidth: 0,
      color: theme.text,
      fontSize: 15,
      fontWeight: "600",
    },
    reactionDetailModalEmoji: {
      fontSize: 22,
    },
    privateCommentComposerRow: {
      paddingHorizontal: 12,
      paddingTop: 10,
      gap: 8,
    },
    privateCommentComposerInput: {
      marginBottom: 0,
    },
    privateCommentCard: {
      marginHorizontal: 12,
      marginBottom: 10,
      padding: 10,
      borderRadius: 12,
      backgroundColor: theme.background === "#000000" ? "rgba(255,255,255,0.05)" : `${theme.divider}66`,
    },
    privateCommentInlineSection: {
      marginTop: 8,
      gap: 8,
    },
    privateCommentChainHeader: {
      gap: 2,
      marginBottom: 6,
    },
    privateCommentChainName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "700",
    },
    privateCommentChainPreview: {
      color: theme.subtleText,
      fontSize: 12,
    },
    privateCommentThreadPlain: {
      gap: 8,
    },
    privateCommentPlainRow: {
      gap: 4,
    },
    privateCommentMeta: {
      color: theme.subtleText,
      fontSize: 11,
      marginBottom: 4,
    },
    privateCommentBody: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 19,
    },
    privateCommentControlsRow: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    privateThreadEntry: {
      marginTop: 8,
      marginLeft: 12,
      paddingLeft: 10,
      borderLeftWidth: 2,
      borderLeftColor: theme.divider,
      gap: 4,
    },
    privateThreadBody: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
    },
    privateThreadComposerRow: {
      marginTop: 10,
      marginLeft: 12,
      gap: 8,
    },
    privateThreadComposerInput: {
      marginBottom: 0,
    },
    fullScreenPostRoot: {
      flex: 1,
    },
    fullScreenPostHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 6,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.divider,
    },
    fullScreenPostScroll: {
      flex: 1,
    },
    postCarouselChevron: {
      position: "absolute",
      top: "50%",
      marginTop: -18,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.42)",
      alignItems: "center",
      justifyContent: "center",
    },
    postCarouselChevronLeft: {
      left: 10,
    },
    postCarouselChevronRight: {
      right: 10,
    },
    postCarouselCountBadge: {
      position: "absolute",
      right: 10,
      bottom: 10,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    postCarouselCountText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
    },
    profilePostsSection: {
      alignSelf: "stretch",
      marginTop: 18,
      paddingBottom: 24,
    },
    profilePostsHeading: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "800",
      marginBottom: 10,
    },
    postGridRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    postGridCell: {
      borderRadius: 4,
      overflow: "hidden",
      backgroundColor: theme.divider,
      position: "relative",
    },
    postGridImage: {
      width: "100%",
      height: "100%",
    },
    postGridTextMiniWrap: {
      flex: 1,
      paddingHorizontal: 4,
      paddingVertical: 4,
      justifyContent: "flex-start",
    },
    postGridTextMini: {
      color: theme.text,
      fontSize: 9,
      lineHeight: 11,
    },
    postGridEmpty: {
      alignItems: "center",
      justifyContent: "center",
    },
    postGridPlayBadge: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.25)",
    },
    postComposerOverlay: {
      flex: 1,
    },
    postComposerCard: {
      maxWidth: 420,
      width: "100%",
    },
    postComposerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    postComposerInput: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      minHeight: 96,
      textAlignVertical: "top",
      marginBottom: 10,
    },
    postComposerPreviewRow: {
      marginBottom: 10,
    },
    postComposerThumb: {
      width: 72,
      height: 72,
      borderRadius: 8,
      marginRight: 8,
      backgroundColor: theme.divider,
    },
    publishMediaSlot: {
      minHeight: 200,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
      justifyContent: "center",
    },
    publishPostCaption: {
      flex: 1,
      minHeight: 140,
      marginTop: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      textAlignVertical: "top",
    },
    publishPostFooterRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 16,
      alignItems: "stretch",
    },
    publishPostPublishButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    publishPostCancelButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 2,
      borderColor: theme.accent,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
    },
    publishPostPublishButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 16,
      lineHeight: 22,
    },
    publishPostCancelButtonText: {
      color: theme.accent,
      fontWeight: "700",
      fontSize: 16,
      lineHeight: 22,
    },
    postComposerActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 6,
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    onlineFriendItem: {
      alignItems: "center",
    },
    profileCircleWrap: {
      marginBottom: 2,
    },
    onlineFriendName: {
      color: theme.text,
      fontSize: 12,
      textAlign: "center",
    },
    chatList: {
      paddingTop: 0,
      paddingBottom: 8,
      flexGrow: 0,
    },
    chatRowBlock: {
      width: "100%",
    },
    /** Matches `broadcastChatRow` borderRadius so dividers don’t extend into the curved corners. */
    broadcastChatRowBlock: {
      marginBottom: 8,
    },
    chatRowSeparator: {
      alignSelf: "stretch",
      height: StyleSheet.hairlineWidth,
      marginHorizontal: 12,
      backgroundColor: theme.divider,
    },
    chatRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      minHeight: 64,
      /** Reserves the same left edge as broadcast rows so avatars line up vertically. */
      borderLeftWidth: 6,
      borderLeftColor: "transparent",
    },
    broadcastChatRow: {
      backgroundColor: `${theme.accent}42`,
      borderTopWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: `${theme.accent}88`,
      /** No accent stripe on the left; keep spacer transparent like other rows. */
      borderLeftColor: "transparent",
      borderRadius: 12,
      paddingVertical: 6,
    },
    broadcastBadge: {
      alignSelf: "flex-start",
      backgroundColor: theme.accent,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 4,
    },
    broadcastBadgeText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    broadcastChatTitle: {
      color: theme.accent,
      fontSize: 15,
      fontWeight: "800",
    },
    chatTapCard: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      minHeight: 42,
    },
    chatAvatarWrap: {
      position: "relative",
      marginRight: 10,
      width: 42,
      alignItems: "center",
      justifyContent: "center",
    },
    chatAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    chatAvatarText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 18,
    },
    onlineDot: {
      position: "absolute",
      width: 12,
      height: 12,
      borderRadius: 6,
      right: -1,
      bottom: -1,
      borderWidth: 2,
      borderColor: theme.background,
      backgroundColor: ONLINE_GREEN,
    },
    chatTextWrap: {
      flex: 1,
      marginRight: 8,
    },
    chatTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 2,
      minWidth: 0,
    },
    chatTitleTextFlex: {
      flex: 1,
      minWidth: 0,
    },
    chatMutedIcon: {
      flexShrink: 0,
    },
    chatName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "600",
    },
    chatPreview: {
      color: theme.subtleText,
      fontSize: 13,
    },
    chatTimestamp: {
      color: theme.subtleText,
      fontSize: 11,
      marginRight: 12,
      marginTop: 1,
    },
    startChatButton: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    startChatButtonInset: {
      marginHorizontal: 0,
    },
    startChatButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 15,
    },
    feedFabButton: {
      position: "absolute",
      left: 14,
      right: 14,
      bottom: 10,
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      elevation: 5,
    },
    chatScreen: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.background,
      zIndex: 10,
      paddingHorizontal: 14,
    },
    friendsListRoot: {
      flex: 1,
      paddingHorizontal: 14,
    },
    friendsListTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    },
    friendsListSearch: {
      marginBottom: 10,
    },
    friendsListScroll: {
      flex: 1,
      minHeight: 0,
    },
    friendsListRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: 12,
    },
    friendsListAvatarWrap: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    feedMuteBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.danger,
      borderWidth: 1,
      borderColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
    },
    friendsListName: {
      flex: 1,
      minWidth: 0,
      color: theme.text,
      fontSize: 16,
      fontWeight: "600",
    },
    chatHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    chatHeaderSideRail: {
      width: CHAT_HEADER_SIDE_RAIL_WIDTH,
      flexDirection: "row",
      alignItems: "center",
    },
    chatHeaderSideRailLeft: {
      gap: 8,
    },
    chatHeaderSideRailRight: {
      justifyContent: "flex-end",
    },
    chatHeaderTitleRail: {
      flex: 1,
      minWidth: 0,
      height: 34,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
    },
    chatHeaderAvatarBubble: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accent,
    },
    chatHeaderAvatarText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 16,
    },
    chatHeaderTitlePressable: {
      width: "100%",
      /** Match `renderAvatar(..., 34)` / `chatHeaderAvatarBubble` so title sits on same vertical band. */
      height: 34,
      justifyContent: "center",
      alignItems: "center",
    },
    /** Header only: no `flex: 1` on Text (avoids the label riding high vs the avatar). */
    chatHeaderTitleText: {
      width: "100%",
      color: theme.text,
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
      lineHeight: 22,
      ...Platform.select({
        android: { includeFontPadding: false },
        default: {},
      }),
    },
    chatScreenTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    },
    profileHeaderTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    },
    profileScreenHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    headerSpacer: {
      width: 38,
      height: 38,
    },
    headerTitleFlex: {
      flex: 1,
    },
    friendProfileScroll: {
      paddingBottom: 120,
    },
    /** Portrait frame for profile hero photos (width:height = 3:4). */
    friendHeroImageFrame: {
      width: "100%",
      aspectRatio: 3 / 4,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: theme.divider,
      marginBottom: 16,
    },
    friendHeroImageFill: {
      width: "100%",
      height: "100%",
    },
    myProfilePlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    friendHeroName: {
      color: theme.text,
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 8,
    },
    friendHeroBio: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 8,
    },
    friendHeroStatus: {
      color: theme.subtleText,
      fontSize: 14,
    },
    profileBottomBar: {
      borderTopWidth: 1,
      borderTopColor: theme.divider,
      paddingTop: 12,
    },
    secondaryButton: {
      alignSelf: "flex-start",
      marginBottom: 16,
      paddingVertical: 6,
    },
    secondaryButtonText: {
      color: theme.accent,
      fontWeight: "600",
      fontSize: 15,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 10,
    },
    passwordInputRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    passwordInputField: {
      flex: 1,
      marginBottom: 0,
    },
    passwordVisibilityButton: {
      marginLeft: 8,
      width: 40,
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    messageList: {
      paddingTop: 4,
      paddingBottom: 8,
    },
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    messageRowOther: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 12,
      width: "100%",
    },
    messageRowMine: {
      flexDirection: "row-reverse",
      alignItems: "flex-start",
      marginBottom: 12,
      width: "100%",
    },
    /** Padded halo behind avatar + bubble when this row is the active reply target. */
    replyTargetRowHalo: {
      borderRadius: 14,
      paddingVertical: 5,
      paddingHorizontal: 4,
    },
    messageAvatar: {
      marginRight: 8,
      marginTop: 2,
      width: 30,
      alignItems: "center",
    },
    messageAvatarOther: {
      marginRight: 8,
      marginTop: 2,
      width: 30,
      alignItems: "center",
    },
    messageAvatarMine: {
      marginLeft: 8,
      marginRight: 0,
      marginTop: 2,
      width: 30,
      alignItems: "center",
    },
    messageColumn: {
      flex: 1,
      minWidth: 0,
      alignItems: "flex-start",
    },
    messageColumnMine: {
      flex: 1,
      minWidth: 0,
      alignItems: "flex-end",
    },
    messageCard: {
      alignSelf: "flex-start",
      maxWidth: "85%",
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingTop: CHAT_XH,
      paddingBottom: CHAT_XH,
      borderWidth: 1,
      borderColor: theme.divider,
      position: "relative",
    },
    myMessageCard: {
      alignSelf: "flex-end",
      backgroundColor: theme.mineBubbleBackground,
      borderColor: "transparent",
    },
    otherMessageCard: {
      backgroundColor: theme.background,
    },
    messageSender: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 2,
    },
    messageSenderOutside: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 4,
      marginLeft: 2,
    },
    messageSenderOutsideMine: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 4,
      marginRight: 2,
      textAlign: "right",
      alignSelf: "stretch",
    },
    messageText: {
      color: theme.text,
      fontSize: CHAT_BUBBLE_BODY_SIZE,
      lineHeight: Math.round(CHAT_BUBBLE_BODY_SIZE * 1.35),
      marginBottom: 0,
    },
    messageTextMine: {
      color: theme.mineBubbleText,
      fontSize: CHAT_BUBBLE_BODY_SIZE,
      lineHeight: Math.round(CHAT_BUBBLE_BODY_SIZE * 1.35),
      marginBottom: 0,
    },
    messageSystemText: {
      color: theme.subtleText,
      fontSize: 14,
      lineHeight: Math.round(14 * 1.35),
      marginBottom: 0,
      fontStyle: "italic",
    },
    messageSystemTextMine: {
      color: theme.mineBubbleReplyMuted,
      fontSize: 14,
      lineHeight: Math.round(14 * 1.35),
      marginBottom: 0,
      fontStyle: "italic",
    },
    replyPreviewLine: {
      color: theme.subtleText,
      fontSize: 12,
      marginBottom: 2,
    },
    replyPreviewLineMine: {
      color: theme.mineBubbleReplyMuted,
      fontSize: 12,
      marginBottom: 2,
    },
    replyPreviewLabel: {
      color: theme.subtleText,
      fontSize: 11,
      fontWeight: "700",
      marginBottom: 2,
    },
    replyPreviewLabelMine: {
      color: theme.mineBubbleReplyMuted,
      fontSize: 11,
      fontWeight: "700",
      marginBottom: 2,
    },
    replyQuoteBlock: {
      borderLeftWidth: 3,
      borderRadius: 8,
      paddingVertical: CHAT_XH_HALF,
      paddingHorizontal: CHAT_XH,
      marginBottom: CHAT_XH,
    },
    replyQuoteLabel: {
      fontSize: 11,
      fontWeight: "700",
      lineHeight: Math.round(11 * 1.35),
      marginBottom: CHAT_XH_HALF,
    },
    replyQuoteBody: {
      fontSize: 12,
      lineHeight: Math.round(12 * 1.35),
      marginBottom: 0,
    },
    replyContextCard: {
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
      backgroundColor: theme.divider,
      opacity: 0.78,
      borderRadius: 8,
      paddingVertical: CHAT_XH_HALF,
      paddingHorizontal: CHAT_XH,
      marginBottom: CHAT_XH,
    },
    replyContextCardMine: {
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
      backgroundColor: theme.replyContextMineBg,
      borderRadius: 8,
      paddingVertical: CHAT_XH_HALF,
      paddingHorizontal: CHAT_XH,
      marginBottom: CHAT_XH,
    },
    attachmentBubble: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 8,
      padding: CHAT_XH,
      marginBottom: CHAT_XH_HALF,
    },
    attachmentBubbleMine: {
      borderWidth: 1,
      borderColor: `${theme.mineBubbleText}33`,
      borderRadius: 8,
      padding: CHAT_XH,
      marginBottom: CHAT_XH_HALF,
    },
    voicePlayRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    inlineMediaPreview: {
      width: 130,
      height: 130,
      borderRadius: 8,
      marginBottom: 6,
      backgroundColor: theme.divider,
    },
    photoMessageImage: {
      borderRadius: 10,
      backgroundColor: theme.divider,
      marginBottom: 4,
      alignSelf: "flex-start",
    },
    photoMessageColumn: {
      flex: 1,
      minWidth: 0,
      alignItems: "flex-start",
    },
    photoMessageColumnMine: {
      flex: 1,
      minWidth: 0,
      alignItems: "flex-end",
    },
    photoMessageStack: {
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    photoMessageStackMine: {
      alignSelf: "flex-end",
      maxWidth: "100%",
    },
    photoMessageImageDetached: {
      borderRadius: 12,
      backgroundColor: theme.divider,
      alignSelf: "flex-start",
      marginBottom: 0,
    },
    videoMessageWrap: {
      position: "relative",
      borderRadius: 12,
      overflow: "hidden",
      alignSelf: "flex-start",
      backgroundColor: theme.divider,
    },
    videoMessageVideo: {
      borderRadius: 12,
    },
    videoOverlayText: {
      position: "absolute",
    },
    photoCaptionCard: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      marginTop: 8,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    photoCaptionCardMine: {
      alignSelf: "flex-end",
      maxWidth: "100%",
      marginTop: 8,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    reactionTray: {
      position: "absolute",
      right: 8,
      bottom: -7,
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    reactionTrayBelowPhoto: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 8,
      alignSelf: "flex-start",
    },
    reactionChipCompact: {
      minWidth: 12,
      height: 12,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "visible",
    },
    reactionChipCompactEmoji: {
      fontSize: 12,
      lineHeight: 12,
    },
    reactionCountBubble: {
      position: "absolute",
      top: -5,
      right: -7,
      minWidth: 11,
      height: 11,
      borderRadius: 6,
      paddingHorizontal: 2,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    reactionCountText: {
      color: "#FFFFFF",
      fontSize: 7,
      fontWeight: "700",
    },
    messageMeta: {
      color: theme.subtleText,
      fontSize: 11,
    },
    messageMetaOutside: {
      color: theme.subtleText,
      fontSize: 10,
      marginTop: 5,
      marginLeft: 4,
    },
    messageMetaOutsideMine: {
      color: theme.subtleText,
      fontSize: 10,
      marginTop: 5,
      marginRight: 4,
      textAlign: "right",
      alignSelf: "stretch",
    },
    chatMemberStripWrap: {
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.divider,
    },
    chatMemberStripCaption: {
      color: theme.subtleText,
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 6,
    },
    chatMemberStripScroll: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingRight: 4,
    },
    chatMemberStripChip: {
      alignItems: "center",
      maxWidth: 72,
    },
    chatMemberStripName: {
      marginTop: 3,
      color: theme.subtleText,
      fontSize: 10,
      textAlign: "center",
      width: "100%",
    },
    replyBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.divider,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginBottom: 6,
    },
    /** Same tonal treatment as reply preview strips (regular chat). */
    broadcastModeHintStrip: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginTop: 10,
      marginBottom: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    replyBannerText: {
      color: theme.text,
      flex: 1,
      marginRight: 8,
      fontSize: 12,
    },
    replyBannerClose: {
      padding: 2,
    },
    chatComposerStack: {
      borderTopWidth: 1,
    },
    replyPreviewShell: {
      flexDirection: "row",
      alignItems: "flex-start",
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingLeft: 10,
      paddingVertical: 6,
      paddingRight: 4,
    },
    replyPreviewScroll: {
      flex: 1,
      minWidth: 0,
      maxHeight: 160,
    },
    replyPreviewScrollContent: {
      paddingBottom: 4,
      flexGrow: 1,
    },
    replyPreviewMeta: {
      fontSize: 11,
      fontWeight: "700",
      marginBottom: 4,
    },
    replyPreviewBody: {
      fontSize: 13,
      lineHeight: 18,
    },
    replyPreviewClose: {
      padding: 6,
      marginTop: -2,
    },
    voicePreviewActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    chatInputBar: {
      paddingTop: 8,
      flexDirection: "row",
      gap: 6,
      alignItems: "flex-end",
      backgroundColor: theme.background,
    },
    chatInputBarCompact: {
      gap: 8,
    },
    attachButton: {
      width: 36,
      height: 36,
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    attachButtonSmall: {
      width: 28,
      height: 28,
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    chatInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    chatInputMultiline: {
      flex: 1,
      flexGrow: 1,
      minWidth: 0,
      minHeight: 36,
      maxHeight: 160,
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 16,
      lineHeight: 20,
    },
    chatInputMultilineCompact: {
      maxHeight: 180,
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonChat: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButton: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 96,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    modalScreen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: 14,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    friendRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 11,
      paddingHorizontal: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.divider,
    },
    friendRowSelected: {
      backgroundColor: `${theme.accent}1A`,
      borderWidth: 2,
      borderColor: theme.accent,
      borderRadius: 12,
      marginVertical: 4,
      borderBottomWidth: 0,
    },
    friendRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    broadcastOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.accent,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      backgroundColor: `${theme.accent}22`,
    },
    broadcastOptionText: {
      color: theme.accent,
      fontWeight: "700",
      fontSize: 15,
    },
    secondaryActionRow: {
      alignSelf: "flex-end",
      marginBottom: 8,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    dropdownTrigger: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dropdownMenu: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      marginBottom: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 4,
    },
    dropdownItem: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    subtleText: {
      color: theme.subtleText,
      fontSize: 13,
      marginBottom: 8,
    },
    selectedText: {
      color: theme.accent,
      fontSize: 13,
      marginBottom: 8,
      fontWeight: "700",
    },
    settingsOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 28,
    },
    menuOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "flex-start",
      alignItems: "flex-end",
      paddingTop: 52,
      paddingRight: 18,
    },
    menuCard: {
      borderRadius: 12,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.divider,
      minWidth: 220,
      overflow: "hidden",
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    menuRowText: {
      color: theme.text,
      fontSize: 15,
    },
    settingsCard: {
      width: "100%",
      maxHeight: "80%",
      borderRadius: 12,
      backgroundColor: theme.background,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.divider,
      gap: 12,
    },
    addMemberModalCard: {
      maxWidth: 440,
      width: "100%",
      maxHeight: "88%",
    },
    addMemberList: {
      maxHeight: 320,
      marginBottom: 8,
    },
    broadcastSaveModalCard: {
      maxWidth: 440,
      width: "100%",
      minHeight: 200,
      paddingVertical: 28,
      paddingHorizontal: 24,
      justifyContent: "center",
    },
    groupCreateModalCard: {
      maxWidth: 480,
      width: "100%",
      minHeight: 420,
      maxHeight: "92%",
      paddingVertical: 22,
      paddingHorizontal: 22,
      borderRadius: 16,
    },
    groupCreateModalScroll: {
      gap: 14,
      paddingBottom: 12,
    },
    groupCreateModalTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: theme.text,
      textAlign: "center",
    },
    groupCreatePhotoPressable: {
      alignSelf: "center",
    },
    groupCreatePhotoCircle: {
      width: 132,
      height: 132,
      borderRadius: 66,
      overflow: "hidden",
      backgroundColor: theme.replyQuotedFromOtherBg,
      borderWidth: 2,
      borderColor: theme.divider,
      alignItems: "center",
      justifyContent: "center",
    },
    groupCreatePhotoImage: {
      width: "100%",
      height: "100%",
    },
    groupCreatePhotoPrompt: {
      marginTop: 6,
      paddingHorizontal: 10,
      color: theme.subtleText,
      fontSize: 13,
      textAlign: "center",
    },
    broadcastModalActionRow: {
      flexDirection: "row",
      gap: 12,
      width: "100%",
      marginTop: 4,
      alignItems: "stretch",
    },
    broadcastModalBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 10,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    broadcastModalBtnOutline: {
      borderWidth: 2,
      borderColor: theme.accent,
      backgroundColor: theme.background,
    },
    broadcastModalBtnOutlineText: {
      color: theme.accent,
      fontWeight: "700",
      fontSize: 16,
    },
    broadcastModalBtnPrimary: {
      backgroundColor: theme.accent,
    },
    broadcastModalBtnPrimaryText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 16,
    },
    inputAccessoryBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.divider,
      backgroundColor: theme.background,
    },
    inputAccessoryBarButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    inputAccessoryBarButtonText: {
      color: theme.accent,
      fontWeight: "700",
      fontSize: 17,
    },
    broadcastSavePromptTitle: {
      color: theme.text,
      fontSize: 21,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 10,
    },
    broadcastSavePromptBody: {
      color: theme.subtleText,
      fontSize: 16,
      lineHeight: 24,
      textAlign: "center",
      marginBottom: 12,
    },
    reactionPickerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    reactionChip: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 16,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    reactionChipText: {
      fontSize: 20,
    },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
    },
    settingsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    themePickerOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.divider,
    },
    themePickerOptionRowLast: {
      borderBottomWidth: 0,
    },
    settingsRowHint: {
      color: theme.subtleText,
      fontSize: 15,
    },
    addFriendRoot: {
      flex: 1,
      paddingHorizontal: 14,
    },
    addFriendCircleWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    addFriendBigButton: {
      alignItems: "center",
      justifyContent: "center",
    },
    addFriendBigButtonInner: {
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      maxWidth: "98%",
      width: "100%",
    },
    addFriendBigButtonText: {
      fontSize: 36,
      fontWeight: "800",
      textAlign: "center",
      lineHeight: 44,
      letterSpacing: 0.25,
      width: "100%",
    },
    addFriendProfileFullScreen: {
      flex: 1,
      position: "relative",
    },
    /** Counteracts `addFriendRoot` horizontal padding so the profile is full screen width. */
    addFriendProfileBleed: {
      marginHorizontal: -14,
      alignSelf: "stretch",
    },
    addFriendProfileHeroColumn: {
      flex: 1,
      width: "100%",
      minHeight: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    addFriendNowFriendsTitle: {
      fontSize: 28,
      fontWeight: "800",
      textAlign: "center",
      lineHeight: 36,
      letterSpacing: 0.2,
    },
    addFriendProfileSoloName: {
      marginTop: 14,
      paddingHorizontal: 20,
      fontSize: 24,
      fontWeight: "700",
      textAlign: "center",
    },
    addFriendProfileImageOnlyWrap: {
      flex: 1,
      width: "100%",
      minHeight: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    addFriendProfileImageOnly: {
      alignSelf: "center",
    },
    /** Bottom stack layer: avatar + name (under dim + Lottie). */
    addFriendCelebrationBase: {
      zIndex: 0,
      elevation: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    addFriendCelebrationHeroInner: {
      alignItems: "stretch",
      justifyContent: "center",
      width: "100%",
    },
    /** Full-bleed width; letterboxing uses `theme.background` on frame. */
    addFriendCelebrationPhotoFrame: {
      overflow: "hidden",
      alignSelf: "stretch",
      width: "100%",
    },
    addFriendCelebrationNameOnAccent: {
      alignSelf: "center",
    },
    /** Dark scrim between photo and confetti. */
    addFriendCelebrationDim: {
      zIndex: 1,
      elevation: 1,
    },
    addFriendCelebrationLottieWrap: {
      zIndex: 2,
      elevation: 2,
    },
    addFriendCelebrationTitleWrap: {
      zIndex: 3,
      elevation: 3,
    },
    bioInput: {
      minHeight: 100,
      textAlignVertical: "top",
    },
  });
