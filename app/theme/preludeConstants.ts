import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import type {
  Chat,
  Friend,
  Message,
  MockAuthAccount,
  MockSessionClaimResult,
  Post,
  SavedBroadcastGroup,
  ThemePalette,
} from "../domain/types";
import { resolveParticipantDisplay } from "../lib/participantDisplay";

export const CURRENT_USER_ID = "me";
export const DEMO_OFFLINE_MODE = false;
export const DEMO_USER_A_QR_PIN = "4242";
/** Primary UI accent — blue-teal. */
export const ACCENT_GREEN = "#0C8579";
/** Hot pink accent (paired with same light/dark structure as green). */
export const ACCENT_PINK = "#E91E8C";
/** Bright “online” green — distinct from UI accent. */
export const ONLINE_GREEN = "#22E55E";
export const VISIBLE_CHAT_PRIORITY_COUNT = 4;

/** @see {@link ../lib/safeAreaInsets.homeBottomActionClearance} */
export { homeBottomActionClearance } from "../lib/safeAreaInsets";

/** Chat bubble main text size (px). */
export const CHAT_BUBBLE_BODY_SIZE = 15;
/**
 * One vertical rhythm unit ≈ x-height of lowercase text at `CHAT_BUBBLE_BODY_SIZE`
 * (bubble padding and gaps between reply strip and main text use whole/half steps).
 */
export const CHAT_XH = Math.round(CHAT_BUBBLE_BODY_SIZE * 0.53);
export const CHAT_XH_HALF = Math.round(CHAT_XH / 2);

/** Darken a `#RRGGBB` accent for fills/borders (multiplies RGB channels). */
export function multiplyHexColor(hex: string, factor: number): string {
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
export function blendAccentTowardWhite(hex: string, t: number): string {
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

export const FRIEND_NAMES = [
  "Maya",
  "Liam",
  "Noah",
  "Zara",
  "Ari",
  "Eva",
  "Omar",
  "Kai",
  "Luna",
  "Theo",
  "Ivy",
  "Nico",
  "Rose",
  "Jude",
  "Ben",
  "Skye",
  "Reid",
  "Nina",
  "Caleb",
  "Mila",
  "Tariq",
  "Sia",
  "Wyatt",
  "Leah",
  "Jonah",
  "Ava",
  "Rami",
  "Elle",
  "Micah",
  "Poppy",
];

export const friendIds = Array.from({ length: FRIEND_NAMES.length }, (_, i) => `f${i + 1}`);

export const FRIEND_LINKS: Record<string, string[]> = (() => {
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
export const FAKE_BIOS = [
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

export const FRIENDS: Friend[] = FRIEND_NAMES.map((name, i) => ({
  id: `f${i + 1}`,
  displayName: name,
  online: i % 3 !== 2,
  profilePictureUrl: `https://picsum.photos/seed/demo-friend-${i + 1}/400/400`,
  bio: FAKE_BIOS[i % FAKE_BIOS.length],
  messageCount: Math.max(3, 72 - i * 2),
}));

export function cloneFriendLinks(src: Record<string, string[]>): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const k of Object.keys(src)) o[k] = [...src[k]];
  return o;
}

export function buildDemoPostsForFriends(friendIds: string[]): Post[] {
  const now = Date.now();
  const out: Post[] = [];
  let idx = 0;
  for (const fid of friendIds) {
    for (let i = 0; i < 5; i += 1) {
      idx += 1;
      out.push({
        id: `demo-post-${fid}-${i + 1}`,
        authorId: fid,
        createdAt: now - idx * 3_600_000,
        text: `Demo post ${i + 1} from ${fid}`,
        imageUris: [`https://picsum.photos/seed/${fid}-post-${i + 1}/900/900`],
        feedReactions: {},
        comments: [],
      });
    }
  }
  return out;
}

export function buildDemoChatsAndMessages(friendIds: string[]): { chats: Chat[]; messages: Message[] } {
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
      name: fid,
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
        text: i % 2 === 0 ? `Hey from ${fid}` : `Reply to ${fid}`,
        createdAt: now - msgIdx * 70_000,
      });
    }
  }

  const groupSets = [
    friendIds.slice(0, 4),
    friendIds.slice(4, 8),
    friendIds.slice(8, 12),
    friendIds.slice(12, 16),
  ].filter((g) => g.length >= 3);
  groupSets.forEach((group, i) => {
    const chatId = `demo-group-${i + 1}`;
    chats.push({
      id: chatId,
      memberIds: [CURRENT_USER_ID, ...group],
      name: `Demo Group ${i + 1}`,
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
      senderId: group[0],
      text: "Group kickoff message",
      createdAt: now - msgIdx * 70_000,
    });
  });

  const broadcastRecipients = friendIds.slice(0, 6);
  chats.push({
    id: "demo-broadcast-1",
    memberIds: [CURRENT_USER_ID, ...broadcastRecipients],
    name: "Demo Broadcast",
    kind: "broadcast",
    createdBy: CURRENT_USER_ID,
    broadcastRecipientIds: broadcastRecipients,
    isCustomName: true,
    isDraft: false,
    visibleToRecipients: true,
    updatedAt: now - 30_000,
  });
  msgIdx += 1;
  messages.push({
    id: "demo-msg-broadcast-1",
    chatId: "demo-broadcast-1",
    senderId: CURRENT_USER_ID,
    text: "Demo broadcast kickoff",
    createdAt: now - msgIdx * 70_000,
  });

  return { chats, messages };
}

