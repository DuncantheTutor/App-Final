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
  AppState,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
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
  type ViewToken,
} from "react-native";

import { FlatListUntilScroll, ScrollViewUntilScroll } from "../ScrollUntilScroll";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PhotoEditorModal,
  type PhotoEditorResult,
  type VideoTextOverlayData,
} from "../PhotoEditorModal";
import LottieView from "lottie-react-native";

import {
  backendUidForEmail,
  backendUidForFriendId,
  callEmulatorFunction,
  getOrCreateBackendDeviceId,
} from "../backendBridge";
import { logAppError, logAppEvent, setTelemetryContext } from "../telemetry";
import {
  mediaUriNeedsFirebaseUpload,
  resolvePostMediaUrisForEncrypt,
  uploadSharedMediaFromDevice,
  uploadSharedMediaIfNeeded,
} from "../mediaStorageUpload";
import { requestReadSmsPermissionIfNeeded, startAndroidOtpAssist } from "../otpSmsAssist";
import { firebaseAuth, getFirestoreDb } from "../firebaseAuthClient";
import {
  collection,
  collectionGroup,
  doc as firestoreDoc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  where,
} from "firebase/firestore";
import { joinCutoffMsForViewer, normalizeMemberJoinedAtForClient } from "./lib/chatMemberJoinedAt";
import { buildLastMessageByChatId } from "./lib/chatListLastMessage";
import {
  findLiveDirectChatForFriend,
  friendBackendUidFromDirectChatLocalId,
  isCanonicalDirectChatId,
  isCanonicalDmHiddenForViewer,
  resolveCanonicalDirectChatLocalId,
  resolveInboundDirectMessageTarget,
  resolveIncomingDirectChatId,
  serverConversationIdForChat,
  serverConversationIdFromLocalChatId,
  serverConversationIdsToHide,
} from "./lib/directChatId";
import {
  isConversationHiddenForViewer,
  localChatIdsFromHiddenConversationIds,
} from "./lib/hiddenConversations";
import {
  CURRENT_USER_LOCAL_ID,
  normalizeChatMemberIds,
  resolveChatMemberToBackendUid,
  resolveChatParticipantBackendUids,
  resolveIncomingSenderFriendId,
} from "./lib/resolveChatMemberBackendUid";
import {
  applyPresenceToFriends,
  dedupeFriendsByBackendUid,
  friendsForFriendsList,
  mergeFriendsCatalog,
  upsertRitualFriend,
} from "./lib/mergeFriendsCatalog";
import { registerOsPushToken, addNotificationResponseListener } from "./lib/pushNotifications";
import { inferOutgoingMediaKind } from "./lib/mediaKind";
import {
  composerBottomPadding,
  fabBottomOffset,
  navDeadZoneHeight,
  scrollPageBottomPadding,
  stickyFooterPadding,
} from "./lib/safeAreaInsets";
import { FeedPostCard } from "./components/FeedPostCard";
import { ReactionBubbleHost } from "./components/ReactionBubbleHost";
import { aggregateReactionCounts, getMyReactionEmoji } from "./lib/reactionHelpers";
import {
  mapServerReactionsToLocal,
  overlayMessageDocMetadata,
  type MessageDocMetadata,
} from "./messaging/messageMetadata";
import { readAvatarsByMessageId, type ReadByMap } from "./lib/readReceipts";
import { useInitialServerSync } from "./boot/useInitialServerSync";
import { clearLocalSocialCacheForEmail } from "./lib/localSocialCache";
import { restoreKeyBundleFromCloudIfMissing, uploadKeyBundleToCloudBackup } from "./lib/e2eeKeyBackup";
import { pullEncryptedPostsIncremental as pullEncryptedPostsFromServer } from "./boot/pullEncryptedPosts";
import {
  restoreSocialSnapshotFromCloud,
  uploadSocialSnapshotToCloud,
} from "./lib/socialSnapshotBackup";
import { useActiveChatMessages } from "./chat/useActiveChatMessages";
import { useFriendRosterSync } from "./friends/useFriendRosterSync";
import { migrateLegacyDraftChats } from "./messaging/legacyChatMigration";
import { isLegacyDraftChatId } from "./messaging/localChatId";
import { openDirectChatWithFriend } from "./messaging/openDirectChat";
import { promotePendingChatToRow } from "./messaging/promotePendingChat";
import { useMessagingSync } from "./messaging/useMessagingSync";
import { updateOutgoingMessageContent } from "./messaging/send";
import { useOutgoingMessages } from "./messaging/useOutgoingMessages";
import { refreshFriendProfilesFromServer } from "./friends/refreshFriendProfiles";
import { publishActivePresence } from "./presence/heartbeat";
import { usePresenceFirestoreListener } from "./presence/usePresenceFirestoreListener";
import { usePresenceHeartbeat } from "./presence/usePresenceHeartbeat";
import { normalizeHttpsProfilePictureUrl } from "./lib/profilePictureUrl";
import {
  decryptPayloadForRecipient,
  ensureLocalKeyBundle,
  encryptPayloadForRecipients,
} from "../e2eeCrypto";

import type {
  Chat,
  ColorThemeId,
  EncryptedSyncChannelState,
  Friend,
  FriendsListRestore,
  Message,
  MockAuthAccount,
  PendingDraft,
  PairingProximityEvidence,
  Post,
  PostComment,
  SavedBroadcastGroup,
  ThemePalette,
  ViewState,
} from "./domain/types";
import {
  APP_BOOT_SPLASH_MIN_MS,
  PLACEHOLDER_APP_PRODUCT_NAME,
  lastHomeTabStorageKey,
  lastViewStorageKey,
  parseFriendsListRestorePayload,
  parsePendingDraftPayload,
  pruneGhostEmptyChats,
  sanitizePersistedFriendsFromStorage,
} from "./lib/viewPersistence";
import {
  collectDirectChatIdsToLockForFriend,
  isChatIdentityLocked,
  mergeIdentityLockedChatIds,
} from "./lib/identityLockedChats";
import { friendDisplayNameFromProfile } from "./lib/friendDisplayName";
import { resolveParticipantDisplay } from "./lib/participantDisplay";
import { maxCreatedAtMs, mergeSyncedMessages, mergeSyncedPosts } from "./lib/mergeEncryptedSync";
import { mergeHydratedPostComments } from "./lib/mergePostComments";
import { makeStyles } from "./styles/makeAppStyles";
import { AddFriendScreen } from "./screens/AddFriendScreen";
import {
  ACCENT_GREEN,
  ACCENT_PINK,
  ADD_FRIEND_HANDSHAKE_MS,
  ADD_FRIEND_HOLD_MS,
  ADD_FRIEND_OVERLAY_DIM_START,
  ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS,
  ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS,
  ADD_FRIEND_PROFILE_FADE_MS,
  ADD_FRIEND_PROFILE_SOLO_MS,
  ADD_FRIEND_PROTOCOL_MAX_ATTEMPTS,
  ADD_FRIEND_PROTOCOL_RETRY_BASE_MS,
  ADD_FRIEND_QR_VISIBLE_MS,
  ALL_INITIAL_MESSAGES,
  APPEARANCE_PREFS_STORAGE_KEY,
  AUTO_REPLY_LINES,
  AUTO_REPLY_MAX_DELAY_MS,
  AUTO_REPLY_MIN_DELAY_MS,
  BROADCAST_EVERYONE_SEND_MESSAGE,
  BROADCAST_EVERYONE_SEND_TITLE,
  CHAT_BUBBLE_BODY_SIZE,
  CHAT_HEADER_SIDE_RAIL_WIDTH,
  CHAT_XH,
  CHAT_XH_HALF,
  CURRENT_USER_ID,
  DARK_THEME_GREEN,
  DARK_THEME_PINK,
  DEMO_OFFLINE_ACCOUNTS,
  DEMO_OFFLINE_MODE,
  DEMO_SHARED_FRIEND_IDS,
  DEMO_USER_A_FRIEND_IDS,
  DEMO_USER_A_ONLY_FRIEND_IDS,
  DEMO_USER_A_QR_PIN,
  DEMO_USER_B_FRIEND_IDS,
  DEMO_USER_B_ONLY_FRIEND_IDS,
  FAKE_BIOS,
  FEED_MUTE_CHOICES,
  FRIENDS,
  FRIEND_LINKS,
  FRIEND_NAMES,
  INITIAL_CHATS,
  INITIAL_MESSAGES,
  INITIAL_POSTS,
  LIGHT_THEME_GREEN,
  LIGHT_THEME_PINK,
  MOCK_SESSION_POLL_MS,
  MOCK_SESSION_RTDB_SEGMENT,
  NOW,
  ONLINE_GREEN,
  ONLINE_STRIP_EDGE_PAD,
  ONLINE_VISIBLE_SLOTS,
  POSTS_STORAGE_KEY,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ONLINE_WINDOW_MS,
  INITIAL_SERVER_SYNC_TIMEOUT_MS,
  ENCRYPTED_POSTS_FULL_SYNC_MS,
  ENCRYPTED_POSTS_SYNC_LIMIT,
  ENCRYPTED_MESSAGES_SYNC_LIMIT,
  REACTION_EMOJIS,
  SCROLL_TEST_MESSAGES,
  SESSION_LOCK_TOKEN_STORAGE_KEY,
  VISIBLE_CHAT_PRIORITY_COUNT,
  addUndirectedEdge,
  removeUndirectedEdge,
  blendAccentTowardWhite,
  buildDemoChatsAndMessages,
  buildDemoOfflineAccount,
  buildDemoPostsForFriends,
  buildHomeChatPreview,
  chunkBy,
  claimMockSessionLedger,
  clearStoredSessionLockToken,
  cloneFriendLinks,
  emailLocalPartGuess,
  isEmailDerivedUsername,
  isPlaceholderProfileUsername,
  resolveProfileUsername,
  usernameForProfileUpsert,
  fetchLedgerTokenFromRtdb,
  fetchLedgerTokenWithEtag,
  formatDayTime,
  friendIds,
  generateMockSessionToken,
  getMessagePreviewBody,
  getMockSessionSyncUrl,
  getPostThumbnailUri,
  homeBottomActionClearance,
  isLikelyChatProfileImageUri,
  isMockSessionSyncConfigured,
  isPostAlive,
  mockSessionRtdbPathKey,
  multiplyHexColor,
  normalizeSet,
  postsStorageKeyForEmail,
  profilePictureStorageKey,
  profileUsernameStorageKey,
  readLedgerSessionToken,
  readStoredSessionLockToken,
  revokeMockSessionLedger,
  sessionLockStorageKeyForEmail,
  shouldPollMockSession,
  socialMessagingStorageKeyForEmail,
  writeStoredSessionLockToken
} from "./theme/preludeConstants";
import {
  readFriendKeyBundleCache,
  readSyncWatermarks,
  writeFriendKeyBundleCache,
  writeSyncWatermarks,
} from "./lib/clientSyncCache";


