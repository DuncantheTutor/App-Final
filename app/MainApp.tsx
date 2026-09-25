import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  storageGetItem,
  storageRemoveItem,
  storageSetItem,
} from "./lib/encryptedLocalStorage";
import { setUserHapticsEnabled, useHapticSettings } from "./lib/haptics";
import { clearEncryptedMediaCaches } from "./lib/encryptedMediaCache";
import * as NavigationBar from "expo-navigation-bar";
import { Audio, ResizeMode, Video } from "expo-av";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ExpoNetwork from "expo-network";
import Constants from "expo-constants";
import { onAuthStateChanged } from "firebase/auth";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  InteractionManager,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
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
import { parseMessageMediaFromPlain } from "./lib/tierBMedia/messageMedia";
import {
  ChatMessageMediaResolver,
  messageHasResolvableMedia,
} from "./components/ChatMessageMediaResolver";
import { ChatThreadErrorBoundary } from "./components/ChatThreadErrorBoundary";
import { ChatVideoAutoPlayWhenReady } from "./components/ChatVideoAutoPlayWhenReady";
import { ChatVideoMessageBubble } from "./components/ChatVideoMessageBubble";
import { ChatReplyTargetPreview } from "./components/ChatReplyTargetPreview";
import { ChatVoiceNoteBubble } from "./components/ChatVoiceNoteBubble";
import { resolveTierBMediaToFileUri } from "./lib/tierBMedia/storage";
import { startAndroidOtpAssist } from "../otpSmsAssist";
import {
  debugSessionLog,
  firebaseAuth,
  firebaseSessionSurvivesNullEvent,
  getFirestoreDb,
  warmFirebaseIdToken,
} from "../firebaseAuthClient";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";
import { joinCutoffMsForViewer, normalizeMemberJoinedAtForClient } from "./lib/chatMemberJoinedAt";
import {
  broadcastCreatorFriendId,
  isBroadcastCreator,
} from "./lib/broadcastMessaging";
import {
  buildLastMessageByChatId,
  buildVisibleThreadMessagesByChatId,
  chatListSortTimestampMs,
  filterChatsVisibleInInbox,
} from "./lib/chatListLastMessage";
import { retainedMessageChatIds } from "./lib/messageRetentionChatIds";
import { trimInMemoryMessages } from "./lib/trimInMemoryMessages";
import { isIncomingChatUnread } from "./lib/chatUnreadState";
import {
  friendBackendUidFromDirectChatLocalId,
  isCanonicalDirectChatId,
  localChatIdsForDirectThread,
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
} from "./lib/mergeFriendsCatalog";
import {
  registerPushTokenWithBackend,
  getOsNotificationPermissionStatus,
  isOsNotificationPermissionGranted,
} from "./lib/pushNotifications";
import { chatCaptionedMediaLayout, chatMediaBubbleInsetStyle, chatMediaInnerClipStyle } from "./lib/chatMediaLayout";
import { messageDisplayText, normalizeMessagesForUi } from "./lib/messageDisplayText";
import {
  composerKeyboardAvoidanceEnabled,
  keyboardComposerBottomPadding,
  androidAbsoluteOverlayKeyboardBottom,
  keyboardOverlapFromEvent,
  navDeadZoneHeight,
  scrollPageBottomPadding,
  stickyFooterPadding,
} from "./lib/safeAreaInsets";
import { keyboardScrollPadding } from "./lib/keyboardInputScroll";
import { postCarouselImageCount } from "./lib/feedPostLayout";
import { useScrollPinnedInput } from "./lib/useScrollPinnedInput";
import { FeedPostCard } from "./components/FeedPostCard";
import { NotificationPrePromptScreen } from "./components/NotificationPrePromptScreen";
import { PostGridCell } from "./components/PostGridCell";
import { ImageCropModal } from "./components/ImageCropModal";
import { HomeTopNavBar } from "./components/HomeTopNavBar";
import { PressAckButton } from "./components/PressAckButton";
import { FullscreenMediaViewer } from "./components/FullscreenMediaViewer";
import { VideoPostThumbnailModal } from "./components/VideoPostThumbnailModal";
import { OpenSourceLicensesScreen } from "./screens/OpenSourceLicensesScreen";
import { ReactionBubbleHost } from "./components/ReactionBubbleHost";
import { aggregateReactionCounts } from "./lib/reactionHelpers";
import {
  overlayMessageDocMetadata,
  type MessageDocMetadata,
} from "./messaging/messageMetadata";
import { readAvatarsByMessageId, type ReadByMap } from "./lib/readReceipts";
import { useInitialServerSync } from "./boot/useInitialServerSync";
import { restoreKeyBundleFromCloudIfMissing, uploadKeyBundleToCloudBackup } from "./lib/e2eeKeyBackup";
import {
  restoreSocialSnapshotFromCloud,
  uploadSocialSnapshotToCloud,
} from "./lib/socialSnapshotBackup";
import { availableStartChatFriends } from "./chat/availableStartChatFriends";
import { useActiveChatMessages } from "./chat/useActiveChatMessages";
import { useStartChatComposer } from "./chat/useStartChatComposer";
import { createChatExitActions } from "./chat/chatExit";
import { createChatMembershipActions } from "./chat/chatMembership";
import { createChatMetaActions } from "./chat/chatMeta";
import { createFailedMessageActions } from "./chat/failedMessageActions";
import { createMessageActions } from "./chat/messageActions";
import { storedChatListTitle } from "./chat/chatListTitle";
import {
  buildDefaultChatName as chatNameFromFriendIds,
  createOpenOrCreateChatActions,
} from "./chat/openOrCreateChat";
import { scheduleDemoAutoReplies } from "./chat/demoAutoReplies";
import { createLeaveChatActions } from "./chat/leaveChat";
import { useInThreadComposer } from "./chat/useInThreadComposer";
import { toggleVoiceMessagePlayback as toggleVoiceMessagePlaybackImpl } from "./chat/voicePlayback";
import { createFriendListActions } from "./friends/friendListActions";
import { useFriendRosterSync } from "./friends/useFriendRosterSync";
import { useFriendsController } from "./friends/useFriendsController";
import { createOpenFriendProfileActions, useEncryptedProfileSync, useProfileController } from "./profile";
import { migrateLegacyDraftChats } from "./messaging/legacyChatMigration";
import { isLegacyDraftChatId } from "./messaging/localChatId";
import { promotePendingChatToRow } from "./messaging/promotePendingChat";
import { useMessagingController } from "./messaging/useMessagingController";
import { useMessagingSync } from "./messaging/useMessagingSync";
import {
  activeChatIdFromView,
  createMainNavSwipePan,
  mainNavSurfaceFromView,
  pendingDraftFromView,
  useAppNavigation,
  useMainNavSlide,
  viewAfterLeavingFriendProfile,
  type MainNavSurface,
} from "./shell";
import { AuthScreens } from "./shell/AuthScreens";
import { SignedInTree } from "./shell/SignedInTree";
import { handleAndroidHardwareBack as handleAndroidHardwareBackImpl } from "./shell/androidHardwareBack";
import { createAccountAuthActions, restoreSignedInAccount, useBackendSession, useSignedInSession } from "./session";
import {
  initializeBackendSessionForAccount as initializeBackendSessionForAccountImpl,
  retryInitializeBackendSession,
} from "./session/initializeBackendSession";
import {
  clearSignedOutSocialState,
  logoutSignedInAccount,
  resetCurrentUserLocalState,
} from "./session/signedOutReset";
import { sendChatPayload, sendComposerDraft, sendComposerVoiceNote } from "./messaging/sendChatPayload";
import {
  FIREBASE_ID_TOKEN_WARM_MS,
  NULL_AUTH_GRACE_MS,
} from "./session/firebaseAuthPersistence";
import { useFeedController, useFeedReactionListeners, useFeedSync, useFullscreenPostThread, usePostThreadActions, useReactionPicker } from "./feed";
import { completePhotoEditorSession } from "./media/completePhotoEditor";
import {
  capturePostPhotoDraft,
  choosePostVideo,
  pickChatCameraMedia,
  pickChatGalleryPhoto,
  pickChatGalleryVideo,
  pickGroupPicture,
  pickPostPhotoDraft,
  pickProfilePhoto,
  promptPostPhotoDraft,
} from "./media/pickMedia";
import { usePhotoEditorSession } from "./media/usePhotoEditorSession";
import { useNotificationPermissionGate, usePushNotificationRouting } from "./notifications";
import { useAddFriendPairing } from "./addFriend/useAddFriendPairing";
import { updateOutgoingMessageContent } from "./messaging/send";
import { useOutgoingMessages } from "./messaging/useOutgoingMessages";
import { refreshFriendProfilesFromServer } from "./friends/refreshFriendProfiles";
import {
  confirmDeleteOwnedPost,
  createPostPublishActions,
  shareOwnedPostsWithNewFriend,
  usePublishComposer,
} from "./posts";
import {
  readPostsSharedWithFriends,
  writePostsSharedWithFriends,
} from "./lib/postsSharedWithFriendsPersistence";
import { publishActivePresence } from "./presence/heartbeat";
import { usePresenceFirestoreListener } from "./presence/usePresenceFirestoreListener";
import { usePresenceHeartbeat } from "./presence/usePresenceHeartbeat";
import {
  mergeProfilePictureUrl,
  normalizeHttpsProfilePictureUrl,
} from "./lib/profilePictureUrl";
import {
  decryptPayloadForRecipient,
  ensureLocalKeyBundle,
  encryptPayloadForRecipients,
} from "../e2eeCrypto";

import type {
  Chat,
  ColorThemeId,
  Friend,
  FriendsListRestore,
  Message,
  MockAuthAccount,
  PendingDraft,
  Post,
  PostComment,
  ThemePalette,
} from "./domain/types";
import {
  PLACEHOLDER_APP_PRODUCT_NAME,
  lastHomeTabStorageKey,
  lastViewStorageKey,
  parseFriendsListRestorePayload,
  parsePendingDraftPayload,
  pruneGhostEmptyChats,
  sanitizePersistedFriendsFromStorage,
} from "./lib/viewPersistence";
import { warmPostGridMediaCache } from "./lib/warmPostMediaCache";
import {
  isChatIdentityLocked,
} from "./lib/identityLockedChats";
import { friendDisplayNameFromProfile } from "./lib/friendDisplayName";
import {
  resolveParticipantDisplay,
  TOMBSTONE_DISPLAY_NAME,
} from "./lib/participantDisplay";
import { readFeedMutesForEmail } from "./lib/feedMutePersistence";
import {
  countUnreadFeedReactionPosts,
  markOwnedPostReactionsSeen,
  readFeedReactionSeenForEmail,
} from "./lib/feedReactionUnread";
import { mergeSyncedMessages, mergeSyncedPosts } from "./lib/mergeEncryptedSync";
import { mergeCloudChatsWithLocalReadBy, mergeReadByMaps } from "./lib/mergeChatReadBy";
import { yieldToUi } from "./lib/yieldToUi";
import { makeStyles } from "./styles/makeAppStyles";
import { AddFriendScreen } from "./screens/AddFriendScreen";
import {
  ACCENT_GREEN,
  ACCENT_PINK,
  ADD_FRIEND_HANDSHAKE_MS,
  ADD_FRIEND_HOLD_MS,
  ADD_FRIEND_OVERLAY_DIM_START,
  ADD_FRIEND_PAIRING_RETRY_COOLDOWN_MS,
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
  DEMO_OFFLINE_MODE,
  EMAIL_OTP_ENABLED,
  DEMO_SHARED_FRIEND_IDS,
  DEMO_USER_A_FRIEND_IDS,
  DEMO_USER_A_ONLY_FRIEND_IDS,
  DEMO_USER_B_FRIEND_IDS,
  DEMO_USER_B_ONLY_FRIEND_IDS,
  FAKE_BIOS,
  FRIENDS,
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
  ENCRYPTED_POSTS_HOME_FEED_LIMIT,
  ENCRYPTED_POSTS_PROFILE_SYNC_LIMIT,
  FEED_UI_INITIAL_COUNT,
  FEED_UI_DISPLAY_PAGE_SIZE,
  ENCRYPTED_MESSAGES_SYNC_LIMIT,
  CHAT_INITIAL_MESSAGE_LIMIT,
  CHAT_OLDER_MESSAGES_PAGE_SIZE,
  CHAT_UI_INITIAL_DISPLAY_COUNT,
  CHAT_UI_DISPLAY_PAGE_SIZE,
  PROFILE_FEED_POSTS_INITIAL,
  PROFILE_FEED_POSTS_PAGE_SIZE,
  FRIEND_PROFILE_REFRESH_MS,
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
  emailLocalPartGuess,
  isEmailDerivedUsername,
  isPlaceholderProfileUsername,
  resolveProfileUsername,
  CHAT_MESSAGE_LONG_PRESS_MS,
  usernameForProfileUpsert,
  fetchLedgerTokenFromRtdb,
  fetchLedgerTokenWithEtag,
  formatDayTime,
  friendIds,
  generateMockSessionToken,
  getMessagePreviewBody,
  getMockSessionSyncUrl,
  homeBottomActionClearance,
  isLikelyChatProfileImageUri,
  isMockSessionSyncConfigured,
  isPostAlive,
  mockSessionRtdbPathKey,
  multiplyHexColor,
  normalizeSet,
  postsStorageKeyForEmail,
  profileBioStorageKey,
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
  shouldResetSyncCacheForAppBuild,
  writeFriendKeyBundleCache,
  writeSyncWatermarks,
} from "./lib/clientSyncCache";


