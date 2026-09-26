import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { storageSetItem } from "./lib/encryptedLocalStorage";
import { useAuthFormDrafts } from "./session/useAuthFormDrafts";
import { useAppearancePrefs } from "./theme/useAppearancePrefs";
import { useFriendIdentityMaps } from "./friends/useFriendIdentityMaps";
import { usePersistLastView } from "./shell/usePersistLastView";
import { clearEncryptedMediaCaches } from "./lib/encryptedMediaCache";
import * as NavigationBar from "expo-navigation-bar";
import { Audio, ResizeMode, Video } from "expo-av";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ExpoNetwork from "expo-network";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
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
import { logAppError } from "../telemetry";
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
import { debugSessionLog, firebaseAuth, warmFirebaseIdToken } from "../firebaseAuthClient";
import {
  broadcastCreatorFriendId,
  isBroadcastCreator,
} from "./lib/broadcastMessaging";
import { retainedMessageChatIds } from "./lib/messageRetentionChatIds";
import { trimInMemoryMessages } from "./lib/trimInMemoryMessages";
import {
  friendBackendUidFromDirectChatLocalId,
  isCanonicalDirectChatId,
  localChatIdsForDirectThread,
  resolveCanonicalDirectChatLocalId,
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
  resolveChatMemberToBackendUid,
  resolveChatParticipantBackendUids,
  resolveIncomingSenderFriendId,
} from "./lib/resolveChatMemberBackendUid";
import { friendsForFriendsList } from "./lib/mergeFriendsCatalog";
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
import { useScrollPinnedInput } from "./lib/useScrollPinnedInput";
import { FeedPostCard } from "./components/FeedPostCard";
import { NotificationPrePromptScreen } from "./components/NotificationPrePromptScreen";
import { ImageCropModal } from "./components/ImageCropModal";
import { HomeTopNavBar } from "./components/HomeTopNavBar";
import { PressAckButton } from "./components/PressAckButton";
import { FullscreenMediaViewer } from "./components/FullscreenMediaViewer";
import { VideoPostThumbnailModal } from "./components/VideoPostThumbnailModal";
import { OpenSourceLicensesScreen } from "./screens/OpenSourceLicensesScreen";
import { ReactionBubbleHost } from "./components/ReactionBubbleHost";
import { aggregateReactionCounts } from "./lib/reactionHelpers";
import { readAvatarsByMessageId, type ReadByMap } from "./lib/readReceipts";
import { useInitialServerSync } from "./boot/useInitialServerSync";
import {
  collectDirectChatIdsToLockForFriend,
  mergeIdentityLockedChatIds,
} from "./lib/identityLockedChats";
import { availableStartChatFriends } from "./chat/availableStartChatFriends";
import { useAccountExit } from "./session/useAccountExit";
import { useChatInboxModel } from "./chat/useChatInboxModel";
import { useChatMediaFrame } from "./chat/useChatMediaFrame";
import { useComposerPrimaryAction } from "./chat/useComposerPrimaryAction";
import { useChatReadPosition } from "./chat/useChatReadPosition";
import { useOpenChatSnapshot } from "./chat/useOpenChatSnapshot";
import { useOlderChatMessages } from "./chat/useOlderChatMessages";
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
import { createLeaveChatActions } from "./chat/leaveChat";
import { useInThreadComposer } from "./chat/useInThreadComposer";
import { toggleVoiceMessagePlayback as toggleVoiceMessagePlaybackImpl } from "./chat/voicePlayback";
import { createFriendListActions } from "./friends/friendListActions";
import { useFriendRosterSync } from "./friends/useFriendRosterSync";
import { useFriendsListSearch } from "./friends/useFriendsListSearch";
import { useOnlineFriendsStrip } from "./friends/useOnlineFriendsStrip";
import { useFriendsController } from "./friends/useFriendsController";
import { createOpenFriendProfileActions, useEncryptedProfileSync, useProfileController } from "./profile";
import { migrateLegacyDraftChats } from "./messaging/legacyChatMigration";
import { isLegacyDraftChatId } from "./messaging/localChatId";
import { useMessagingController } from "./messaging/useMessagingController";
import { usePersistSocialMessaging } from "./messaging/usePersistSocialMessaging";
import { useMessagingSync } from "./messaging/useMessagingSync";
import {
  activeChatIdFromView,
  useAppNavigation,
} from "./shell";
import { useHomeNavigation } from "./shell/useHomeNavigation";
import { AuthScreens } from "./shell/AuthScreens";
import { SignedInTree } from "./shell/SignedInTree";
import { handleAndroidHardwareBack as handleAndroidHardwareBackImpl } from "./shell/androidHardwareBack";
import { useSharePostsWithNewFriend } from "./posts/useSharePostsWithNewFriend";
import { useFeedCardPresentation } from "./feed/useFeedCardPresentation";
import { useChatSend } from "./chat/useChatSend";
import { usePushRegistration } from "./notifications/usePushRegistration";
import { useSignedInAccountBoot } from "./session/useSignedInAccountBoot";
import {
  createAccountAuthActions,
  useBackendSession,
  usePersistFriendKeyCache,
  usePersistSyncWatermarks,
  useSignedInSession,
  useSocialSnapshotCloudBackup,
} from "./session";
import { sendComposerVoiceNote } from "./messaging/sendChatPayload";
import { FIREBASE_ID_TOKEN_WARM_MS } from "./session/firebaseAuthPersistence";
import { useFeedLists } from "./feed/useFeedLists";
import { useFeedController, useFeedReactionListeners, useFeedSync, useFullscreenPostThread, usePostThreadActions, useReactionPicker } from "./feed";
import { completePhotoEditorSession } from "./media/completePhotoEditor";
import {
  capturePostPhotoDraft,
  choosePostVideo,
  pickGroupPicture,
  pickPostPhotoDraft,
  pickProfilePhoto,
  promptPostPhotoDraft,
} from "./media/pickMedia";
import { useFullscreenMedia } from "./media/useFullscreenMedia";
import { usePhotoEditorSession } from "./media/usePhotoEditorSession";
import { useNotificationPermissionGate, usePushNotificationRouting } from "./notifications";
import { useAddFriendPairing } from "./addFriend/useAddFriendPairing";
import { updateOutgoingMessageContent } from "./messaging/send";
import { refreshFriendProfilesFromServer } from "./friends/refreshFriendProfiles";
import {
  confirmDeleteOwnedPost,
  createPostPublishActions,
  shareOwnedPostsWithNewFriend,
  usePersistPosts,
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
  storageObjectPathFromDownloadUrl,
} from "./lib/profilePictureUrl";
import {
  ensureLocalKeyBundle,
  encryptPayloadForRecipients,
} from "../e2eeCrypto";