function MainAppInner() {
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
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
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
  /** 1:1 chat ids that keep **User** identity after refriend (set on unfriend, never cleared). */
  const [identityLockedChatIds, setIdentityLockedChatIds] = useState<string[]>([]);
  const [chatOverflowOpen, setChatOverflowOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [fullscreenMedia, setFullscreenMedia] = useState<{
    uri: string;
    kind: "photo" | "gif" | "video";
  } | null>(null);
  const [messageActionsOpen, setMessageActionsOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [postReactionTargetId, setPostReactionTargetId] = useState<string | null>(null);
  const [commentReactionTarget, setCommentReactionTarget] = useState<{
    postId: string;
    commentId: string;
    threadEntryId?: string;
  } | null>(null);
  const [messageActionTargetId, setMessageActionTargetId] = useState<string | null>(null);
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedBroadcastThreadFriendId, setSelectedBroadcastThreadFriendId] = useState<
    string | null
  >(null);
  const [voiceNoteMode, setVoiceNoteMode] = useState(false);
  const [voiceRecordStartedAt, setVoiceRecordStartedAt] = useState<number | null>(null);
  const [voiceRecordElapsedSec, setVoiceRecordElapsedSec] = useState(0);
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
  const [finishedVideoMessageIds, setFinishedVideoMessageIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
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
  /** `${postId}:${commentId}` when post owner is replying in a private thread; else null = new top-level comment. */
  const [postFullscreenThreadReplyKey, setPostFullscreenThreadReplyKey] = useState<string | null>(null);
  const [shouldFocusPostCommentInput, setShouldFocusPostCommentInput] = useState(false);
  const postCommentInputRef = useRef<TextInput | null>(null);
  const [reactionDetailPost, setReactionDetailPost] = useState<Post | null>(null);
  const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<string, string>>({});
  const [threadDraftByChainKey, setThreadDraftByChainKey] = useState<Record<string, string>>({});
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
  const chatsRef = useRef<Chat[]>([]);
  chatsRef.current = chats;
  const messagesRef = useRef<Message[]>([]);
  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>([]);
  const hiddenChatIdsRef = useRef<string[]>([]);
  hiddenChatIdsRef.current = hiddenChatIds;
  const hiddenServerConversationIdsRef = useRef<Set<string>>(new Set());
  const unfriendedIdsRef = useRef<string[]>([]);
  unfriendedIdsRef.current = unfriendedIds;
  const identityLockedChatIdsRef = useRef<string[]>([]);
  identityLockedChatIdsRef.current = identityLockedChatIds;
  const [messages, setMessages] = useState<Message[]>([]);
  messagesRef.current = messages;
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [chatLoadingOlder, setChatLoadingOlder] = useState(false);
  const [chatHasMoreOlder, setChatHasMoreOlder] = useState<Record<string, boolean>>({});
  const [playingFeedVideoPostId, setPlayingFeedVideoPostId] = useState<string | null>(null);
  const [feedPullNonce, setFeedPullNonce] = useState(0);
  const feedVideoViewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const feedViewableHydrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [friendLinksState, setFriendLinksState] = useState<Record<string, string[]>>(() =>
    cloneFriendLinks(FRIEND_LINKS)
  );
  const [addedFriendsFromRitual, setAddedFriendsFromRitual] = useState<Friend[]>([]);
  const [presenceOnlineByBackendUid, setPresenceOnlineByBackendUid] = useState<Record<string, boolean>>({});
  const addedFriendsFromRitualRef = useRef<Friend[]>([]);
  addedFriendsFromRitualRef.current = addedFriendsFromRitual;
  const autoReplyTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const messagesWatermarkMsRef = useRef(0);
  const acceptedFriendBackendUidsRef = useRef<Set<string>>(new Set());
  const [serverAcceptedFriendBackendUids, setServerAcceptedFriendBackendUids] = useState<Set<string>>(
    () => new Set()
  );
  const syncServerAcceptedFriendBackendUids = useCallback((uids: Set<string>) => {
    acceptedFriendBackendUidsRef.current = uids;
    setServerAcceptedFriendBackendUids(new Set(uids));
  }, []);
  const messagesLastFullSyncAtRef = useRef(0);
  const backendUidToFriendIdRef = useRef<Record<string, string>>({});
  const postsWatermarkMsRef = useRef(0);
  const postsLastFullSyncAtRef = useRef(0);
  /**
   * Snapshot the current sync watermarks to AsyncStorage so the next cold
   * start can do an incremental `sinceMs` pull instead of replaying the full
   * 200-row backlog. Best-effort: in-memory refs remain authoritative for the
   * current session even if the disk write fails.
   */
  const persistWatermarksNow = useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void writeSyncWatermarks(email, {
      messagesWatermarkMs: messagesWatermarkMsRef.current,
      messagesLastFullSyncAt: messagesLastFullSyncAtRef.current,
      postsWatermarkMs: postsWatermarkMsRef.current,
      postsLastFullSyncAt: postsLastFullSyncAtRef.current,
    });
  }, []);
  /**
   * Snapshot the friend public-key cache to AsyncStorage so the first send
   * after a cold start doesn't need an extra `getFriendKeyBundles` round-trip
   * to encrypt the payload. Best-effort.
   */
  const persistFriendKeyCacheNow = useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void writeFriendKeyBundleCache(email, { ...recipientKeyCacheRef.current });
  }, []);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const voiceRecordStartedAtRef = useRef<number | null>(null);
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
  const [appLifecycleState, setAppLifecycleState] = useState(AppState.currentState);
  useEffect(() => {
    const t = setTimeout(() => setAppBootMinMsElapsed(true), APP_BOOT_SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  /**
   * Tracks whether the one-shot boot-time server pull has been kicked off
   * for this signed-in session. The splash **no longer waits** for it (see
   * `showBootSplash` below) — the home renders as soon as auth resolves and
   * the 500 ms minimum has elapsed, even for a true first sign-in on this
   * device.
   *
   * The boot-time pull (`listMyFriends` + `getUserProfiles` +
   * `listEncryptedMessages`) still runs *in the background* because it does
   * two important things the snapshot listeners don't:
   *   1. Backfills `participantAuthUids` onto legacy `friendships` /
   *      `encryptedPosts` / `encryptedProfiles` / `privatePostThreads` docs
   *      that pre-date the auth-UID mirror (so the snapshot listeners can
   *      see them after the next deploy).
   *   2. Seeds friend display names / bios for any friend the snapshot
   *      listener delivers without a profile cached locally.
   *
   * The state is still tracked here so the boot-sync effect knows whether to
   * run (it should only run once per session).
   */
  const [initialServerSyncDone, setInitialServerSyncDone] = useState(false);

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
      /* With edge-to-edge, background calls may no-op; system bar appearance still updates button style. */
      void NavigationBar.setBackgroundColorAsync(rootBg);
      void NavigationBar.setButtonStyleAsync(
        addFriend ? (isDarkMode ? "dark" : "light") : isDarkMode ? "light" : "dark"
      );
    }
  }, [view.screen, colorThemeId, theme.accent, theme.background, isDarkMode]);

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

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (authMode !== "loginOtp" && authMode !== "signupOtp") return;

    const emailLocalHint =
      authMode === "loginOtp"
        ? loginEmail.trim().toLowerCase().split("@")[0] ?? ""
        : signupEmail.trim().toLowerCase().split("@")[0] ?? "";

    const stop = startAndroidOtpAssist(
      (code) => {
        const clipped = code.replace(/\D/g, "").slice(0, 6);
        if (clipped.length !== 6) return;
        if (authModeRef.current === "loginOtp") setLoginOtp(clipped);
        else if (authModeRef.current === "signupOtp") setSignupOtp(clipped);
      },
      {
        emailLocalPartHint: emailLocalHint,
        shouldApplyCode: () => {
          if (authModeRef.current === "loginOtp") return loginOtpRef.current.trim().length < 6;
          if (authModeRef.current === "signupOtp") return signupOtpRef.current.trim().length < 6;
          return false;
        },
      }
    );

    return () => {
      stop();
    };
  }, [authMode, loginEmail, signupEmail]);

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
      JSON.stringify({
        chats,
        messages,
        hiddenChatIds,
        addedFriendsFromRitual,
        unfriendedIds,
        identityLockedChatIds,
      })
    ).catch(() => {
      logAppError("messaging.persist", new Error("write failed"), { email });
    });
  }, [chats, messages, hiddenChatIds, addedFriendsFromRitual, unfriendedIds, identityLockedChatIds, signedIn]);

  const persistSocialMessagingNow = useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email || DEMO_OFFLINE_MODE) return;
    void AsyncStorage.setItem(
      socialMessagingStorageKeyForEmail(email),
      JSON.stringify({
        chats: chatsRef.current,
        messages: messagesRef.current,
        hiddenChatIds: hiddenChatIdsRef.current,
        addedFriendsFromRitual: addedFriendsFromRitualRef.current,
        unfriendedIds: unfriendedIdsRef.current,
        identityLockedChatIds: identityLockedChatIdsRef.current,
      })
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", setAppLifecycleState);
    return () => sub.remove();
  }, []);

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

  useEffect(() => {
    if (!signedIn) return;
    setAddedFriendsFromRitual((prev) => {
      const next = dedupeFriendsByBackendUid(prev);
      if (next.length === prev.length && next.every((f, i) => f === prev[i])) return prev;
      return next;
    });
  }, [signedIn]);

  const presenceFriendUidMap = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of addedFriendsFromRitual) {
      const bu = friend.backendUid?.trim();
      if (bu?.startsWith("u_")) out[friend.id] = bu;
    }
    for (const uid of serverAcceptedFriendBackendUids) {
      if (!uid.startsWith("u_")) continue;
      out[backendUidForFriendId(uid)] = uid;
    }
    return out;
  }, [addedFriendsFromRitual, serverAcceptedFriendBackendUids]);

  const allFriends = useMemo(
    () =>
      applyPresenceToFriends(
        mergeFriendsCatalog(DEMO_OFFLINE_MODE ? FRIENDS : [], addedFriendsFromRitual),
        presenceOnlineByBackendUid,
        presenceFriendUidMap
      ),
    [addedFriendsFromRitual, presenceOnlineByBackendUid, presenceFriendUidMap]
  );

  const friendMap = useMemo(() => {
    const acc: Record<string, Friend> = {};
    for (const f of allFriends) {
      acc[f.id] = f;
      const bu = f.backendUid?.trim();
      if (bu?.startsWith("u_")) acc[bu] = f;
    }
    return acc;
  }, [allFriends]);

  const friendMapRef = useRef(friendMap);
  friendMapRef.current = friendMap;

  const serverFriendUidsForDisplay = useMemo(() => {
    if (DEMO_OFFLINE_MODE) return null;
    if (!initialServerSyncDone) {
      return null;
    }
    return serverAcceptedFriendBackendUids;
  }, [initialServerSyncDone, serverAcceptedFriendBackendUids]);
  const identityLockedChatIdsSet = useMemo(
    () => new Set(identityLockedChatIds),
    [identityLockedChatIds]
  );
  const resolvePd = useCallback(
    (friendId: string, chatId?: string) =>
      resolveParticipantDisplay(friendId, friendMap, unfriendedIds, serverFriendUidsForDisplay, {
        chatId,
        identityLockedChatIds: identityLockedChatIdsSet,
      }),
    [friendMap, unfriendedIds, serverFriendUidsForDisplay, identityLockedChatIdsSet]
  );

  useEffect(() => {
    if (view.screen !== "friendProfile") return;
    if (resolvePd(view.friendId).canOpenProfile) return;
    const v = view;
    if (v.returnTo === "friendsList" && v.friendsListRestore) {
      setView({
        screen: "friendsList",
        returnTo: v.friendsListRestore.returnTo,
        returnChatId: v.friendsListRestore.returnChatId,
        returnPendingDraft: v.friendsListRestore.returnPendingDraft,
      });
      return;
    }
    if (v.returnTo === "chat") {
      if (v.returnPendingDraft) setView({ screen: "chat", pendingDraft: v.returnPendingDraft });
      else if (v.returnChatId) setView({ screen: "chat", chatId: v.returnChatId });
      else setView({ screen: "home" });
      return;
    }
    setView({ screen: "home" });
  }, [view, resolvePd]);

  const visibleFriends = useMemo(
    () => friendsForFriendsList(allFriends, unfriendedIds),
    [allFriends, unfriendedIds]
  );
  const visibleFriendIds = useMemo(() => visibleFriends.map((f) => f.id), [visibleFriends]);
  const demoActiveInboundFriendIds = useMemo(
    () => (DEMO_OFFLINE_MODE ? visibleFriendIds.slice(0, 5) : []),
    [visibleFriendIds]
  );

  const friendIdToBackendUid = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of allFriends) {
      const bu = friend.backendUid?.trim();
      if (bu?.startsWith("u_")) out[friend.id] = bu;
    }
    return out;
  }, [allFriends]);

  const backendUidToFriendId = useMemo(() => {
    const out: Record<string, string> = {};
    for (const friend of allFriends) {
      const bu = friend.backendUid?.trim();
      if (bu?.startsWith("u_")) out[bu] = friend.id;
    }
    return out;
  }, [allFriends]);

  const friendIdToBackendUidRef = useRef(friendIdToBackendUid);
  friendIdToBackendUidRef.current = friendIdToBackendUid;

  useEffect(() => {
    if (!signedIn) return;
    setChats((current) => {
      let changed = false;
      const next = current.map((chat) => {
        const memberIds = normalizeChatMemberIds(chat.memberIds, friendMap, backendUidToFriendId);
        if (memberIds.length === chat.memberIds.length && memberIds.every((id, i) => id === chat.memberIds[i])) {
          return chat;
        }
        changed = true;
        return { ...chat, memberIds };
      });
      return changed ? next : current;
    });
  }, [signedIn, friendMap, backendUidToFriendId]);

  const getBackendSession = useCallback(() => {
    const uid = backendAuthUidRef.current;
    const deviceId = backendDeviceIdRef.current;
    if (!backendSessionReady || !uid || !deviceId) return null;
    return { uid, deviceId };
  }, [backendSessionReady]);

  const postsRef = useRef(posts);
  postsRef.current = posts;
  const socialSnapshotUploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSocialSnapshotCloudBackup = useCallback(() => {
    if (DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session) return;
    if (socialSnapshotUploadTimerRef.current) {
      clearTimeout(socialSnapshotUploadTimerRef.current);
    }
    socialSnapshotUploadTimerRef.current = setTimeout(() => {
      socialSnapshotUploadTimerRef.current = null;
      void uploadSocialSnapshotToCloud(session.uid, session.deviceId, {
        chats: chatsRef.current,
        messages: messagesRef.current,
        posts: postsRef.current,
        messagesWatermarkMs: messagesWatermarkMsRef.current,
        postsWatermarkMs: postsWatermarkMsRef.current,
      }).catch(() => undefined);
    }, 8_000);
  }, [DEMO_OFFLINE_MODE, getBackendSession]);

  useEffect(() => {
    backendUidToFriendIdRef.current = backendUidToFriendId;
  }, [backendUidToFriendId]);

  const messagingSyncRefs = useMemo(
    () => ({
      chatsRef,
      messagesRef,
      hiddenChatIdsRef,
      hiddenServerConversationIdsRef,
      messagesWatermarkMsRef,
      backendUidToFriendIdRef,
      friendMapRef,
      friendIdToBackendUidRef,
      identityLockedChatIdsRef,
      acceptedFriendBackendUidsRef,
    }),
    []
  );

  const {
    pullEncryptedMessagesIncremental,
    resolveConversationId,
    resolveRecipientEncryptionKeys,
    refreshHiddenConversationIdsFromServer,
    rememberHiddenConversationIds,
  } = useMessagingSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    appLifecycleState,
    initialServerSyncDone,
    viewScreen: view.screen,
    activeChatLocalId:
      view.screen === "chat" && "chatId" in view ? view.chatId : null,
    getBackendSession,
    backendSessionReady,
    allFriends,
    backendUidToFriendId,
    refs: messagingSyncRefs,
    chatsRef,
    friendMapRef,
    friendIdToBackendUidRef,
    hiddenServerConversationIdsRef,
    recipientKeyCacheRef,
    persistWatermarksNow,
    persistFriendKeyCacheNow,
    setChats,
    setMessages,
    setHiddenChatIds,
    setEncryptedSyncState,
  });

  const pullEncryptedPostsIncremental = useCallback(
    async (options?: { forceFull?: boolean }) => {
      const session = getBackendSession();
      if (!session || DEMO_OFFLINE_MODE) return;
      setEncryptedSyncState((current) => ({ ...current, posts: "syncing" }));
      try {
        await pullEncryptedPostsFromServer(
          {
            session,
            backendUidToFriendId,
            currentUserLocalId: CURRENT_USER_ID,
            postsWatermarkMsRef,
            postsLastFullSyncAtRef,
            forceFull: options?.forceFull,
          },
          setPosts
        );
        persistWatermarksNow();
        setEncryptedSyncState((current) => ({ ...current, posts: "ok", lastSuccessAt: Date.now() }));
      } catch {
        setEncryptedSyncState((current) => ({ ...current, posts: "error" }));
      }
    },
    [DEMO_OFFLINE_MODE, backendUidToFriendId, getBackendSession, persistWatermarksNow]
  );

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !backendSessionReady) return;
    scheduleSocialSnapshotCloudBackup();
  }, [chats, messages, posts, signedIn, backendSessionReady, scheduleSocialSnapshotCloudBackup]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    if (appLifecycleState !== "background" && appLifecycleState !== "inactive") return;
    const session = getBackendSession();
    if (!session) return;
    void uploadSocialSnapshotToCloud(session.uid, session.deviceId, {
      chats: chatsRef.current,
      messages: messagesRef.current,
      posts: postsRef.current,
      messagesWatermarkMs: messagesWatermarkMsRef.current,
      postsWatermarkMs: postsWatermarkMsRef.current,
    }).catch(() => undefined);
  }, [appLifecycleState, signedIn, getBackendSession]);

  useEffect(() => {
    if (!DEMO_OFFLINE_MODE) return;
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
      ...visibleFriendIds
        .map((id) => friendMap[id]?.backendUid?.trim())
        .filter((uid): uid is string => !!uid && uid.startsWith("u_")),
    ];
    const payload = {
      bio: myBio,
      profilePictureUrl: normalizeHttpsProfilePictureUrl(myProfilePictureUrl),
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
    friendMap,
  ]);

  /**
   * Push-based encrypted-profile delivery via Firestore `onSnapshot`. Replaces
   * the old 45 s `getEncryptedProfile` self-poll. Filters on the
   * `recipientAuthUids` mirror that `putEncryptedProfile` now populates from
   * the envelope keys, so a single listener delivers:
   *
   * - **self** updates pushed from another signed-in device (this is the
   *   primary motivator — the user editing bio/picture on phone A propagates
   *   instantly to phone B without waiting for a 45 s poll cycle), and
   * - **friend** profile updates if/when we wire those into UI state (the
   *   listener already decodes them; today we only assign self).
   */
  useEffect(() => {
    if (DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const firebaseAuthUid = firebaseAuth.currentUser?.uid;
    if (!firebaseAuthUid) return;

    let cancelled = false;
    const db = getFirestoreDb();
    const q = firestoreQuery(
      collection(db, "encryptedProfiles"),
      where("recipientAuthUids", "array-contains", firebaseAuthUid)
    );

    setEncryptedSyncState((current) => ({ ...current, profile: "syncing" }));

    const unsubscribe = onSnapshot(
      q,
      async (snap) => {
        if (cancelled) return;
        for (const doc of snap.docs) {
          const data = doc.data() as {
            ownerUid?: string;
            ciphertext?: string;
            nonce?: string;
            envelopes?: Record<string, string>;
          };
          const envelope = data.envelopes?.[session.uid];
          if (!envelope || !data.ciphertext || !data.nonce || !data.ownerUid) continue;
          try {
            const plain = await decryptPayloadForRecipient<{
              bio?: string;
              profilePictureUrl?: string | null;
            }>(session.uid, data.ciphertext, data.nonce, envelope);
            const rawPic = plain.profilePictureUrl;
            const safePic =
              typeof rawPic === "string" && /^https?:\/\//i.test(rawPic) ? rawPic : null;
            if (data.ownerUid === session.uid) {
              if (typeof plain.bio === "string") setMyBio(plain.bio);
              if (typeof rawPic === "string" || rawPic === null) {
                setMyProfilePictureUrl(safePic);
              }
            } else if (data.ownerUid?.startsWith("u_")) {
              if (safePic !== null) {
                setAddedFriendsFromRitual((current) =>
                  current.map((f) =>
                    f.backendUid === data.ownerUid
                      ? {
                          ...f,
                          ...(typeof plain.bio === "string" ? { bio: plain.bio } : {}),
                          profilePictureUrl: safePic ?? "",
                        }
                      : f
                  )
                );
              } else {
                const ownerUid = data.ownerUid;
                void refreshFriendProfilesFromServer(session, addedFriendsFromRitualRef.current).then(
                  (refreshed) => {
                    if (cancelled) return;
                    setAddedFriendsFromRitual((current) => {
                      const row = refreshed.find((f) => f.backendUid === ownerUid);
                      if (!row?.profilePictureUrl) return current;
                      return current.map((f) =>
                        f.backendUid === ownerUid
                          ? {
                              ...f,
                              profilePictureUrl: row.profilePictureUrl,
                              ...(typeof plain.bio === "string" ? { bio: plain.bio } : {}),
                            }
                          : f
                      );
                    });
                  }
                );
              }
            }
          } catch {
            /* Skip un-decodable profile doc (key mismatch, malformed envelope). */
          }
        }
        if (cancelled) return;
        setEncryptedSyncState((current) => ({
          ...current,
          profile: "ok",
          lastSuccessAt: Date.now(),
        }));
      },
      () => {
        if (cancelled) return;
        setEncryptedSyncState((current) => ({ ...current, profile: "error" }));
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [signedIn, getBackendSession]);

  // Posts are pulled **on open** of a post-bearing surface (feed tab, my
  // profile, a friend's profile) rather than on a recurring timer. This effect
  // re-fires whenever `view.screen` / `homeTab` change (i.e. the user navigates
  // away and back) or when the app foregrounds, which gives the user the same
  // freshness guarantee without the cost of background polling while they sit
  // on the screen. A user-initiated refresh affordance (button + pull-to-
  // refresh) is still backlog — `MASTER_PRODUCT_PLAN.md` Feed and ranking
  // breadth.
  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    if (appLifecycleState !== "active") return;
    const onPostSurfaces =
      (view.screen === "home" && homeTab === "feed") ||
      view.screen === "myProfile" ||
      view.screen === "friendProfile";
    if (!onPostSurfaces) return;
    let cancelled = false;
    const tick = async () => {
      const now = Date.now();
      const fullSync =
        feedRefreshing ||
        postsWatermarkMsRef.current <= 0 ||
        now - postsLastFullSyncAtRef.current > ENCRYPTED_POSTS_FULL_SYNC_MS;
      setEncryptedSyncState((current) => ({ ...current, posts: "syncing" }));
      try {
        const request: {
          uid: string;
          deviceId: string;
          limit: number;
          sinceMs?: number;
        } = {
          uid: session.uid,
          deviceId: session.deviceId,
          limit: ENCRYPTED_POSTS_SYNC_LIMIT,
        };
        if (!fullSync && postsWatermarkMsRef.current > 0) {
          request.sinceMs = Math.max(0, postsWatermarkMsRef.current - 5_000);
        }
        const res = await callEmulatorFunction<{
          items: Array<{
            postId: string;
            ownerUid: string;
            ciphertext: string;
            nonce: string;
            envelope: string;
            createdAtMs?: number;
          }>;
          reactionsByPostId?: Record<string, Record<string, string>>;
          incremental?: boolean;
          hasMore?: boolean;
        }>("listEncryptedPosts", request);
        if (!Array.isArray(res.items)) return;
        const decoded: Post[] = [];
        let postDecodeFailures = 0;
        for (const item of res.items) {
          try {
            const plain = await decryptPayloadForRecipient<{
              postId: string;
              authorId?: string;
              authorUid?: string;
              createdAt?: number;
              text?: string | null;
              imageUris?: string[] | null;
              videoUri?: string | null;
              videoPosterUri?: string | null;
            }>(session.uid, item.ciphertext, item.nonce, item.envelope);
            const authorUid =
              typeof plain.authorUid === "string" && plain.authorUid.trim()
                ? plain.authorUid.trim()
                : item.ownerUid;
            const friendAuthorId =
              authorUid === session.uid
                ? CURRENT_USER_ID
                : backendUidToFriendId[authorUid] ?? backendUidForFriendId(authorUid);
            const serverReactions = res.reactionsByPostId?.[item.postId];
            const mappedReactions: Record<string, string> | undefined = serverReactions
              ? Object.fromEntries(
                  Object.entries(serverReactions).map(([uid, emoji]) => [
                    uid === session.uid
                      ? CURRENT_USER_ID
                      : backendUidToFriendId[uid] ?? backendUidForFriendId(uid),
                    emoji,
                  ])
                )
              : undefined;
            decoded.push({
              id: item.postId,
              authorId: friendAuthorId,
              createdAt: item.createdAtMs ?? plain.createdAt ?? Date.now(),
              text: plain.text ?? undefined,
              imageUris: plain.imageUris ?? undefined,
              videoUri: plain.videoUri ?? undefined,
              videoPosterUri: plain.videoPosterUri ?? undefined,
              feedReactions: mappedReactions,
            });
          } catch {
            postDecodeFailures += 1;
          }
        }
        if (cancelled) return;
        const incremental = Boolean(res.incremental);
        setPosts((current) =>
          mergeSyncedPosts(current, decoded, { incremental, optimisticWindowMs: 90_000 })
        );
        if (decoded.length > 0 && postDecodeFailures === 0) {
          postsWatermarkMsRef.current = Math.max(postsWatermarkMsRef.current, maxCreatedAtMs(decoded));
        }
        if (fullSync) {
          postsLastFullSyncAtRef.current = now;
        }
        setFeedHasMore(res.hasMore ?? decoded.length >= ENCRYPTED_POSTS_SYNC_LIMIT);
        persistWatermarksNow();
        setEncryptedSyncState((current) => ({ ...current, posts: "ok", lastSuccessAt: Date.now() }));
      } catch {
        if (cancelled) return;
        setEncryptedSyncState((current) => ({ ...current, posts: "error" }));
      } finally {
        if (!cancelled) {
          setFeedRefreshing(false);
          setFeedLoadingMore(false);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [
    signedIn,
    getBackendSession,
    backendUidToFriendId,
    appLifecycleState,
    view.screen,
    homeTab,
    persistWatermarksNow,
    feedPullNonce,
  ]);

  useFriendRosterSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    getBackendSession,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged: syncServerAcceptedFriendBackendUids,
    addedFriendsFromRitualRef,
    setAddedFriendsFromRitual,
    setUnfriendedIds,
    setFriendLinksState,
    addUndirectedEdge,
    removeUndirectedEdge,
  });

  /**
   * Push-based encrypted-post delivery via Firestore `onSnapshot`. Filters on
   * the `recipientAuthUids` mirror that `createEncryptedPost` now populates
   * (with opportunistic backfill on every `listEncryptedPosts` callable read
   * for pre-migration docs). New posts from friends — and deletions via
   * `deleteEncryptedPost` — propagate in real time without waiting for the
   * user to navigate back to a feed surface.
   *
   * The poll-on-open `listEncryptedPosts` effect above still runs on each
   * surface entry: it serves both as the backlog fetch on first sign-in
   * (where the snapshot listener has no cached docs) and as the trigger for
   * the server-side `recipientAuthUids` backfill on older posts.
   */
  useEffect(() => {
    if (DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const firebaseAuthUid = firebaseAuth.currentUser?.uid;
    if (!firebaseAuthUid) return;

    let cancelled = false;
    const db = getFirestoreDb();
    const q = firestoreQuery(
      collection(db, "encryptedPosts"),
      where("recipientAuthUids", "array-contains", firebaseAuthUid),
      orderBy("createdAt", "desc"),
      firestoreLimit(ENCRYPTED_POSTS_SYNC_LIMIT)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snap) => {
        if (cancelled) return;

        // Handle removals first (server-side `deleteEncryptedPost`).
        const removedIds: string[] = [];
        for (const change of snap.docChanges()) {
          if (change.type === "removed") {
            const removedId = change.doc.id;
            const data = change.doc.data() as { postId?: string };
            removedIds.push(data.postId || removedId);
          }
        }
        if (removedIds.length > 0) {
          const removedSet = new Set(removedIds);
          setPosts((current) => {
            const next = current.filter((p) => !removedSet.has(p.id));
            return next.length === current.length ? current : next;
          });
        }

        const decoded: Post[] = [];
        let postDecodeFailures = 0;
        for (const doc of snap.docs) {
          const data = doc.data() as {
            postId?: string;
            ownerUid?: string;
            envelopes?: Record<string, string>;
            ciphertext?: string;
            nonce?: string;
            createdAt?: { toMillis?: () => number } | number | null;
          };
          const envelope = data.envelopes?.[session.uid];
          if (!envelope || !data.ciphertext || !data.nonce || !data.ownerUid) continue;
          const createdAtMs =
            typeof data.createdAt === "number"
              ? data.createdAt
              : typeof data.createdAt === "object" && data.createdAt && typeof (data.createdAt as { toMillis?: () => number }).toMillis === "function"
                ? (data.createdAt as { toMillis: () => number }).toMillis()
                : Date.now();
          // Skip docs older than what we've already seen — avoids double-decoding
          // the historical backlog the boot pull already processed.
          if (createdAtMs > 0 && createdAtMs <= postsWatermarkMsRef.current - 5_000) {
            continue;
          }
          try {
            const plain = await decryptPayloadForRecipient<{
              postId: string;
              authorId?: string;
              authorUid?: string;
              createdAt?: number;
              text?: string | null;
              imageUris?: string[] | null;
              videoUri?: string | null;
              videoPosterUri?: string | null;
            }>(session.uid, data.ciphertext, data.nonce, envelope);
            const authorUid =
              typeof plain.authorUid === "string" && plain.authorUid.trim()
                ? plain.authorUid.trim()
                : data.ownerUid;
            decoded.push({
              id: data.postId || doc.id,
              authorId:
                authorUid === session.uid
                  ? CURRENT_USER_ID
                  : backendUidToFriendId[authorUid] ?? backendUidForFriendId(authorUid),
              createdAt: createdAtMs || plain.createdAt || Date.now(),
              text: plain.text ?? undefined,
              imageUris: plain.imageUris ?? undefined,
              videoUri: plain.videoUri ?? undefined,
              videoPosterUri: plain.videoPosterUri ?? undefined,
            });
          } catch {
            postDecodeFailures += 1;
          }
        }

        if (cancelled) return;
        if (decoded.length > 0) {
          setPosts((current) =>
            mergeSyncedPosts(current, decoded, { incremental: true, optimisticWindowMs: 90_000 })
          );
          if (postDecodeFailures === 0) {
            postsWatermarkMsRef.current = Math.max(
              postsWatermarkMsRef.current,
              maxCreatedAtMs(decoded)
            );
            persistWatermarksNow();
          }
        }
        setEncryptedSyncState((current) => ({
          ...current,
          posts: "ok",
          lastSuccessAt: Date.now(),
        }));
      },
      () => {
        if (cancelled) return;
        /* Listener torn down (network error, rules denial, etc.). The
         * poll-on-open callable path remains the durable fallback. */
        setEncryptedSyncState((current) => ({ ...current, posts: "error" }));
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [signedIn, getBackendSession, backendUidToFriendId, persistWatermarksNow]);

  useInitialServerSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    setInitialServerSyncDone,
    getBackendSession,
    refreshHiddenConversationIdsFromServer,
    pullEncryptedMessagesIncremental,
    pullEncryptedPostsIncremental,
    setAddedFriendsFromRitual,
    setFriendLinksState,
    setChats,
    setMessages,
    chatsRef,
    messagesRef,
    postsRef,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged: syncServerAcceptedFriendBackendUids,
    addUndirectedEdge,
    currentUserLocalId: CURRENT_USER_ID,
  });

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn || DEMO_OFFLINE_MODE) return;
    if (!chatsRef.current.some((c) => isLegacyDraftChatId(c.id))) return;
    const migrated = migrateLegacyDraftChats(
      chatsRef.current,
      messagesRef.current,
      session.uid,
      friendMapRef.current,
      friendIdToBackendUidRef.current
    );
    setChats(migrated.chats);
    setMessages(migrated.messages);
  }, [signedIn, backendSessionReady, getBackendSession, friendMap, friendIdToBackendUid]);

  const friendBackendUidsKey = useMemo(
    () =>
      addedFriendsFromRitual
        .map((f) => f.backendUid?.trim())
        .filter((uid): uid is string => !!uid?.startsWith("u_"))
        .sort()
        .join(","),
    [addedFriendsFromRitual]
  );

  const presenceRosterKey = useMemo(() => {
    const accepted = [...serverAcceptedFriendBackendUids].sort().join(",");
    return `${accepted}::${friendBackendUidsKey}`;
  }, [serverAcceptedFriendBackendUids, friendBackendUidsKey]);

  usePresenceHeartbeat({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    appLifecycleState,
    getBackendSession,
    allFriends,
    friendIdToBackendUid,
    presenceRosterKey,
    acceptedFriendBackendUidsRef,
    setPresenceOnlineByBackendUid,
  });

  usePresenceFirestoreListener({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    getBackendSession,
    setPresenceOnlineByBackendUid,
  });

  useEffect(() => {
    if (DEMO_OFFLINE_MODE || !signedIn || !initialServerSyncDone) return;
    const session = getBackendSession();
    if (!session) return;
    let cancelled = false;
    const run = async () => {
      const refreshed = await refreshFriendProfilesFromServer(
        session,
        addedFriendsFromRitualRef.current
      );
      if (cancelled) return;
      setAddedFriendsFromRitual((current) => {
        const next = refreshed;
        if (
          next.length === current.length &&
          next.every(
            (f, i) =>
              current[i]?.id === f.id &&
              current[i]?.profilePictureUrl === f.profilePictureUrl &&
              current[i]?.displayName === f.displayName &&
              current[i]?.bio === f.bio
          )
        ) {
          return current;
        }
        return next;
      });
    };
    void run();
    const id = setInterval(() => void run(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [signedIn, initialServerSyncDone, friendBackendUidsKey, getBackendSession]);

  /** Top icon strip: only the screen you’re on is highlighted (friend profile / chat: none). */
  const homeNavIconHighlight = useMemo(() => {
    const screen = view.screen;
    const onHome = screen === "home";
    return {
      settings: screen === "settings",
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

  const loadMoreFeedPosts = useCallback(() => {
    if (feedLoadingMore || !feedHasMore || DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session) return;
    const oldest = feedPosts[feedPosts.length - 1];
    if (!oldest) return;
    setFeedLoadingMore(true);
    void (async () => {
      try {
        const res = await callEmulatorFunction<{
          items: Array<{
            postId: string;
            ownerUid: string;
            ciphertext: string;
            nonce: string;
            envelope: string;
            createdAtMs?: number;
          }>;
          reactionsByPostId?: Record<string, Record<string, string>>;
          hasMore?: boolean;
        }>("listEncryptedPosts", {
          uid: session.uid,
          deviceId: session.deviceId,
          limit: ENCRYPTED_POSTS_SYNC_LIMIT,
          beforeMs: oldest.createdAt - 1,
        });
        const decoded: Post[] = [];
        for (const item of res.items ?? []) {
          try {
            const plain = await decryptPayloadForRecipient<{
              authorUid?: string;
              createdAt?: number;
              text?: string | null;
              imageUris?: string[] | null;
              videoUri?: string | null;
              videoPosterUri?: string | null;
            }>(session.uid, item.ciphertext, item.nonce, item.envelope);
            const authorUid = plain.authorUid?.trim() || item.ownerUid;
            const serverReactions = res.reactionsByPostId?.[item.postId];
            const mappedReactions: Record<string, string> | undefined = serverReactions
              ? Object.fromEntries(
                  Object.entries(serverReactions).map(([uid, emoji]) => [
                    uid === session.uid
                      ? CURRENT_USER_ID
                      : backendUidToFriendId[uid] ?? backendUidForFriendId(uid),
                    emoji,
                  ])
                )
              : undefined;
            decoded.push({
              id: item.postId,
              authorId:
                authorUid === session.uid
                  ? CURRENT_USER_ID
                  : backendUidToFriendId[authorUid] ?? backendUidForFriendId(authorUid),
              createdAt: item.createdAtMs ?? plain.createdAt ?? Date.now(),
              text: plain.text ?? undefined,
              imageUris: plain.imageUris ?? undefined,
              videoUri: plain.videoUri ?? undefined,
              videoPosterUri: plain.videoPosterUri ?? undefined,
              feedReactions: mappedReactions,
            });
          } catch {
            /* skip */
          }
        }
        setPosts((current) => {
          const byId = Object.fromEntries(current.map((p) => [p.id, p] as const));
          for (const p of decoded) {
            const prev = byId[p.id];
            byId[p.id] = {
              ...prev,
              ...p,
              feedReactions: p.feedReactions ?? prev?.feedReactions,
              comments: prev?.comments ?? p.comments,
            };
          }
          return Object.values(byId).sort((a, b) => b.createdAt - a.createdAt);
        });
        setFeedHasMore(res.hasMore ?? (res.items?.length ?? 0) >= ENCRYPTED_POSTS_SYNC_LIMIT);
      } finally {
        setFeedLoadingMore(false);
      }
    })();
  }, [feedLoadingMore, feedHasMore, feedPosts, getBackendSession, backendUidToFriendId]);

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

  const joinCutoffForViewer = useCallback(
    (chat: Chat | null | undefined) => {
      const session = getBackendSession();
      return joinCutoffMsForViewer(chat, session?.uid ?? null);
    },
    [getBackendSession]
  );

  const lastMessageByChatId = useMemo(() => {
    const session = getBackendSession();
    return buildLastMessageByChatId({
      chats,
      messages,
      sessionAppUid: session?.uid ?? null,
      friendMap,
      friendIdToBackendUid,
      currentUserId: CURRENT_USER_ID,
      currentUserLocalId: CURRENT_USER_LOCAL_ID,
    });
  }, [messages, chats, friendMap, friendIdToBackendUid, getBackendSession]);

  const sortedChats = useMemo(() => {
    const hidden = new Set(hiddenChatIds);
    const mine = chats.filter((c) => c.memberIds.includes(CURRENT_USER_ID) && !hidden.has(c.id));
    return [...mine].sort((a, b) => {
      const aTs = lastMessageByChatId[a.id]?.createdAt ?? a.updatedAt;
      const bTs = lastMessageByChatId[b.id]?.createdAt ?? b.updatedAt;
      return bTs - aTs;
    });
  }, [chats, lastMessageByChatId, hiddenChatIds]);

  /**
   * Chat list visibility rule (see `Planning/MASTER_PRODUCT_PLAN.md`,
   * `FEATURE_TEST_SCENARIOS.md` → “Chat list ghost rule”):
   *
   * 1. A chat row is shown only when it has at least one **visible** message
   *    (after `joinCutoffForViewer` + `hiddenFromOwner` filtering), **OR** it is
   *    *my own* draft (`isDraft && createdBy === me`) that carries non-empty
   *    `draftComposerText`. No identity (username/avatar) leaks via a row that
   *    is otherwise empty.
   * 2. Drafts that are not yet `visibleToRecipients` stay private to the
   *    creator until the first message is committed.
   * 3. Chats with an unfriended counterpart stay visible when they already have
   *    message history (tombstone-with-history); empty ex-friend threads stay hidden.
   */
  const visibleSortedChats = useMemo(() => {
    return sortedChats.filter((c) => {
      const ownedByMe = (c.createdBy ?? CURRENT_USER_ID) === CURRENT_USER_ID;
      if (c.isDraft && c.visibleToRecipients !== true && !ownedByMe) return false;

      const hasVisibleMessages = lastMessageByChatId[c.id] !== undefined;
      if (!hasVisibleMessages) {
        const hasSavedDraftText = (c.draftComposerText ?? "").trim().length > 0;
        if (!c.isDraft || !ownedByMe || !hasSavedDraftText) return false;
        const others = c.memberIds.filter((id) => id !== CURRENT_USER_ID);
        if (others.some((id) => unfriendedIds.includes(id))) return false;
      }

      return true;
    });
  }, [sortedChats, lastMessageByChatId, unfriendedIds]);

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
  const activeCounterpartIds = (resolvedChat?.memberIds ?? pendingDraft?.memberIds ?? []).filter(
    (id) => id !== CURRENT_USER_ID
  );
  const activeChatId =
    view.screen === "chat" && "chatId" in view ? view.chatId : undefined;
  const activeDirectCounterpartPd =
    activeChatKind === "standard" && activeCounterpartIds.length === 1
      ? resolvePd(activeCounterpartIds[0], activeChatId)
      : null;
  const activeChatIdentityLocked = isChatIdentityLocked(activeChatId, identityLockedChatIdsSet);
  const chatScreenTitle = useMemo(() => {
    if (activeChatKind !== "standard") {
      return pendingDraft?.name ?? resolvedChat?.name ?? "Chat";
    }
    if (activeCounterpartIds.length === 1) {
      if (activeChatIdentityLocked) return "User";
      const counterpartId = activeCounterpartIds[0];
      const pd = resolvePd(counterpartId, activeChatId);
      return pd.displayName;
    }
    if (activeCounterpartIds.length > 1) {
      if (resolvedChat?.isCustomName) return resolvedChat.name;
      if (pendingDraft?.standardGroupTitle === "custom") {
        return pendingDraft.name?.trim() || buildDefaultChatName(activeCounterpartIds);
      }
      return buildDefaultChatName(activeCounterpartIds);
    }
    return pendingDraft?.name ?? resolvedChat?.name ?? "Chat";
  }, [
    activeChatKind,
    activeCounterpartIds,
    friendMap,
    unfriendedIds,
    pendingDraft?.name,
    pendingDraft?.standardGroupTitle,
    resolvedChat?.name,
    resolvedChat?.isCustomName,
    resolvedChat?.kind,
    activeChatId,
    activeChatIdentityLocked,
    identityLockedChatIds,
    serverFriendUidsForDisplay,
    resolvePd,
  ]);
  /** Direct DM: ex-friend, unknown participant, or identity-locked history after refriend. */
  const isDirectTombstoneChat =
    view.screen === "chat" &&
    activeChatKind === "standard" &&
    activeCounterpartIds.length === 1 &&
    (activeChatIdentityLocked ||
      (activeDirectCounterpartPd !== null && !activeDirectCounterpartPd.canOpenProfile));

  const broadcastMemberCount =
    resolvedChat?.kind === "broadcast"
      ? resolvedChat.broadcastRecipientIds?.length ??
        resolvedChat.memberIds.filter((id) => id !== CURRENT_USER_ID).length
      : 0;
  const chatScreenTitleWithCount =
    resolvedChat?.kind === "broadcast" && (resolvedChat.createdBy ?? CURRENT_USER_ID) === CURRENT_USER_ID
      ? `${chatScreenTitle} (${broadcastMemberCount})`
      : chatScreenTitle;
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

  const activeChatMessages = useActiveChatMessages({
    view,
    chats,
    messages,
    chatSearch,
    demoOfflineMode: DEMO_OFFLINE_MODE,
    sessionUid: getBackendSession()?.uid ?? null,
    friendMap,
    friendIdToBackendUid,
    currentUserId: CURRENT_USER_ID,
  });

  /** Newest first — required for `inverted` FlatList (latest sits at bottom, scroll up for older). */
  const invertedChatMessages = useMemo(
    () => [...activeChatMessages].reverse(),
    [activeChatMessages]
  );

  const activeChatForRead = useMemo(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return null;
    return chats.find((c) => c.id === view.chatId) ?? null;
  }, [chats, view]);

  const readAvatarsForActiveChat = useMemo(() => {
    const readByBackend = activeChatForRead?.readBy as ReadByMap | undefined;
    if (!readByBackend) return {};
    const readByFriendIds: ReadByMap = {};
    for (const [uid, cursor] of Object.entries(readByBackend)) {
      const friendId =
        uid === getBackendSession()?.uid
          ? CURRENT_USER_ID
          : backendUidToFriendId[uid] ?? uid;
      readByFriendIds[friendId] = cursor;
    }
    return readAvatarsByMessageId(activeChatMessages, readByFriendIds, CURRENT_USER_ID);
  }, [activeChatMessages, activeChatForRead?.readBy, backendUidToFriendId, getBackendSession]);

  const loadOlderChatMessages = useCallback(async () => {
    if (view.screen !== "chat" || !("chatId" in view) || chatLoadingOlder) return;
    const chatId = view.chatId;
    if (chatHasMoreOlder[chatId] === false) return;
    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    const oldest = activeChatMessages[0];
    setChatLoadingOlder(true);
    try {
      const res = await callEmulatorFunction<{
        items: Array<{
          messageId: string;
          conversationId: string;
          senderUid: string;
          ciphertext: string;
          nonce: string;
          envelope: string;
          createdAtMs: number;
          reactions?: Record<string, string>;
          editedAt?: number | null;
          unsentAt?: number | null;
        }>;
        hasMore?: boolean;
      }>("listConversationMessages", {
        uid: session.uid,
        deviceId: session.deviceId,
        conversationId: resolveConversationId(chatId),
        beforeMs: oldest?.createdAt,
        limit: 50,
      });
      const chatRow = chats.find((c) => c.id === chatId) ?? null;
      const cutoff = joinCutoffForViewer(chatRow);
      const hiddenLocal = new Set(hiddenChatIdsRef.current);
      const hiddenServer = hiddenServerConversationIdsRef.current;
      const decoded: Message[] = [];
      for (const item of res.items ?? []) {
        const rawLocal = item.conversationId.replace(/^enc_/, "");
        const preTarget = resolveInboundDirectMessageTarget({
          conversationId: item.conversationId,
          rawLocalChatId: rawLocal,
          senderAppUid: item.senderUid,
          sessionAppUid: session.uid,
          chats,
          friendMap,
          friendIdToBackendUid,
          hiddenLocalChatIds: hiddenLocal,
          hiddenServerConversationIds: hiddenServer,
          identityLockedChatIds: identityLockedChatIdsSet,
        });
        if ("drop" in preTarget) continue;
        try {
          const plain = await decryptPayloadForRecipient<{
            messageId: string;
            chatId: string;
            text: string;
            createdAt: number;
            kind?: Message["kind"];
            mediaUri?: string | null;
            durationSec?: number | null;
            replyToMessageId?: string | null;
            broadcastThreadFriendId?: string | null;
          }>(session.uid, item.ciphertext, item.nonce, item.envelope);
          const createdAt = item.createdAtMs ?? plain.createdAt ?? Date.now();
          if (createdAt < cutoff) continue;
          const docMeta: MessageDocMetadata = {
            reactions: item.reactions,
            editedAt: item.editedAt,
            unsentAt: item.unsentAt,
          };
          const postTarget = resolveInboundDirectMessageTarget({
            conversationId: item.conversationId,
            rawLocalChatId: rawLocal,
            senderAppUid: item.senderUid,
            sessionAppUid: session.uid,
            chats,
            friendMap,
            friendIdToBackendUid,
            hiddenLocalChatIds: hiddenLocal,
            hiddenServerConversationIds: hiddenServer,
            identityLockedChatIds: identityLockedChatIdsSet,
            plainLocalChatId: plain.chatId,
          });
          if ("drop" in postTarget) continue;
          const messageChatId = postTarget.resolvedLocalChatId;
          const baseRow: Message = {
            id: item.messageId,
            chatId: messageChatId,
            senderId:
              item.senderUid === session.uid
                ? CURRENT_USER_ID
                : backendUidToFriendId[item.senderUid] ?? item.senderUid,
            text: plain.text ?? "",
            createdAt,
            kind: plain.kind,
            mediaUri: plain.mediaUri ?? undefined,
            durationSec:
              typeof plain.durationSec === "number" && Number.isFinite(plain.durationSec)
                ? Math.max(0, Math.round(plain.durationSec))
                : undefined,
            replyToMessageId: plain.replyToMessageId ?? undefined,
            broadcastThreadFriendId: plain.broadcastThreadFriendId ?? undefined,
          };
          const row = overlayMessageDocMetadata(
            baseRow,
            docMeta,
            session.uid,
            backendUidToFriendId
          );
          decoded.push(row);
        } catch (err) {
          logAppError("chat.pagination.decode", err, {
            chatId,
            conversationId: item.conversationId,
          });
        }
      }
      if (decoded.length > 0) {
        setMessages((current) => mergeSyncedMessages(current, decoded, { incremental: true, optimisticWindowMs: 120_000 }));
      }
      setChatHasMoreOlder((current) => ({ ...current, [chatId]: Boolean(res.hasMore) }));
    } finally {
      setChatLoadingOlder(false);
    }
  }, [
    view,
    chats,
    joinCutoffForViewer,
    chatLoadingOlder,
    chatHasMoreOlder,
    activeChatMessages,
    getBackendSession,
    backendUidToFriendId,
  ]);

  useEffect(() => {
    if (view.screen !== "chat" || !("chatId" in view) || DEMO_OFFLINE_MODE) return;
    const chatId = view.chatId;
    const session = getBackendSession();
    if (!session) return;
    const db = getFirestoreDb();
    const conversationDocId = resolveConversationId(chatId);
    const unsub = onSnapshot(firestoreDoc(db, "conversations", conversationDocId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        readBy?: Chat["readBy"];
        memberJoinedAt?: Record<string, number>;
        adminIds?: string[];
        participantUids?: string[];
        mutedBy?: Record<string, boolean>;
      };
      const serverMuted = Boolean(data.mutedBy?.[session.uid]);
      setChats((current) =>
        current.map((c) =>
          c.id === chatId
            ? {
                ...c,
                readBy: data.readBy ?? c.readBy,
                memberJoinedAt:
                  normalizeMemberJoinedAtForClient(
                    data.memberJoinedAt,
                    session.uid,
                    c.memberIds,
                    friendIdToBackendUid
                  ) ?? c.memberJoinedAt,
                adminIds: data.adminIds ?? c.adminIds,
                mutedForNotifications: serverMuted,
              }
            : c
        )
      );
    });
    return () => unsub();
  }, [view, getBackendSession, resolveConversationId, friendIdToBackendUid]);

  const activeChatLatestMessage = activeChatMessages[activeChatMessages.length - 1] ?? null;

  const activeChatSharedMedia = useMemo(
    () =>
      activeChatMessages.filter(
        (m) =>
          m.mediaUri &&
          !m.unsentAt &&
          (m.kind === "photo" || m.kind === "gif" || m.kind === "video")
      ),
    [activeChatMessages]
  );
  useEffect(() => {
    if (view.screen !== "chat" || !activeChatLatestMessage || DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session || !("chatId" in view)) return;
    const conversationId = resolveConversationId(view.chatId);
    void callEmulatorFunction("updateConversationReadPosition", {
      uid: session.uid,
      deviceId: session.deviceId,
      conversationId,
      lastReadAtMs: activeChatLatestMessage.createdAt,
      lastReadMessageId: activeChatLatestMessage.id,
    }).catch((err) => {
      logAppError("chat.read_position.update", err, {
        chatId: view.screen === "chat" && "chatId" in view ? view.chatId : "",
      });
    });
  }, [view, activeChatLatestMessage?.id, activeChatLatestMessage?.createdAt, getBackendSession, resolveConversationId]);

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
      friendsForFriendsList(allFriends, unfriendedIds)
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
    setHiddenChatIds([]);
    hiddenServerConversationIdsRef.current = new Set();
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
      void clearLocalSocialCacheForEmail(email);
    }
    logAppEvent("local_state.reset_current_user", { email: email ?? "" });
  }, [resetLocalSocialStateForSignedOut]);

  const initializeBackendSessionForAccount = useCallback(async (account: MockAuthAccount) => {
    const uid = backendUidForEmail(account.email);
    const deviceId = await getOrCreateBackendDeviceId();
    const persistedUsername =
      (await AsyncStorage.getItem(profileUsernameStorageKey(account.email)))?.trim() ?? "";
    const claimUsername = resolveProfileUsername({
      email: account.email,
      persistedUsername,
      accountUsername: account.username,
    });
    const usernameForClaim =
      persistedUsername ||
      (claimUsername !== "User" && !isEmailDerivedUsername(claimUsername, account.email)
        ? claimUsername
        : "");
    await callEmulatorFunction("claimDeviceSession", {
      uid,
      deviceId,
      ...(usernameForClaim ? { username: usernameForClaim } : {}),
    });

    const keyRestore = await restoreKeyBundleFromCloudIfMissing(uid, deviceId);
    if (keyRestore.status === "restored") {
      logAppEvent("e2ee.key_backup.restored", { uid });
    }
    if (keyRestore.status === "backup_decrypt_failed") {
      throw new Error(
        "Could not restore your encryption keys from backup. Sign in with the same account you used before, then contact support if this continues."
      );
    }
    const ownBundle = await ensureLocalKeyBundle(uid);

    const cloudSnapshot = await restoreSocialSnapshotFromCloud(uid, deviceId);
    if (cloudSnapshot) {
      setChats(cloudSnapshot.chats);
      setMessages(cloudSnapshot.messages);
      setPosts(cloudSnapshot.posts);
      messagesWatermarkMsRef.current = cloudSnapshot.messagesWatermarkMs;
      postsWatermarkMsRef.current = cloudSnapshot.postsWatermarkMs;
      messagesLastFullSyncAtRef.current = Date.now();
      postsLastFullSyncAtRef.current = Date.now();
    }

    // Register this device's Firebase Auth UID against the app uid so the
    // backend can mirror it into `participantAuthUids` on every encrypted
    // message and conversation doc. Without this, the client-side
    // `onSnapshot` listener (push delivery) would never see new messages
    // because Firestore rules can only authorize on the real auth UID.
    // Soft-fails: if the registry write doesn't land, we still fall back to
    // the boot-time `listEncryptedMessages` callable pull.
    const firebaseAuthUid = firebaseAuth.currentUser?.uid;
    if (firebaseAuthUid) {
      let authRegistryOk = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await callEmulatorFunction("registerFirebaseAuthUid", {
            uid,
            deviceId,
            firebaseAuthUid,
          });
          // registerFirebaseAuthUid also refreshes presence server-side; publish again for redundancy.
          await publishActivePresence({ uid, deviceId }, Date.now());
          authRegistryOk = true;
          break;
        } catch (err) {
          if (attempt >= 2) {
            logAppError("auth.register_firebase_uid", err, { uid, attempt });
          } else {
            await new Promise<void>((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
      }
      if (!authRegistryOk) {
        void publishActivePresence({ uid, deviceId }, Date.now()).catch(() => undefined);
      }
    }

    let resolvedBio = (account.bio || "").trim();
    let resolvedPicture: string | null = account.profilePictureUrl ?? null;
    let self: { username?: string; bio?: string; profilePictureUrl?: string | null } | null | undefined =
      null;
    try {
      try {
        const profilesRes = await callEmulatorFunction<{
          profiles?: Record<string, { username?: string; bio?: string; profilePictureUrl?: string | null } | null>;
        }>("getUserProfiles", {
          uid,
          deviceId,
          targetUids: [uid],
        });
        self = profilesRes.profiles?.[uid] ?? null;
      } catch {
        /* no server profile yet — first device claim */
      }
      if (self) {
        const sb = (self.bio ?? "").trim();
        if (sb) resolvedBio = sb;
        if (typeof self.profilePictureUrl === "string" && self.profilePictureUrl.trim()) {
          resolvedPicture = self.profilePictureUrl.trim();
        }
      }
    } catch {
      // Keep account defaults — server may lag or profile may not exist yet.
    }
    const resolvedUsername = resolveProfileUsername({
      email: account.email,
      persistedUsername,
      accountUsername: account.username,
      serverUsername: self?.username,
    });
    if (!isPlaceholderProfileUsername(resolvedUsername, account.email)) {
      void AsyncStorage.setItem(profileUsernameStorageKey(account.email), resolvedUsername).catch(
        () => {}
      );
    }

    await callEmulatorFunction("publishUserKeyBundle", {
      uid,
      deviceId,
      keyVersion: ownBundle.keyVersion,
      encryptionPublicKey: ownBundle.encryptionPublicKey,
      identitySigningPublicKey: ownBundle.identitySigningPublicKey,
    });
    void uploadKeyBundleToCloudBackup(uid, deviceId).catch(() => undefined);
    if (cloudSnapshot) {
      void uploadSocialSnapshotToCloud(uid, deviceId, {
        chats: cloudSnapshot.chats,
        messages: cloudSnapshot.messages,
        posts: cloudSnapshot.posts,
        messagesWatermarkMs: cloudSnapshot.messagesWatermarkMs,
        postsWatermarkMs: cloudSnapshot.postsWatermarkMs,
      }).catch(() => undefined);
    }
    const usernameForUpsert = usernameForProfileUpsert({
      email: account.email,
      persistedUsername,
      accountUsername: account.username,
      serverUsername: self?.username,
    });
    await callEmulatorFunction("upsertUserProfile", {
      uid,
      deviceId,
      ...(usernameForUpsert ? { username: usernameForUpsert } : {}),
      bio: resolvedBio,
      profilePictureUrl: resolvedPicture,
      phoneNumber: account.phoneNumber,
    });
    const safeProfilePic = normalizeHttpsProfilePictureUrl(resolvedPicture);
    setMyProfilePictureUrl(safeProfilePic);
    if (safeProfilePic) {
      void AsyncStorage.setItem(profilePictureStorageKey(account.email), safeProfilePic).catch(() => {});
    }

    backendAuthUidRef.current = uid;
    backendDeviceIdRef.current = deviceId;
    setTelemetryContext({ uid, deviceId });
    /**
     * Merge into the recipient key cache rather than replacing it: any friend
     * public keys hydrated from `readFriendKeyBundleCache` in
     * `applySignedInAccount` must survive this session-init step so the first
     * outbound message after cold start doesn't pay an extra
     * `getFriendKeyBundles` round-trip.
     */
    recipientKeyCacheRef.current = {
      ...recipientKeyCacheRef.current,
      [uid]: ownBundle.encryptionPublicKey,
    };
    setBackendSessionReady(true);
    /**
     * Watermarks (`messagesWatermarkMsRef`, `postsWatermarkMsRef`, …) are now
     * seeded from AsyncStorage in `applySignedInAccount` *before* this function
     * runs, so the first `listEncryptedMessages` / `listEncryptedPosts` call
     * can do an incremental `sinceMs` pull instead of replaying the full
     * backlog. We deliberately do NOT zero them here — they are reset only on
     * explicit sign-out / session-replaced (see `logout` / `logoutFromSessionReplaced`).
     */
    setEncryptedSyncState({ profile: "syncing", posts: "syncing", messages: "syncing", lastSuccessAt: null });
    await refreshHiddenConversationIdsFromServer();
  }, [refreshHiddenConversationIdsFromServer]);

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
      let nextUnfriendedIds =
        account.seedFriendIds && account.seedFriendIds.length > 0
          ? allSeedIds.filter((id) => !account.seedFriendIds!.includes(id))
          : allSeedIds;
      const emailKey = account.email.trim().toLowerCase();

      let nextPosts: Post[] =
        DEMO_OFFLINE_MODE && hasSeedGraph
          ? buildDemoPostsForFriends(account.seedFriendIds ?? [])
          : hasSeedGraph
            ? INITIAL_POSTS
            : [];
      let restoredRitualFriends: Friend[] = [];
      let nextIdentityLockedChatIds: string[] = [];
      try {
        const [rawPosts, rawSocial, persistedWatermarks, persistedFriendKeys] =
          await Promise.all([
            AsyncStorage.getItem(postsStorageKeyForEmail(emailKey)),
            AsyncStorage.getItem(socialMessagingStorageKeyForEmail(emailKey)),
            readSyncWatermarks(emailKey),
            readFriendKeyBundleCache(emailKey),
          ]);

        /**
         * Seed the in-memory sync refs from disk so the boot-time
         * `listEncryptedMessages` / `listEncryptedPosts` calls can ask for
         * `sinceMs = watermark - 5_000` instead of replaying the full backlog.
         * `initializeBackendSessionForAccount` no longer zeros these.
         */
        messagesWatermarkMsRef.current = persistedWatermarks.messagesWatermarkMs;
        messagesLastFullSyncAtRef.current = persistedWatermarks.messagesLastFullSyncAt;
        postsWatermarkMsRef.current = persistedWatermarks.postsWatermarkMs;
        postsLastFullSyncAtRef.current = persistedWatermarks.postsLastFullSyncAt;
        /**
         * Seed the friend public-key cache from disk so the first outbound
         * message after a cold start doesn't need a `getFriendKeyBundles`
         * round-trip before it can encrypt.
         */
        recipientKeyCacheRef.current = { ...persistedFriendKeys };
        if (!hasSeedGraph && !demoGraph && rawSocial) {
          try {
            const parsedSocial = JSON.parse(rawSocial) as {
              chats?: unknown;
              messages?: unknown;
              hiddenChatIds?: unknown;
              addedFriendsFromRitual?: unknown;
              unfriendedIds?: unknown;
              identityLockedChatIds?: unknown;
            };
            if (Array.isArray(parsedSocial.chats)) {
              nextChats = parsedSocial.chats as Chat[];
            }
            if (Array.isArray(parsedSocial.messages)) {
              nextMessages = parsedSocial.messages as Message[];
            }
            // Strip ghost-empty chats lurking in legacy persisted blobs so the
            // first render after sign-in doesn't surface a friend's username
            // through an otherwise empty thread (see `pruneGhostEmptyChats`).
            nextChats = pruneGhostEmptyChats(nextChats, nextMessages, CURRENT_USER_ID);
            const restoredHidden = Array.isArray(parsedSocial.hiddenChatIds)
              ? parsedSocial.hiddenChatIds
                  .map((id) => String(id ?? "").trim())
                  .filter((id) => id.length > 0)
              : [];
            setHiddenChatIds(restoredHidden);
            for (const id of restoredHidden) {
              if (isCanonicalDirectChatId(id)) {
                hiddenServerConversationIdsRef.current.add(`enc_${id}`);
              }
            }
            const hiddenLocal = new Set(restoredHidden);
            nextChats = nextChats.filter((c) => !hiddenLocal.has(c.id));
            nextMessages = nextMessages.filter((m) => !hiddenLocal.has(m.chatId));
            restoredRitualFriends = sanitizePersistedFriendsFromStorage(parsedSocial.addedFriendsFromRitual);
            if (Array.isArray(parsedSocial.unfriendedIds)) {
              const persistedUnfriends = parsedSocial.unfriendedIds
                .map((id) => String(id ?? "").trim())
                .filter((id) => id.length > 0);
              if (persistedUnfriends.length > 0) {
                nextUnfriendedIds = [...new Set([...nextUnfriendedIds, ...persistedUnfriends])];
              }
            }
            if (Array.isArray(parsedSocial.identityLockedChatIds)) {
              nextIdentityLockedChatIds = [
                ...new Set(
                  parsedSocial.identityLockedChatIds
                    .map((id) => String(id ?? "").trim())
                    .filter((id) => id.length > 0)
                ),
              ];
            }
          } catch {
            /* ignore */
          }
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

      const ritualFriendsFiltered = restoredRitualFriends.filter((f) => !nextUnfriendedIds.includes(f.id));

      // Prevent data bleed across accounts: reset local social timeline state on every sign-in.
      setChats(nextChats);
      setMessages(nextMessages);
      setPosts(nextPosts);
      setUnfriendedIds(nextUnfriendedIds);
      setIdentityLockedChatIds(nextIdentityLockedChatIds);
      setFriendLinksState(() => {
        let next = cloneFriendLinks(FRIEND_LINKS);
        for (const f of ritualFriendsFiltered) {
          next = addUndirectedEdge(next, CURRENT_USER_ID, f.id);
        }
        return next;
      });
      setAddedFriendsFromRitual(dedupeFriendsByBackendUid(ritualFriendsFiltered));
      setPresenceOnlineByBackendUid({});
      setFeedMutedUntilByFriendId({});
      setMyBio(account.bio);
      setMyBioTextEntryOpen(!account.bio.trim());
      const persistedProfilePic = await AsyncStorage.getItem(profilePictureStorageKey(emailKey)).catch(
        () => null
      );
      setMyProfilePictureUrl(
        normalizeHttpsProfilePictureUrl(persistedProfilePic ?? account.profilePictureUrl)
      );

      /**
       * Re-arm the boot-sync guard so the once-per-session
       * `listMyFriends` / `getUserProfiles` / `listEncryptedMessages`
       * backfill pull runs for this newly-signed-in account. The splash no
       * longer waits on this — it only exists to prevent the boot-sync
       * effect from looping. See the `initialServerSyncDone` declaration
       * above for the full contract.
       */
      setInitialServerSyncDone(false);

      // Stay in the app shell while the backend session is (re)claimed — Firebase already persisted the user.
      setSignedIn(true);
      signedInRef.current = true;
      setAuthMode("login");
      setView({ screen: "home" });
      setHomeTab("feed");
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
        setInitialServerSyncDone(true);
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
          setInitialServerSyncDone(false);
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
          const persistedUsername =
            (await AsyncStorage.getItem(profileUsernameStorageKey(email)))?.trim() ?? "";
          const account: MockAuthAccount = {
            email,
            password: "",
            username: persistedUsername,
            phoneNumber: "",
            bio: "",
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
      void clearLocalSocialCacheForEmail(email);
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
    messagesWatermarkMsRef.current = 0;
    acceptedFriendBackendUidsRef.current = new Set();
    messagesLastFullSyncAtRef.current = 0;
    postsWatermarkMsRef.current = 0;
    postsLastFullSyncAtRef.current = 0;
    setBackendSessionReady(false);
    setEncryptedSyncState({ profile: "idle", posts: "idle", messages: "idle", lastSuccessAt: null });
    setInitialServerSyncDone(false);
    setSignedIn(false);
    setView({ screen: "home" });
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
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
  const confirmLogout = useCallback(() => {
    Alert.alert("Logout?", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: logout },
    ]);
  }, [logout]);
  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete account?",
      "This is permanent and cannot be undone.\n\nWhat will be deleted:\n- Your account access and profile.\n- Your posts across the app.\n\nWhat may remain for other people:\n- Messages you already sent in chats may remain visible to recipients as \"User\".\n- Your comments/reactions on other users' posts may remain but are attributed as \"User\".\n\nProceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete account not enabled yet",
              "This button now shows the final deletion policy. Backend deletion rollout is next so delete can run safely end-to-end."
            );
          },
        },
      ]
    );
  }, []);
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
    messagesWatermarkMsRef.current = 0;
    acceptedFriendBackendUidsRef.current = new Set();
    messagesLastFullSyncAtRef.current = 0;
    postsWatermarkMsRef.current = 0;
    postsLastFullSyncAtRef.current = 0;
    setBackendSessionReady(false);
    setEncryptedSyncState({ profile: "idle", posts: "idle", messages: "idle", lastSuccessAt: null });
    setInitialServerSyncDone(false);
    setSignedIn(false);
    setView({ screen: "home" });
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
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
    const persistedUsername =
      (await AsyncStorage.getItem(profileUsernameStorageKey(email)))?.trim() ?? "";
    const account: MockAuthAccount = {
      email,
      password,
      username: persistedUsername,
      phoneNumber: "",
      bio: "",
      profilePictureUrl: null,
    };
    sessionEmailRef.current = account.email;
    await applySignedInAccount(account);
  };

  const goToLoginOtpStep = () => {
    if (DEMO_OFFLINE_MODE) return;
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) {
      Alert.alert("Login", "Enter email and password.");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      Alert.alert("Login", "Use a valid email address.");
      return;
    }
    setLoginOtp("");
    setIssuedOtpCode(null);
    setIssuedOtpForEmail(null);
    setAuthMode("loginOtp");
  };

  const loginDemoOrSubmit = async () => {
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
    goToLoginOtpStep();
  };

  const requestLoginOtpCode = async () => {
    if (DEMO_OFFLINE_MODE) return;
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) {
      Alert.alert("Missing details", "Enter email and password (use Back to edit).");
      return;
    }
    if (Platform.OS === "android") {
      await requestReadSmsPermissionIfNeeded();
    }
    try {
      const res = await callEmulatorFunction<{ debugCode?: string }>("requestEmailOtp", {
        email,
        purpose: "login",
      });
      setIssuedOtpCode(String(res.debugCode ?? ""));
      setIssuedOtpForEmail(email);
      setLoginOtp("");
      Alert.alert("OTP sent", res.debugCode ? `Test OTP for ${email}: ${res.debugCode}` : `OTP sent to ${email}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not request OTP.";
      logAppError("auth.request_login_otp", e, { email });
      if (/wait before requesting another otp|resource-exhausted/i.test(message)) {
        Alert.alert("Please wait", "You can request a new OTP in a few seconds.");
        return;
      }
      Alert.alert("OTP error", message);
    }
  };

  const completeLoginWithOtp = async () => {
    if (DEMO_OFFLINE_MODE) return;
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    const otp = loginOtp.replace(/\D/g, "").slice(0, 6);
    if (!email || !password || !otp || otp.length !== 6) {
      Alert.alert("Missing fields", "Enter email, password, and a full 6-digit OTP.");
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
    const otp = signupOtp.replace(/\D/g, "").slice(0, 6);
    if (!email || !password || !username || !phone || !otp || otp.length !== 6) {
      Alert.alert("Missing fields", "Complete email, password, username, phone, and a full 6-digit OTP.");
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
      bio: "",
      profilePictureUrl: null,
    };
    sessionEmailRef.current = account.email;
    try {
      await AsyncStorage.setItem(profileUsernameStorageKey(email), username.trim());
    } catch {
      /* ignore */
    }
    await clearLocalSocialCacheForEmail(email);
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
      return resolvePd(friendIds[0]).displayName;
    }
    return friendIds.map((id) => resolvePd(id).displayName).join(", ");
  };

  const resolvedStoredChatListTitle = useCallback(
    (chat: Chat) => {
      if (chat.kind === "broadcast") return chat.name;
      const counterpartIds = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
      if (counterpartIds.length === 1) {
        return resolvePd(counterpartIds[0], chat.id).displayName;
      }
      if (counterpartIds.length > 1 && !chat.isCustomName) {
        return counterpartIds
          .map((id) => resolvePd(id, chat.id).displayName)
          .join(", ");
      }
      return chat.name;
    },
    [resolvePd]
  );

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
    setChatSearchVisible(false);
    setChatSearch("");
    setSelectedBroadcastThreadFriendId(null);
    setReplyTargetMessageId(null);
    setEditingMessageId(null);
    let targetChatId = chatId;
    const session = getBackendSession();
    if (session && isCanonicalDirectChatId(chatId)) {
      const friendBackendUid = friendBackendUidFromDirectChatLocalId(chatId, session.uid);
      if (
        friendBackendUid &&
        isCanonicalDmHiddenForViewer(
          session.uid,
          friendBackendUid,
          new Set(hiddenChatIdsRef.current),
          hiddenServerConversationIdsRef.current
        )
      ) {
        const live = findLiveDirectChatForFriend(
          chats,
          session.uid,
          friendBackendUid,
          friendMap,
          friendIdToBackendUid
        );
        if (live) targetChatId = live.id;
      }
    }
    const chat = chats.find((c) => c.id === targetChatId);
    const draftText = chat?.draftComposerText ?? "";
    setHiddenChatIds((current) => current.filter((id) => id !== targetChatId));
    setChatInput(draftText);
    setShouldFocusChatInput(draftText.trim().length > 0);
    setView({ screen: "chat", chatId: targetChatId });
  };

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn || DEMO_OFFLINE_MODE) return;
    void registerOsPushToken(session);
    return addNotificationResponseListener((conversationId) => {
      const localChatId = conversationId.replace(/^enc_/, "");
      if (localChatId) goToChat(localChatId);
    });
  }, [signedIn, getBackendSession, goToChat]);

  const goToPendingDraftChat = (pending: PendingDraft) => {
    setChatOverflowOpen(false);
    setMembersModalOpen(false);
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
        standardGroupTitle: titleFromComposer ? "custom" : "members",
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
      ...(selectedComposerIds.length > 1 ? { standardGroupTitle: "members" as const } : {}),
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
    openDirectChatWithFriend({
      friendId,
      session: getBackendSession(),
      chats,
      friendMap,
      friendIdToBackendUid,
      unfriendedIds,
      identityLockedChatIds: identityLockedChatIdsSet,
      hiddenServerConversationIds: hiddenServerConversationIdsRef.current,
      hiddenLocalChatIds: new Set(hiddenChatIdsRef.current),
      resolveDisplayName: (id) =>
        friendMap[id]?.displayName?.trim() || resolvePd(id).displayName,
      normalizeMemberSet: normalizeSet,
      goToChat,
      setChats,
    });
  };

  const openChatFromHome = (chatId: string) => {
    goToChat(chatId);
  };

  const openFriendProfile = async (
    friendId: string,
    from: "home" | "chat",
    options?: { returnChatId?: string; returnPendingDraft?: PendingDraft }
  ) => {
    if (!resolvePd(friendId).canOpenProfile) return;
    const backendUid = friendMap[friendId]?.backendUid?.trim();
    if (!DEMO_OFFLINE_MODE && backendUid?.startsWith("u_")) {
      const session = getBackendSession();
      if (!session) return;
      try {
        const res = await callEmulatorFunction<{
          profiles?: Record<string, { username?: string } | null>;
        }>("getUserProfiles", {
          uid: session.uid,
          deviceId: session.deviceId,
          targetUids: [backendUid],
        });
        if (!res.profiles?.[backendUid]) return;
      } catch {
        return;
      }
    }
    setChatOverflowOpen(false);
    setView({
      screen: "friendProfile",
      friendId,
      returnTo: from,
      returnChatId: from === "chat" ? options?.returnChatId : undefined,
      returnPendingDraft: from === "chat" ? options?.returnPendingDraft : undefined,
    });
  };

  const openFriendProfileFromFriendsList = async (friendId: string) => {
    if (view.screen !== "friendsList") return;
    if (!resolvePd(friendId).canOpenProfile) return;
    const backendUid = friendMap[friendId]?.backendUid?.trim();
    if (!DEMO_OFFLINE_MODE && backendUid?.startsWith("u_")) {
      const session = getBackendSession();
      if (!session) return;
      try {
        const res = await callEmulatorFunction<{
          profiles?: Record<string, { username?: string } | null>;
        }>("getUserProfiles", {
          uid: session.uid,
          deviceId: session.deviceId,
          targetUids: [backendUid],
        });
        if (!res.profiles?.[backendUid]) return;
      } catch {
        return;
      }
    }
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

  const openSettingsScreen = useCallback(() => {
    setView({ screen: "settings" });
  }, []);

  const hydrateFriendByUid = useCallback(
    async (
      session: { uid: string; deviceId: string },
      friendUid: string,
      opts?: { pairingPin?: string | null; previewOnly?: boolean }
    ): Promise<Friend | null> => {
      const pin = opts?.pairingPin?.trim() ?? "";
      const profiles = await callEmulatorFunction<{
        profiles?: Record<string, { username?: string; bio?: string; profilePictureUrl?: string | null } | null>;
      }>("getUserProfiles", {
        uid: session.uid,
        deviceId: session.deviceId,
        targetUids: [friendUid],
        ...(pin.length === 4 && /^\d{4}$/.test(pin) ? { pairingPin: pin } : {}),
      });
      const profile = profiles.profiles?.[friendUid] ?? {};
      const friend: Friend = {
        id: backendUidForFriendId(friendUid),
        backendUid: friendUid,
        displayName: friendDisplayNameFromProfile(profile?.username, friendUid),
        online: false,
        profilePictureUrl: profile?.profilePictureUrl || "",
        bio: profile?.bio || "",
        messageCount: 0,
      };
      if (!opts?.previewOnly) {
        const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
          uid: session.uid,
          deviceId: session.deviceId,
        });
        if (!(friendsRes.friendUids ?? []).includes(friendUid)) {
          return friend;
        }
        setAddedFriendsFromRitual((prev) => upsertRitualFriend(prev, friend));
        setFriendLinksState((prev) => addUndirectedEdge(prev, CURRENT_USER_ID, friend.id));
        syncServerAcceptedFriendBackendUids(
          new Set([...acceptedFriendBackendUidsRef.current, friendUid])
        );
      }
      return friend;
    },
    [syncServerAcceptedFriendBackendUids]
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
        setAddedFriendsFromRitual((prev) => upsertRitualFriend(prev, friend));
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
          if (res.status === "awaiting_issuer_confirm" && res.redeemerUid?.trim()) {
            const redeemerUid = res.redeemerUid.trim();
            try {
              const hydrated = await hydrateFriendByUid(session, redeemerUid, {
                pairingPin: pin,
                previewOnly: true,
              });
              if (hydrated) return hydrated;
            } catch {
              /* keep polling while session is active; hydration may lag behind status update */
            }
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
            online: false,
            profilePictureUrl: "https://picsum.photos/seed/demo-user-a/400/400",
            bio: "Demo mode account A",
            messageCount: 0,
          };
          setAddedFriendsFromRitual((prev) => upsertRitualFriend(prev, friend));
          setUnfriendedIds((prev) => prev.filter((id) => id !== friend.id));
          return friend;
        }
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        setDemoPendingAddableQueue((q) => q.slice(1));
        const friend = FRIENDS.find((f) => f.id === nextId) ?? null;
        if (!friend) return null;
        setAddedFriendsFromRitual((prev) => upsertRitualFriend(prev, friend));
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
      return hydrateFriendByUid(session, friendUid, { pairingPin: pin, previewOnly: true });
    },
    [getBackendSession, hydrateFriendByUid, collectPairingProximityEvidence, demoPendingAddableQueue]
  );

  const pairingAwaitIssuerFinalConfirmParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (DEMO_OFFLINE_MODE) {
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        return FRIENDS.find((f) => f.id === nextId) ?? null;
      }
      const session = getBackendSession();
      if (!session) return null;
      const deadline = Date.now() + ADD_FRIEND_PAIRING_SESSION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          const res = await callEmulatorFunction<{ status?: string; issuerUid?: string | null }>(
            "getNfcPinPairOfferStatus",
            {
              uid: session.uid,
              deviceId: session.deviceId,
              pin: pin.trim(),
            }
          );
          if (res.status === "joined" && res.issuerUid?.trim()) {
            const issuerUid = res.issuerUid.trim();
            try {
              const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
                uid: session.uid,
                deviceId: session.deviceId,
              });
              if (!(friendsRes.friendUids ?? []).includes(issuerUid)) {
                continue;
              }
              syncServerAcceptedFriendBackendUids(
                new Set([...acceptedFriendBackendUidsRef.current, issuerUid])
              );
              const hydrated = await hydrateFriendByUid(session, issuerUid, { pairingPin: pin });
              if (hydrated) return hydrated;
            } catch {
              /* keep polling while session is active; hydration may lag behind status update */
            }
          }
        } catch {
          /* transient */
        }
        await new Promise<void>((r) => setTimeout(r, 700));
      }
      return null;
    },
    [getBackendSession, hydrateFriendByUid, demoPendingAddableQueue]
  );

  const pairingFinalizePinOfferParent = useCallback(
    async (pin: string): Promise<Friend | null> => {
      if (DEMO_OFFLINE_MODE) {
        const session = getBackendSession();
        if (!session) return null;
        const nextId = demoPendingAddableQueue[0];
        if (!nextId) return null;
        setDemoPendingAddableQueue((q) => q.slice(1));
        const seed = FRIENDS.find((f) => f.id === nextId) ?? null;
        if (!seed) return null;
        const friend: Friend = { ...seed, online: false };
        setAddedFriendsFromRitual((prev) => upsertRitualFriend(prev, friend));
        setUnfriendedIds((prev) => prev.filter((id) => id !== friend.id));
        setFriendLinksState((prev) => addUndirectedEdge(prev, CURRENT_USER_ID, friend.id));
        return friend;
      }
      const session = getBackendSession();
      if (!session) return null;
      const res = await callEmulatorFunction<{ accepted?: boolean; friendUid?: string }>("finalizeNfcPinPairOffer", {
        uid: session.uid,
        deviceId: session.deviceId,
        pin: pin.trim(),
      });
      const friendUid = res.friendUid?.trim() ?? "";
      if (!res.accepted || !friendUid) return null;
      const friendsRes = await callEmulatorFunction<{ friendUids?: string[] }>("listMyFriends", {
        uid: session.uid,
        deviceId: session.deviceId,
      });
      const onServer = (friendsRes.friendUids ?? []).includes(friendUid);
      if (!onServer) {
        throw new Error(
          "Friendship was not saved on the server. Delete collection nfcPinPairSessions in Firebase (stale pairing sessions), then pair again."
        );
      }
      syncServerAcceptedFriendBackendUids(
        new Set([...acceptedFriendBackendUidsRef.current, friendUid])
      );
      const hydrated = await hydrateFriendByUid(session, friendUid, { pairingPin: pin });
      void publishActivePresence(session, Date.now()).catch(() => undefined);
      return hydrated;
    },
    [getBackendSession, hydrateFriendByUid, demoPendingAddableQueue, syncServerAcceptedFriendBackendUids]
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

  /** Dual-confirm UI: session deleted when either side aborts — poll returns false. */
  const pairingPollOfferStillPresentParent = useCallback(
    async (pin: string): Promise<boolean> => {
      if (DEMO_OFFLINE_MODE) return true;
      const session = getBackendSession();
      if (!session) return false;
      try {
        await callEmulatorFunction("getNfcPinPairOfferStatus", {
          uid: session.uid,
          deviceId: session.deviceId,
          pin: pin.trim(),
        });
        return true;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
        if (msg.includes("not found") || msg.includes("not-found")) {
          return false;
        }
        return true;
      }
    },
    [getBackendSession]
  );

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
        onPress: () => {
          void (async () => {
            const session = getBackendSession();
            const friendRow = friendMap[friendId];
            const otherUid = friendRow?.backendUid?.trim();
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
                return;
              }
            }
            setUnfriendedIds((cur) => (cur.includes(friendId) ? cur : [...cur, friendId]));
            const chatIdsToLock = collectDirectChatIdsToLockForFriend(
              chatsRef.current ?? [],
              friendId
            );
            if (chatIdsToLock.length > 0) {
              setIdentityLockedChatIds((cur) => mergeIdentityLockedChatIds(cur, chatIdsToLock));
            }
            setAddedFriendsFromRitual((prev) =>
              prev.filter(
                (f) =>
                  f.id !== friendId &&
                  (!otherUid || f.backendUid?.trim() !== otherUid)
              )
            );
            setFriendLinksState((prev) => {
              let next = removeUndirectedEdge(prev, CURRENT_USER_ID, friendId);
              if (otherUid) {
                next = removeUndirectedEdge(next, CURRENT_USER_ID, backendUidForFriendId(otherUid));
              }
              return next;
            });
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
    if (!DEMO_OFFLINE_MODE) {
      try {
        const session = getBackendSession();
        if (!session) throw new Error("Account session is not ready. Please wait a moment and try again.");
        const recipientUids = [
          session.uid,
          ...visibleFriendIds
            .map((id) => allFriends.find((friend) => friend.id === id)?.backendUid)
            .filter((uid): uid is string => !!uid && uid.trim().length > 0),
        ];
        const keyMap = await resolveRecipientEncryptionKeys(recipientUids);
        const authUid = firebaseAuth.currentUser?.uid;
        if (!authUid) throw new Error("Firebase Auth is not ready. Please wait a moment and try again.");
        const remoteMedia = await resolvePostMediaUrisForEncrypt(
          newPost.imageUris,
          newPost.videoUri,
          newPost.videoPosterUri,
          authUid
        );
        const encrypted = await encryptPayloadForRecipients(
          session.uid,
          {
            postId: newPost.id,
            authorId: CURRENT_USER_ID,
            authorUid: session.uid,
            createdAt: newPost.createdAt,
            text: newPost.text ?? null,
            imageUris: remoteMedia.imageUris ?? null,
            videoUri: remoteMedia.videoUri ?? null,
            videoPosterUri: remoteMedia.videoPosterUri ?? null,
          },
          keyMap
        );
        const created = await callEmulatorFunction<{ ok?: boolean; postId?: string }>("createEncryptedPost", {
          uid: session.uid,
          deviceId: session.deviceId,
          ...encrypted,
        });
        if (created.postId && created.postId !== newPost.id) {
          setPosts((current) =>
            current.map((post) => (post.id === newPost.id ? { ...post, id: created.postId! } : post))
          );
        }
      } catch (err) {
        setPosts((current) => current.filter((post) => post.id !== newPost.id));
        const message = err instanceof Error ? err.message : "Could not publish post.";
        Alert.alert("Post not published", message);
      }
    }
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
    if (!DEMO_OFFLINE_MODE) {
      void (async () => {
        try {
          const session = getBackendSession();
          if (!session) throw new Error("Account session is not ready. Please wait a moment and try again.");
          const recipientUids = [
            session.uid,
            ...visibleFriendIds
              .map((id) => allFriends.find((friend) => friend.id === id)?.backendUid)
              .filter((uid): uid is string => !!uid && uid.trim().length > 0),
          ];
          const keyMap = await resolveRecipientEncryptionKeys(recipientUids);
          const authUid = firebaseAuth.currentUser?.uid;
          if (!authUid) throw new Error("Firebase Auth is not ready. Please wait a moment and try again.");
          const remoteMedia = await resolvePostMediaUrisForEncrypt(
            newPost.imageUris,
            newPost.videoUri,
            newPost.videoPosterUri,
            authUid
          );
          const encrypted = await encryptPayloadForRecipients(
            session.uid,
            {
              postId: newPost.id,
              authorId: CURRENT_USER_ID,
              authorUid: session.uid,
              createdAt: newPost.createdAt,
              text: newPost.text ?? null,
              imageUris: remoteMedia.imageUris ?? null,
              videoUri: remoteMedia.videoUri ?? null,
              videoPosterUri: remoteMedia.videoPosterUri ?? null,
            },
            keyMap
          );
          const created = await callEmulatorFunction<{ ok?: boolean; postId?: string }>("createEncryptedPost", {
            uid: session.uid,
            deviceId: session.deviceId,
            ...encrypted,
          });
          if (created.postId && created.postId !== newPost.id) {
            setPosts((current) =>
              current.map((p) => (p.id === newPost.id ? { ...p, id: created.postId! } : p))
            );
          }
        } catch (err) {
          setPosts((current) => current.filter((post) => post.id !== newPost.id));
          const message = err instanceof Error ? err.message : "Could not publish post.";
          Alert.alert("Post not published", message);
        }
      })();
    }
  };

  const confirmDeletePost = (post: Post) => {
    if (post.authorId !== CURRENT_USER_ID) return;
    Alert.alert(
      "Delete post?",
      "This removes the post for you and for friends who could see it.",
      [
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
          if (!DEMO_OFFLINE_MODE) {
            void (async () => {
              try {
                const session = getBackendSession();
                if (!session) throw new Error("Account session is not ready. Try again in a moment.");
                await callEmulatorFunction<{ ok?: boolean }>("deleteEncryptedPost", {
                  uid: session.uid,
                  deviceId: session.deviceId,
                  postId: post.id,
                });
              } catch (err) {
                const message = err instanceof Error ? err.message : "Could not delete post.";
                setPosts((list) =>
                  list.map((p) => (p.id === post.id ? { ...p, deletedAt: undefined } : p))
                );
                Alert.alert("Could not delete post", message);
              }
            })();
          }
        },
      },
    ]
    );
  };

  const handleChatInputChange = (text: string) => {
    if (view.screen === "chat" && "pendingDraft" in view && view.pendingDraft && text.trim().length > 0) {
      promotePendingChatToRow({
        pending: view.pendingDraft,
        session: getBackendSession(),
        friendMap,
        friendIdToBackendUid,
        setChats,
        setView,
      });
    }
    setChatInput(text);
  };

  const ensureChatForSend = (): Chat | null => {
    if (view.screen !== "chat") return null;
    if ("chatId" in view) {
      return chats.find((c) => c.id === view.chatId) ?? null;
    }
    return promotePendingChatToRow({
      pending: view.pendingDraft,
      session: getBackendSession(),
      friendMap,
      friendIdToBackendUid,
      setChats,
      setView,
    });
  };

  const addAutoReplies = (chat: Chat, latestMessages: Message[]) => {
    if (!DEMO_OFFLINE_MODE) return;
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

  const { commitOutgoingMessages } = useOutgoingMessages({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    getBackendSession,
    friendMap,
    friendIdToBackendUid,
    friendMapRef,
    friendIdToBackendUidRef,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
    resolveConversationId,
    pullEncryptedMessagesIncremental,
    setChats,
    setMessages,
    setHiddenChatIds,
    setView,
    addAutoReplies,
  });

  const sendPayload = (payload: {
    text: string;
    kind?: "text" | "photo" | "video" | "voice" | "gif";
    mediaUri?: string;
    mediaWidth?: number;
    mediaHeight?: number;
    durationSec?: number;
    videoTextOverlays?: VideoTextOverlayData[];
  }) => {
    const chat = ensureChatForSend();
    if (!chat) return;
    if (isDirectTombstoneChat) return;
    if (!DEMO_OFFLINE_MODE && !getBackendSession()) {
      Alert.alert(
        "Not connected",
        "Your account session is still starting. Wait a few seconds and try again."
      );
      return;
    }

    if (editingMessageId) {
      const trimmed = payload.text.trim();
      if (!trimmed) return;
      const editedAt = Date.now();
      const targetId = editingMessageId;
      setMessages((current) =>
        current.map((message) =>
          message.id === targetId
            ? {
                ...message,
                text: trimmed,
                editedAt,
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
      if (!DEMO_OFFLINE_MODE) {
        const session = getBackendSession();
        const target = messages.find((m) => m.id === targetId);
        const editedMessage = {
          ...(target ?? { id: targetId, chatId: chat.id, senderId: CURRENT_USER_ID, createdAt: editedAt }),
          text: trimmed,
          editedAt,
          kind: payload.kind ?? "text",
          mediaUri: payload.mediaUri,
          durationSec: payload.durationSec,
          videoTextOverlays: payload.videoTextOverlays,
          unsentAt: undefined,
        } as Message;
        if (session && target) {
          void updateOutgoingMessageContent({
            session,
            chat,
            message: editedMessage,
            friendIdToBackendUid,
            friendMapRef,
            friendIdToBackendUidRef,
            recipientKeyCacheRef,
            persistFriendKeyCacheNow,
            resolveConversationId,
          }).catch((err) => logAppError("messages.edit_body", err, { messageId: targetId }));
        }
      }
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
        if (!DEMO_OFFLINE_MODE) return;
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
      mediaTypes: ImagePicker.MediaTypeOptions.All,
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
    const kind = inferOutgoingMediaKind(asset.uri, asset.type);
    if (kind === "gif") {
      setPhotoEditorOpen(false);
      setPhotoEditorAsset(null);
      sendPayload({
        text: "",
        kind: "gif",
        mediaUri: asset.uri,
        mediaWidth: asset.width ?? undefined,
        mediaHeight: asset.height ?? undefined,
      });
      return;
    }
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
        // Local `file://` URIs are unreachable for other devices AND get
        // evicted from the cache directory between launches, so we MUST upload
        // to Firebase Storage and persist the resulting HTTPS download URL.
        // Set a temporary preview from the local URI so the user sees the
        // change instantly; replace it with the HTTPS URL once the upload
        // settles. Only the HTTPS URL is ever written to encrypted profile
        // sync (the debounced `putEncryptedProfile` effect picks it up).
        setMyProfilePictureUrl(result.uri);
        void (async () => {
          try {
            const authUid = firebaseAuth.currentUser?.uid;
            if (!authUid || !mediaUriNeedsFirebaseUpload(result.uri)) return;
            const httpsUrl = await uploadSharedMediaFromDevice(result.uri, authUid);
            setMyProfilePictureUrl(httpsUrl);
            const session = getBackendSession();
            const email = sessionEmailRef.current?.trim();
            if (email) {
              void AsyncStorage.setItem(profilePictureStorageKey(email), httpsUrl).catch(() => {});
            }
            if (session && email) {
              const persistedUsername =
                (await AsyncStorage.getItem(profileUsernameStorageKey(email)))?.trim() ?? "";
              let serverUsername = "";
              try {
                const profilesRes = await callEmulatorFunction<{
                  profiles?: Record<string, { username?: string } | null>;
                }>("getUserProfiles", {
                  uid: session.uid,
                  deviceId: session.deviceId,
                  targetUids: [session.uid],
                });
                serverUsername = String(profilesRes.profiles?.[session.uid]?.username ?? "").trim();
              } catch {
                /* keep existing server username */
              }
              const usernameForUpsert = usernameForProfileUpsert({
                email,
                persistedUsername,
                serverUsername,
              });
              await callEmulatorFunction("upsertUserProfile", {
                uid: session.uid,
                deviceId: session.deviceId,
                ...(usernameForUpsert ? { username: usernameForUpsert } : {}),
                bio: myBio,
                profilePictureUrl: httpsUrl,
              });
            }
          } catch (err) {
            Alert.alert(
              "Couldn't save profile picture",
              err instanceof Error && err.message ? err.message : "Please try again."
            );
            setMyProfilePictureUrl(null);
          }
        })();
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

  const cancelVoiceRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        /* ignore */
      }
      recordingRef.current = null;
    }
    voiceRecordStartedAtRef.current = null;
    setVoiceRecordStartedAt(null);
    setVoiceRecordElapsedSec(0);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const exitVoiceNoteMode = useCallback(async () => {
    await cancelVoiceRecording();
    setVoiceNoteMode(false);
  }, [cancelVoiceRecording]);

  const toggleVoiceNoteMode = useCallback(() => {
    if (voiceNoteMode) {
      void exitVoiceNoteMode();
      return;
    }
    setVoiceNoteMode(true);
  }, [exitVoiceNoteMode, voiceNoteMode]);

  const startVoiceRecording = useCallback(async () => {
    if (recordingRef.current) return;
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone", "Allow microphone access to record voice notes.");
      return;
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      if (previewSoundRef.current) {
        await previewSoundRef.current.unloadAsync();
        previewSoundRef.current = null;
      }
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      const startedAt = Date.now();
      voiceRecordStartedAtRef.current = startedAt;
      setVoiceRecordStartedAt(startedAt);
      setVoiceRecordElapsedSec(0);
    } catch (err) {
      logAppError("voice.record_start", err, {});
      Alert.alert("Recording failed", "Could not start the voice note. Try again.");
      recordingRef.current = null;
      voiceRecordStartedAtRef.current = null;
      setVoiceRecordStartedAt(null);
    }
  }, []);

  const stopVoiceRecordingAndSend = useCallback(async () => {
    const recording = recordingRef.current;
    const startedAt = voiceRecordStartedAtRef.current;
    if (!recording || startedAt == null) return;

    let durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    let uri: string | null = null;
    try {
      const status = await recording.getStatusAsync();
      if (status.isRecording && typeof status.durationMillis === "number") {
        durationSec = Math.max(1, Math.round(status.durationMillis / 1000));
      }
      uri = recording.getURI();
      await recording.stopAndUnloadAsync();
    } catch (err) {
      logAppError("voice.record_stop", err, {});
      Alert.alert("Recording failed", "Could not finish the voice note. Try again.");
    } finally {
      recordingRef.current = null;
      voiceRecordStartedAtRef.current = null;
      setVoiceRecordStartedAt(null);
      setVoiceRecordElapsedSec(0);
      setVoiceNoteMode(false);
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch {
        /* ignore */
      }
    }

    if (!uri) return;
    sendPayload({
      text: `Voice note (${durationSec}s)`,
      kind: "voice",
      durationSec,
      mediaUri: uri,
    });
  }, [sendPayload]);

  const onComposerPrimaryPress = useCallback(() => {
    if (voiceNoteMode) {
      if (voiceRecordStartedAt) {
        void stopVoiceRecordingAndSend();
      } else {
        void startVoiceRecording();
      }
      return;
    }
    sendMessage();
  }, [
    voiceNoteMode,
    voiceRecordStartedAt,
    stopVoiceRecordingAndSend,
    startVoiceRecording,
    sendMessage,
  ]);

  useEffect(() => {
    if (!voiceRecordStartedAt) return;
    const tick = () => {
      setVoiceRecordElapsedSec(
        Math.max(0, Math.round((Date.now() - voiceRecordStartedAt) / 1000))
      );
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [voiceRecordStartedAt]);

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
    setVoiceNoteMode(false);
    setVoiceRecordStartedAt(null);
    setVoiceRecordElapsedSec(0);
    voiceRecordStartedAtRef.current = null;
    setPlayingVoiceMessageId(null);
    setPlayingVideoMessageId(null);
    setFinishedVideoMessageIds(new Set());
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

    const session = getBackendSession();
    const idsToHide = new Set<string>([chatId]);
    if (session) {
      const canonicalId = resolveCanonicalDirectChatLocalId(
        chat,
        session.uid,
        friendMap,
        friendIdToBackendUid
      );
      // Tombstone canonical local row only when deleting the canonical thread — not a `__live` row.
      if (canonicalId && isCanonicalDirectChatId(chat.id)) {
        idsToHide.add(canonicalId);
      }
      if (!DEMO_OFFLINE_MODE) {
        const conversationIdsToHide = serverConversationIdsToHide(
          chat,
          session.uid,
          friendMap,
          friendIdToBackendUid
        );
        rememberHiddenConversationIds(conversationIdsToHide);
        for (const conversationId of conversationIdsToHide) {
          void callEmulatorFunction("hideConversationForUser", {
            uid: session.uid,
            deviceId: session.deviceId,
            conversationId,
          }).catch((err) => logAppError("chat.hide.server", err, { conversationId }));
          void callEmulatorFunction("manageConversationMembership", {
            uid: session.uid,
            deviceId: session.deviceId,
            conversationId,
            action: "leave",
          }).catch(() => undefined);
        }
      }
    }
    setHiddenChatIds((current) => [...new Set([...current, ...idsToHide])]);
    if (chat.kind === "broadcast") {
      setChats((c) => c.filter((x) => x.id !== chatId));
      setMessages((m) => m.filter((msg) => msg.chatId !== chatId));
      persistSocialMessagingNow();
      return;
    }

    const newMemberIds = chat.memberIds.filter((id) => id !== CURRENT_USER_ID);
    if (newMemberIds.length < 2) {
      setChats((c) => c.filter((x) => !idsToHide.has(x.id)));
      setMessages((m) => m.filter((msg) => !idsToHide.has(msg.chatId)));
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
    persistSocialMessagingNow();
  };

  const leaveChat = () => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    const session = getBackendSession();
    if (session && !DEMO_OFFLINE_MODE) {
      const chat = chats.find((c) => c.id === chatId);
      const conversationIds = chat
        ? serverConversationIdsToHide(chat, session.uid, friendMap, friendIdToBackendUid)
        : [resolveConversationId(chatId)];
      rememberHiddenConversationIds(conversationIds);
      for (const conversationId of conversationIds) {
        void callEmulatorFunction("hideConversationForUser", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId,
        }).catch(() => undefined);
        void callEmulatorFunction("manageConversationMembership", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId,
          action: "leave",
        }).catch(() => undefined);
      }
    }
    removeChatForCurrentUser(chatId);
    leaveChatToHome();
  };

  const kickMemberFromChat = (friendId: string) => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;
    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    const targetBackendUid = resolveChatMemberToBackendUid(
      friendId,
      session.uid,
      friendMap,
      friendIdToBackendUid
    );
    if (!targetBackendUid?.startsWith("u_")) {
      Alert.alert("Could not remove member", "This member is not linked to a server account.");
      return;
    }
    void (async () => {
      try {
        await callEmulatorFunction("manageConversationMembership", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId: resolveConversationId(chatId),
          action: "kick",
          targetUid: targetBackendUid,
        });
        const nextMemberIds = chat.memberIds.filter((id) => id !== friendId);
        setChats((c) =>
          c.map((x) =>
            x.id === chatId
              ? {
                  ...x,
                  memberIds: nextMemberIds,
                  memberJoinedAt: x.memberJoinedAt
                    ? Object.fromEntries(
                        Object.entries(x.memberJoinedAt).filter(([k]) => k !== friendId)
                      )
                    : undefined,
                  updatedAt: Date.now(),
                }
              : x
          )
        );
      } catch (err) {
        Alert.alert("Could not remove member", err instanceof Error ? err.message : "Try again.");
      }
    })();
  };

  const toggleChatMute = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;
    const nextMuted = !chat.mutedForNotifications;
    setChats((current) =>
      current.map((c) => (c.id === chatId ? { ...c, mutedForNotifications: nextMuted } : c))
    );
    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    void callEmulatorFunction("setConversationNotificationMute", {
      uid: session.uid,
      deviceId: session.deviceId,
      conversationId: resolveConversationId(chatId),
      muted: nextMuted,
    }).catch((err) => {
      logAppError("chat.mute.sync", err, { chatId, muted: nextMuted });
      setChats((current) =>
        current.map((c) =>
          c.id === chatId ? { ...c, mutedForNotifications: !nextMuted } : c
        )
      );
    });
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
    const listTitle = resolvedStoredChatListTitle(chat);
    Alert.alert(listTitle, undefined, [
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

    const session = getBackendSession();
    if (!session || DEMO_OFFLINE_MODE) return;
    const targetBackendUid = resolveChatMemberToBackendUid(
      friendId,
      session.uid,
      friendMap,
      friendIdToBackendUid
    );
    if (!targetBackendUid?.startsWith("u_")) {
      Alert.alert("Could not add member", "This friend is not linked to a server account yet.");
      return;
    }

    void (async () => {
      try {
        const res = await callEmulatorFunction<{
          participantUids?: string[];
          memberJoinedAt?: Record<string, number>;
        }>("manageConversationMembership", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId: resolveConversationId(chatId),
          action: "addMember",
          targetUid: targetBackendUid,
        });
        const now = Date.now();
        const joinedAt = res.memberJoinedAt?.[targetBackendUid] ?? now;
        const nextMemberIds = [...chat.memberIds, friendId];
        const counterpartIds = nextMemberIds.filter((id) => id !== CURRENT_USER_ID);
        const newName = chat.isCustomName ? chat.name : buildDefaultChatName(counterpartIds);
        setChats((c) =>
          c.map((x) =>
            x.id === chatId
              ? {
                  ...x,
                  memberIds: nextMemberIds,
                  memberJoinedAt: { ...x.memberJoinedAt, [friendId]: joinedAt },
                  name: newName,
                  updatedAt: now,
                }
              : x
          )
        );
        setAddMemberModalOpen(false);
        setAddMemberSearch("");
      } catch (err) {
        Alert.alert("Could not add member", err instanceof Error ? err.message : "Try again.");
      }
    })();
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
    const hasUnsent = chatInput.trim().length > 0 || !!voiceRecordStartedAt;

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

  const applyReactionToMessage = useCallback(
    (messageId: string, emoji: string) => {
      const target = messages.find((m) => m.id === messageId);
      const session = getBackendSession();
      if (!session) return;
      const chat = target ? chats.find((c) => c.id === target.chatId) : undefined;
      const prevEmoji = target
        ? getMyReactionEmoji(target.reactions, session.uid, backendUidToFriendId)
        : undefined;
      const nextEmoji = prevEmoji === emoji ? undefined : emoji;
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== messageId) return message;
          const reactions = { ...(message.reactions ?? {}) };
          delete reactions[session.uid];
          delete reactions[CURRENT_USER_ID];
          if (nextEmoji) reactions[CURRENT_USER_ID] = nextEmoji;
          return { ...message, reactions };
        })
      );
      setReactionPickerOpen(false);
      setMessageActionsOpen(false);
      if (!target || !chat || DEMO_OFFLINE_MODE) return;
      void callEmulatorFunction("updateMessageMetadata", {
        uid: session.uid,
        deviceId: session.deviceId,
        conversationId: resolveConversationId(chat),
        messageId: target.id,
        reactions: { [session.uid]: nextEmoji ?? "" },
      }).catch((err) =>
        logAppError("messages.reaction_metadata", err, {
          messageId: target.id,
          chatId: chat.id,
        })
      );
    },
    [
      DEMO_OFFLINE_MODE,
      backendUidToFriendId,
      chats,
      getBackendSession,
      messages,
      resolveConversationId,
    ]
  );

  const applyReaction = (emoji: string) => {
    if (postReactionTargetId) {
      const post = posts.find((p) => p.id === postReactionTargetId);
      if (post) void togglePostReaction(post, emoji);
      setPostReactionTargetId(null);
      setReactionPickerOpen(false);
      return;
    }
    if (commentReactionTarget) {
      const { postId, commentId, threadEntryId } = commentReactionTarget;
      if (threadEntryId) {
        toggleThreadReaction(postId, commentId, threadEntryId, emoji);
      } else {
        toggleCommentReaction(postId, commentId, emoji);
      }
      setCommentReactionTarget(null);
      setReactionPickerOpen(false);
      return;
    }
    if (!messageActionTargetId) return;
    applyReactionToMessage(messageActionTargetId, emoji);
    setReactionPickerOpen(false);
  };

  const openReactionPickerForMessage = useCallback((messageId: string) => {
    setPostReactionTargetId(null);
    setCommentReactionTarget(null);
    setMessageActionTargetId(messageId);
    setMessageActionsOpen(false);
    setReactionPickerOpen(true);
  }, []);

  const openReactionPickerForPost = useCallback((postId: string) => {
    setMessageActionTargetId(null);
    setCommentReactionTarget(null);
    setPostReactionTargetId(postId);
    setReactionPickerOpen(true);
  }, []);

  const openReactionPickerForComment = useCallback(
    (postId: string, commentId: string, threadEntryId?: string) => {
      setMessageActionTargetId(null);
      setPostReactionTargetId(null);
      setCommentReactionTarget({ postId, commentId, threadEntryId });
      setReactionPickerOpen(true);
    },
    []
  );

  const unsendTargetMessage = () => {
    if (!messageActionTarget) return;
    const unsentAt = Date.now();
    const target = messageActionTarget;
    setMessages((current) =>
      current.map((message) =>
        message.id === target.id
          ? {
              ...message,
              text: "",
              kind: "text",
              mediaUri: undefined,
              durationSec: undefined,
              videoTextOverlays: undefined,
              unsentAt,
              editedAt: undefined,
            }
          : message
      )
    );
    setMessageActionsOpen(false);
    if (!DEMO_OFFLINE_MODE) {
      const session = getBackendSession();
      const chat = chats.find((c) => c.id === target.chatId);
      if (session && chat) {
        void callEmulatorFunction("updateMessageMetadata", {
          uid: session.uid,
          deviceId: session.deviceId,
          conversationId: resolveConversationId(chat),
          messageId: target.id,
          unsentAt,
        }).catch((err) => logAppError("messages.unsend_metadata", err, { messageId: target.id }));
      }
    }
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
    const session = getBackendSession();
    return aggregateReactionCounts(
      message.reactions,
      session?.uid ?? null,
      backendUidToFriendId,
      visibleFriendIds
    );
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

  const postAuthorMeta = useCallback(
    (authorId: string) => {
      if (authorId === CURRENT_USER_ID) {
        return { name: "You", avatarUri: myProfilePictureUrl ?? undefined };
      }
      const pd = resolvePd(authorId);
      return { name: pd.displayName, avatarUri: pd.profilePictureUrl || undefined };
    },
    [myProfilePictureUrl, friendMap, unfriendedIds, serverFriendUidsForDisplay]
  );

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
            : friendDisplayNameFromProfile(
                friendMap[userId]?.displayName,
                friendMap[userId]?.backendUid ?? userId
              ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reactionDetailPost, visibleFriendIds, friendMap]);

  const togglePostReaction = useCallback(
    (post: Post, emoji: string) => {
      const session = getBackendSession();
      if (!session || DEMO_OFFLINE_MODE) return;
      const prev = post.feedReactions ?? {};
      const mine = prev[CURRENT_USER_ID] ?? prev[session.uid];
      const nextEmoji = mine === emoji ? "" : emoji;
      const next = { ...prev };
      delete next[CURRENT_USER_ID];
      delete next[session.uid];
      if (nextEmoji) next[CURRENT_USER_ID] = nextEmoji;
      setPosts((current) =>
        current.map((p) => (p.id === post.id ? { ...p, feedReactions: next } : p))
      );
      void callEmulatorFunction("setEncryptedPostReaction", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId: post.id,
        emoji: nextEmoji,
      }).catch(() => {
        setPosts((current) =>
          current.map((p) => (p.id === post.id ? { ...p, feedReactions: prev } : p))
        );
      });
    },
    [DEMO_OFFLINE_MODE, getBackendSession]
  );

  const reactTheme = useMemo(
    () => ({
      accent: theme.accent,
      divider: theme.divider,
      text: theme.text,
      subtleText: theme.subtleText,
      background: theme.background,
    }),
    [theme]
  );

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
          const mapCommentReactions = (reactions?: Record<string, string>) =>
            mapServerReactionsToLocal(reactions, session.uid, backendUidToFriendId) ?? {};
          const first = items[0];
          const commentAuthorLocalId = toLocalId(friendUid);
          const firstAuthorLocal = toLocalId(first.authorUid);
          const comment: PostComment = {
            id: first.messageId,
            authorId: commentAuthorLocalId,
            text: first.text,
            createdAt: first.createdAtMs ?? Date.now(),
            reactions: mapCommentReactions(first.reactions),
            thread: items.slice(1).map((entry) => ({
              id: entry.messageId,
              authorId: toLocalId(entry.authorUid),
              text: entry.text,
              createdAt: entry.createdAtMs ?? Date.now(),
              reactions: mapCommentReactions(entry.reactions),
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
                reactions: mapCommentReactions(first.reactions),
              },
              ...(comment.thread ?? []),
            ],
          } as PostComment;
        })
      );
      const comments = chainResults.filter((x): x is PostComment => !!x);
      const commentSignature = (items: PostComment[]) =>
        items
          .map((comment) =>
            [
              comment.id,
              comment.authorId,
              comment.text,
              comment.createdAt,
              JSON.stringify(comment.reactions ?? {}),
              (comment.thread ?? [])
                .map((entry) =>
                  [entry.id, entry.authorId, entry.text, entry.createdAt, JSON.stringify(entry.reactions ?? {})].join("|")
                )
                .join("||"),
            ].join("::")
          )
          .join("##");
      setPosts((current) =>
        current.map((candidate) => {
          if (candidate.id !== post.id) return candidate;
          const merged = mergeHydratedPostComments(candidate.comments, comments);
          const prevSig = commentSignature(candidate.comments ?? []);
          const nextSig = commentSignature(merged);
          if (prevSig === nextSig) return candidate;
          return { ...candidate, comments: merged };
        })
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
    const optimisticId = `opt_comment_${Date.now()}`;
    setPosts((current) =>
      current.map((candidate) => {
        if (candidate.id !== postId) return candidate;
        const optimistic: PostComment = {
          id: optimisticId,
          authorId: CURRENT_USER_ID,
          text,
          createdAt: Date.now(),
          reactions: {},
          thread: [],
        };
        return { ...candidate, comments: [...(candidate.comments ?? []), optimistic] };
      })
    );
    void callEmulatorFunction("createPrivatePostThreadMessage", {
      uid: session.uid,
      deviceId: session.deviceId,
      postId,
      postOwnerUid,
      friendUid: session.uid,
      text,
    })
      .then(() => hydratePrivateThreadForPost(post))
      .catch(() => {
        setPosts((current) =>
          current.map((candidate) => {
            if (candidate.id !== postId) return candidate;
            return {
              ...candidate,
              comments: (candidate.comments ?? []).filter((c) => c.id !== optimisticId),
            };
          })
        );
      });
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
    const optimisticId = `opt_thread_${Date.now()}`;
    setPosts((current) =>
      current.map((candidate) => {
        if (candidate.id !== postId) return candidate;
        return {
          ...candidate,
          comments: (candidate.comments ?? []).map((c) => {
            if (c.id !== commentId) return c;
            const entry = {
              id: optimisticId,
              authorId: CURRENT_USER_ID,
              text,
              createdAt: Date.now(),
              reactions: {} as Record<string, string>,
            };
            return { ...c, thread: [...(c.thread ?? []), entry] };
          }),
        };
      })
    );
    void callEmulatorFunction("createPrivatePostThreadMessage", {
      uid: session.uid,
      deviceId: session.deviceId,
      postId,
      postOwnerUid,
      friendUid,
      text,
    })
      .then(() => hydratePrivateThreadForPost(post))
      .catch(() => {
        setPosts((current) =>
          current.map((candidate) => {
            if (candidate.id !== postId) return candidate;
            return {
              ...candidate,
              comments: (candidate.comments ?? []).map((c) => {
                if (c.id !== commentId) return c;
                return {
                  ...c,
                  thread: (c.thread ?? []).filter((entry) => entry.id !== optimisticId),
                };
              }),
            };
          })
        );
      });
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

  const patchPostCommentReactions = useCallback(
    (
      postId: string,
      messageId: string,
      emoji: string,
      options?: { threadParentId?: string }
    ): Post[] | null => {
      const session = getBackendSession();
      if (!session) return null;
      const post = posts.find((p) => p.id === postId);
      if (!post) return null;

      const patchEntry = <T extends { reactions?: Record<string, string> }>(entry: T): T => {
        const prev = entry.reactions ?? {};
        const mine = prev[CURRENT_USER_ID] ?? prev[session.uid];
        const nextEmoji = mine === emoji ? "" : emoji;
        const next = { ...prev };
        delete next[CURRENT_USER_ID];
        delete next[session.uid];
        if (nextEmoji) next[CURRENT_USER_ID] = nextEmoji;
        return { ...entry, reactions: next };
      };

      return posts.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: (p.comments ?? []).map((comment) => {
            if (options?.threadParentId) {
              if (comment.id !== options.threadParentId) return comment;
              return {
                ...comment,
                thread: (comment.thread ?? []).map((entry) =>
                  entry.id === messageId ? patchEntry(entry) : entry
                ),
              };
            }
            if (comment.id !== messageId) return comment;
            return patchEntry(comment);
          }),
        };
      });
    },
    [getBackendSession, posts]
  );

  const toggleCommentReaction = useCallback(
    (postId: string, commentId: string, emoji: string) => {
      const post = posts.find((p) => p.id === postId);
      const session = getBackendSession();
      if (!post || !session || DEMO_OFFLINE_MODE) return;
      const comment = (post.comments ?? []).find((c) => c.id === commentId);
      if (!comment) return;
      const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
      if (!postOwnerUid) return;
      const friendUid =
        post.authorId === CURRENT_USER_ID
          ? friendMap[comment.authorId]?.backendUid ?? null
          : session.uid;
      if (!friendUid || comment.id.startsWith("srv_")) return;
      const prevComments = post.comments ?? [];
      const nextPosts = patchPostCommentReactions(postId, commentId, emoji);
      if (nextPosts) setPosts(nextPosts);
      void callEmulatorFunction("togglePrivatePostThreadMessageReaction", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId,
        postOwnerUid,
        friendUid,
        messageId: comment.id,
        emoji,
      })
        .then(() => hydratePrivateThreadForPost(post))
        .catch(() => {
          setPosts((current) =>
            current.map((p) => (p.id === postId ? { ...p, comments: prevComments } : p))
          );
        });
    },
    [
      DEMO_OFFLINE_MODE,
      friendMap,
      getBackendSession,
      hydratePrivateThreadForPost,
      patchPostCommentReactions,
      posts,
      resolvePostOwnerBackendUid,
    ]
  );

  const toggleThreadReaction = useCallback(
    (postId: string, commentId: string, threadId: string, emoji: string) => {
      const post = posts.find((p) => p.id === postId);
      const session = getBackendSession();
      if (!post || !session || DEMO_OFFLINE_MODE) return;
      const comment = (post.comments ?? []).find((c) => c.id === commentId);
      if (!comment) return;
      const postOwnerUid = resolvePostOwnerBackendUid(post, session.uid);
      if (!postOwnerUid) return;
      const friendUid =
        post.authorId === CURRENT_USER_ID
          ? friendMap[comment.authorId]?.backendUid ?? null
          : session.uid;
      if (!friendUid) return;
      const prevComments = post.comments ?? [];
      const nextPosts = patchPostCommentReactions(postId, threadId, emoji, {
        threadParentId: commentId,
      });
      if (nextPosts) setPosts(nextPosts);
      void callEmulatorFunction("togglePrivatePostThreadMessageReaction", {
        uid: session.uid,
        deviceId: session.deviceId,
        postId,
        postOwnerUid,
        friendUid,
        messageId: threadId,
        emoji,
      })
        .then(() => hydratePrivateThreadForPost(post))
        .catch(() => {
          setPosts((current) =>
            current.map((p) => (p.id === postId ? { ...p, comments: prevComments } : p))
          );
        });
    },
    [
      DEMO_OFFLINE_MODE,
      friendMap,
      getBackendSession,
      hydratePrivateThreadForPost,
      patchPostCommentReactions,
      posts,
      resolvePostOwnerBackendUid,
    ]
  );

  useEffect(() => {
    if (!fullScreenPost) return;
    void hydratePrivateThreadForPost(fullScreenPost);
  }, [fullScreenPost, hydratePrivateThreadForPost]);

  /**
   * Push-based private-post-thread delivery while a post is open in
   * fullscreen. Replaces the manual `.then(() => hydratePrivateThreadForPost)`
   * dance for *remote* changes (the local-action callbacks still call it to
   * confirm the optimistic write).
   *
   * Subscribes to each thread doc's `messages` subcollection (one
   * subscription per friend pair when the viewer is the post owner; a
   * single subscription when the viewer is the friend). On any change we
   * re-run the existing aggregator so the rendered comment tree always
   * reflects server truth without a callable poll.
   */
  useEffect(() => {
    if (DEMO_OFFLINE_MODE) return;
    if (!fullScreenPost) return;
    const session = getBackendSession();
    if (!session) return;
    const firebaseAuthUid = firebaseAuth.currentUser?.uid;
    if (!firebaseAuthUid) return;
    const postOwnerUid = resolvePostOwnerBackendUid(fullScreenPost, session.uid);
    if (!postOwnerUid) return;
    const pairFriendUids =
      fullScreenPost.authorId === CURRENT_USER_ID
        ? allFriends.map((f) => f.backendUid).filter((x): x is string => !!x && x !== session.uid)
        : [session.uid];
    if (pairFriendUids.length === 0) return;
    const buildThreadId = (friendUid: string) => {
      const pair =
        postOwnerUid < friendUid ? `${postOwnerUid}_${friendUid}` : `${friendUid}_${postOwnerUid}`;
      return `${fullScreenPost.id}__${pair}`;
    };
    const db = getFirestoreDb();
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRehydrate = () => {
      if (cancelled) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      // Debounce: a burst of writes (e.g. message + thread doc updatedAt
      // in the same callable) shouldn't trigger N hydrations.
      debounceTimer = setTimeout(() => {
        if (cancelled) return;
        void hydratePrivateThreadForPost(fullScreenPost);
      }, 80);
    };
    const unsubscribers = pairFriendUids.map((friendUid) => {
      const threadId = buildThreadId(friendUid);
      const q = firestoreQuery(
        collection(db, "privatePostThreads", threadId, "messages"),
        where("participantAuthUids", "array-contains", firebaseAuthUid)
      );
      return onSnapshot(
        q,
        (snap) => {
          if (cancelled) return;
          if (snap.docChanges().length > 0) scheduleRehydrate();
        },
        () => {
          /* Listener torn down. The initial hydration above and the
           * post-action `.then(() => hydratePrivateThreadForPost(post))`
           * fallbacks remain the durable path. */
        }
      );
    });
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const unsub of unsubscribers) unsub();
    };
  }, [
    fullScreenPost,
    allFriends,
    getBackendSession,
    hydratePrivateThreadForPost,
    resolvePostOwnerBackendUid,
  ]);

  const postsToHydrateComments = useMemo(() => {
    if (view.screen === "myProfile") {
      return myProfilePosts.slice(0, 25);
    }
    if (view.screen === "friendProfile") {
      return friendProfilePosts.slice(0, 25);
    }
    if (view.screen === "home" && homeTab === "feed") {
      const ownPosts = feedPosts.filter((p) => p.authorId === CURRENT_USER_ID);
      const friendPosts = feedPosts.filter((p) => p.authorId !== CURRENT_USER_ID).slice(0, 12);
      return [...new Map([...ownPosts, ...friendPosts].map((p) => [p.id, p])).values()].slice(0, 25);
    }
    return [];
  }, [view.screen, homeTab, feedPosts, myProfilePosts, friendProfilePosts]);

  /**
   * Post comments live in `privatePostThreads` and are not part of the encrypted
   * post payload. Poll open post surfaces so owners see new friend comments on
   * the feed without opening fullscreen first.
   */
  useEffect(() => {
    if (DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session || !signedIn) return;
    if (appLifecycleState !== "active") return;
    if (postsToHydrateComments.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await Promise.all(postsToHydrateComments.map((post) => hydratePrivateThreadForPost(post)));
    };
    void tick();
    const intervalId = setInterval(() => void tick(), 6000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    DEMO_OFFLINE_MODE,
    signedIn,
    appLifecycleState,
    postsToHydrateComments,
    getBackendSession,
    hydratePrivateThreadForPost,
  ]);

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

  const commentReactionEntries = useCallback(
    (reactions: Record<string, string> | undefined) => {
      const session = getBackendSession();
      return aggregateReactionCounts(
        reactions,
        session?.uid ?? null,
        backendUidToFriendId,
        visibleFriendIds
      );
    },
    [backendUidToFriendId, getBackendSession, visibleFriendIds]
  );

  const feedPostCardShared = useMemo(
    () => ({
      windowWidth,
      subtleTextColor: theme.subtleText,
      styles,
      reactTheme,
      currentUserId: CURRENT_USER_ID,
      visibleFriendIds,
      demoOfflineMode: DEMO_OFFLINE_MODE,
      resolveAuthorMeta: postAuthorMeta,
      resolveCanOpenProfile: (friendId: string) => resolvePd(friendId).canOpenProfile,
      formatTime: formatDayTime,
      renderAvatar,
      getBackendSession,
      commentReactionEntries,
      canReactToComment: (messageId: string) => !messageId.startsWith("srv_"),
      onOpenFriendProfile: (friendId: string) => openFriendProfile(friendId, "home"),
      onOpenMyProfile: openMyProfile,
      onOpenPostActions: openFeedPostActions,
      onConfirmDeletePost: confirmDeletePost,
      onOpenReactionPickerForPost: openReactionPickerForPost,
      onOpenReactionPickerForComment: openReactionPickerForComment,
      onOpenReactionDetail: setReactionDetailPost,
    }),
    [
      windowWidth,
      theme.subtleText,
      styles,
      reactTheme,
      visibleFriendIds,
      postAuthorMeta,
      getBackendSession,
      commentReactionEntries,
      openReactionPickerForPost,
      openReactionPickerForComment,
    ]
  );

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

  // Splash stays up while: Firebase auth resolves, the minimum splash duration elapses,
  // and (when signed in) the boot server pull completes — so the home never paints
  // with an empty friends list while messages are already creating chat rows for the
  // same people. See the boot-sync effect for the friends + initial messages fetch.
  /**
   * Splash only waits on **local** signals: Firebase Auth state resolution
   * and a 500 ms minimum so we don't flash empty UI between cache hydration
   * and the first paint. No server pull blocks the splash — friends, chats,
   * messages, and posts arrive via cache hydration + background snapshot
   * listeners + the once-per-session boot-time callable pull, all of which
   * stream into a rendered home rather than gating it.
   */
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
      <View
        style={[
          styles.screen,
          {
            backgroundColor: theme.background,
            paddingTop: safeTop + 10,
            paddingBottom: stickyFooterPadding(insets.bottom),
          },
        ]}
      >
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
                <Pressable style={styles.primaryButton} onPress={loginDemoOrSubmit}>
                  <Text style={styles.primaryButtonText}>Login</Text>
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
              <View style={[styles.authCard, { width: "100%", maxWidth: 420 }]}>
                <Text style={styles.authHeading}>Verification code</Text>
                <Text style={styles.subtleText}>
                  Enter the 6-digit code for {loginEmail.trim()}. Tap “Request OTP code” below; on Android your
                  phone will ask for SMS access so only messages that match your sign-in can fill the code
                  automatically.
                </Text>
                <TextInput
                  value={loginOtp}
                  onChangeText={(t) => setLoginOtp(t.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholderTextColor={theme.subtleText}
                  style={styles.searchInput}
                />
                <View style={{ height: 14 }} />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={completeLoginWithOtp}>
                    <Text style={styles.primaryButtonText}>Validate OTP</Text>
                  </Pressable>
                  <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={() => void requestLoginOtpCode()}>
                    <Text style={styles.primaryButtonText}>Request OTP code</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        ) : authMode === "signup" ? (
          <ScrollViewUntilScroll
            contentContainerStyle={[
              styles.authCard,
              { paddingBottom: scrollPageBottomPadding(insets.bottom, 20) },
            ]}
          >
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
                  onChangeText={(t) => setSignupOtp(t.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  keyboardType="number-pad"
                  maxLength={6}
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
          animationType="fade"
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
                contentContainerStyle={[
                  styles.friendProfileScroll,
                  { paddingBottom: scrollPageBottomPadding(insets.bottom, 96) },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <FeedPostCard
                  {...feedPostCardShared}
                  post={fullScreenPost}
                  inFullscreenModal
                  hideComposers
                  onToggleReaction={(emoji) => togglePostReaction(fullScreenPost, emoji)}
                  onOpenThreadReply={
                    fullScreenPost.authorId === CURRENT_USER_ID
                      ? (cid) => {
                          setPostFullscreenThreadReplyKey(`${fullScreenPost.id}:${cid}`);
                          requestAnimationFrame(() => postCommentInputRef.current?.focus());
                        }
                      : undefined
                  }
                />
              </ScrollViewUntilScroll>
              {(() => {
                const pc = fullScreenPost;
                const isViewerOwner = pc.authorId === CURRENT_USER_ID;
                const threadDraftKey = postFullscreenThreadReplyKey;
                const composerActive = isViewerOwner ? !!threadDraftKey : true;
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
                          paddingBottom: composerBottomPadding(insets.bottom, keyboardVisible),
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
                              : "Add comment ..."
                            : "Tap Reply on a comment above"
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
                onPress={openSettingsScreen}
                style={[
                  styles.iconButton,
                  homeNavIconHighlight.settings ? styles.homeModeIconActive : null,
                ]}
                accessibilityLabel="Settings"
              >
                <Ionicons
                  name={homeNavIconHighlight.settings ? "settings" : "settings-outline"}
                  size={22}
                  color={theme.accent}
                />
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
            <Pressable onPress={confirmLogout} style={styles.iconButton} accessibilityLabel="Logout">
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
                data={visibleSortedChats}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.chatList,
                  { paddingBottom: homeBottomActionClearance(insets.bottom) },
                ]}
                renderItem={({ item }) => {
                  const counterpartIds = item.memberIds.filter((id) => id !== CURRENT_USER_ID);
                  const showOnline = counterpartIds.some((id) => friendMap[id]?.online);
                  const lastMessage = lastMessageByChatId[item.id];
                  const isGroup = counterpartIds.length !== 1;
                  const primaryFriendId = !isGroup ? counterpartIds[0] : null;
                  const counterpartPd =
                    primaryFriendId != null
                      ? resolvePd(primaryFriendId, item.id)
                      : null;
                  const avatarLetter = isGroup ? "^" : counterpartPd?.letter ?? "^";
                  const avatarUri = !isGroup ? counterpartPd?.profilePictureUrl : undefined;
                  const itemTitle = resolvedStoredChatListTitle(item);
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
                            if (primaryFriendId && counterpartPd?.canOpenProfile) {
                              openFriendProfile(primaryFriendId, "home");
                            }
                          }}
                          disabled={!primaryFriendId || !counterpartPd?.canOpenProfile}
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
                              {buildHomeChatPreview(
                                item,
                                lastMessage,
                                friendMap,
                                unfriendedIds,
                                serverFriendUidsForDisplay,
                                identityLockedChatIdsSet
                              )}
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

              <View
                pointerEvents="box-none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: theme.background,
                  elevation: 6,
                  shadowColor: "#000",
                  shadowOpacity: Platform.OS === "ios" ? 0.08 : 0,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: -2 },
                }}
              >
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
                        height: navDeadZoneHeight(insets.bottom),
                        backgroundColor: theme.background,
                      },
                    ]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                </View>
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
                  { paddingBottom: homeBottomActionClearance(insets.bottom) },
                ]}
                refreshControl={
                  <RefreshControl
                    refreshing={feedRefreshing}
                    onRefresh={() => {
                      setFeedRefreshing(true);
                      setFeedPullNonce((n) => n + 1);
                    }}
                    tintColor={theme.accent}
                  />
                }
                onEndReached={() => loadMoreFeedPosts()}
                onEndReachedThreshold={0.35}
                ListFooterComponent={
                  feedLoadingMore ? (
                    <ActivityIndicator style={{ marginVertical: 16 }} color={theme.accent} />
                  ) : null
                }
                onViewableItemsChanged={({ viewableItems }: { viewableItems: ViewToken[] }) => {
                  const videoVisible = viewableItems.find(
                    (v) => v.isViewable && (v.item as Post)?.videoUri
                  );
                  setPlayingFeedVideoPostId(
                    videoVisible ? (videoVisible.item as Post).id : null
                  );
                  const visiblePosts = viewableItems
                    .filter((v) => v.isViewable && v.item)
                    .map((v) => v.item as Post);
                  if (visiblePosts.length > 0) {
                    if (feedViewableHydrateTimerRef.current) {
                      clearTimeout(feedViewableHydrateTimerRef.current);
                    }
                    feedViewableHydrateTimerRef.current = setTimeout(() => {
                      for (const visiblePost of visiblePosts.slice(0, 6)) {
                        void hydratePrivateThreadForPost(visiblePost);
                      }
                    }, 250);
                  }
                }}
                viewabilityConfig={feedVideoViewabilityConfig}
                ItemSeparatorComponent={() => <View style={styles.feedSeparator} />}
                ListEmptyComponent={<Text style={styles.feedEmpty}>No posts from friends yet.</Text>}
                renderItem={({ item }) => (
                  <FeedPostCard
                    {...feedPostCardShared}
                    post={item}
                    videoShouldPlay={playingFeedVideoPostId === item.id}
                    onToggleReaction={(emoji) => togglePostReaction(item, emoji)}
                    onOpenViewer={() => openPostViewerFromFeed(item)}
                  />
                )}
              />
              <Pressable
                style={[styles.feedFabButton, { bottom: fabBottomOffset(insets.bottom) }]}
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
                  onPress={openSettingsScreen}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.settings ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Settings"
                >
                  <Ionicons
                    name={homeNavIconHighlight.settings ? "settings" : "settings-outline"}
                    size={22}
                    color={theme.accent}
                  />
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
              <Pressable onPress={confirmLogout} style={styles.iconButton} accessibilityLabel="Logout">
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
              {friendMap[view.friendId].bio.trim().length > 0 ? (
                <Text style={styles.friendHeroBio}>{friendMap[view.friendId].bio}</Text>
              ) : null}
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
                    {...feedPostCardShared}
                    key={`friend-post-${post.id}`}
                    post={post}
                    onToggleReaction={(emoji) => togglePostReaction(post, emoji)}
                    onOpenViewer={() => openPostViewerFromFeed(post)}
                  />
                ))}
              </View>
            </ScrollViewUntilScroll>
            <View style={[styles.profileBottomBar, { paddingBottom: stickyFooterPadding(insets.bottom) }]}>
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
                  onPress={openSettingsScreen}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.settings ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Settings"
                >
                  <Ionicons
                    name={homeNavIconHighlight.settings ? "settings" : "settings-outline"}
                    size={22}
                    color={theme.accent}
                  />
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
              <Pressable onPress={confirmLogout} style={styles.iconButton} accessibilityLabel="Logout">
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
                  placeholder="Enter bio here..."
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
                    {...feedPostCardShared}
                    key={`my-post-${post.id}`}
                    post={post}
                    onToggleReaction={(emoji) => togglePostReaction(post, emoji)}
                    onOpenViewer={() => openPostViewerFromFeed(post)}
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
            bottomInset={stickyFooterPadding(insets.bottom)}
            navHighlight={homeNavIconHighlight}
            styles={styles}
            onOpenSettings={openSettingsScreen}
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
            onLogout={confirmLogout}
            pairingBackendReady={backendSessionReady}
            onPairingRegisterPinWithRetry={pairingRegisterPinWithRetryParent}
            onPairingAwaitPinRedeem={pairingAwaitPinRedeemParent}
            onPairingConfirmPinRead={pairingConfirmPinReadParent}
            onPairingAwaitIssuerFinalConfirm={pairingAwaitIssuerFinalConfirmParent}
            onPairingFinalizePinOffer={pairingFinalizePinOfferParent}
            onEnsurePairingLocationPermission={ensurePairingLocationPermission}
            onPairingCancelPinOffer={pairingCancelPinOfferParent}
            onPairingPollOfferStillPresent={pairingPollOfferStillPresentParent}
          />
        </View>
      ) : null}

      {view.screen === "chatSharedMedia" ? (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 28 }]}
        >
          <View style={{ flex: 1, paddingTop: safeTop, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Pressable
                onPress={() => setView({ screen: "chat", chatId: view.chatId })}
                style={styles.iconButton}
                accessibilityLabel="Back to chat"
              >
                <Ionicons name="arrow-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={[styles.chatScreenTitle, { flex: 1, textAlign: "center", marginRight: 38 }]}>
                Shared media
              </Text>
            </View>
            <FlatListUntilScroll
              data={activeChatSharedMedia}
              keyExtractor={(m) => m.id}
              numColumns={3}
              columnWrapperStyle={{ gap: postGridLayout.gap, marginBottom: postGridLayout.gap }}
              contentContainerStyle={{ paddingBottom: stickyFooterPadding(insets.bottom) }}
              ListEmptyComponent={
                <Text style={styles.subtleText}>No photos or videos in this chat yet.</Text>
              }
              renderItem={({ item: m }) => (
                <Pressable
                  onPress={() =>
                    setFullscreenMedia({
                      uri: m.mediaUri!,
                      kind: m.kind === "video" ? "video" : m.kind === "gif" ? "gif" : "photo",
                    })
                  }
                  style={{ width: postGridLayout.cell, height: postGridLayout.cell }}
                >
                  {m.kind === "video" ? (
                    <View
                      style={[
                        styles.postGridCell,
                        { width: postGridLayout.cell, height: postGridLayout.cell },
                      ]}
                    >
                      <Video
                        source={{ uri: m.mediaUri! }}
                        style={styles.postGridImage}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={false}
                      />
                      <View style={styles.postGridPlayBadge}>
                        <Ionicons name="play" size={18} color="#fff" />
                      </View>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: m.mediaUri! }}
                      style={[
                        styles.postGridImage,
                        { width: postGridLayout.cell, height: postGridLayout.cell },
                      ]}
                      resizeMode="cover"
                    />
                  )}
                </Pressable>
              )}
            />
          </View>
        </View>
      ) : null}

      {view.screen === "publishPost" ? (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 27 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={safeTop}
        >
          <View style={{ flex: 1, paddingTop: safeTop, paddingHorizontal: 16, minHeight: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Pressable onPress={closePublishPostScreen} style={styles.iconButton} accessibilityLabel="Back">
                <Ionicons name="arrow-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={[styles.chatScreenTitle, { flex: 1, textAlign: "center", marginRight: 38 }]}>
                New post
              </Text>
            </View>

            <ScrollViewUntilScroll
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                paddingBottom: 12,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
            >
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
                  <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 24 }}>
                    <Ionicons name="image-outline" size={44} color={theme.subtleText} />
                    <Text style={[styles.subtleText, { marginTop: 8, textAlign: "center", paddingHorizontal: 16 }]}>
                      Tap to add photos
                    </Text>
                  </View>
                ) : postDraftVideoUri ? (
                  <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20 }}>
                    <Ionicons name="videocam-outline" size={40} color={theme.subtleText} />
                    <Text style={[styles.subtleText, { marginTop: 6 }]}>
                      Video ready — publish to choose thumbnail
                    </Text>
                  </View>
                ) : (
                  <ScrollViewUntilScroll
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 8 }}
                  >
                    {postDraftImageUris.map((uri) => (
                      <Image key={uri} source={{ uri }} style={styles.postComposerThumb} />
                    ))}
                  </ScrollViewUntilScroll>
                )}
              </Pressable>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10, justifyContent: "center" }}>
                <Pressable
                  style={[styles.iconActionPill, { borderColor: theme.divider }]}
                  onPress={pickPostPhotos}
                  accessibilityLabel="Add photos"
                >
                  <Ionicons name="image-outline" size={22} color={theme.text} />
                </Pressable>
                <Pressable
                  style={[styles.iconActionPill, { borderColor: theme.divider }]}
                  onPress={pickPostVideo}
                  accessibilityLabel="Add video"
                >
                  <Ionicons name="videocam-outline" size={22} color={theme.text} />
                </Pressable>
                <Pressable
                  style={[styles.iconActionPill, { borderColor: theme.divider }]}
                  onPress={() => {
                    setPostDraftImageUris([]);
                    setPostDraftVideoUri(null);
                  }}
                  accessibilityLabel="Clear media"
                >
                  <Ionicons name="trash-outline" size={22} color={theme.text} />
                </Pressable>
              </View>

              <TextInput
                value={postDraftText}
                onChangeText={setPostDraftText}
                placeholder="Write something…"
                placeholderTextColor={theme.subtleText}
                multiline
                style={[
                  styles.publishPostCaption,
                  {
                    flex: 0,
                    flexGrow: 0,
                    minHeight: 120,
                    marginTop: 10,
                    color: theme.text,
                    borderColor: theme.divider,
                  },
                ]}
              />
            </ScrollViewUntilScroll>

            {/* Sticky confirm bar — lifted above Android's nav/gesture area so the
                Publish button never sits inside the protected region. */}
            <View
              style={[
                styles.publishPostFooterRow,
                {
                  paddingBottom: stickyFooterPadding(insets.bottom),
                  paddingTop: 8,
                  marginTop: 0,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.divider,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <Pressable style={styles.publishPostCancelButton} onPress={closePublishPostScreen}>
                <Text style={styles.publishPostCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.publishPostPublishButton} onPress={publishPost}>
                <Text style={styles.publishPostPublishButtonText}>Publish</Text>
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
                  onPress={openSettingsScreen}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.settings ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Settings"
                >
                  <Ionicons
                    name={homeNavIconHighlight.settings ? "settings" : "settings-outline"}
                    size={22}
                    color={theme.accent}
                  />
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
              <Pressable onPress={confirmLogout} style={styles.iconButton} accessibilityLabel="Logout">
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
              contentContainerStyle={{
                paddingBottom: scrollPageBottomPadding(insets.bottom, 20),
                flexGrow: 1,
              }}
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
                  !canEditActiveGroupMeta && !(activeDirectCounterpartPd?.canOpenProfile ?? false)
                }
                onPress={() => {
                  if (activeChatKind !== "standard" || activeCounterpartIds.length !== 1) return;
                  const friendId = activeCounterpartIds[0];
                  if (!friendId || !activeDirectCounterpartPd?.canOpenProfile) return;
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
                    activeDirectCounterpartPd?.profilePictureUrl,
                    activeDirectCounterpartPd?.letter ?? "?",
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
            extraData={[replyTargetMessageId, messages, unfriendedIds, readAvatarsForActiveChat]}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => void loadOlderChatMessages()}
            onEndReachedThreshold={0.2}
            ListFooterComponent={
              chatLoadingOlder ? (
                <ActivityIndicator color={theme.accent} style={{ marginVertical: 8 }} />
              ) : null
            }
            ListHeaderComponent={null}
            renderItem={({ item }) => {
              const readAvatarUids = readAvatarsForActiveChat[item.id] ?? [];
              const reactionEntries = getReactionEntries(item);
              const peerPd =
                item.senderId !== CURRENT_USER_ID
                  ? resolvePd(item.senderId, item.chatId)
                  : null;
              const sender =
                item.senderId === CURRENT_USER_ID
                  ? {
                      displayName: "You",
                      profilePictureUrl: myProfilePictureUrl,
                      letter: "Y",
                    }
                  : {
                      displayName: peerPd!.displayName,
                      profilePictureUrl: peerPd!.profilePictureUrl,
                      letter: peerPd!.letter,
                    };
              const isMine = item.senderId === CURRENT_USER_ID;
              const reactionAlign: "left" | "right" = isMine ? "right" : "left";
              const messageReactionHostStyle = isMine
                ? styles.messageReactionHostMine
                : styles.messageReactionHost;
              const mineDeliveryLabel =
                isMine && !item.unsentAt
                  ? item.deliveryStatus === "sending"
                    ? " • Sending…"
                    : item.deliveryStatus === "sent"
                      ? " • Sent"
                      : item.deliveryStatus === "failed"
                        ? " • Not sent"
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
                    : `Replying to ${resolvePd(quotedMsg.senderId, item.chatId).displayName}`
                  : null;

              const senderProfileTapAllowed = Boolean(peerPd?.canOpenProfile);

              const messageAvatar = (
                <Pressable
                  style={isMine ? styles.messageAvatarMine : styles.messageAvatarOther}
                  onPress={() => {
                    if (!senderProfileTapAllowed) return;
                    if (pendingDraft) {
                      openFriendProfile(item.senderId, "chat", {
                        returnPendingDraft: pendingDraft,
                      });
                    } else if (resolvedChat) {
                      openFriendProfile(item.senderId, "chat", {
                        returnChatId: resolvedChat.id,
                      });
                    }
                  }}
                  disabled={item.senderId === CURRENT_USER_ID || !senderProfileTapAllowed}
                >
                  {renderAvatar(sender.profilePictureUrl, sender.letter, 30)}
                </Pressable>
              );

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
                      {isMine ? "You unsent a message." : "Message removed."}
                    </Text>
                  ) : item.text.trim() ? (
                    <Text style={isMine ? styles.messageTextMine : styles.messageText}>{item.text}</Text>
                  ) : null}
                </>
              );

              if ((item.kind === "photo" || item.kind === "gif") && item.mediaUri) {
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
                      <ReactionBubbleHost
                        entries={item.unsentAt ? [] : reactionEntries}
                        align={reactionAlign}
                        theme={reactTheme}
                        style={messageReactionHostStyle}
                      >
                        <Pressable
                          style={isMine ? styles.photoMessageStackMine : styles.photoMessageStack}
                          onLongPress={() => {
                            if (item.unsentAt || DEMO_OFFLINE_MODE || !getBackendSession()) return;
                            openReactionPickerForMessage(item.id);
                          }}
                          onPress={() => {
                            if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                              setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                            } else {
                              setFullscreenMedia({
                                uri: item.mediaUri!,
                                kind: item.kind === "gif" ? "gif" : "photo",
                              });
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
                          ) : null}
                        </Pressable>
                      </ReactionBubbleHost>
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
                const videoIsPlaying = playingVideoMessageId === item.id;
                const videoHasPlayed = finishedVideoMessageIds.has(item.id);
                const showVideoPlayButton = !videoIsPlaying && !videoHasPlayed;
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
                      <ReactionBubbleHost
                        entries={item.unsentAt ? [] : reactionEntries}
                        align={reactionAlign}
                        theme={reactTheme}
                        style={messageReactionHostStyle}
                      >
                        <Pressable
                          style={isMine ? styles.photoMessageStackMine : styles.photoMessageStack}
                          onLongPress={() => {
                            if (item.unsentAt || DEMO_OFFLINE_MODE || !getBackendSession()) return;
                            openReactionPickerForMessage(item.id);
                          }}
                          onPress={() => {
                            if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                              setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                              return;
                            }
                            if (videoHasPlayed || videoIsPlaying) return;
                            setPlayingVideoMessageId(item.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={
                            videoHasPlayed ? "Video already played" : "Play video message"
                          }
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
                            shouldPlay={videoIsPlaying}
                            isLooping={false}
                            useNativeControls={false}
                            onPlaybackStatusUpdate={(status) => {
                              if (!status.isLoaded || !status.didJustFinish) return;
                              setPlayingVideoMessageId((cur) => (cur === item.id ? null : cur));
                              setFinishedVideoMessageIds((prev) => {
                                if (prev.has(item.id)) return prev;
                                const next = new Set(prev);
                                next.add(item.id);
                                return next;
                              });
                            }}
                          />
                          {showVideoPlayButton ? (
                            <View style={styles.postGridPlayBadge} pointerEvents="none">
                              <View style={styles.chatVideoPlayButton}>
                                <Ionicons name="play" size={28} color="#fff" />
                              </View>
                            </View>
                          ) : null}
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
                        ) : null}
                        </Pressable>
                      </ReactionBubbleHost>
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
                    <ReactionBubbleHost
                      entries={item.unsentAt ? [] : reactionEntries}
                      align={reactionAlign}
                      theme={reactTheme}
                      style={messageReactionHostStyle}
                    >
                    <Pressable
                      style={[
                        styles.messageCard,
                        isMine ? styles.myMessageCard : styles.otherMessageCard,
                      ]}
                      onLongPress={() => {
                        if (item.unsentAt || DEMO_OFFLINE_MODE || !getBackendSession()) return;
                        openReactionPickerForMessage(item.id);
                      }}
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
                          {isMine ? "You unsent a message." : "Message removed."}
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
                    </Pressable>
                    </ReactionBubbleHost>
                    <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                      {formatDayTime(item.createdAt)}
                      {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                      {mineDeliveryLabel}
                    </Text>
                    {readAvatarUids.length > 0 ? (
                      <View style={styles.readReceiptAvatarRow}>
                        {readAvatarUids.map((uid) => {
                          const pd =
                            uid === CURRENT_USER_ID
                              ? {
                                  profilePictureUrl: myProfilePictureUrl,
                                  letter: "Y",
                                }
                              : {
                                  profilePictureUrl:
                                    friendMap[uid]?.profilePictureUrl ?? "",
                                  letter: friendMap[uid]?.displayName?.slice(0, 1) ?? "?",
                                };
                          return (
                            <View key={`${item.id}:${uid}`}>
                              {renderAvatar(pd.profilePictureUrl, pd.letter, 22)}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
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

          {isDirectTombstoneChat ? (
            <View
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.divider,
                backgroundColor: theme.background,
                paddingTop: 16,
                paddingHorizontal: 16,
                paddingBottom: stickyFooterPadding(insets.bottom),
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityRole="text"
              accessibilityLabel="Cannot message this account"
            >
              <Text style={[styles.subtleText, { textAlign: "center" }]}>Cannot message this account</Text>
            </View>
          ) : (
            <>
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

              {voiceNoteMode ? (
                <View
                  style={[
                    styles.voiceRecordingStrip,
                    { borderBottomColor: theme.divider, backgroundColor: theme.replyBannerQuotingOtherBg },
                  ]}
                >
                  {voiceRecordStartedAt ? (
                    <>
                      <View style={styles.voiceRecordingDot} />
                      <Text style={[styles.replyBannerText, { color: theme.text, flex: 1 }]}>
                        Recording… {voiceRecordElapsedSec}s
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.replyBannerText, { color: theme.text, flex: 1 }]}>
                      Voice note — tap the mic button to record, then tap stop to send
                    </Text>
                  )}
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
                      paddingBottom: composerBottomPadding(insets.bottom, keyboardVisible),
                    },
                  ]}
                >
                  {!showCompactComposer ? (
                    <>
                      <Pressable
                        style={[
                          styles.attachButtonSmall,
                          voiceNoteMode ? styles.attachButtonSmallActive : null,
                        ]}
                        onPress={toggleVoiceNoteMode}
                        accessibilityLabel={
                          voiceNoteMode ? "Leave voice note mode" : "Voice note mode"
                        }
                      >
                        <Ionicons
                          name="mic-outline"
                          size={16}
                          color={voiceNoteMode ? "#FFFFFF" : theme.accent}
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
                    style={[
                      styles.sendButtonChat,
                      voiceNoteMode && voiceRecordStartedAt
                        ? { backgroundColor: theme.danger }
                        : null,
                    ]}
                    onPress={onComposerPrimaryPress}
                    accessibilityLabel={
                      voiceNoteMode
                        ? voiceRecordStartedAt
                          ? "Stop recording and send voice note"
                          : "Start recording voice note"
                        : "Send message"
                    }
                  >
                    <Ionicons
                      name={
                        voiceNoteMode
                          ? voiceRecordStartedAt
                            ? "stop"
                            : "mic"
                          : "send"
                      }
                      size={16}
                      color="#FFFFFF"
                    />
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      ) : null}

      <Modal visible={chatComposerOpen} animationType="slide" onRequestClose={closeComposer}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.background }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={insets.top + 8}
        >
        <View style={[styles.modalScreen, { paddingTop: insets.top + 8, paddingBottom: stickyFooterPadding(insets.bottom) }]}>
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
            style={{ flex: 1, minHeight: 0 }}
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
        <View style={[styles.modalScreen, { paddingTop: insets.top + 8, paddingBottom: stickyFooterPadding(insets.bottom) }]}>
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
            style={{ flex: 1, minHeight: 0 }}
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
        onRequestClose={() => {
          setReactionPickerOpen(false);
          setPostReactionTargetId(null);
          setCommentReactionTarget(null);
        }}
      >
        <Pressable
          style={styles.settingsOverlay}
          onPress={() => {
            setReactionPickerOpen(false);
            setPostReactionTargetId(null);
            setCommentReactionTarget(null);
          }}
        >
          <Pressable style={styles.settingsCard} onPress={() => {}}>
            <Text style={styles.chatScreenTitle}>React</Text>
            <View style={styles.reactionPickerRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable key={emoji} style={styles.reactionChip} onPress={() => applyReaction(emoji)}>
                  <Text style={styles.reactionChipText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            {messageActionTarget && !postReactionTargetId && !commentReactionTarget ? (
              <Pressable
                style={[styles.menuRow, { marginTop: 12 }]}
                onPress={() => {
                  setReactionPickerOpen(false);
                  setMessageActionsOpen(true);
                }}
              >
                <Feather name="more-horizontal" size={18} color={theme.text} />
                <Text style={styles.menuRowText}>Reply, edit, and more…</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {view.screen === "settings" ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 30 }]}>
          <View style={[styles.fullScreen, { paddingTop: safeTop }]}>
            <View style={styles.homeTopBar}>
              <View style={styles.homeTopLeftIcons}>
                <Pressable
                  onPress={openSettingsScreen}
                  style={[
                    styles.iconButton,
                    homeNavIconHighlight.settings ? styles.homeModeIconActive : null,
                  ]}
                  accessibilityLabel="Settings"
                >
                  <Ionicons
                    name={homeNavIconHighlight.settings ? "settings" : "settings-outline"}
                    size={22}
                    color={theme.accent}
                  />
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
              <Pressable onPress={confirmLogout} style={styles.iconButton} accessibilityLabel="Logout">
                <Ionicons name="log-out-outline" size={22} color={theme.accent} />
              </Pressable>
            </View>
            <ScrollViewUntilScroll
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingTop: 8,
                paddingBottom: scrollPageBottomPadding(insets.bottom, 24),
                gap: 12,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.chatScreenTitle, { flex: 0, textAlign: "left" }]}>Settings</Text>
              <View style={[styles.settingsRow, { paddingVertical: 12 }]}>
                <Text style={styles.chatName}>Dark mode</Text>
                <Switch
                  value={isDarkMode}
                  onValueChange={setIsDarkMode}
                  thumbColor="#FFFFFF"
                  trackColor={{ false: "#95A1A8", true: theme.accent }}
                />
              </View>
              <Pressable
                style={[styles.settingsRow, { paddingVertical: 12 }]}
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
                style={[styles.settingsRow, { paddingVertical: 12 }]}
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
                          setView({ screen: "home" });
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={[styles.chatName, { color: theme.danger }]}>Reset local app state</Text>
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
              </Pressable>
              <Pressable
                style={[styles.settingsRow, { paddingVertical: 12 }]}
                onPress={confirmDeleteAccount}
              >
                <Text style={[styles.chatName, { color: theme.danger }]}>Delete account</Text>
                <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
              </Pressable>
            </ScrollViewUntilScroll>
          </View>
        </View>
      ) : null}

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
                if (resolvedChat) {
                  setView({ screen: "chatSharedMedia", chatId: resolvedChat.id });
                }
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
        visible={fullscreenMedia !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenMedia(null)}
      >
        <Pressable
          style={[
            styles.settingsOverlay,
            {
              justifyContent: "center",
              paddingTop: insets.top,
              paddingBottom: stickyFooterPadding(insets.bottom),
            },
          ]}
          onPress={() => setFullscreenMedia(null)}
        >
          <Pressable style={{ width: "100%", maxHeight: "90%" }} onPress={() => {}}>
            {fullscreenMedia?.kind === "video" ? (
              <Video
                source={{ uri: fullscreenMedia.uri }}
                style={{ width: "100%", height: 360 }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            ) : fullscreenMedia ? (
              <Image
                source={{ uri: fullscreenMedia.uri }}
                style={{ width: "100%", height: "100%", minHeight: 280 }}
                resizeMode="contain"
              />
            ) : null}
          </Pressable>
          <Pressable
            style={[styles.iconButton, { position: "absolute", top: insets.top + 8, right: 16 }]}
            onPress={() => setFullscreenMedia(null)}
            accessibilityLabel="Close fullscreen"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </Pressable>
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

export default function MainApp() {
  return <MainAppInner />;
}