export function addUndirectedEdge(
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

export function removeUndirectedEdge(
  links: Record<string, string[]>,
  a: string,
  b: string
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...links };
  const drop = (from: string, to: string) => {
    if (!next[from]?.length) return;
    const filtered = next[from].filter((x) => x !== to);
    if (filtered.length === 0) {
      delete next[from];
    } else if (filtered.length !== next[from].length) {
      next[from] = filtered;
    }
  };
  drop(a, b);
  drop(b, a);
  return next;
}

export const ADD_FRIEND_HOLD_MS = 150;

/** Shown before any broadcast message that all recipients can see (no private thread). */
export const BROADCAST_EVERYONE_SEND_TITLE = "Broadcast";
export const BROADCAST_EVERYONE_SEND_MESSAGE =
  "This is a Broadcast, this message will be seen by everyone in the Broadcast, do you still want to send?";

export const NOW = Date.now();

export const INITIAL_CHATS: Chat[] = [
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

export const INITIAL_MESSAGES: Message[] = [
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
export const SCROLL_TEST_MESSAGES: Message[] = (() => {
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

export const ALL_INITIAL_MESSAGES = [...INITIAL_MESSAGES, ...SCROLL_TEST_MESSAGES];

export const INITIAL_POSTS: Post[] = [
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

export const LIGHT_THEME_GREEN: ThemePalette = {
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

export const DARK_THEME_GREEN: ThemePalette = {
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

export const LIGHT_THEME_PINK: ThemePalette = {
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

export const DARK_THEME_PINK: ThemePalette = {
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


export const normalizeSet = (memberIds: string[]) => [...memberIds].sort().join("|");
export const POSTS_STORAGE_KEY = "mvpplus.posts.v1";
export const postsStorageKeyForEmail = (email: string) => `${POSTS_STORAGE_KEY}:${email.trim().toLowerCase()}`;
/** Local chats + DM history keyed by signed-in email (survives app restarts until backend catches up). */
export const socialMessagingStorageKeyForEmail = (email: string) =>
  `mvpplus.messaging.v1:${email.trim().toLowerCase()}`;
export const PRESENCE_HEARTBEAT_MS = 8_000;
/** Must exceed heartbeat interval + network skew (server is authoritative). */
export const PRESENCE_ONLINE_WINDOW_MS = 45_000;
/**
 * Internal one-shot guard timeout for the boot-time background server pull
 * (`listMyFriends` + `getUserProfiles` + `listEncryptedMessages`). The
 * splash **never waits** on this — it only waits on Firebase Auth state
 * resolution and a 500 ms minimum. This timer exists purely as belt-and-
 * braces so the boot-sync effect's `initialServerSyncDone` guard always
 * eventually flips to `true`, releasing the one-shot lock even in the
 * (currently unreachable) case that `Promise.allSettled` over the backfill
 * sub-fetches never resolves. See the boot-sync `useEffect` in `MainApp.tsx`.
 */
export const INITIAL_SERVER_SYNC_TIMEOUT_MS = 20_000;
export const ENCRYPTED_POSTS_SYNC_LIMIT = 150;
export const ENCRYPTED_MESSAGES_SYNC_LIMIT = 400;
/**
 * Wall-clock threshold after which the next poll-on-open for posts asks for
 * a full backlog instead of an incremental `sinceMs` pull. Belt-and-braces
 * against the snapshot listener missing an `added` event during a long
 * background hibernation.
 */
export const ENCRYPTED_POSTS_FULL_SYNC_MS = 20 * 60_000;
/** Device-local dark/accent prefs (persist across cold start). */
export const APPEARANCE_PREFS_STORAGE_KEY = "mvpplus.appearance.v1";
export const SESSION_LOCK_TOKEN_STORAGE_KEY = "mvpplus.session_lock_token.v1";
export const sessionLockStorageKeyForEmail = (email: string) =>
  `${SESSION_LOCK_TOKEN_STORAGE_KEY}:${email.trim().toLowerCase()}`;

/**
 * Single active session per email (mock): **Required** — Firebase **Realtime Database** root URL via
 * `expo.extra.mockSessionRtdbUrl` in app.json and/or `EXPO_PUBLIC_MOCK_SESSION_RTDB_URL`. There is no
 * purely-local fallback: two phones cannot share state without network.
 * REST only (no SDK). Dev rules example:
 * `{ "rules": { "mock_sessions_v1": { ".read": true, ".write": true } } }` — tighten before prod.
 */
export const MOCK_SESSION_POLL_MS = 2500;
export const MOCK_SESSION_RTDB_SEGMENT = "mock_sessions_v1";

export function getMockSessionSyncUrl(): string {
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

export function isMockSessionSyncConfigured(): boolean {
  return getMockSessionSyncUrl().length > 0;
}

export function mockSessionRtdbPathKey(email: string): string {
  return encodeURIComponent(email.toLowerCase()).replace(/%/g, "_");
}

/** Persisted signup username wins over email-local defaults on Firebase session restore/login. */
export function profileUsernameStorageKey(email: string): string {
  return `app.profile.username.v1.${email.trim().toLowerCase()}`;
}

/** HTTPS profile picture URL cached for cold start before encrypted profile listener runs. */
export function profilePictureStorageKey(email: string): string {
  return `app.profile.picture.v1.${email.trim().toLowerCase()}`;
}

export function emailLocalPartGuess(email: string): string {
  return (email.split("@")[0] ?? "").trim().toLowerCase();
}

/** True when a stored username is just the email local-part (or Title Case variant). */
export function isEmailDerivedUsername(username: string, email: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const local = emailLocalPartGuess(email);
  if (!local) return false;
  if (u === local) return true;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return norm(u) === norm(local);
}

/** Placeholder labels — must never be written back to Firestore or AsyncStorage. */
export function isPlaceholderProfileUsername(username: string, email: string): boolean {
  const c = username.trim();
  if (!c || c === "User" || c === "Friend") return true;
  if (/^User u_/i.test(c)) return true;
  return isEmailDerivedUsername(c, email);
}

/**
 * Pick the display username for this account. Persisted signup username always wins;
 * never falls back to the email local-part.
 */
export function resolveProfileUsername(params: {
  email: string;
  persistedUsername?: string;
  accountUsername?: string;
  serverUsername?: string;
}): string {
  const persisted = (params.persistedUsername ?? "").trim();
  if (persisted && !isPlaceholderProfileUsername(persisted, params.email)) return persisted;

  for (const candidate of [params.serverUsername, params.accountUsername]) {
    const c = (candidate ?? "").trim();
    if (!c || isPlaceholderProfileUsername(c, params.email)) continue;
    return c;
  }
  return "User";
}

/** Username to send on `upsertUserProfile` — omit when empty so server keeps existing value. */
export function usernameForProfileUpsert(params: {
  email: string;
  persistedUsername?: string;
  accountUsername?: string;
  serverUsername?: string;
}): string {
  for (const candidate of [
    params.persistedUsername,
    params.serverUsername,
    params.accountUsername,
    resolveProfileUsername(params),
  ]) {
    const c = (candidate ?? "").trim();
    if (c && !isPlaceholderProfileUsername(c, params.email)) return c;
  }
  return "";
}

export function generateMockSessionToken(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Poll while signed in iff RTDB is configured (required for login, so normally always on). */
export function shouldPollMockSession(): boolean {
  return false;
}

export async function fetchLedgerTokenFromRtdb(email: string): Promise<string | null> {
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

export async function fetchLedgerTokenWithEtag(email: string): Promise<{ token: string; etag: string } | null> {
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

export async function claimMockSessionLedger(email: string, token: string): Promise<MockSessionClaimResult> {
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

export async function revokeMockSessionLedger(email: string): Promise<void> {
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

export async function readStoredSessionLockToken(email: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(sessionLockStorageKeyForEmail(email));
    return String(raw ?? "").trim();
  } catch {
    return "";
  }
}

export async function writeStoredSessionLockToken(email: string, token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(sessionLockStorageKeyForEmail(email), token);
  } catch {
    /* ignore */
  }
}

export async function clearStoredSessionLockToken(email: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(sessionLockStorageKeyForEmail(email));
  } catch {
    /* ignore */
  }
}

export async function readLedgerSessionToken(email: string, canonicalMine: string): Promise<string> {
  const remote = await fetchLedgerTokenFromRtdb(email);
  if (remote === null) return canonicalMine;
  return remote;
}
export const FEED_MUTE_CHOICES = [
  { label: "24 hours", durationMs: 24 * 60 * 60 * 1000 },
  { label: "1 week", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { label: "1 month", durationMs: 30 * 24 * 60 * 60 * 1000 },
] as const;

export const DEMO_SHARED_FRIEND_IDS = Array.from({ length: 40 }, (_, i) => `f${i + 1}`);
export const DEMO_USER_A_ONLY_FRIEND_IDS = Array.from({ length: 60 }, (_, i) => `f${i + 41}`);
export const DEMO_USER_B_ONLY_FRIEND_IDS = Array.from({ length: 60 }, (_, i) => `f${i + 101}`);
export const DEMO_USER_A_FRIEND_IDS = [...DEMO_SHARED_FRIEND_IDS, ...DEMO_USER_A_ONLY_FRIEND_IDS];
export const DEMO_USER_B_FRIEND_IDS = [...DEMO_SHARED_FRIEND_IDS, ...DEMO_USER_B_ONLY_FRIEND_IDS];

export function buildDemoOfflineAccount(username: "User A" | "User B"): MockAuthAccount {
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

export const DEMO_OFFLINE_ACCOUNTS: MockAuthAccount[] = [
  buildDemoOfflineAccount("User A"),
  buildDemoOfflineAccount("User B"),
];

export const formatDayTime = (timestamp: number) => {
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

export const getMessagePreviewBody = (m: Message) => {
  if (m.unsentAt) return "Message removed";
  const t = m.text?.trim();
  if (t) return t;
  if (m.kind === "photo") return "Photo";
  if (m.kind === "gif") return "GIF";
  if (m.kind === "video") return "Video";
  if (m.kind === "voice") return "Voice message";
  return "";
};

/** Group `profilePicture` is usually an emoji; treat common URI schemes as uploaded images. */
export const isLikelyChatProfileImageUri = (value: string | undefined | null): boolean => {
  const s = value?.trim() ?? "";
  return /^(file:|https?:|content:)/i.test(s);
};

/** Home list preview: in group/broadcast chats, prefix last message with sender ("You" for self). */
export const buildHomeChatPreview = (
  chat: Chat,
  lastMessage: Message | undefined,
  friendLookup: Record<string, Friend>,
  unfriendedIds: string[],
  serverAcceptedFriendBackendUids?: ReadonlySet<string> | null,
  identityLockedChatIds?: ReadonlySet<string>
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
        : `${resolveParticipantDisplay(
            lastMessage.senderId,
            friendLookup,
            unfriendedIds,
            serverAcceptedFriendBackendUids,
            identityLockedChatIds
              ? { chatId: chat.id, identityLockedChatIds }
              : undefined
          ).displayName}: `;
    return `${prefix}${displayBody}`;
  }
  if (chat.draftComposerText?.trim()) {
    return showSender ? `You: ${chat.draftComposerText}` : chat.draftComposerText;
  }
  return "No messages yet";
};

export const isPostAlive = (post: Post) => !post.deletedAt;

export const getPostThumbnailUri = (post: Post): string | undefined => {
  if (post.imageUris?.[0]) return post.imageUris[0];
  if (post.videoPosterUri) return post.videoPosterUri;
  if (post.videoUri) return post.videoUri;
  return undefined;
};

export function chunkBy<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😢", "🔥", "👏"];
export const AUTO_REPLY_LINES = [
  "Got it, thanks!",
  "Sounds good to me.",
  "On it — will reply soon.",
  "Perfect timing.",
  "Thanks for the update.",
  "Yep, let's do that.",
];
export const AUTO_REPLY_MIN_DELAY_MS = DEMO_OFFLINE_MODE ? 5 * 1000 : 0;
export const AUTO_REPLY_MAX_DELAY_MS = 5 * 60 * 1000;
export const REACTION_LAYOUT_STEP_PX = 20;
/** Horizontal inset from screen edges inside the full-bleed online friends strip. */
export const ONLINE_STRIP_EDGE_PAD = 14;
/** How many friend slots fit across the screen before horizontal scrolling. */
export const ONLINE_VISIBLE_SLOTS = 6;
/** Back (38) + gap + header avatar (34) — matches right rail so the title centers on screen. */
export const CHAT_HEADER_SIDE_RAIL_WIDTH = 38 + 8 + 34;

/** Background link delay (no dedicated handshake UI). */
export const ADD_FRIEND_HANDSHAKE_MS = 750;
/** Max time to wait for an NDEF read after the hold completes (native only). */
export const ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS = 45000;
/** Peak opacity of the dark scrim over the friend photo during celebration (fades to 0). */
export const ADD_FRIEND_OVERLAY_DIM_START = 0.62;
/** Dim + confetti + “now friends” title fade duration. */
export const ADD_FRIEND_PROFILE_FADE_MS = 1500;
/** After the fade, keep the profile + name visible before returning to the button. */
export const ADD_FRIEND_PROFILE_SOLO_MS = 1000;
/** After releasing before the handshake completes, ignore new presses until this elapses (hold retry gate). */
export const ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS = 1000;
export const ADD_FRIEND_PROTOCOL_MAX_ATTEMPTS = 3;
export const ADD_FRIEND_PROTOCOL_RETRY_BASE_MS = 200;
export const ADD_FRIEND_QR_VISIBLE_MS = 4_000;
/** Dual-confirm screen: auto-cancel if user taps neither Confirm nor Cancel in time. */
export const ADD_FRIEND_DUAL_CONFIRM_TIMEOUT_MS = 30_000;