import type {
  Chat,
  Friend,
  FriendsListRestore,
  Message,
  PendingDraft,
  Post,
  PostComment,
} from "./domain/types";
import {
  PLACEHOLDER_APP_PRODUCT_NAME,
} from "./lib/viewPersistence";
import { readFeedMutesForEmail } from "./lib/feedMutePersistence";
import { mergeSyncedPosts } from "./lib/mergeEncryptedSync";
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
  DEMO_OFFLINE_MODE,
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
  NOW,
  ONLINE_GREEN,
  POSTS_STORAGE_KEY,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ONLINE_WINDOW_MS,
  INITIAL_SERVER_SYNC_TIMEOUT_MS,
  ENCRYPTED_POSTS_PROFILE_SYNC_LIMIT,
  ENCRYPTED_MESSAGES_SYNC_LIMIT,
  CHAT_INITIAL_MESSAGE_LIMIT,
  CHAT_UI_INITIAL_DISPLAY_COUNT,
  CHAT_UI_DISPLAY_PAGE_SIZE,
  REACTION_EMOJIS,
  SCROLL_TEST_MESSAGES,
  SESSION_LOCK_TOKEN_STORAGE_KEY,
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
  mockSessionRtdbPathKey,
  multiplyHexColor,
  normalizeSet,
  profileBioStorageKey,
  profilePictureStorageKey,
} from "./theme/preludeConstants";
import {
  readFriendKeyBundleCache,
  readSyncWatermarks,
  shouldResetSyncCacheForAppBuild,
} from "./lib/clientSyncCache";