function MainAppInner() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [colorThemeId, setColorThemeId] = useState<ColorThemeId>("green");
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const hapticSettings = useHapticSettings();
  useEffect(() => {
    let cancelled = false;
    void storageGetItem(APPEARANCE_PREFS_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const o = JSON.parse(raw) as {
              isDarkMode?: unknown;
              colorThemeId?: unknown;
              hapticsEnabled?: unknown;
            };
            if (typeof o.isDarkMode === "boolean") setIsDarkMode(o.isDarkMode);
            if (o.colorThemeId === "green" || o.colorThemeId === "pink") setColorThemeId(o.colorThemeId);
            if (typeof o.hapticsEnabled === "boolean") setUserHapticsEnabled(o.hapticsEnabled);
          } catch {
            /* ignore */
          }
        }
        setPrefsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setPrefsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!prefsHydrated) return;
    void storageSetItem(
      APPEARANCE_PREFS_STORAGE_KEY,
      JSON.stringify({
        isDarkMode,
        colorThemeId,
        hapticsEnabled: hapticSettings.userEnabled,
      })
    ).catch(() => {});
  }, [isDarkMode, colorThemeId, hapticSettings.userEnabled, prefsHydrated]);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const {
    signedIn,
    setSignedIn,
    signedInRef,
    sessionEmailRef,
    sessionTokenRef,
    backendInitGenerationRef,
    authMode,
    setAuthMode,
    authModeRef,
    isRestoringAuthRef,
    appBootAuthResolvedRef,
    markAppBootAuthResolved,
    showBootSplash,
    encryptedSyncState,
    setEncryptedSyncState,
    initialServerSyncDone,
    setInitialServerSyncDone,
    initialServerSyncCompletedAtRef,
    markSignedIn,
    resetSyncChannelsIdle,
  } = useSignedInSession();
  const {
    backendSessionReady,
    backendAuthUidRef,
    backendDeviceIdRef,
    backendSessionReadyRef,
    readBackendSessionFromRefs,
    getBackendSession,
    waitForBackendSession,
    markSessionReady,
    clearSession,
  } = useBackendSession();
  const recipientKeyCacheRef = useRef<Record<string, string>>({});
  const sessionConflictNoticeAtRef = useRef(0);
  /** Latest `logout` so session-retry alerts can offer Logout before `logout` is defined in source order. */
  const logoutRef = useRef<() => void>(() => {});
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
  const {
    view,
    setView,
    viewRef,
    homeTab,
    setHomeTab,
    homeNavIconHighlight,
    goHome,
    openHomeChatsFromNav,
    openHomeFeedFromNav,
    goToSettings,
    goToAddFriend,
    goToMyProfile,
    goToPublishPost,
    goToOpenSourceLicenses,
    goToFriendsListFromHome,
  } = useAppNavigation();
  const {
    chats,
    chatsRef,
    messages,
    messagesRef,
    hiddenChatIds,
    setHiddenChatIds,
    hiddenChatIdsRef,
    hiddenServerConversationIdsRef,
    openDirectChat,
    hideChatIds,
    unhideChatId,
    removeChatsAndMessages,
    upsertChat,
    patchChat,
    appendMessages,
    removeMessageById,
    patchMessage,
    applyChats,
    applyMessages,
    replaceInbox,
    resetMessagingState,
  } = useMessagingController();
  const { posts, setPosts, postsRef, resetPosts, feedMutedUntilByFriendId, setFeedMutedUntilByFriendId, seenFeedReactionSigByPostId, setSeenFeedReactionSigByPostId, feedRefreshing, setFeedRefreshing, feedLoadingMore, setFeedLoadingMore, feedHasMore, setFeedHasMore, feedDisplayLimit, setFeedDisplayLimit, resetFeedPrefs } = useFeedController({
    signedIn,
    sessionEmailRef,
  });
  const {
    postDraftText,
    setPostDraftText,
    postDraftImageUris,
    setPostDraftImageUris,
    postDraftVideoUri,
    setPostDraftVideoUri,
    queuedPostPhotoAssets,
    setQueuedPostPhotoAssets,
    videoThumbnailModalOpen,
    videoThumbnailDefaultPosterUri,
    videoThumbnailPreviewLoading,
    resetPublishDraft,
    openPostComposer,
    postDraftImageCaptions,
    setPostDraftImageCaptions,
    clearPostDraftMedia,
    appendEditedPostPhoto,
    openVideoThumbnailModal,
    closeVideoThumbnailModal,
  } = usePublishComposer({ goToPublishPost });
  const {
    addedFriendsFromRitual,
    setAddedFriendsFromRitual,
    addedFriendsFromRitualRef,
    unfriendedIds,
    setUnfriendedIds,
    unfriendedIdsRef,
    friendLinksState,
    setFriendLinksState,
    stickyUnfriendedFriendIdsRef,
    acceptedFriendBackendUidsRef,
    serverAcceptedFriendBackendUids,
    setServerAcceptedFriendUids,
    resetFriendsState,
    hydrateFriends,
    acceptFriend,
    unfriendLocally,
    replaceFriendsIfChanged,
  } = useFriendsController();
  const {
    myProfilePictureUrl,
    setMyProfilePictureUrl,
    myProfilePictureUrlRef,
    myBio,
    setMyBio,
    myBioTextEntryOpen,
    setMyBioTextEntryOpen,
    myDisplayNameRef,
    resetMyProfile,
    hydrateMyProfile,
    mergeRosterIntoCache,
    resolveFriendProfileCard: resolveFriendProfileCardFromMaps,
    friendHasCachedProfile: friendHasCachedProfileFromMaps,
  } = useProfileController({ signedIn, sessionEmailRef });
  const {
    chatComposerOpen,
    setChatComposerOpen,
    broadcastPickerOpen,
    setBroadcastPickerOpen,
    composerMode,
    selectedComposerIds,
    composerCustomTitle,
    setComposerCustomTitle,
    createTitleEditOpen,
    setCreateTitleEditOpen,
    createTitleDraft,
    setCreateTitleDraft,
    createGroupPictureUri,
    setCreateGroupPictureUri,
    pendingStandardGroupCreateAfterTitle,
    setPendingStandardGroupCreateAfterTitle,
    savedBroadcastGroups,
    selectedBroadcastGroupId,
    setSelectedBroadcastGroupId,
    broadcastGroupDropdownOpen,
    setBroadcastGroupDropdownOpen,
    saveBroadcastGroupPromptOpen,
    setSaveBroadcastGroupPromptOpen,
    broadcastGroupNameDraft,
    setBroadcastGroupNameDraft,
    pendingBroadcastCreateIds,
    setPendingBroadcastCreateIds,
    saveBroadcastGroupNameModalOpen,
    setSaveBroadcastGroupNameModalOpen,
    composerSearch,
    setComposerSearch,
    selectedBroadcastGroup,
    closeComposer,
    closeBroadcastPicker,
    openBroadcastPicker,
    openStandardComposer,
    toggleFriendSelection,
    toggleSelectAllBroadcast,
    applySavedBroadcastGroup,
    commitSavedBroadcastGroup,
    beginGroupTitleStep,
  } = useStartChatComposer();
  const [chatSearch, setChatSearch] = useState("");
  const [chatSearchVisible, setChatSearchVisible] = useState(false);
  const [friendsListSearch, setFriendsListSearch] = useState("");
  const [demoPendingAddableQueue, setDemoPendingAddableQueue] = useState<string[]>([]);
  /** 1:1 chat ids that keep **User** identity after refriend (set on unfriend, never cleared). */
  const [identityLockedChatIds, setIdentityLockedChatIds] = useState<string[]>([]);
  const [chatOverflowOpen, setChatOverflowOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [fullscreenMedia, setFullscreenMedia] = useState<{
    uri: string;
    kind: "photo" | "gif" | "video";
    mediaWidth?: number;
    mediaHeight?: number;
    galleryUris?: string[];
    galleryIndex?: number;
    postId?: string;
  } | null>(null);
  const [postMediaGalleryIndexByPostId, setPostMediaGalleryIndexByPostId] = useState<Record<string, number>>(
    {}
  );
  const {
    reactionPickerOpen,
    setReactionPickerOpen,
    reactionTargetMessageId,
    setReactionTargetMessageId,
    postReactionTargetId,
    setPostReactionTargetId,
    commentReactionTarget,
    setCommentReactionTarget,
    closeReactionPicker,
    openReactionPickerForMessage: openReactionPickerForMessageBase,
    openReactionPickerForPost: openReactionPickerForPostBase,
    openReactionPickerForComment: openReactionPickerForCommentBase,
  } = useReactionPicker();
  const [messageActionTargetId, setMessageActionTargetId] = useState<string | null>(null);
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedBroadcastThreadFriendId, setSelectedBroadcastThreadFriendId] = useState<
    string | null
  >(null);
  const {
    chatInput,
    chatInputTextRef,
    chatInputRef,
    setChatInputSynced,
    setShouldFocusChatInput,
    voiceNoteMode,
    setVoiceNoteMode,
    voiceRecordStartedAt,
    voiceRecordElapsedSec,
    pendingVoiceNote,
    setPendingVoiceNote,
    pendingChatMediaAttachment,
    setPendingChatMediaAttachment,
    previewVoicePlaying,
    cancelVoiceRecording,
    exitVoiceNoteMode,
    toggleVoiceNoteMode,
    startVoiceRecording,
    stopVoiceRecordingForPreview,
    togglePendingVoicePreview,
    discardPendingVoiceNote,
    discardPendingChatMedia,
    preparePendingVoiceNoteForSend,
    clearComposerOnLeave,
  } = useInThreadComposer({ chatScreenOpen: view.screen === "chat" });
  const abortAddFriendPairingRef = useRef<(() => void) | null>(null);
  const registerAddFriendPairingAbort = useCallback((abort: () => void) => {
    abortAddFriendPairingRef.current = abort;
  }, []);
  const [playingVideoMessageId, setPlayingVideoMessageId] = useState<string | null>(null);
  const [measuredChatMediaByMessageId, setMeasuredChatMediaByMessageId] = useState<
    Record<string, { width: number; height: number }>
  >({});
  /** Tier B chat videos: decrypt/download only after the user taps play. */
  const [videoPrepareRequestedIds, setVideoPrepareRequestedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  /** Play inline once decrypt finishes after tap-to-prepare. */
  const [videoPlayAfterPrepareId, setVideoPlayAfterPrepareId] = useState<string | null>(null);
  const [playingVoiceMessageId, setPlayingVoiceMessageId] = useState<string | null>(null);
  const [voiceLoadingMessageId, setVoiceLoadingMessageId] = useState<string | null>(null);
  const [voicePlaybackProgress, setVoicePlaybackProgress] = useState<{
    messageId: string;
    positionMs: number;
    durationMs: number;
  } | null>(null);
  /** Caps how many loaded chat rows FlatList mounts (scroll-up expands before server fetch). */
  const [chatListDisplayLimit, setChatListDisplayLimit] = useState(CHAT_UI_INITIAL_DISPLAY_COUNT);
  /** Full feed cards below profile media grid (grid always shows all media tiles). */
  const [profileFeedPostLimit, setProfileFeedPostLimit] = useState(PROFILE_FEED_POSTS_INITIAL);
  const [editChatMetaOpen, setEditChatMetaOpen] = useState(false);
  const [editChatPictureOpen, setEditChatPictureOpen] = useState(false);
  const [chatTitleDraft, setChatTitleDraft] = useState("");
  const [chatPictureDraft, setChatPictureDraft] = useState("");
  const photoEditor = usePhotoEditorSession({
    extraBlur: () => chatInputRef.current?.blur(),
    isPublishPost: () => viewRef.current.screen === "publishPost",
    setQueuedPostPhotoAssets,
    setCreateGroupPictureUri,
  });
  const {
    photoEditorOpen,
    photoEditorInCrop,
    setPhotoEditorInCrop,
    photoEditorCropExitTick,
    photoEditorMediaType,
    setPhotoEditorMediaType,
    photoEditorTarget,
    setPhotoEditorTarget,
    photoEditorAsset,
    setPhotoEditorAsset,
    imageCropVisible,
    imageCropUri,
    imageCropAspect,
    cancelImageCropFlow,
    openPhotoEditorDirect,
    handleImageCropComplete,
    beginGroupPictureCrop,
    cancelPhotoEditor,
    resetPhotoEditor,
    setPhotoEditorOpen,
    setPhotoEditorCropExitTick,
  } = photoEditor;
  const {
    fullScreenPost,
    setFullScreenPost,
    fullScreenPostLive,
    postFullscreenThreadReplyKey,
    setPostFullscreenThreadReplyKey,
    postCommentInputRef,
    postCommentTextRef,
    postCommentInput,
    setPostCommentInput,
    setCommentDraftByPostId,
    threadDraftByChainKey,
    setThreadDraftByChainKey,
    closeFullscreenPost,
    openPostViewerFromFeed,
    handlePostCommentInputChange,
  } = useFullscreenPostThread({ posts });

  const publishPostScrollRef = useRef<ScrollView | null>(null);
  const publishCaptionInputRef = useRef<TextInput | null>(null);
  const bioInputRef = useRef<TextInput | null>(null);
  const myProfileScrollRef = useRef<ScrollView | null>(null);
  const [reactionDetailPost, setReactionDetailPost] = useState<Post | null>(null);
  const identityLockedChatIdsRef = useRef<string[]>([]);
  identityLockedChatIdsRef.current = identityLockedChatIds;
  const [feedMediaResolveIds, setFeedMediaResolveIds] = useState<Set<string>>(() => new Set());
  const [chatLoadingOlder, setChatLoadingOlder] = useState(false);
  const [chatHasMoreOlder, setChatHasMoreOlder] = useState<Record<string, boolean>>({});
  /** Per-chat pagination cursor when server rows decode to zero (avoids repeat reads). */
  const chatPaginationBeforeMsRef = useRef<Record<string, number>>({});
  const chatEndReachedBusyRef = useRef(false);
  const [feedPullNonce, setFeedPullNonce] = useState(0);
  const feedViewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const feedViewableHydrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistPostsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSocialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [presenceOnlineByBackendUid, setPresenceOnlineByBackendUid] = useState<Record<string, boolean>>({});
  /** Network reachability — drives the "Not connected to internet" profile state. */
  const [isOnline, setIsOnline] = useState(true);
  const autoReplyTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const messagesWatermarkMsRef = useRef(0);
  const sharePostsBackfillStartedRef = useRef<Set<string>>(new Set());
  const pendingPostsShareFriendUidsRef = useRef<Set<string>>(new Set());
  const postsSharedWithFriendsRef = useRef<Set<string>>(new Set());
  const sharePostsWithNewFriendHandlerRef = useRef<(newFriendUid: string) => void>(() => {});
  const resolveRecipientEncryptionKeysRef = useRef<
    (recipientUids: string[]) => Promise<Record<string, string>>
  >(async () => ({}));
  const messagesLastFullSyncAtRef = useRef(0);
  const backendUidToFriendIdRef = useRef<Record<string, string>>({});
  const postsWatermarkMsRef = useRef(0);
  const postsLastFullSyncAtRef = useRef(0);
  /** Survives cold start via sync watermarks so deleted posts are not resurrected from disk or server. */
  const deletedPostIdsRef = useRef<Set<string>>(new Set());
  /** Last local social blob write — skip older cloud snapshot restore on cold start. */
  const localSocialCacheSavedAtMsRef = useRef(0);
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
      deletedPostIds: [...deletedPostIdsRef.current],
    });
  }, []);
  const postsVisibleForCache = useCallback(
    (list: Post[]) =>
      list.filter((p) => isPostAlive(p) && !deletedPostIdsRef.current.has(p.id)),
    []
  );
  const persistPostsNow = useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    const alive = postsVisibleForCache(postsRef.current);
    void storageSetItem(postsStorageKeyForEmail(email), JSON.stringify(alive)).catch(() => {
      logAppError("posts.persistNow", new Error("write failed"), { email });
    });
  }, [postsVisibleForCache]);
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
  const messageSoundRef = useRef<Audio.Sound | null>(null);

  const theme = useMemo(() => {
    if (colorThemeId === "pink") {
      return isDarkMode ? DARK_THEME_PINK : LIGHT_THEME_PINK;
    }
    return isDarkMode ? DARK_THEME_GREEN : LIGHT_THEME_GREEN;
  }, [isDarkMode, colorThemeId]);

  const [appLifecycleState, setAppLifecycleState] = useState(AppState.currentState);

  /**
   * The one-shot boot-time server pull (`listMyFriends` + `getUserProfiles` +
   * `listEncryptedMessages`) still runs in the background after auth resolves.
   * Splash gating is owned by `useSignedInSession` (`showBootSplash`).
   * Notification pre-prompt + OS snapshot live in `useNotificationPermissionGate`.
   */
  const {
    notificationGateReady,
    showNotificationPrePrompt,
    notificationPrePromptBusy,
    osNotificationGranted,
    setOsNotificationGranted,
    onAllowNotificationsPrePrompt,
    onDeclineNotificationsPrePrompt,
  } = useNotificationPermissionGate({
    signedIn,
    sessionEmailRef,
    appLifecycleState,
    getBackendSession,
    waitForBackendSession,
  });

  useEffect(() => {
    return () => {
      autoReplyTimersRef.current.forEach((timer) => clearTimeout(timer));
      autoReplyTimersRef.current = [];
      if (messageSoundRef.current) {
        void messageSoundRef.current.unloadAsync();
        messageSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.background);
    if (Platform.OS === "android") {
      /* With edge-to-edge, background calls may no-op; system bar appearance still updates button style. */
      void NavigationBar.setBackgroundColorAsync(theme.background);
      void NavigationBar.setButtonStyleAsync(isDarkMode ? "light" : "dark");
    }
  }, [colorThemeId, theme.background, isDarkMode]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!reactionPickerOpen) return;
    void NavigationBar.setBackgroundColorAsync(theme.background);
    void NavigationBar.setButtonStyleAsync(isDarkMode ? "light" : "dark");
  }, [reactionPickerOpen, theme.background, isDarkMode]);

  /** Android edge-to-edge can report `insets.top` as 0; combine with status bar height. */
  const safeTop = Math.max(
    insets.top,
    Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(keyboardOverlapFromEvent(e));
      }
    );
    /** `keyboardDidHide` avoids leftover padding from KeyboardAvoidingView (bar stuck too high). */
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /** Full-screen overlays that manage their own keyboard — don't shift chat/post composers underneath. */
  const overlaySuppressesKeyboardAvoidance =
    photoEditorOpen ||
    imageCropVisible ||
    videoThumbnailModalOpen ||
    reactionPickerOpen;
  const composerKavEnabled = composerKeyboardAvoidanceEnabled(
    keyboardVisible,
    overlaySuppressesKeyboardAvoidance
  );

  const myProfileBioPin = useScrollPinnedInput({
    scrollRef: myProfileScrollRef,
    inputRef: bioInputRef,
    keyboardVisible,
    keyboardHeight,
    enabled:
      view.screen === "myProfile" &&
      (myBioTextEntryOpen || !myBio.trim()) &&
      !overlaySuppressesKeyboardAvoidance,
  });

  const publishCaptionPin = useScrollPinnedInput({
    scrollRef: publishPostScrollRef,
    inputRef: publishCaptionInputRef,
    keyboardVisible,
    keyboardHeight,
    enabled: view.screen === "publishPost" && !overlaySuppressesKeyboardAvoidance,
  });

  const styles = useMemo(() => makeStyles(theme), [theme]);

  const setPostMediaGalleryIndex = useCallback((postId: string, index: number) => {
    setPostMediaGalleryIndexByPostId((current) => ({ ...current, [postId]: index }));
  }, []);

  const openFullscreenMedia = useCallback(
    (
      uri: string,
      kind: "photo" | "gif" | "video",
      options?: {
        galleryUris?: string[];
        galleryIndex?: number;
        postId?: string;
        mediaWidth?: number;
        mediaHeight?: number;
      }
    ) => {
      Keyboard.dismiss();
      chatInputRef.current?.blur();
      // Post detail is a native Modal — close it before the full-screen media layer so
      // video does not open underneath and appear only after dismissing post view.
      setFullScreenPost(null);
      setPostFullscreenThreadReplyKey(null);
      const postId = options?.postId;
      const uris = options?.galleryUris ?? [];
      const maxIndex = Math.max(0, uris.length - 1);
      const galleryIndex = Math.max(0, Math.min(options?.galleryIndex ?? 0, maxIndex));
      const activeUri = uris[galleryIndex] ?? uri;
      if (postId) {
        setPostMediaGalleryIndex(postId, galleryIndex);
      }
      setFullscreenMedia({
        uri: activeUri,
        kind,
        mediaWidth: options?.mediaWidth,
        mediaHeight: options?.mediaHeight,
        galleryUris: uris.length > 0 ? uris : undefined,
        galleryIndex,
        postId,
      });
    },
    [setPostMediaGalleryIndex]
  );

  useEffect(() => {
    if (!EMAIL_OTP_ENABLED) return;
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
    if (persistPostsTimerRef.current) clearTimeout(persistPostsTimerRef.current);
    persistPostsTimerRef.current = setTimeout(() => {
      persistPostsTimerRef.current = null;
      void storageSetItem(
        postsStorageKeyForEmail(email),
        JSON.stringify(postsVisibleForCache(posts))
      ).catch(() => {
        logAppError("posts.persist", new Error("write failed"), { email });
      });
    }, 1800);
    return () => {
      if (persistPostsTimerRef.current) clearTimeout(persistPostsTimerRef.current);
    };
  }, [posts, signedIn, postsVisibleForCache]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    if (persistSocialTimerRef.current) clearTimeout(persistSocialTimerRef.current);
    persistSocialTimerRef.current = setTimeout(() => {
      persistSocialTimerRef.current = null;
      void storageSetItem(
        socialMessagingStorageKeyForEmail(email),
        JSON.stringify({
          savedAtMs: Date.now(),
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
    }, 2200);
    return () => {
      if (persistSocialTimerRef.current) clearTimeout(persistSocialTimerRef.current);
    };
  }, [chats, messages, hiddenChatIds, addedFriendsFromRitual, unfriendedIds, identityLockedChatIds, signedIn]);

  const persistSocialMessagingNow = useCallback(() => {
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email || DEMO_OFFLINE_MODE) return;
    void storageSetItem(
      socialMessagingStorageKeyForEmail(email),
      JSON.stringify({
        savedAtMs: Date.now(),
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
    const sub = AppState.addEventListener("change", (next) => {
      // #region agent log
      debugSessionLog("MainApp.tsx:AppState", "lifecycle change", "H3", {
        next,
        signedIn: signedInRef.current,
        hasFirebaseUser: Boolean(firebaseAuth.currentUser),
      });
      // #endregion
      setAppLifecycleState(next);
      if (next === "active" && signedInRef.current && !DEMO_OFFLINE_MODE) {
        void warmFirebaseIdToken();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    const id = setInterval(() => {
      void warmFirebaseIdToken();
    }, FIREBASE_ID_TOKEN_WARM_MS);
    return () => clearInterval(id);
  }, [signedIn]);

  // Track network reachability so profile screens can fall back to the cached
  // card and show "Not connected to internet" instead of an empty/stale feed.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const state = await ExpoNetwork.getNetworkStateAsync();
        if (!cancelled) setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
      } catch {
        /* leave previous value on transient error */
      }
    };
    void check();
    const id = setInterval(() => void check(), 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    void storageSetItem(lastViewStorageKey(email), JSON.stringify(view)).catch(() => {
      /* ignore */
    });
    if (view.screen === "home") {
      void storageSetItem(lastHomeTabStorageKey(email), homeTab).catch(() => {
        /* ignore */
      });
    }
  }, [view, signedIn, homeTab]);

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

  const resolveFriendProfileCard = useCallback(
    (friendId: string) => resolveFriendProfileCardFromMaps(friendId, friendMap),
    [friendMap, resolveFriendProfileCardFromMaps]
  );

  // Keep the persisted profile-card cache in step with the live roster so a
  // previously-seen friend's name/bio/avatar survive cold starts and offline.
  useEffect(() => {
    if (!signedIn) return;
    const email = sessionEmailRef.current?.trim().toLowerCase();
    if (!email) return;
    mergeRosterIntoCache(allFriends, email);
  }, [allFriends, signedIn, mergeRosterIntoCache]);

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
  const localAcceptedFriendIds = useMemo(
    () => new Set(friendLinksState[CURRENT_USER_ID] ?? []),
    [friendLinksState]
  );

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

  const resolveChatMemberFriendId = useCallback(
    (memberId: string) => {
      if (friendMap[memberId]) return memberId;
      const trimmed = memberId.trim();
      if (trimmed.startsWith("u_")) {
        return friendIdToBackendUid[trimmed] ?? (friendMap[trimmed] ? trimmed : memberId);
      }
      return memberId;
    },
    [friendMap, friendIdToBackendUid]
  );
  const resolvePd = useCallback(
    (friendId: string, chatId?: string) =>
      resolveParticipantDisplay(
        resolveChatMemberFriendId(friendId),
        friendMap,
        unfriendedIds,
        serverFriendUidsForDisplay,
        {
          chatId,
          identityLockedChatIds: identityLockedChatIdsSet,
          localAcceptedFriendIds,
        }
      ),
    [
      friendMap,
      unfriendedIds,
      serverFriendUidsForDisplay,
      identityLockedChatIdsSet,
      localAcceptedFriendIds,
      resolveChatMemberFriendId,
    ]
  );

  useEffect(() => {
    if (view.screen !== "friendProfile") return;
    if (resolvePd(view.friendId).canOpenProfile) return;
    setView(viewAfterLeavingFriendProfile(view));
  }, [view, resolvePd]);

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
    applyChats((current) => {
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

  const queueSharePostsWithNewFriend = useCallback((newFriendUid: string) => {
    if (DEMO_OFFLINE_MODE) return;
    if (!newFriendUid.startsWith("u_")) return;
    if (postsSharedWithFriendsRef.current.has(newFriendUid)) return;
    if (sharePostsBackfillStartedRef.current.has(newFriendUid)) return;
    const session = readBackendSessionFromRefs();
    if (!session) {
      pendingPostsShareFriendUidsRef.current.add(newFriendUid);
      return;
    }
    sharePostsBackfillStartedRef.current.add(newFriendUid);
    sharePostsWithNewFriendHandlerRef.current(newFriendUid);
  }, [readBackendSessionFromRefs]);

  const syncServerAcceptedFriendBackendUids = useCallback(
    (uids: Set<string>) => {
      setServerAcceptedFriendUids(uids);
      for (const uid of uids) {
        queueSharePostsWithNewFriend(uid);
      }
    },
    [queueSharePostsWithNewFriend, setServerAcceptedFriendUids]
  );
  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !osNotificationGranted) return;
    const session = getBackendSession();
    if (!session) return;
    void registerPushTokenWithBackend(session).catch((err) => {
      logAppError("push.register", err, {});
    });
  }, [signedIn, osNotificationGranted, getBackendSession, backendSessionReady]);

  /**
   * OS permission can change while the app is backgrounded (Settings). Re-check on
   * foreground so push tokens stay registered for chat/post alerts.
   */
  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    if (appLifecycleState !== "active") return;
    const session = getBackendSession();
    if (!session) return;
    void (async () => {
      const osStatus = await getOsNotificationPermissionStatus();
      const granted = isOsNotificationPermissionGranted(osStatus);
      setOsNotificationGranted(granted);
      if (!granted) return;
      const authUid = firebaseAuth.currentUser?.uid;
      if (authUid) {
        try {
          await callEmulatorFunction("registerFirebaseAuthUid", {
            uid: session.uid,
            deviceId: session.deviceId,
            firebaseAuthUid: authUid,
          });
        } catch (err) {
          logAppError("push.foreground.auth_map", err, { uid: session.uid });
        }
      }
      await registerPushTokenWithBackend(session);
    })().catch((err) => {
      logAppError("push.foreground.register", err, {});
    });
  }, [signedIn, appLifecycleState, getBackendSession, backendSessionReady]);

  const socialSnapshotUploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSocialSnapshotCloudBackup = useCallback(() => {
    if (DEMO_OFFLINE_MODE || !initialServerSyncDone) return;
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
        posts: postsVisibleForCache(postsRef.current),
        messagesWatermarkMs: messagesWatermarkMsRef.current,
        postsWatermarkMs: postsWatermarkMsRef.current,
      }).catch(() => undefined);
    }, 8_000);
  }, [DEMO_OFFLINE_MODE, getBackendSession, postsVisibleForCache, initialServerSyncDone]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !backendSessionReady || !initialServerSyncDone) return;
    scheduleSocialSnapshotCloudBackup();
  }, [chats, messages, posts, signedIn, backendSessionReady, initialServerSyncDone, scheduleSocialSnapshotCloudBackup]);

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !initialServerSyncDone) return;
    if (appLifecycleState !== "background" && appLifecycleState !== "inactive") return;
    const session = getBackendSession();
    if (!session) return;
    void uploadSocialSnapshotToCloud(session.uid, session.deviceId, {
      chats: chatsRef.current,
      messages: messagesRef.current,
      posts: postsVisibleForCache(postsRef.current),
      messagesWatermarkMs: messagesWatermarkMsRef.current,
      postsWatermarkMs: postsWatermarkMsRef.current,
    }).catch(() => undefined);
  }, [appLifecycleState, signedIn, initialServerSyncDone, getBackendSession, postsVisibleForCache]);

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
    pullEncryptedMessagesForConversation,
    resolveConversationId,
    resolveRecipientEncryptionKeys,
    refreshHiddenConversationIdsFromServer,
    rememberHiddenConversationIds,
  } = useMessagingSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    initialServerSyncDone,
    viewScreen: view.screen,
    homeTab: view.screen === "home" ? homeTab : undefined,
    activeChatLocalId:
      activeChatIdFromView(view),
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
    setChats: applyChats,
    setMessages: applyMessages,
    setHiddenChatIds,
    setEncryptedSyncState,
  });

  const { pullEncryptedPostsIncremental, loadMoreOlderPosts } = useFeedSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    initialServerSyncDone,
    viewScreen: view.screen,
    homeTab,
    appLifecycleState,
    feedRefreshing,
    feedLoadingMore,
    feedHasMore,
    feedPullNonce,
    getBackendSession,
    backendUidToFriendId,
    postsWatermarkMsRef,
    postsLastFullSyncAtRef,
    deletedPostIdsRef,
    initialServerSyncCompletedAtRef,
    persistWatermarksNow,
    setPosts,
    setEncryptedSyncState,
    setFeedRefreshing,
    setFeedLoadingMore,
    setFeedHasMore,
  });

  resolveRecipientEncryptionKeysRef.current = resolveRecipientEncryptionKeys;
  sharePostsWithNewFriendHandlerRef.current = (newFriendUid: string) => {
    if (DEMO_OFFLINE_MODE) return;
    const session = getBackendSession();
    if (!session) {
      sharePostsBackfillStartedRef.current.delete(newFriendUid);
      pendingPostsShareFriendUidsRef.current.add(newFriendUid);
      return;
    }
    void (async () => {
      try {
        const visibleIds = [
          ...new Set([
            ...friendsForFriendsList(
              addedFriendsFromRitualRef.current,
              unfriendedIdsRef.current
            ).map((f) => f.id),
            ...[...acceptedFriendBackendUidsRef.current].map((uid) => backendUidForFriendId(uid)),
          ]),
        ];
        const result = await shareOwnedPostsWithNewFriend({
          session,
          newFriendUid,
          allFriends: addedFriendsFromRitualRef.current,
          visibleFriendIds: visibleIds,
          serverFriendBackendUids: [...acceptedFriendBackendUidsRef.current],
          resolveRecipientEncryptionKeys: (recipientUids) =>
            resolveRecipientEncryptionKeysRef.current(recipientUids),
        });
        if (result.completedScan) {
          postsSharedWithFriendsRef.current.add(newFriendUid);
          const email = sessionEmailRef.current?.trim().toLowerCase();
          if (email) {
            void writePostsSharedWithFriends(email, postsSharedWithFriendsRef.current);
          }
        } else {
          sharePostsBackfillStartedRef.current.delete(newFriendUid);
        }
        await pullEncryptedPostsIncremental({
          forceFull: true,
          limit: ENCRYPTED_POSTS_PROFILE_SYNC_LIMIT,
        });
      } catch (err) {
        sharePostsBackfillStartedRef.current.delete(newFriendUid);
        logAppError("posts.share_with_new_friend.handler", err, { newFriendUid });
      }
    })();
  };

  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !backendSessionReady) return;
    const pending = [...pendingPostsShareFriendUidsRef.current];
    pendingPostsShareFriendUidsRef.current.clear();
    for (const uid of pending) {
      queueSharePostsWithNewFriend(uid);
    }
    for (const uid of acceptedFriendBackendUidsRef.current) {
      queueSharePostsWithNewFriend(uid);
    }
  }, [signedIn, backendSessionReady, queueSharePostsWithNewFriend]);

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
    if (!session || !signedIn || !backendSessionReady || DEMO_OFFLINE_MODE) return;
    const timer = setTimeout(() => {
      void callEmulatorFunction("upsertUserProfile", {
        uid: session.uid,
        deviceId: session.deviceId,
        bio: myBio,
      })
        .then(() => {
          const email = sessionEmailRef.current?.trim().toLowerCase();
          if (email) {
            void storageSetItem(profileBioStorageKey(email), myBio).catch(() => {});
          }
        })
        .catch(() => {
          // Do not block local profile editing on backend sync failure.
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [signedIn, backendSessionReady, myBio, getBackendSession]);

  useEffect(() => {
    const session = getBackendSession();
    if (!session || !signedIn) return;
    const httpsPicture = normalizeHttpsProfilePictureUrl(myProfilePictureUrl);
    // Local `file://` previews must not ship through encrypted sync — they normalize
    // to "" and would wipe friends' cached avatars before Storage upload finishes.
    if (!httpsPicture) return;
    const recipientUids = [
      session.uid,
      ...visibleFriendIds
        .map((id) => friendMap[id]?.backendUid?.trim())
        .filter((uid): uid is string => !!uid && uid.startsWith("u_")),
    ];
    const payload = {
      profilePictureUrl: httpsPicture,
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
    myProfilePictureUrl,
    visibleFriendIds,
    getBackendSession,
    resolveRecipientEncryptionKeys,
    friendMap,
  ]);

  useEncryptedProfileSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    getBackendSession,
    sessionEmailRef,
    myProfilePictureUrlRef,
    setMyProfilePictureUrl,
    addedFriendsFromRitualRef,
    setAddedFriendsFromRitual,
    setEncryptedSyncState,
  });

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
    stickyUnfriendedFriendIdsRef,
  });

  useInitialServerSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    setInitialServerSyncDone,
    getBackendSession,
    refreshHiddenConversationIdsFromServer,
    pullEncryptedMessagesIncremental,
    pullEncryptedMessagesForConversation,
    resolveConversationId,
    pullEncryptedPostsIncremental,
    setAddedFriendsFromRitual,
    setFriendLinksState,
    setChats: applyChats,
    setMessages: applyMessages,
    chatsRef,
    messagesRef,
    postsRef,
    addedFriendsFromRitualRef,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged: syncServerAcceptedFriendBackendUids,
    addUndirectedEdge,
    currentUserLocalId: CURRENT_USER_ID,
    currentUserId: CURRENT_USER_ID,
    unfriendedIdsRef,
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
    replaceInbox(migrated.chats, migrated.messages);
  }, [signedIn, backendSessionReady, getBackendSession, friendMap, friendIdToBackendUid, replaceInbox]);

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
    presenceRosterKey,
  });

  usePresenceFirestoreListener({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    getBackendSession,
    setPresenceOnlineByBackendUid,
  });

  /** Republish active presence when the server friend roster first becomes non-empty. */
  useEffect(() => {
    if (DEMO_OFFLINE_MODE || !signedIn || !backendSessionReady || !initialServerSyncDone) return;
    if (appLifecycleState !== "active") return;
    if (serverAcceptedFriendBackendUids.size === 0) return;
    const session = getBackendSession();
    if (!session) return;
    void publishActivePresence(session, Date.now()).catch((err) => {
      logAppError("presence.publish.roster_ready", err, { uid: session.uid });
    });
  }, [
    presenceRosterKey,
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    DEMO_OFFLINE_MODE,
    appLifecycleState,
    getBackendSession,
  ]);

  useEffect(() => {
    if (DEMO_OFFLINE_MODE || !signedIn || !initialServerSyncDone) return;
    const session = getBackendSession();
    if (!session) return;
    let cancelled = false;
    const run = async () => {
      try {
        const selfRes = await callEmulatorFunction<{
          profiles?: Record<string, { bio?: string } | null>;
        }>("getUserProfiles", {
          uid: session.uid,
          deviceId: session.deviceId,
          targetUids: [session.uid],
        });
        const selfProfile = selfRes.profiles?.[session.uid];
        if (selfProfile && typeof selfProfile.bio === "string") {
          setMyBio(selfProfile.bio);
          const email = sessionEmailRef.current?.trim().toLowerCase();
          if (email) {
            void storageSetItem(profileBioStorageKey(email), selfProfile.bio).catch(() => {});
          }
        }
      } catch {
        /* self profile refresh is best-effort */
      }

      const refreshed = await refreshFriendProfilesFromServer(
        session,
        addedFriendsFromRitualRef.current
      );
      if (cancelled) return;
      replaceFriendsIfChanged(refreshed);
    };
    void run();
    const id = setInterval(() => void run(), FRIEND_PROFILE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [signedIn, initialServerSyncDone, friendBackendUidsKey, getBackendSession, replaceFriendsIfChanged]);

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

  const displayedFeedPosts = useMemo(
    () => feedPosts.slice(0, feedDisplayLimit),
    [feedPosts, feedDisplayLimit]
  );

  const feedReactionListenPostIds = useMemo(() => {
    const ids = new Set(displayedFeedPosts.map((p) => p.id));
    if (fullScreenPost?.id) ids.add(fullScreenPost.id);
    return [...ids].slice(0, ENCRYPTED_POSTS_HOME_FEED_LIMIT);
  }, [displayedFeedPosts, fullScreenPost?.id]);

  useFeedReactionListeners({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    initialServerSyncDone,
    viewScreen: view.screen,
    homeTab,
    getBackendSession,
    backendUidToFriendId,
    listenPostIds: feedReactionListenPostIds,
    setPosts,
  });

  const markFeedPostsForMediaResolve = useCallback((postIds: string[]) => {
    if (postIds.length === 0) return;
    setFeedMediaResolveIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of postIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    markFeedPostsForMediaResolve(
      feedPosts.slice(0, FEED_UI_INITIAL_COUNT).map((post) => post.id)
    );
  }, [feedPosts, markFeedPostsForMediaResolve]);

  const loadMoreFeedPosts = useCallback(() => {
    const oldest = feedPosts[feedPosts.length - 1];
    if (!oldest) return;
    loadMoreOlderPosts(oldest.createdAt);
  }, [feedPosts, loadMoreOlderPosts]);

  const onFeedEndReached = useCallback(() => {
    if (feedDisplayLimit < feedPosts.length) {
      setFeedDisplayLimit((cur) =>
        Math.min(cur + FEED_UI_DISPLAY_PAGE_SIZE, feedPosts.length)
      );
      return;
    }
    loadMoreFeedPosts();
  }, [feedDisplayLimit, feedPosts.length, loadMoreFeedPosts]);

  const myProfilePosts = useMemo(
    () => sortedVisiblePosts.filter((post) => post.authorId === CURRENT_USER_ID),
    [sortedVisiblePosts]
  );

  const myProfileMediaPosts = useMemo(
    () =>
      myProfilePosts.filter(
        (post) =>
          (post.imageUris?.length ?? 0) > 0 ||
          (post.imageEncryptedMedia?.length ?? 0) > 0 ||
          !!post.videoUri ||
          !!post.videoEncryptedMedia
      ),
    [myProfilePosts]
  );

  const friendProfilePosts = useMemo(() => {
    if (view.screen !== "friendProfile") return [];
    return sortedVisiblePosts.filter((post) => post.authorId === view.friendId);
  }, [sortedVisiblePosts, view]);

  const friendProfileMediaPosts = useMemo(
    () =>
      friendProfilePosts.filter(
        (post) =>
          (post.imageUris?.length ?? 0) > 0 ||
          (post.imageEncryptedMedia?.length ?? 0) > 0 ||
          !!post.videoUri ||
          !!post.videoEncryptedMedia
      ),
    [friendProfilePosts]
  );

  const visibleMyProfileFeedPosts = useMemo(
    () => myProfilePosts.slice(0, profileFeedPostLimit),
    [myProfilePosts, profileFeedPostLimit]
  );

  const visibleFriendProfileFeedPosts = useMemo(
    () => friendProfilePosts.slice(0, profileFeedPostLimit),
    [friendProfilePosts, profileFeedPostLimit]
  );

  const myProfileFeedHasMore = myProfilePosts.length > visibleMyProfileFeedPosts.length;
  const friendProfileFeedHasMore =
    friendProfilePosts.length > visibleFriendProfileFeedPosts.length;

  const postGridLayout = useMemo(() => {
    const cols = 3;
    const gap = 2;
    const inner = windowWidth - 28;
    const cell = Math.floor((inner - gap * (cols - 1)) / cols);
    return { cols, gap, cell };
  }, [windowWidth]);

  /** After cold start, pre-decrypt own profile grid thumbs from on-disk cache. */
  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE || !initialServerSyncDone) return;
    if (myProfileMediaPosts.length === 0) return;
    void warmPostGridMediaCache(myProfileMediaPosts, { maxPosts: 36, priority: "normal" });
  }, [signedIn, initialServerSyncDone, myProfileMediaPosts]);

  /** Opening My Profile: jump thumbnail warm ahead of feed decrypt work. */
  useEffect(() => {
    if (!signedIn || DEMO_OFFLINE_MODE) return;
    if (view.screen !== "myProfile") return;
    if (myProfileMediaPosts.length === 0) return;
    void warmPostGridMediaCache(myProfileMediaPosts, { maxPosts: 36, priority: "high" });
  }, [signedIn, view.screen, myProfileMediaPosts]);

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

  const visibleThreadMessagesByChatId = useMemo(() => {
    const session = getBackendSession();
    return buildVisibleThreadMessagesByChatId({
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
      const aTs = chatListSortTimestampMs(
        a,
        lastMessageByChatId[a.id],
        visibleThreadMessagesByChatId[a.id] ?? []
      );
      const bTs = chatListSortTimestampMs(
        b,
        lastMessageByChatId[b.id],
        visibleThreadMessagesByChatId[b.id] ?? []
      );
      return bTs - aTs;
    });
  }, [chats, lastMessageByChatId, visibleThreadMessagesByChatId, hiddenChatIds]);

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
  const visibleSortedChats = useMemo(
    () => filterChatsVisibleInInbox(sortedChats, lastMessageByChatId, unfriendedIds, CURRENT_USER_ID),
    [sortedChats, lastMessageByChatId, unfriendedIds]
  );

  useEffect(() => {
    if (!initialServerSyncDone || DEMO_OFFLINE_MODE || !signedIn) return;
    const session = getBackendSession();
    const openChatLocalId =
      activeChatIdFromView(view);
    const retained = retainedMessageChatIds({
      chats,
      messages,
      sessionAppUid: session?.uid ?? null,
      friendMap,
      friendIdToBackendUid,
      currentUserId: CURRENT_USER_ID,
      currentUserLocalId: CURRENT_USER_LOCAL_ID,
      unfriendedIds,
      openChatLocalId,
    });
    const exemptChatIds = new Set<string>();
    if (openChatLocalId) {
      if (session?.uid) {
        for (const id of localChatIdsForDirectThread(
          openChatLocalId,
          chats,
          session.uid,
          friendMap,
          friendIdToBackendUid
        )) {
          exemptChatIds.add(id);
        }
      } else {
        exemptChatIds.add(openChatLocalId);
      }
    }
    applyMessages((current) => {
      const trimmed = trimInMemoryMessages(current, retained, CHAT_INITIAL_MESSAGE_LIMIT, {
        exemptChatIds,
      });
      const curSig = current
        .map((m) => m.id)
        .sort()
        .join("\n");
      const triSig = trimmed
        .map((m) => m.id)
        .sort()
        .join("\n");
      return curSig === triSig ? current : trimmed;
    });
  }, [
    initialServerSyncDone,
    signedIn,
    chats,
    messages.length,
    visibleSortedChats,
    unfriendedIds,
    view,
    friendMap,
    friendIdToBackendUid,
    getBackendSession,
  ]);

  /**
   * Number of chats with unread incoming messages — drives the red badge on the
   * chat nav icon. A chat is unread when its latest visible message is from
   * someone else and arrived after my read watermark (`readBy[myUid]`). The
   * currently-open chat and muted chats never count.
   */
  const unreadChatIdSet = useMemo(() => {
    if (!backendSessionReady) return new Set<string>();
    const session = getBackendSession();
    const myUid = session?.uid ?? null;
    if (!myUid) return new Set<string>();
    const openChatId = activeChatIdFromView(view);
    const unread = new Set<string>();
    for (const chat of visibleSortedChats) {
      if (chat.mutedForNotifications) continue;
      if (chat.id === openChatId) continue;
      const last = lastMessageByChatId[chat.id];
      if (
        isIncomingChatUnread({
          chat,
          lastMessage: last,
          myUid,
          currentUserId: CURRENT_USER_ID,
          currentUserLocalId: CURRENT_USER_LOCAL_ID,
        })
      ) {
        unread.add(chat.id);
      }
    }
    return unread;
  }, [visibleSortedChats, lastMessageByChatId, view, getBackendSession, backendSessionReady]);

  const unreadChatCount = unreadChatIdSet.size;

  const onHomeFeedTab = view.screen === "home" && homeTab === "feed";

  const unreadFeedReactionCount = useMemo(() => {
    if (onHomeFeedTab) return 0;
    const session = getBackendSession();
    return countUnreadFeedReactionPosts(
      posts,
      CURRENT_USER_ID,
      session?.uid ?? null,
      seenFeedReactionSigByPostId
    );
  }, [onHomeFeedTab, posts, seenFeedReactionSigByPostId, getBackendSession]);

  const homeNavBadges = useMemo(
    () => ({ chats: unreadChatCount, feed: unreadFeedReactionCount }),
    [unreadChatCount, unreadFeedReactionCount]
  );

  useEffect(() => {
    if (!onHomeFeedTab) return;
    const session = getBackendSession();
    setSeenFeedReactionSigByPostId((current) =>
      markOwnedPostReactionsSeen(posts, CURRENT_USER_ID, session?.uid ?? null, current)
    );
  }, [onHomeFeedTab, posts, getBackendSession]);

  const pendingDraft =
    pendingDraftFromView(view);

  const resolvedChat = useMemo(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return null;
    const byViewId = chats.find((c) => c.id === view.chatId);
    if (byViewId) return byViewId;
    const session = getBackendSession();
    if (session && !DEMO_OFFLINE_MODE) {
      const threadIds = localChatIdsForDirectThread(
        view.chatId,
        chats,
        session.uid,
        friendMap,
        friendIdToBackendUid
      );
      return chats.find((c) => threadIds.has(c.id)) ?? null;
    }
    return null;
  }, [chats, view, friendMap, friendIdToBackendUid, getBackendSession]);

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
    activeChatIdFromView(view) ?? undefined;
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
      if (activeChatIdentityLocked) return TOMBSTONE_DISPLAY_NAME;
      const counterpartId = resolveChatMemberFriendId(activeCounterpartIds[0]);
      const pd = resolvePd(counterpartId, activeChatId);
      if (!pd.canOpenProfile) return TOMBSTONE_DISPLAY_NAME;
      return pd.displayName;
    }
    if (activeCounterpartIds.length > 1) {
      if (resolvedChat?.isCustomName) return resolvedChat.name;
      if (pendingDraft?.standardGroupTitle === "custom") {
        return (
          pendingDraft.name?.trim() ||
          chatNameFromFriendIds(activeCounterpartIds, (id) => resolvePd(id).displayName)
        );
      }
      return chatNameFromFriendIds(activeCounterpartIds, (id) => resolvePd(id).displayName);
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
    resolveChatMemberFriendId,
    unfriendedIds,
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
  const isActiveBroadcastCreator =
    activeChatKind === "broadcast" &&
    !!resolvedChat &&
    isBroadcastCreator(resolvedChat, CURRENT_USER_ID);
  const isActiveBroadcastRecipient =
    activeChatKind === "broadcast" &&
    !!resolvedChat &&
    !isBroadcastCreator(resolvedChat, CURRENT_USER_ID);
  const broadcastRecipientComposerLocked =
    isActiveBroadcastRecipient && !replyTargetMessage;
  const editingMessage = editingMessageId ? messageById[editingMessageId] : undefined;

  const buildComposerHeaderTitle = () => {
    if (composerMode === "broadcast") {
      return composerCustomTitle.trim() || "Broadcast";
    }
    if (composerCustomTitle.trim()) {
      return composerCustomTitle.trim();
    }
    if (selectedComposerIds.length === 0) return "Start Chat";
    return chatNameFromFriendIds(selectedComposerIds, (id) => resolvePd(id).displayName);
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

  /** Only mount a window of rows even when more messages are already in memory. */
  const invertedChatMessagesForList = useMemo(
    () => invertedChatMessages.slice(0, chatListDisplayLimit),
    [invertedChatMessages, chatListDisplayLimit]
  );

  const chatListCanExpandLocally = invertedChatMessages.length > chatListDisplayLimit;

  const activeChatIdForPagination =
    activeChatIdFromView(view);

  /** Enable scroll-up when more rows are in memory or the server may have older history. */
  const chatPaginationEnabled = Boolean(
    activeChatIdForPagination &&
      (chatListCanExpandLocally ||
        chatHasMoreOlder[activeChatIdForPagination] !== false)
  );

  /** FlatList extraData — avoid passing the global `messages` array (re-renders every row on any chat update). */
  const activeChatListRenderKey = useMemo(() => {
    const last = activeChatMessages[activeChatMessages.length - 1];
    return `${activeChatMessages.length}:${last?.id ?? ""}:${last?.deliveryStatus ?? ""}:${last?.createdAt ?? 0}`;
  }, [activeChatMessages]);

  const activeChatForRead = useMemo(() => {
    const onChatThread = view.screen === "chat" || view.screen === "chatSharedMedia";
    if (!onChatThread || !("chatId" in view)) return null;
    const byViewId = chats.find((c) => c.id === view.chatId);
    if (byViewId) return byViewId;
    const session = getBackendSession();
    if (session && !DEMO_OFFLINE_MODE) {
      const threadIds = localChatIdsForDirectThread(
        view.chatId,
        chats,
        session.uid,
        friendMap,
        friendIdToBackendUid
      );
      return chats.find((c) => threadIds.has(c.id)) ?? null;
    }
    return null;
  }, [chats, view, friendMap, friendIdToBackendUid, getBackendSession]);

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
    const paginationBeforeMs =
      chatPaginationBeforeMsRef.current[chatId] ?? oldest?.createdAt;
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
        beforeMs: paginationBeforeMs,
        limit: CHAT_OLDER_MESSAGES_PAGE_SIZE,
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
            mediaTier?: number | null;
            mediaObjectPath?: string | null;
            mediaKeyB64?: string | null;
            mediaNonceB64?: string | null;
            mediaContentType?: string | null;
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
          const parsedMedia = parseMessageMediaFromPlain(plain);
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
            mediaUri: parsedMedia.mediaUri,
            mediaEncrypted: parsedMedia.mediaEncrypted,
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
        applyMessages((current) => mergeSyncedMessages(current, decoded, { incremental: true, optimisticWindowMs: 120_000 }));
      }
      const fetchedCount = res.items?.length ?? 0;
      if (fetchedCount > 0) {
        setChatListDisplayLimit((current) =>
          current + Math.max(decoded.length, CHAT_UI_DISPLAY_PAGE_SIZE)
        );
      }
      if (fetchedCount === 0) {
        setChatHasMoreOlder((current) => ({ ...current, [chatId]: false }));
      } else if (decoded.length === 0) {
        const oldestFetchedMs = Math.min(
          ...(res.items ?? []).map((item) => item.createdAtMs ?? Number.MAX_SAFE_INTEGER)
        );
        if (
          Number.isFinite(oldestFetchedMs) &&
          oldestFetchedMs < Number.MAX_SAFE_INTEGER &&
          oldestFetchedMs !== paginationBeforeMs
        ) {
          chatPaginationBeforeMsRef.current[chatId] = oldestFetchedMs;
          setChatHasMoreOlder((current) => ({
            ...current,
            [chatId]: Boolean(res.hasMore),
          }));
        } else {
          setChatHasMoreOlder((current) => ({ ...current, [chatId]: false }));
        }
      } else {
        const decodedOldestMs = decoded.reduce(
          (min, row) => Math.min(min, row.createdAt),
          Number.MAX_SAFE_INTEGER
        );
        if (decodedOldestMs < Number.MAX_SAFE_INTEGER) {
          chatPaginationBeforeMsRef.current[chatId] = decodedOldestMs;
        }
        setChatHasMoreOlder((current) => ({
          ...current,
          [chatId]: Boolean(res.hasMore),
        }));
      }
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
    if (view.screen !== "chat" || !("chatId" in view)) return;
    setChatListDisplayLimit(CHAT_UI_INITIAL_DISPLAY_COUNT);
    delete chatPaginationBeforeMsRef.current[view.chatId];
  }, [view]);

  useEffect(() => {
    if (view.screen !== "myProfile" && view.screen !== "friendProfile") return;
    setProfileFeedPostLimit(PROFILE_FEED_POSTS_INITIAL);
  }, [view]);

  const handleChatListEndReached = useCallback(() => {
    if (view.screen !== "chat" || !("chatId" in view)) return;
    const chatId = view.chatId;
    if (invertedChatMessages.length > chatListDisplayLimit) {
      setChatListDisplayLimit((current) => current + CHAT_UI_DISPLAY_PAGE_SIZE);
      return;
    }
    if (chatHasMoreOlder[chatId] === false) return;
    if (chatEndReachedBusyRef.current || chatLoadingOlder) return;
    chatEndReachedBusyRef.current = true;
    void loadOlderChatMessages().finally(() => {
      chatEndReachedBusyRef.current = false;
    });
  }, [
    view,
    invertedChatMessages.length,
    chatListDisplayLimit,
    chatHasMoreOlder,
    chatLoadingOlder,
    loadOlderChatMessages,
  ]);

  const loadMoreProfileFeedPosts = useCallback(() => {
    setProfileFeedPostLimit((current) => current + PROFILE_FEED_POSTS_PAGE_SIZE);
  }, []);

  useEffect(() => {
    if (view.screen !== "chat" || !("chatId" in view) || DEMO_OFFLINE_MODE) return;
    const chatRowId = activeChatForRead?.id ?? view.chatId;
    const session = getBackendSession();
    if (!session) return;
    const db = getFirestoreDb();
    const conversationDocId = resolveConversationId(chatRowId);
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
      applyChats((current) =>
        current.map((c) =>
          c.id === chatRowId
            ? {
                ...c,
                readBy: mergeReadByMaps(c.readBy, data.readBy),
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
  }, [view, activeChatForRead?.id, getBackendSession, resolveConversationId, friendIdToBackendUid]);

  const activeChatLatestMessage = activeChatMessages[activeChatMessages.length - 1] ?? null;
  const activeChatReadTargetRef = useRef<{ chatId: string; message: Message } | null>(null);

  useEffect(() => {
    if (view.screen !== "chat" || !activeChatLatestMessage || !("chatId" in view)) return;
    activeChatReadTargetRef.current = {
      chatId: activeChatForRead?.id ?? view.chatId,
      message: activeChatLatestMessage,
    };
  }, [view, activeChatForRead?.id, activeChatLatestMessage?.id, activeChatLatestMessage?.createdAt]);

  const activeChatSharedMedia = useMemo(
    () =>
      activeChatMessages.filter(
        (m) =>
          messageHasResolvableMedia(m) &&
          !m.unsentAt &&
          (m.kind === "photo" || m.kind === "gif" || m.kind === "video")
      ),
    [activeChatMessages]
  );
  const pushChatReadPositionToServer = useCallback(
    (chatRowId: string, readMessage: Message) => {
      if (DEMO_OFFLINE_MODE) return;
      const session = getBackendSession();
      if (!session) return;
      void callEmulatorFunction("updateConversationReadPosition", {
        uid: session.uid,
        deviceId: session.deviceId,
        conversationId: resolveConversationId(chatRowId),
        lastReadAtMs: readMessage.createdAt,
        lastReadMessageId: readMessage.id,
      }).catch((err) => {
        logAppError("chat.read_position.update", err, { chatId: chatRowId });
      });
    },
    [DEMO_OFFLINE_MODE, getBackendSession, resolveConversationId]
  );

  useEffect(() => {
    if (view.screen !== "chat" || !activeChatLatestMessage || DEMO_OFFLINE_MODE) return;
    if (!("chatId" in view)) return;
    if (
      activeChatLatestMessage.senderId === CURRENT_USER_ID &&
      activeChatLatestMessage.deliveryStatus === "sending"
    ) {
      return;
    }
    const chatRowId = activeChatForRead?.id ?? view.chatId;
    const message = activeChatLatestMessage;
    const task = InteractionManager.runAfterInteractions(() => {
      pushChatReadPositionToServer(chatRowId, message);
    });
    return () => task.cancel();
  }, [
    view,
    activeChatForRead?.id,
    activeChatLatestMessage?.id,
    activeChatLatestMessage?.createdAt,
    activeChatLatestMessage?.senderId,
    activeChatLatestMessage?.deliveryStatus,
    pushChatReadPositionToServer,
  ]);

  const prevViewRef = useRef(view);
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (prev.screen !== "chat" || !("chatId" in prev)) return;
    if (view.screen === "chat" && "chatId" in view && view.chatId === prev.chatId) return;
    const stored = activeChatReadTargetRef.current;
    if (stored) {
      pushChatReadPositionToServer(stored.chatId, stored.message);
    }
  }, [view, pushChatReadPositionToServer]);

  const availableComposerFriends = useMemo(
    () =>
      availableStartChatFriends({
        allFriends,
        unfriendedIds,
        selectedComposerIds,
        composerSearch,
        composerMode,
        friendLinksState,
      }),
    [composerMode, composerSearch, selectedComposerIds, unfriendedIds, allFriends, friendLinksState]
  );

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
    clearSignedOutSocialState({
      resetMessagingState,
      resetPosts,
      resetFriendsState,
      resetMyProfile,
      resetFeedPrefs,
      deletedPostIdsRef,
      recipientKeyCacheRef,
      messagesWatermarkMsRef,
      messagesLastFullSyncAtRef,
      postsWatermarkMsRef,
      postsLastFullSyncAtRef,
      sharePostsBackfillStartedRef,
      pendingPostsShareFriendUidsRef,
      postsSharedWithFriendsRef,
    });
  }, [resetMessagingState, resetPosts, resetFriendsState, resetMyProfile, resetFeedPrefs]);

  const resetLocalStateForCurrentUser = useCallback(() => {
    resetCurrentUserLocalState({
      sessionEmailRef,
      resetLocalSocialStateForSignedOut,
      setView,
      setHomeTab,
    });
  }, [resetLocalSocialStateForSignedOut]);

  const initializeBackendSessionForAccount = useCallback(
    async (account: MockAuthAccount) => {
      await initializeBackendSessionForAccountImpl(account, {
        markSessionReady,
        recipientKeyCacheRef,
        setEncryptedSyncState,
        localSocialCacheSavedAtMsRef,
        deletedPostIdsRef,
        applyChats,
        applyMessages,
        setPosts,
        messagesWatermarkMsRef,
        postsWatermarkMsRef,
        messagesLastFullSyncAtRef,
        postsLastFullSyncAtRef,
        myDisplayNameRef,
        hydrateMyProfile,
        refreshHiddenConversationIdsFromServer,
      });
    },
    [refreshHiddenConversationIdsFromServer, markSessionReady, hydrateMyProfile]
  );

  const retryInitializeBackendForAccount = useCallback(
    (account: MockAuthAccount) =>
      retryInitializeBackendSession(account, {
        initializeBackendSessionForAccount,
        setEncryptedSyncState,
      }),
    [initializeBackendSessionForAccount]
  );

  const applySignedInAccount = useCallback(
    (account: MockAuthAccount) =>
      restoreSignedInAccount(account, {
        sessionEmailRef,
        setSeenFeedReactionSigByPostId,
        postsSharedWithFriendsRef,
        sharePostsBackfillStartedRef,
        messagesWatermarkMsRef,
        messagesLastFullSyncAtRef,
        postsWatermarkMsRef,
        postsLastFullSyncAtRef,
        deletedPostIdsRef,
        recipientKeyCacheRef,
        localSocialCacheSavedAtMsRef,
        setHiddenChatIds,
        hiddenServerConversationIdsRef,
        replaceInbox,
        setPosts,
        setIdentityLockedChatIds,
        hydrateFriends,
        setPresenceOnlineByBackendUid,
        setFeedMutedUntilByFriendId,
        hydrateMyProfile,
        setInitialServerSyncDone,
        markSignedIn,
        setAuthMode,
        setView,
        setHomeTab,
        setDemoPendingAddableQueue,
        markSessionReady,
        setEncryptedSyncState,
        backendInitGenerationRef,
        initializeBackendSessionForAccount,
        retryInitializeBackendForAccount,
        clearSession,
        logoutRef,
      }),
    [initializeBackendSessionForAccount, retryInitializeBackendForAccount, markSessionReady, clearSession, hydrateFriends, hydrateMyProfile, markSignedIn]
  );

  const applySignedInAccountRef = useRef(applySignedInAccount);
  applySignedInAccountRef.current = applySignedInAccount;

  useEffect(() => {
    if (DEMO_OFFLINE_MODE) {
      markAppBootAuthResolved();
      return () => {};
    }
    let nullAuthTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelNullAuthDrop = () => {
      if (nullAuthTimer) {
        clearTimeout(nullAuthTimer);
        nullAuthTimer = null;
      }
    };
    const dropSignedInUi = () => {
      if (!signedInRef.current) return;
      const navEmail = sessionEmailRef.current;
      if (navEmail) {
        void storageRemoveItem(lastViewStorageKey(navEmail)).catch(() => {
          /* ignore */
        });
        void storageRemoveItem(lastHomeTabStorageKey(navEmail)).catch(() => {
          /* ignore */
        });
      }
      sessionEmailRef.current = null;
      sessionTokenRef.current = null;
      resetLocalSocialStateForSignedOut();
      signedInRef.current = false;
      isRestoringAuthRef.current = false;
      backendInitGenerationRef.current += 1;
      clearSession();
      setTelemetryContext({ uid: null, deviceId: null });
      setSignedIn(false);
      setView({ screen: "home" });
      setAuthMode("login");
      resetSyncChannelsIdle();
      debugSessionLog(
        "MainApp.tsx:onAuthStateChanged",
        "cleared signed-in UI from null auth event",
        "H1",
        { hadSessionEmail: Boolean(navEmail) }
      );
    };
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      // #region agent log
      debugSessionLog("MainApp.tsx:onAuthStateChanged", "auth state event", "H1", {
        hasEventUser: Boolean(user),
        hasEventEmail: Boolean(user?.email?.trim()),
        hasCurrentUser: Boolean(firebaseAuth.currentUser),
        hasCurrentEmail: Boolean(firebaseAuth.currentUser?.email?.trim()),
        signedInRef: signedInRef.current,
        isRestoring: isRestoringAuthRef.current,
        bootResolved: appBootAuthResolvedRef.current,
      });
      // #endregion
      if (!user?.email) {
        if (signedInRef.current) {
          const stillSignedIn = firebaseAuth.currentUser?.email?.trim();
          if (stillSignedIn) {
            cancelNullAuthDrop();
            // #region agent log
            debugSessionLog(
              "MainApp.tsx:onAuthStateChanged",
              "ignored spurious null auth event",
              "H5",
              { signedInRef: true }
            );
            // #endregion
            return;
          }
          // Token refresh emits a transient null. Wait, then drop only if the user and the persisted blob are both gone.
          cancelNullAuthDrop();
          nullAuthTimer = setTimeout(() => {
            nullAuthTimer = null;
            void (async () => {
              if (!signedInRef.current) return;
              if (firebaseAuth.currentUser?.email?.trim()) return;
              const keep = await firebaseSessionSurvivesNullEvent();
              if (!signedInRef.current) return;
              if (keep || firebaseAuth.currentUser?.email?.trim()) {
                debugSessionLog(
                  "MainApp.tsx:onAuthStateChanged",
                  "kept signed-in UI after null auth event",
                  "H5",
                  { keep }
                );
                return;
              }
              dropSignedInUi();
            })();
          }, NULL_AUTH_GRACE_MS);
        }
        markAppBootAuthResolved();
        return;
      }
      cancelNullAuthDrop();
      if (signedInRef.current || isRestoringAuthRef.current) {
        // #region agent log
        debugSessionLog(
          "MainApp.tsx:onAuthStateChanged",
          "skipped restore (already signed in or restoring)",
          "H5",
          {
            signedInRef: signedInRef.current,
            isRestoring: isRestoringAuthRef.current,
          }
        );
        // #endregion
        return;
      }
      isRestoringAuthRef.current = true;
      const restoredEmail = user.email;
      void (async () => {
        try {
          if (!restoredEmail) return;
          const email = restoredEmail.trim().toLowerCase();
          sessionEmailRef.current = email;
          const persistedUsername =
            (await storageGetItem(profileUsernameStorageKey(email)))?.trim() ?? "";
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

    const restoreFallbackTimer = setTimeout(() => {
      if (signedInRef.current || isRestoringAuthRef.current) return;
      const persistedEmail = firebaseAuth.currentUser?.email?.trim().toLowerCase();
      if (!persistedEmail) return;
      isRestoringAuthRef.current = true;
      sessionEmailRef.current = persistedEmail;
      void (async () => {
        try {
          const persistedUsername =
            (await storageGetItem(profileUsernameStorageKey(persistedEmail)))?.trim() ?? "";
          const account: MockAuthAccount = {
            email: persistedEmail,
            password: "",
            username: persistedUsername,
            phoneNumber: "",
            bio: "",
            profilePictureUrl: null,
          };
          logAppEvent("auth.restore_session_fallback", { email: persistedEmail });
          await applySignedInAccountRef.current(account);
        } catch {
          /* ignore — user can sign in manually */
        } finally {
          isRestoringAuthRef.current = false;
          markAppBootAuthResolved();
        }
      })();
    }, 1200);

    return () => {
      cancelNullAuthDrop();
      clearTimeout(restoreFallbackTimer);
      unsub();
    };
  }, [resetLocalSocialStateForSignedOut, markAppBootAuthResolved, clearSession]);

  const logout = () => {
    logoutSignedInAccount({
      sessionEmailRef,
      backendInitGenerationRef,
      sessionTokenRef,
      resetLocalSocialStateForSignedOut,
      signedInRef,
      backendAuthUidRef,
      backendDeviceIdRef,
      clearSession,
      resetSyncChannelsIdle,
      setSignedIn,
      setView,
      setChatOverflowOpen,
      setMembersModalOpen,
      setAuthMode,
      setIssuedOtpCode,
      setIssuedOtpForEmail,
      setSignupOtp,
      setLoginOtp,
    });
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
      void storageRemoveItem(lastViewStorageKey(navEmail)).catch(() => {
        /* ignore */
      });
      void storageRemoveItem(lastHomeTabStorageKey(navEmail)).catch(() => {
        /* ignore */
      });
    }
    sessionTokenRef.current = null;
    sessionEmailRef.current = null;
    resetLocalSocialStateForSignedOut();
    logAppEvent("auth.session_replaced", {});
    clearSession();
    setTelemetryContext({ uid: null, deviceId: null });
    resetSyncChannelsIdle();
    signedInRef.current = false;
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

  const {
    loginDemoOrSubmit,
    requestLoginOtpCode,
    completeLoginWithOtp,
    requestSignupOtp,
    startSignup,
    completeSignupWithOtp,
  } = createAccountAuthActions({
    loginEmail,
    loginPassword,
    signupEmail,
    signupPassword,
    signupPasswordConfirm,
    signupUsername,
    signupPhoneNumber,
    loginOtp,
    signupOtp,
    issuedOtpCode,
    issuedOtpForEmail,
    setLoginOtp,
    setSignupOtp,
    setIssuedOtpCode,
    setIssuedOtpForEmail,
    setAuthMode,
    sessionEmailRef,
    myDisplayNameRef,
    applySignedInAccount,
  });
  const toggleSelectAllBroadcastFriends = () => {
    toggleSelectAllBroadcast(allFriends.map((friend) => friend.id));
  };

  const resolvedStoredChatListTitle = useCallback(
    (chat: Chat) => storedChatListTitle(chat, resolvePd, identityLockedChatIdsSet),
    [resolvePd, identityLockedChatIdsSet]
  );

  const {
    buildDefaultChatName,
    continueToBroadcastDraft,
    handleBroadcastGroupNameConfirm,
    goToChat,
    goToPendingDraftChat,
    createOrOpenChat,
    onPressCreateStandardChat,
    findOrCreateChatWithFriend,
    openChatFromHome,
  } = createOpenOrCreateChatActions({
    composerCustomTitle,
    composerMode,
    selectedComposerIds,
    allFriends,
    chats,
    savedBroadcastGroups,
    pendingBroadcastCreateIds,
    broadcastGroupNameDraft,
    broadcastPickerOpen,
    friendMap,
    friendIdToBackendUid,
    identityLockedChatIdsSet,
    unfriendedIds,
    serverAcceptedFriendBackendUids,
    hiddenChatIdsRef,
    hiddenServerConversationIdsRef,
    resolvePd,
    resolveChatMemberFriendId,
    getBackendSession,
    normalizeSet,
    upsertChat,
    unhideChatId,
    openDirectChat,
    commitSavedBroadcastGroup,
    beginGroupTitleStep,
    closeComposer,
    closeBroadcastPicker,
    setView,
    setChatInputSynced,
    setShouldFocusChatInput,
    setChatOverflowOpen,
    setMembersModalOpen,
    setChatSearchVisible,
    setChatSearch,
    setSelectedBroadcastThreadFriendId,
    setReplyTargetMessageId,
    setEditingMessageId,
    setPendingBroadcastCreateIds,
    setSaveBroadcastGroupPromptOpen,
  });


  usePushNotificationRouting({
    signedIn,
    goToChat,
    openHomeFeedFromNav,
    pullEncryptedMessagesForConversation,
    pullEncryptedMessagesIncremental,
    pullEncryptedPostsIncremental,
  });


  const { openFriendProfile, openFriendProfileFromFriendsList } = createOpenFriendProfileActions({
    view,
    friendMap,
    resolvePd,
    friendHasCachedProfile: (friendId) => friendHasCachedProfileFromMaps(friendId, friendMap),
    getBackendSession,
    waitForBackendSession,
    addedFriendsFromRitualRef,
    replaceFriendsIfChanged,
    setChatOverflowOpen,
    setView,
  });

  const openFriendsListFromHome = useCallback(() => {
    setFriendsListSearch("");
    goToFriendsListFromHome();
  }, [goToFriendsListFromHome]);

  const openAddFriendFromHome = goToAddFriend;

  const openSettingsScreen = goToSettings;

  const {
    ensurePairingLocationPermission,
    ensurePairingCameraPermission,
    pairingRegisterPinWithRetryParent,
    pairingAwaitPinRedeemParent,
    pairingConfirmPinReadParent,
    pairingConfirmRedeemerDualConfirmParent,
    pairingAwaitIssuerFinalConfirmParent,
    pairingFinalizePinOfferParent,
    pairingCancelPinOfferParent,
    pairingPollOfferStillPresentParent,
    pairingGetOfferStatusParent,
  } = useAddFriendPairing({
    sessionEmailRef,
    getBackendSession,
    waitForBackendSession,
    acceptFriend,
    syncServerAcceptedFriendBackendUids,
    acceptedFriendBackendUidsRef,
    persistSocialMessagingNow,
    demoPendingAddableQueue,
    setDemoPendingAddableQueue,
  });

  /**
   * Swipe between main top-nav screens with a follow-the-finger page slide.
   * Feed swipes from anywhere except a multi-image carousel (single photos still switch views).
   */
  const openMyProfile = goToMyProfile;
  const homeTabRef = useRef(homeTab);
  homeTabRef.current = homeTab;
  const feedCarouselTouchRef = useRef(false);

  const goToMainNavSurface = useCallback((surface: MainNavSurface) => {
    switch (surface) {
      case "myProfile":
        openMyProfile();
        break;
      case "friendsList":
        openFriendsListFromHome();
        break;
      case "chats":
        openHomeChatsFromNav();
        break;
      case "feed":
        openHomeFeedFromNav();
        break;
      case "addFriend":
        openAddFriendFromHome();
        break;
      case "settings":
        openSettingsScreen();
        break;
    }
  }, [
    openAddFriendFromHome,
    openFriendsListFromHome,
    openHomeChatsFromNav,
    openHomeFeedFromNav,
    openMyProfile,
    openSettingsScreen,
  ]);

  const {
    incoming: mainNavIncoming,
    isSurfaceVisible,
    slideStyle: mainNavSlideStyle,
    onDragMove,
    onDragRelease,
    isHomeToHome,
  } = useMainNavSlide({
    getCurrent: () => mainNavSurfaceFromView(viewRef.current, homeTabRef.current),
    goToSurface: goToMainNavSurface,
    getWidth: () => windowWidth,
  });

  const mainNavSwipePan = useMemo(
    () =>
      createMainNavSwipePan({
        getSurface: () => mainNavSurfaceFromView(viewRef.current, homeTabRef.current),
        getMinPageY: () => safeTop + 52,
        getChatsOnlineStripMaxY: () => safeTop + 148,
        isCarouselTouch: () => feedCarouselTouchRef.current,
        onMove: onDragMove,
        onRelease: onDragRelease,
      }),
    [onDragMove, onDragRelease, safeTop]
  );

  const currentMainNav = mainNavSurfaceFromView(view, homeTab);
  const incomingMainNav = mainNavIncoming?.surface ?? null;
  const homeColumnSlideSurface: MainNavSurface | null = isHomeToHome
    ? null
    : isSurfaceVisible("chats") && currentMainNav === "chats"
      ? "chats"
      : isSurfaceVisible("feed") && currentMainNav === "feed"
        ? "feed"
        : isSurfaceVisible("chats")
          ? "chats"
          : isSurfaceVisible("feed")
            ? "feed"
            : null;

  const pickProfileImage = () => pickProfilePhoto({ openPhotoEditorDirect });

  const pickCreateGroupPicture = () => pickGroupPicture({ beginGroupPictureCrop });

  const closePublishPostScreen = useCallback(() => {
    goHome("feed");
  }, [goHome]);

  const pickPostPhotos = () =>
    pickPostPhotoDraft({ openPhotoEditorDirect, setPostDraftVideoUri });

  const capturePostPhoto = () =>
    capturePostPhotoDraft({ openPhotoEditorDirect, setPostDraftVideoUri });

  const promptPostPhotoSource = () =>
    promptPostPhotoDraft({ openPhotoEditorDirect, setPostDraftVideoUri });

  const pickPostVideo = () =>
    choosePostVideo({
      setPostDraftImageUris,
      setPostDraftImageCaptions,
      setPostDraftVideoUri,
    });

  const confirmDeletePost = (post: Post) => {
    confirmDeleteOwnedPost(post, {
      setFullScreenPost,
      setPostFullscreenThreadReplyKey,
      deletedPostIdsRef,
      setPosts,
      setPostMediaGalleryIndexByPostId,
      setSeenFeedReactionSigByPostId,
      persistPostsNow,
      persistWatermarksNow,
      postsRef,
      getBackendSession,
      waitForBackendSession,
      chatsRef,
      messagesRef,
      messagesWatermarkMsRef,
      postsWatermarkMsRef,
      postsLastFullSyncAtRef,
      encryptedSyncState,
      postsVisibleForCache,
    });
  };

  const { openFeedPostActions, handleFriendsListFriendLongPress } = createFriendListActions({
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
  });

  const handleChatInputChange = (text: string) => {
    chatInputTextRef.current = text;
    if (view.screen === "chat" && "pendingDraft" in view && view.pendingDraft && text.trim().length > 0) {
      promotePendingChatToRow({
        pending: view.pendingDraft,
        session: getBackendSession(),
        friendMap,
        friendIdToBackendUid,
        setChats: applyChats,
        setView,
      });
    }
    setChatInputSynced(text);
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
      setChats: applyChats,
      setView,
    });
  };

  const addAutoReplies = (chat: Chat, latestMessages: Message[]) =>
    scheduleDemoAutoReplies(chat, latestMessages, {
      demoActiveInboundFriendIds,
      appendMessages,
      patchChat,
      autoReplyTimersRef,
    });

  const getSenderDisplayName = useCallback(() => myDisplayNameRef.current.trim(), []);

  const { finalizeVideoPosterAndPublish, publishPost } = createPostPublishActions({
    getBackendSession,
    visibleFriendIds,
    allFriends,
    serverAcceptedFriendBackendUids,
    resolveRecipientEncryptionKeys,
    getSenderDisplayName,
    setPostMediaGalleryIndexByPostId,
    setPosts,
    postDraftVideoUri,
    postDraftText,
    postDraftImageUris,
    postDraftImageCaptions,
    closePublishPostScreen,
    resetPublishDraft,
    openVideoThumbnailModal,
  });

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
    getSenderDisplayName,
    pullEncryptedMessagesIncremental,
    setChats: applyChats,
    setMessages: applyMessages,
    setHiddenChatIds,
    setView,
    addAutoReplies,
  });

  const { retryFailedMessage, deleteFailedMessage, handleChatMessagePress } = useMemo(
    () =>
      createFailedMessageActions({
        chats,
        removeMessageById,
        commitOutgoingMessages,
      }),
    [chats, removeMessageById, commitOutgoingMessages]
  );

  const sendPayload = (payload: {
    text: string;
    kind?: "text" | "photo" | "video" | "voice" | "gif";
    mediaUri?: string;
    mediaWidth?: number;
    mediaHeight?: number;
    durationSec?: number;
    videoTextOverlays?: VideoTextOverlayData[];
  }) =>
    sendChatPayload(payload, {
      ensureChatForSend,
      isDirectTombstoneChat,
      getBackendSession,
      isOnline,
      editingMessageId,
      patchMessage,
      setEditingMessageId,
      setChatInputSynced,
      messages,
      friendIdToBackendUid,
      friendMapRef,
      friendIdToBackendUidRef,
      recipientKeyCacheRef,
      persistFriendKeyCacheNow,
      resolveConversationId,
      replyTargetMessage,
      commitOutgoingMessages,
      setReplyTargetMessageId,
      appendMessages,
      patchChat,
      autoReplyTimersRef,
      setSelectedBroadcastThreadFriendId,
      selectedBroadcastThreadFriendId,
    });

  const sendMessage = () => {
    sendComposerDraft({
      chatInputTextRef,
      pendingChatMediaAttachment,
      chatInputRef,
      setPendingChatMediaAttachment,
      sendPayload,
    });
  };

  const sendCameraMedia = (mode: "photo" | "video") =>
    pickChatCameraMedia(mode, {
      setPhotoEditorTarget,
      setPhotoEditorMediaType,
      setPhotoEditorAsset,
      setPhotoEditorOpen,
      openPhotoEditorDirect,
    });

  const sendGalleryPhoto = () =>
    pickChatGalleryPhoto({
      setPhotoEditorTarget,
      setPhotoEditorMediaType,
      setPhotoEditorAsset,
      setPhotoEditorOpen,
      openPhotoEditorDirect,
      sendPayload,
    });

  const sendGalleryVideo = () =>
    pickChatGalleryVideo({
      setPhotoEditorTarget,
      setPhotoEditorMediaType,
      setPhotoEditorAsset,
      setPhotoEditorOpen,
      openPhotoEditorDirect,
    });

  const completePhotoEditor = (result: PhotoEditorResult) => {
    completePhotoEditorSession(result, {
      chatInputRef,
      photoEditorTarget,
      setPhotoEditorOpen,
      setPhotoEditorAsset,
      setPhotoEditorMediaType,
      setPhotoEditorTarget,
      setMyProfilePictureUrl,
      getBackendSession,
      sessionEmailRef,
      myBio,
      appendEditedPostPhoto,
      queuedPostPhotoAssets,
      openPhotoEditorDirect,
      setQueuedPostPhotoAssets,
      resetPhotoEditor,
      sendPayload,
      setPendingChatMediaAttachment,
      setShouldFocusChatInput,
    });
  };

  const sendPendingVoiceNote = useCallback(async () => {
    await sendComposerVoiceNote({
      preparePendingVoiceNoteForSend,
      sendPayload,
      setPendingVoiceNote,
      setVoiceNoteMode,
    });
  }, [preparePendingVoiceNoteForSend, sendPayload]);

  const onComposerPrimaryPress = useCallback(() => {
    if (voiceNoteMode) {
      if (pendingVoiceNote) {
        void sendPendingVoiceNote();
        return;
      }
      if (voiceRecordStartedAt) {
        void stopVoiceRecordingForPreview();
      } else {
        void startVoiceRecording();
      }
      return;
    }
    sendMessage();
  }, [
    voiceNoteMode,
    pendingVoiceNote,
    voiceRecordStartedAt,
    stopVoiceRecordingForPreview,
    sendPendingVoiceNote,
    startVoiceRecording,
    sendMessage,
  ]);

  const toggleVoiceMessagePlayback = (message: Message) =>
    toggleVoiceMessagePlaybackImpl(message, {
      playingVoiceMessageId,
      messageSoundRef,
      setPlayingVoiceMessageId,
      setVoicePlaybackProgress,
      setVoiceLoadingMessageId,
    });

  const { leaveChatToHome, removeChatForCurrentUser, leaveChat, confirmLeaveChat } =
    createLeaveChatActions({
      setView,
      setChatSearch,
      clearComposerOnLeave,
      setChatSearchVisible,
      setChatOverflowOpen,
      setMembersModalOpen,
      setReplyTargetMessageId,
      setEditingMessageId,
      setMessageActionTargetId,
      setReactionPickerOpen,
      setSelectedBroadcastThreadFriendId,
      setPhotoEditorOpen,
      setPhotoEditorAsset,
      setAddMemberModalOpen,
      setAddMemberSearch,
      setPlayingVoiceMessageId,
      setVoiceLoadingMessageId,
      setVoicePlaybackProgress,
      setPlayingVideoMessageId,
      setVideoPrepareRequestedIds,
      setChatListDisplayLimit,
      setVideoPlayAfterPrepareId,
      messageSoundRef,
      chats,
      getBackendSession,
      friendMap,
      friendIdToBackendUid,
      rememberHiddenConversationIds,
      hideChatIds,
      removeChatsAndMessages,
      persistSocialMessagingNow,
      patchChat,
      view,
      resolveConversationId,
    });

  const { kickMemberFromChat, toggleChatMute, addMemberToChat } = createChatMembershipActions({
    view,
    chats,
    getBackendSession,
    friendMap,
    friendIdToBackendUid,
    resolveConversationId,
    patchChat,
    allFriends,
    friendLinksState,
    buildDefaultChatName,
    setAddMemberModalOpen,
    setAddMemberSearch,
  });

  const { confirmDeleteChatFromHome, openChatRowActions, onBackFromChat } = createChatExitActions({
    view,
    chats,
    messages,
    removeChatForCurrentUser,
    leaveChatToHome,
    toggleChatMute,
    resolvedStoredChatListTitle,
    setChatInputSynced,
    chatInputTextRef,
    voiceRecordStartedAt,
    pendingVoiceNote,
    pendingChatMediaAttachment,
    removeChatsAndMessages,
    patchChat,
  });

  const handleAndroidHardwareBackRef = useRef<() => boolean>(() => false);

  const handleAndroidHardwareBack = useCallback(
    () =>
      handleAndroidHardwareBackImpl({
        imageCropVisible,
        cancelImageCropFlow,
        photoEditorOpen,
        photoEditorInCrop,
        setPhotoEditorCropExitTick,
        cancelPhotoEditor,
        keyboardVisible,
        fullscreenMedia,
        setFullscreenMedia,
        fullScreenPost,
        closeFullscreenPost,
        reactionDetailPost,
        setReactionDetailPost,
        themePickerOpen,
        setThemePickerOpen,
        reactionPickerOpen,
        closeReactionPicker,
        postFullscreenThreadReplyKey,
        setPostFullscreenThreadReplyKey,
        chatOverflowOpen,
        setChatOverflowOpen,
        membersModalOpen,
        setMembersModalOpen,
        addMemberModalOpen,
        setAddMemberModalOpen,
        setAddMemberSearch,
        editChatMetaOpen,
        setEditChatMetaOpen,
        editChatPictureOpen,
        setEditChatPictureOpen,
        saveBroadcastGroupNameModalOpen,
        setSaveBroadcastGroupNameModalOpen,
        saveBroadcastGroupPromptOpen,
        setSaveBroadcastGroupPromptOpen,
        createTitleEditOpen,
        setPendingStandardGroupCreateAfterTitle,
        setCreateTitleEditOpen,
        setCreateGroupPictureUri,
        broadcastPickerOpen,
        setBroadcastPickerOpen,
        chatComposerOpen,
        setChatComposerOpen,
        chatSearchVisible,
        setChatSearchVisible,
        setChatSearch,
        voiceRecordStartedAt,
        cancelVoiceRecording,
        pendingVoiceNote,
        discardPendingVoiceNote,
        pendingChatMediaAttachment,
        discardPendingChatMedia,
        voiceNoteMode,
        exitVoiceNoteMode,
        viewRef,
        onBackFromChat,
        closePublishPostScreen,
        abortAddFriendPairingRef,
        goHome,
        setView,
      }),
    [
      imageCropVisible,
      cancelImageCropFlow,
      photoEditorOpen,
      photoEditorInCrop,
      keyboardVisible,
      fullscreenMedia,
      fullScreenPost,
      reactionDetailPost,
      themePickerOpen,
      reactionPickerOpen,
      closeReactionPicker,
      postFullscreenThreadReplyKey,
      chatOverflowOpen,
      membersModalOpen,
      addMemberModalOpen,
      editChatMetaOpen,
      editChatPictureOpen,
      saveBroadcastGroupNameModalOpen,
      saveBroadcastGroupPromptOpen,
      createTitleEditOpen,
      broadcastPickerOpen,
      chatComposerOpen,
      chatSearchVisible,
      voiceRecordStartedAt,
      pendingVoiceNote,
      pendingChatMediaAttachment,
      voiceNoteMode,
      closeFullscreenPost,
      closePublishPostScreen,
      cancelPhotoEditor,
      cancelVoiceRecording,
      discardPendingVoiceNote,
      discardPendingChatMedia,
      exitVoiceNoteMode,
      onBackFromChat,
      goHome,
    ]
  );

  handleAndroidHardwareBackRef.current = handleAndroidHardwareBack;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () =>
      handleAndroidHardwareBackRef.current()
    );
    return () => sub.remove();
  }, []);

  const {
    togglePostReaction,
    hydratePrivateThreadForPost,
    submitFullscreenPostComment,
    reactionPickerActiveEmoji,
    applyReaction,
    removeActiveReaction,
    openReactionPickerForMessage,
    openReactionPickerForPost,
    openReactionPickerForComment,
  } = usePostThreadActions({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    appLifecycleState,
    viewScreen: view.screen,
    homeTab,
    getBackendSession,
    posts,
    setPosts,
    myProfilePosts,
    friendProfilePosts,
    fullScreenPost,
    postFullscreenThreadReplyKey,
    postCommentTextRef,
    setPostCommentInput,
    setCommentDraftByPostId,
    setThreadDraftByChainKey,
    allFriends,
    friendMap,
    backendUidToFriendId,
    messages,
    chats,
    patchMessage,
    resolveConversationId,
    messageActionTargetId,
    setMessageActionTargetId,
    reactionTargetMessageId,
    setReactionTargetMessageId,
    postReactionTargetId,
    setPostReactionTargetId,
    commentReactionTarget,
    setCommentReactionTarget,
    setReactionPickerOpen,
    openReactionPickerForMessageBase,
    openReactionPickerForPostBase,
    openReactionPickerForCommentBase,
  });

  const { unsendTargetMessage, startEditMessage, startReplyToMessage } = createMessageActions({
    messageActionTarget,
    resolvedChat,
    isActiveBroadcastRecipient,
    chats,
    patchMessage,
    getBackendSession,
    resolveConversationId,
    setEditingMessageId,
    setChatInputSynced,
    setReplyTargetMessageId,
    setSelectedBroadcastThreadFriendId,
  });

  const { saveChatTitle, saveChatPicture } = createChatMetaActions({
    resolvedChat,
    chatTitleDraft,
    chatPictureDraft,
    patchChat,
    setEditChatMetaOpen,
    setEditChatPictureOpen,
  });

  const getCaptionedMediaLayout = useCallback(
    (message: Message) => {
      const measured = measuredChatMediaByMessageId[message.id];
      const fallbackAspect = message.kind === "video" ? 9 / 16 : 4 / 3;
      return chatCaptionedMediaLayout(
        windowWidth,
        message.mediaWidth ?? measured?.width,
        message.mediaHeight ?? measured?.height,
        fallbackAspect
      );
    },
    [windowWidth, measuredChatMediaByMessageId]
  );

  const rememberChatVideoDimensions = useCallback((messageId: string, width: number, height: number) => {
    setMeasuredChatMediaByMessageId((prev) => {
      const cur = prev[messageId];
      if (cur?.width === width && cur?.height === height) return prev;
      return { ...prev, [messageId]: { width, height } };
    });
  }, []);

  const cancelVideoPrepare = useCallback((messageId: string) => {
    setVideoPlayAfterPrepareId((cur) => (cur === messageId ? null : cur));
    setPlayingVideoMessageId((cur) => (cur === messageId ? null : cur));
    setVideoPrepareRequestedIds((prev) => {
      if (!prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
  }, []);

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
      .filter(
        ([userId]) =>
          userId === CURRENT_USER_ID || visibleFriendIds.includes(userId)
      )
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

  const renderPostGridCell = (post: Post) => (
    <PostGridCell
      post={post}
      width={postGridLayout.cell}
      height={postGridLayout.cell}
      styles={styles}
      subtleTextColor={theme.subtleText}
      resolvePriority="normal"
    />
  );

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

  const feedPostGalleryProps = useCallback(
    (post: Post) => {
      const count = postCarouselImageCount(post);
      const raw = postMediaGalleryIndexByPostId[post.id];
      const onMediaGalleryIndexChange = (index: number) => {
        const clamped = count > 0 ? Math.max(0, Math.min(index, count - 1)) : 0;
        setPostMediaGalleryIndex(post.id, clamped);
      };
      if (raw === undefined) {
        return { onMediaGalleryIndexChange };
      }
      return {
        mediaGalleryIndex: count > 0 ? Math.min(raw, count - 1) : 0,
        onMediaGalleryIndexChange,
      };
    },
    [postMediaGalleryIndexByPostId, setPostMediaGalleryIndex]
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
      onHorizontalMediaCarouselTouchChange: (active: boolean) => {
        feedCarouselTouchRef.current = active;
      },
      onOpenMedia: (
        uri: string,
        kind: "photo" | "video",
        options?: { galleryUris?: string[]; galleryIndex?: number; postId?: string }
      ) => openFullscreenMedia(uri, kind, options),
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
      openFullscreenMedia,
    ]
  );

  const showHome = isSurfaceVisible("chats") || isSurfaceVisible("feed");
  /** Keep chat mounted whenever `view.screen === "chat"` — do not gate on `resolvedChat` (send/migrate can briefly drop the row). */
  const showChatScreen = view.screen === "chat";
  const showCompactComposer =
    !!pendingChatMediaAttachment || (keyboardVisible && !!chatInput.trim());

  const pendingChatMediaLayout = useMemo(() => {
    if (!pendingChatMediaAttachment) return null;
    return chatCaptionedMediaLayout(
      windowWidth,
      pendingChatMediaAttachment.width,
      pendingChatMediaAttachment.height
    );
  }, [pendingChatMediaAttachment, windowWidth]);

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
              fontSize: 64,
              fontWeight: "900",
              letterSpacing: 0.5,
              color: theme.accent,
            }}
          >
            E
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

  if (signedIn && !notificationGateReady) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: safeTop }}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </View>
    );
  }

  if (signedIn && showNotificationPrePrompt) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <NotificationPrePromptScreen
          theme={theme}
          styles={styles}
          productName={PLACEHOLDER_APP_PRODUCT_NAME}
          safeTop={safeTop}
          busy={notificationPrePromptBusy}
          onAllow={() => void onAllowNotificationsPrePrompt()}
          onDecline={() => void onDeclineNotificationsPrePrompt()}
        />
      </View>
    );
  }

  if (!signedIn) {
    return <AuthScreens {...{
        keyboardVisible,
        keyboardHeight,
        theme,
        styles,
        safeTop,
        insets,
        isDarkMode,
        authMode,
        setAuthMode,
        loginEmail,
        setLoginEmail,
        loginPassword,
        setLoginPassword,
        loginPasswordVisible,
        setLoginPasswordVisible,
        loginDemoOrSubmit,
        loginOtp,
        setLoginOtp,
        requestLoginOtpCode,
        completeLoginWithOtp,
        signupEmail,
        setSignupEmail,
        signupUsername,
        setSignupUsername,
        signupPhoneNumber,
        setSignupPhoneNumber,
        signupPassword,
        setSignupPassword,
        signupPasswordVisible,
        setSignupPasswordVisible,
        signupPasswordConfirm,
        setSignupPasswordConfirm,
        signupPasswordConfirmVisible,
        setSignupPasswordConfirmVisible,
        startSignup,
        signupOtp,
        setSignupOtp,
        requestSignupOtp,
        completeSignupWithOtp,
      }} />;
  }

  return (
    <SignedInTree {...{
        styles,
        theme,
        isDarkMode,
        isOnline,
        safeTop,
        fullScreenPost,
        fullScreenPostLive,
        closeFullscreenPost,
        composerKavEnabled,
        submitFullscreenPostComment,
        insets,
        feedPostCardShared,
        feedPostGalleryProps,
        togglePostReaction,
        setPostFullscreenThreadReplyKey,
        postCommentInputRef,
        postFullscreenThreadReplyKey,
        keyboardVisible,
        keyboardHeight,
        postCommentInput,
        handlePostCommentInputChange,
        postCommentTextRef,
        reactionDetailPost,
        setReactionDetailPost,
        feedReactionDetailRows,
        showHome,
        homeColumnSlideSurface,
        mainNavSlideStyle,
        homeNavIconHighlight,
        homeNavBadges,
        openPostComposer,
        openSettingsScreen,
        openMyProfile,
        openFriendsListFromHome,
        openHomeChatsFromNav,
        openHomeFeedFromNav,
        openAddFriendFromHome,
        confirmLogout,
        mainNavSwipePan,
        isSurfaceVisible,
        isHomeToHome,
        incomingMainNav,
        currentMainNav,
        prioritizedOnlineFriends,
        onlineStripContentStyle,
        onlineStripLayout,
        findOrCreateChatWithFriend,
        renderAvatar,
        visibleSortedChats,
        friendMap,
        lastMessageByChatId,
        resolvePd,
        resolvedStoredChatListTitle,
        unreadChatIdSet,
        openFriendProfile,
        openChatFromHome,
        openChatRowActions,
        unfriendedIds,
        serverFriendUidsForDisplay,
        identityLockedChatIdsSet,
        localAcceptedFriendIds,
        visibleThreadMessagesByChatId,
        openStandardComposer,
        displayedFeedPosts,
        feedRefreshing,
        setFeedDisplayLimit,
        setFeedRefreshing,
        setFeedPullNonce,
        onFeedEndReached,
        feedLoadingMore,
        markFeedPostsForMediaResolve,
        feedViewableHydrateTimerRef,
        hydratePrivateThreadForPost,
        feedViewabilityConfig,
        feedMediaResolveIds,
        openPostViewerFromFeed,
        view,
        resolveFriendProfileCard,
        friendProfilePosts,
        friendProfileMediaPosts,
        postGridLayout,
        renderPostGridCell,
        visibleFriendProfileFeedPosts,
        friendProfileFeedHasMore,
        loadMoreProfileFeedPosts,
        myProfileScrollRef,
        myProfileBioPin,
        pickProfileImage,
        myProfilePictureUrl,
        myBio,
        myBioTextEntryOpen,
        setMyBioTextEntryOpen,
        bioInputRef,
        setMyBio,
        myProfileMediaPosts,
        confirmDeletePost,
        visibleMyProfileFeedPosts,
        myProfileFeedHasMore,
        backendSessionReady,
        pairingRegisterPinWithRetryParent,
        pairingAwaitPinRedeemParent,
        pairingConfirmPinReadParent,
        pairingConfirmRedeemerDualConfirmParent,
        pairingAwaitIssuerFinalConfirmParent,
        pairingFinalizePinOfferParent,
        ensurePairingLocationPermission,
        ensurePairingCameraPermission,
        pairingCancelPinOfferParent,
        pairingPollOfferStillPresentParent,
        pairingGetOfferStatusParent,
        registerAddFriendPairingAbort,
        setView,
        activeChatSharedMedia,
        videoPrepareRequestedIds,
        setVideoPrepareRequestedIds,
        openFullscreenMedia,
        publishPostScrollRef,
        publishCaptionPin,
        promptPostPhotoSource,
        postDraftImageUris,
        postDraftVideoUri,
        postDraftImageCaptions,
        capturePostPhoto,
        pickPostPhotos,
        pickPostVideo,
        clearPostDraftMedia,
        publishCaptionInputRef,
        postDraftText,
        setPostDraftText,
        closePublishPostScreen,
        publishPost,
        friendsListSearch,
        setFriendsListSearch,
        friendsListFiltered,
        isFriendFeedMuted,
        openFriendProfileFromFriendsList,
        handleFriendsListFriendLongPress,
        showChatScreen,
        chatInputTextRef,
        sendMessage,
        onBackFromChat,
        canEditActiveGroupMeta,
        activeDirectCounterpartPd,
        activeChatKind,
        activeCounterpartIds,
        pendingDraft,
        resolvedChat,
        setChatPictureDraft,
        activeHeaderPicture,
        setEditChatPictureOpen,
        chatScreenTitle,
        setChatTitleDraft,
        setEditChatMetaOpen,
        chatScreenTitleWithCount,
        setChatOverflowOpen,
        chatSearchVisible,
        chatSearch,
        setChatSearch,
        invertedChatMessagesForList,
        replyTargetMessageId,
        activeChatListRenderKey,
        readAvatarsForActiveChat,
        chatPaginationEnabled,
        handleChatListEndReached,
        chatLoadingOlder,
        chatListCanExpandLocally,
        getReactionEntries,
        retryFailedMessage,
        deleteFailedMessage,
        messageById,
        getCaptionedMediaLayout,
        reactTheme,
        getBackendSession,
        openReactionPickerForMessage,
        handleChatMessagePress,
        setSelectedBroadcastThreadFriendId,
        setMeasuredChatMediaByMessageId,
        playingVideoMessageId,
        setVideoPlayAfterPrepareId,
        setPlayingVideoMessageId,
        videoPlayAfterPrepareId,
        cancelVideoPrepare,
        rememberChatVideoDimensions,
        playingVoiceMessageId,
        voiceLoadingMessageId,
        voicePlaybackProgress,
        toggleVoiceMessagePlayback,
        isDirectTombstoneChat,
        editingMessage,
        setEditingMessageId,
        isActiveBroadcastCreator,
        voiceNoteMode,
        voiceRecordStartedAt,
        voiceRecordElapsedSec,
        pendingVoiceNote,
        togglePendingVoicePreview,
        previewVoicePlaying,
        discardPendingVoiceNote,
        sendPendingVoiceNote,
        pendingChatMediaAttachment,
        pendingChatMediaLayout,
        chatInput,
        discardPendingChatMedia,
        replyTargetMessage,
        setReplyTargetMessageId,
        showCompactComposer,
        broadcastRecipientComposerLocked,
        toggleVoiceNoteMode,
        sendCameraMedia,
        sendGalleryPhoto,
        sendGalleryVideo,
        chatInputRef,
        handleChatInputChange,
        onComposerPrimaryPress,
        chatComposerOpen,
        closeComposer,
        openBroadcastPicker,
        composerSearch,
        setComposerSearch,
        availableComposerFriends,
        selectedComposerIds,
        toggleFriendSelection,
        onPressCreateStandardChat,
        broadcastPickerOpen,
        closeBroadcastPicker,
        setPendingStandardGroupCreateAfterTitle,
        setCreateTitleDraft,
        buildComposerHeaderTitle,
        setCreateTitleEditOpen,
        setBroadcastGroupDropdownOpen,
        selectedBroadcastGroup,
        broadcastGroupDropdownOpen,
        savedBroadcastGroups,
        applySavedBroadcastGroup,
        toggleSelectAllBroadcastFriends,
        allFriends,
        composerCustomTitle,
        setComposerCustomTitle,
        createOrOpenChat,
        saveBroadcastGroupPromptOpen,
        setSaveBroadcastGroupPromptOpen,
        setPendingBroadcastCreateIds,
        pendingBroadcastCreateIds,
        continueToBroadcastDraft,
        setBroadcastGroupNameDraft,
        setSaveBroadcastGroupNameModalOpen,
        saveBroadcastGroupNameModalOpen,
        broadcastGroupNameDraft,
        handleBroadcastGroupNameConfirm,
        createTitleEditOpen,
        setCreateGroupPictureUri,
        pendingStandardGroupCreateAfterTitle,
        pickCreateGroupPicture,
        createGroupPictureUri,
        createTitleDraft,
        composerMode,
        editChatMetaOpen,
        chatTitleDraft,
        saveChatTitle,
        editChatPictureOpen,
        chatPictureDraft,
        saveChatPicture,
        reactionPickerOpen,
        setReactionPickerOpen,
        setPostReactionTargetId,
        setCommentReactionTarget,
        setReactionTargetMessageId,
        messageActionTarget,
        postReactionTargetId,
        commentReactionTarget,
        startReplyToMessage,
        startEditMessage,
        unsendTargetMessage,
        reactionPickerActiveEmoji,
        removeActiveReaction,
        applyReaction,
        setIsDarkMode,
        hapticSettings,
        goToOpenSourceLicenses,
        setThemePickerOpen,
        colorThemeId,
        resetLocalStateForCurrentUser,
        confirmDeleteAccount,
        themePickerOpen,
        setColorThemeId,
        chatOverflowOpen,
        setMembersModalOpen,
        setChatSearchVisible,
        setAddMemberSearch,
        setAddMemberModalOpen,
        confirmLeaveChat,
        membersModalOpen,
        addMemberModalOpen,
        addMemberSearch,
        filteredFriendsToAdd,
        addMemberToChat,
        eligibleFriendsToAdd,
        fullscreenMedia,
        setFullscreenMedia,
        setPostMediaGalleryIndex,
        imageCropVisible,
        imageCropUri,
        imageCropAspect,
        handleImageCropComplete,
        cancelImageCropFlow,
        videoThumbnailModalOpen,
        videoThumbnailDefaultPosterUri,
        videoThumbnailPreviewLoading,
        closeVideoThumbnailModal,
        finalizeVideoPosterAndPublish,
        photoEditorOpen,
        cancelPhotoEditor,
        setPhotoEditorInCrop,
        photoEditorCropExitTick,
        completePhotoEditor,
        photoEditorAsset,
        photoEditorMediaType,
        photoEditorTarget,
      }} />
  );
}

export default function MainApp() {
  return <MainAppInner />;
}