function MainAppInner() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const {
    isDarkMode,
    setIsDarkMode,
    colorThemeId,
    setColorThemeId,
    themePickerOpen,
    setThemePickerOpen,
    hapticSettings,
    theme,
  } = useAppearancePrefs();
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
  const {
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginPasswordVisible,
    setLoginPasswordVisible,
    signupEmail,
    setSignupEmail,
    signupPassword,
    setSignupPassword,
    signupPasswordConfirm,
    setSignupPasswordConfirm,
    signupPasswordVisible,
    setSignupPasswordVisible,
    signupPasswordConfirmVisible,
    setSignupPasswordConfirmVisible,
    signupUsername,
    setSignupUsername,
    signupPhoneNumber,
    setSignupPhoneNumber,
    signupOtp,
    setSignupOtp,
    loginOtp,
    setLoginOtp,
    issuedOtpCode,
    setIssuedOtpCode,
    issuedOtpForEmail,
    setIssuedOtpForEmail,
  } = useAuthFormDrafts(authMode, authModeRef);
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
  const persistWatermarksNow = usePersistSyncWatermarks({
    sessionEmailRef,
    messagesWatermarkMsRef,
    messagesLastFullSyncAtRef,
    postsWatermarkMsRef,
    postsLastFullSyncAtRef,
    deletedPostIdsRef,
  });
  const { postsVisibleForCache, persistPostsNow } = usePersistPosts({
    signedIn,
    sessionEmailRef,
    posts,
    postsRef,
    deletedPostIdsRef,
  });
  /**
   * Snapshot the friend public-key cache to AsyncStorage so the first send
   * after a cold start doesn't need an extra `getFriendKeyBundles` round-trip
   * to encrypt the payload. Best-effort.
   */
  const persistFriendKeyCacheNow = usePersistFriendKeyCache({
    sessionEmailRef,
    recipientKeyCacheRef,
  });
  const messageSoundRef = useRef<Audio.Sound | null>(null);

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

  const { setPostMediaGalleryIndex, openFullscreenMedia } = useFullscreenMedia({
    chatInputRef,
    setFullScreenPost,
    setPostFullscreenThreadReplyKey,
    setPostMediaGalleryIndexByPostId,
    setFullscreenMedia,
  });

  const persistSocialMessagingNow = usePersistSocialMessaging({
    signedIn,
    sessionEmailRef,
    chats,
    messages,
    hiddenChatIds,
    addedFriendsFromRitual,
    unfriendedIds,
    identityLockedChatIds,
    chatsRef,
    messagesRef,
    hiddenChatIdsRef,
    addedFriendsFromRitualRef,
    unfriendedIdsRef,
    identityLockedChatIdsRef,
  });

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

  usePersistLastView({ signedIn, sessionEmailRef, view, homeTab });

  const {
    allFriends,
    friendMap,
    friendMapRef,
    resolveFriendProfileCard,
    serverFriendUidsForDisplay,
    identityLockedChatIdsSet,
    localAcceptedFriendIds,
    visibleFriends,
    visibleFriendIds,
    demoActiveInboundFriendIds,
    friendIdToBackendUid,
    friendIdToBackendUidRef,
    resolveChatMemberFriendId,
    resolvePd,
    backendUidToFriendId,
  } = useFriendIdentityMaps({
    signedIn,
    sessionEmailRef,
    addedFriendsFromRitual,
    setAddedFriendsFromRitual,
    serverAcceptedFriendBackendUids,
    presenceOnlineByBackendUid,
    initialServerSyncDone,
    identityLockedChatIds,
    friendLinksState,
    unfriendedIds,
    view,
    setView,
    applyChats,
    mergeRosterIntoCache,
    resolveFriendProfileCardFromMaps,
  });

  const { queueSharePostsWithNewFriend, syncServerAcceptedFriendBackendUids } = useSharePostsWithNewFriend({
    readBackendSessionFromRefs,
    postsSharedWithFriendsRef,
    sharePostsBackfillStartedRef,
    pendingPostsShareFriendUidsRef,
    sharePostsWithNewFriendHandlerRef,
    setServerAcceptedFriendUids,
    demoOfflineMode: DEMO_OFFLINE_MODE,
  });
  usePushRegistration({
    signedIn,
    demoOfflineMode: DEMO_OFFLINE_MODE,
    osNotificationGranted,
    getBackendSession,
    backendSessionReady,
    appLifecycleState,
    setOsNotificationGranted,
  });

  useSocialSnapshotCloudBackup({
    signedIn,
    backendSessionReady,
    initialServerSyncDone,
    appLifecycleState,
    chats,
    messages,
    posts,
    getBackendSession,
    postsVisibleForCache,
    chatsRef,
    messagesRef,
    postsRef,
    messagesWatermarkMsRef,
    postsWatermarkMsRef,
  });

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
    const picturePath = storageObjectPathFromDownloadUrl(httpsPicture);
    const recipientUids = [
      session.uid,
      ...visibleFriendIds
        .map((id) => friendMap[id]?.backendUid?.trim())
        .filter((uid): uid is string => !!uid && uid.startsWith("u_")),
    ];
    const payload = picturePath
      ? { profilePicturePath: picturePath, updatedAt: Date.now() }
      : { profilePictureUrl: httpsPicture, updatedAt: Date.now() };
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

  const lockChatsForRemovedFriends = useCallback(
    (backendUids: string[]) => {
      const session = getBackendSession();
      if (!session || backendUids.length === 0) return;
      const additions: string[] = [];
      for (const uid of backendUids) {
        additions.push(
          ...collectDirectChatIdsToLockForFriend(
            chatsRef.current ?? [],
            backendUidForFriendId(uid),
            {
              friendBackendUid: uid,
              sessionAppUid: session.uid,
              friendMap: friendMapRef.current,
              friendIdToBackendUid: friendIdToBackendUidRef.current,
            }
          )
        );
      }
      if (additions.length > 0) {
        setIdentityLockedChatIds((cur) => mergeIdentityLockedChatIds(cur, additions));
      }
    },
    [getBackendSession]
  );

  useFriendRosterSync({
    demoOfflineMode: DEMO_OFFLINE_MODE,
    signedIn,
    getBackendSession,
    acceptedFriendBackendUidsRef,
    onServerFriendBackendUidsChanged: syncServerAcceptedFriendBackendUids,
    onFriendsRemoved: lockChatsForRemovedFriends,
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
    onFriendsRemoved: lockChatsForRemovedFriends,
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
    return () => {
      cancelled = true;
    };
  }, [signedIn, initialServerSyncDone, friendBackendUidsKey, getBackendSession, replaceFriendsIfChanged]);

  const onHomeFeedTab = view.screen === "home" && homeTab === "feed";

  const {
    isFriendFeedMuted,
    feedPosts,
    displayedFeedPosts,
    feedReactionListenPostIds,
    onFeedEndReached,
    myProfilePosts,
    myProfileMediaPosts,
    friendProfilePosts,
    friendProfileMediaPosts,
    visibleMyProfileFeedPosts,
    visibleFriendProfileFeedPosts,
    myProfileFeedHasMore,
    friendProfileFeedHasMore,
    postGridLayout,
    loadMoreProfileFeedPosts,
    unreadFeedReactionCount,
    markFeedPostsForMediaResolve,
  } = useFeedLists({
    posts,
    visibleFriendIds,
    feedMutedUntilByFriendId,
    feedDisplayLimit,
    setFeedDisplayLimit,
    fullScreenPost,
    view,
    signedIn,
    initialServerSyncDone,
    windowWidth,
    onHomeFeedTab,
    seenFeedReactionSigByPostId,
    setSeenFeedReactionSigByPostId,
    getBackendSession,
    loadMoreOlderPosts,
    setFeedMediaResolveIds,
  });

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
  const {
    joinCutoffForViewer,
    lastMessageByChatId,
    visibleThreadMessagesByChatId,
    sortedChats,
    visibleSortedChats,
    unreadChatIdSet,
    unreadChatCount,
    pendingDraft,
    resolvedChat,
    messageById,
    activeChatKind,
    activeCounterpartIds,
    activeChatId,
    activeDirectCounterpartPd,
    activeChatIdentityLocked,
    chatScreenTitle,
    isDirectTombstoneChat,
    chatScreenTitleWithCount,
    canEditActiveGroupMeta,
    activeHeaderPicture,
    eligibleFriendsToAdd,
    filteredFriendsToAdd,
    activeChatMessages,
    invertedChatMessages,
    invertedChatMessagesForList,
    chatListCanExpandLocally,
    activeChatIdForPagination,
    activeChatListRenderKey,
    activeChatForRead,
    readAvatarsForActiveChat,
  } = useChatInboxModel({
    chats,
    messages,
    hiddenChatIds,
    unfriendedIds,
    friendMap,
    friendIdToBackendUid,
    backendUidToFriendId,
    identityLockedChatIds,
    identityLockedChatIdsSet,
    serverFriendUidsForDisplay,
    allFriends,
    friendLinksState,
    view,
    chatSearch,
    chatListDisplayLimit,
    addMemberSearch,
    backendSessionReady,
    getBackendSession,
    resolvePd,
    resolveChatMemberFriendId,
  });

  const messageActionTarget = messageActionTargetId ? messageById[messageActionTargetId] : undefined;
  const replyTargetMessage = replyTargetMessageId ? messageById[replyTargetMessageId] : undefined;
  const isActiveBroadcastCreator =
    activeChatKind === "broadcast" && !!resolvedChat && isBroadcastCreator(resolvedChat, CURRENT_USER_ID);
  const isActiveBroadcastRecipient =
    activeChatKind === "broadcast" && !!resolvedChat && !isBroadcastCreator(resolvedChat, CURRENT_USER_ID);
  const broadcastRecipientComposerLocked = isActiveBroadcastRecipient && !replyTargetMessage;
  const editingMessage = editingMessageId ? messageById[editingMessageId] : undefined;
  const chatPaginationEnabled = Boolean(
    activeChatIdForPagination &&
      (chatListCanExpandLocally || chatHasMoreOlder[activeChatIdForPagination] !== false)
  );
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
  const homeNavBadges = useMemo(
    () => ({ chats: unreadChatCount, feed: unreadFeedReactionCount }),
    [unreadChatCount, unreadFeedReactionCount]
  );
  const { handleChatListEndReached } = useOlderChatMessages({
    view,
    chats,
    friendMap,
    friendIdToBackendUid,
    backendUidToFriendId,
    identityLockedChatIdsSet,
    activeChatMessages,
    invertedChatMessages,
    chatLoadingOlder,
    chatHasMoreOlder,
    chatListDisplayLimit,
    setChatLoadingOlder,
    setChatHasMoreOlder,
    setChatListDisplayLimit,
    chatPaginationBeforeMsRef,
    chatEndReachedBusyRef,
    hiddenChatIdsRef,
    hiddenServerConversationIdsRef,
    getBackendSession,
    joinCutoffForViewer,
    resolveConversationId,
    applyMessages,
  });

  useOpenChatSnapshot({
    view,
    activeChatForRead,
    friendIdToBackendUid,
    getBackendSession,
    resolveConversationId,
    applyChats,
  });

  useChatReadPosition({
    view,
    activeChatMessages,
    activeChatForRead,
    getBackendSession,
    resolveConversationId,
  });

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

  const { prioritizedOnlineFriends, onlineStripLayout, onlineStripContentStyle } = useOnlineFriendsStrip({
    allFriends,
    unfriendedIds,
    visibleSortedChats,
    windowWidth,
  });

  const friendsListFiltered = useFriendsListSearch({
    allFriends,
    unfriendedIds,
    friendsListSearch,
  });

  const {
    resetLocalSocialStateForSignedOut,
    resetLocalStateForCurrentUser,
    applySignedInAccount,
  } = useSignedInAccountBoot({
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
    markSessionReady,
    setEncryptedSyncState,
    localSocialCacheSavedAtMsRef,
    applyChats,
    applyMessages,
    setPosts,
    myDisplayNameRef,
    hydrateMyProfile,
    refreshHiddenConversationIdsFromServer,
    sessionEmailRef,
    setSeenFeedReactionSigByPostId,
    setHiddenChatIds,
    hiddenServerConversationIdsRef,
    replaceInbox,
    setIdentityLockedChatIds,
    hydrateFriends,
    setPresenceOnlineByBackendUid,
    setFeedMutedUntilByFriendId,
    setInitialServerSyncDone,
    markSignedIn,
    setAuthMode,
    setView,
    setHomeTab,
    setDemoPendingAddableQueue,
    backendInitGenerationRef,
    clearSession,
    logoutRef,
    signedIn,
    signedInRef,
    isRestoringAuthRef,
    appBootAuthResolvedRef,
    sessionTokenRef,
    markAppBootAuthResolved,
    setSignedIn,
    resetSyncChannelsIdle,
    sessionConflictNoticeAtRef,
  });

  const { confirmLogout, confirmDeleteAccount, logoutFromSessionReplaced } = useAccountExit({
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
    logoutRef,
  });

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

  const {
    openFriendsListFromHome,
    openAddFriendFromHome,
    openSettingsScreen,
    openMyProfile,
    feedCarouselTouchRef,
    mainNavSlideStyle,
    mainNavSwipePan,
    isSurfaceVisible,
    isHomeToHome,
    incomingMainNav,
    currentMainNav,
    homeColumnSlideSurface,
  } = useHomeNavigation({
    view,
    viewRef,
    homeTab,
    windowWidth,
    safeTop,
    setFriendsListSearch,
    goToFriendsListFromHome,
    goToAddFriend,
    goToSettings,
    goToMyProfile,
    openHomeChatsFromNav,
    openHomeFeedFromNav,
  });

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

  const {
    handleChatInputChange,
    getSenderDisplayName,
    commitOutgoingMessages,
    sendPayload,
    sendMessage,
    sendCameraMedia,
    sendGalleryPhoto,
    sendGalleryVideo,
  } = useChatSend({
    view,
    chats,
    friendMap,
    friendIdToBackendUid,
    friendMapRef,
    friendIdToBackendUidRef,
    getBackendSession,
    applyChats,
    applyMessages,
    setView,
    setHiddenChatIds,
    demoActiveInboundFriendIds,
    appendMessages,
    patchChat,
    autoReplyTimersRef,
    myDisplayNameRef,
    recipientKeyCacheRef,
    persistFriendKeyCacheNow,
    resolveConversationId,
    pullEncryptedMessagesIncremental,
    isDirectTombstoneChat,
    isOnline,
    editingMessageId,
    patchMessage,
    setEditingMessageId,
    setChatInputSynced,
    messages,
    replyTargetMessage,
    setReplyTargetMessageId,
    setSelectedBroadcastThreadFriendId,
    selectedBroadcastThreadFriendId,
    chatInputTextRef,
    pendingChatMediaAttachment,
    chatInputRef,
    setPendingChatMediaAttachment,
    chatPicker: {
      setPhotoEditorTarget,
      setPhotoEditorMediaType,
      setPhotoEditorAsset,
      setPhotoEditorOpen,
      openPhotoEditorDirect,
    },
  });

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

  const { retryFailedMessage, deleteFailedMessage, handleChatMessagePress } = useMemo(
    () =>
      createFailedMessageActions({
        chats,
        removeMessageById,
        commitOutgoingMessages,
      }),
    [chats, removeMessageById, commitOutgoingMessages]
  );

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

  const { sendPendingVoiceNote, onComposerPrimaryPress } = useComposerPrimaryAction({
    preparePendingVoiceNoteForSend,
    sendPayload,
    setPendingVoiceNote,
    setVoiceNoteMode,
    voiceNoteMode,
    pendingVoiceNote,
    voiceRecordStartedAt,
    stopVoiceRecordingForPreview,
    startVoiceRecording,
    sendMessage,
  });

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

  const { getCaptionedMediaLayout, rememberChatVideoDimensions, cancelVideoPrepare } = useChatMediaFrame({
    windowWidth,
    measuredChatMediaByMessageId,
    setMeasuredChatMediaByMessageId,
    setVideoPlayAfterPrepareId,
    setPlayingVideoMessageId,
    setVideoPrepareRequestedIds,
  });

  const getReactionEntries = (message: Message) => {
    const session = getBackendSession();
    return aggregateReactionCounts(
      message.reactions,
      session?.uid ?? null,
      backendUidToFriendId,
      visibleFriendIds
    );
  };

  const {
    postAuthorMeta,
    feedReactionDetailRows,
    reactTheme,
    renderAvatar,
    renderPostGridCell,
    feedPostGalleryProps,
    feedPostCardShared,
  } = useFeedCardPresentation({
    myProfilePictureUrl,
    resolvePd,
    friendMap,
    unfriendedIds,
    serverFriendUidsForDisplay,
    visibleFriendIds,
    reactionDetailPost,
    theme,
    windowWidth,
    styles,
    postGridLayout,
    postMediaGalleryIndexByPostId,
    setPostMediaGalleryIndex,
    getBackendSession,
    backendUidToFriendId,
    openFriendProfile,
    openMyProfile,
    openFeedPostActions,
    confirmDeletePost,
    openReactionPickerForPost,
    openReactionPickerForComment,
    setReactionDetailPost,
    feedCarouselTouchRef,
    openFullscreenMedia,
  });

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
        publishCaptionInputRef,
        postDraftText,
        setPostDraftText,
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
