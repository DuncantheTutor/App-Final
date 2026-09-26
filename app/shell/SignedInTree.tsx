import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  storageGetItem,
  storageRemoveItem,
  storageSetItem,
} from "../lib/encryptedLocalStorage";
import { setUserHapticsEnabled, useHapticSettings } from "../lib/haptics";
import { clearEncryptedMediaCaches } from "../lib/encryptedMediaCache";
import * as ImagePicker from "expo-image-picker";
import * as NavigationBar from "expo-navigation-bar";
import { Audio, ResizeMode, Video } from "expo-av";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ExpoNetwork from "expo-network";
import * as VideoThumbnails from "expo-video-thumbnails";
import Constants from "expo-constants";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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

import { FlatListUntilScroll, ScrollViewUntilScroll } from "../../ScrollUntilScroll";
import { suspendMediaPlayback } from "../lib/suspendMediaPlayback";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PhotoEditorModal,
  type PhotoEditorResult,
  type VideoTextOverlayData,
} from "../../PhotoEditorModal";
import LottieView from "lottie-react-native";

import {
  backendUidForEmail,
  backendUidForFriendId,
  callEmulatorFunction,
  getOrCreateBackendDeviceId,
} from "../../backendBridge";
import { logAppError, logAppEvent, setTelemetryContext } from "../../telemetry";
import {
  mediaUriNeedsFirebaseUpload,
  uploadSharedMediaFromDevice,
} from "../../mediaStorageUpload";
import { parseMessageMediaFromPlain } from "../lib/tierBMedia/messageMedia";
import {
  ChatMessageMediaResolver,
  messageHasResolvableMedia,
} from "../components/ChatMessageMediaResolver";
import { ChatThreadErrorBoundary } from "../components/ChatThreadErrorBoundary";
import { ChatVideoAutoPlayWhenReady } from "../components/ChatVideoAutoPlayWhenReady";
import { ChatVideoMessageBubble } from "../components/ChatVideoMessageBubble";
import { ChatReplyTargetPreview } from "../components/ChatReplyTargetPreview";
import { ChatVoiceNoteBubble } from "../components/ChatVoiceNoteBubble";
import { resolveTierBMediaToFileUri } from "../lib/tierBMedia/storage";
import { requestReadSmsPermissionIfNeeded, startAndroidOtpAssist } from "../../otpSmsAssist";
import {
  debugSessionLog,
  firebaseAuth,
  firebaseSessionSurvivesNullEvent,
  getFirestoreDb,
  warmFirebaseIdToken,
} from "../../firebaseAuthClient";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";
import { joinCutoffMsForViewer, normalizeMemberJoinedAtForClient } from "../lib/chatMemberJoinedAt";
import {
  broadcastCreatorFriendId,
  canReplyToBroadcastMessage,
  isBroadcastCreator,
} from "../lib/broadcastMessaging";
import {
  buildLastMessageByChatId,
  buildVisibleThreadMessagesByChatId,
  chatListSortTimestampMs,
  filterChatsVisibleInInbox,
} from "../lib/chatListLastMessage";
import { retainedMessageChatIds } from "../lib/messageRetentionChatIds";
import { trimInMemoryMessages } from "../lib/trimInMemoryMessages";
import { isIncomingChatUnread } from "../lib/chatUnreadState";
import {
  friendBackendUidFromDirectChatLocalId,
  isCanonicalDirectChatId,
  localChatIdsForDirectThread,
  resolveCanonicalDirectChatLocalId,
  resolveDirectChatOpenTarget,
  resolveInboundDirectMessageTarget,
  resolveIncomingDirectChatId,
  serverConversationIdForChat,
  serverConversationIdFromLocalChatId,
  serverConversationIdsToHide,
} from "../lib/directChatId";
import {
  isConversationHiddenForViewer,
  localChatIdsFromHiddenConversationIds,
} from "../lib/hiddenConversations";
import {
  CURRENT_USER_LOCAL_ID,
  normalizeChatMemberIds,
  resolveChatMemberToBackendUid,
  resolveChatParticipantBackendUids,
  resolveIncomingSenderFriendId,
} from "../lib/resolveChatMemberBackendUid";
import {
  applyPresenceToFriends,
  dedupeFriendsByBackendUid,
  friendsForFriendsList,
  mergeFriendsCatalog,
} from "../lib/mergeFriendsCatalog";
import {
  registerPushTokenWithBackend,
  getOsNotificationPermissionStatus,
  isOsNotificationPermissionGranted,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  conversationIdFromNotificationData,
  pushNotificationType,
} from "../lib/pushNotifications";
import { inferOutgoingMediaKind } from "../lib/mediaKind";
import { chatCaptionedMediaLayout, chatMediaBubbleInsetStyle, chatMediaInnerClipStyle } from "../lib/chatMediaLayout";
import { probeVideoDisplayDimensions } from "../lib/videoDisplayDimensions";
import { prepareVoicePlaybackAudioMode } from "../lib/voicePlaybackAudio";
import { resolveVoicePlayUri, voiceSoundSource } from "../lib/resolveVoicePlayUri";
import { messageDisplayText, normalizeMessagesForUi } from "../lib/messageDisplayText";
import { readComposerTextTrimmed } from "../lib/syncedComposerText";
import {
  composerKeyboardAvoidanceEnabled,
  keyboardComposerBottomPadding,
  androidAbsoluteOverlayKeyboardBottom,
  keyboardOverlapFromEvent,
  navDeadZoneHeight,
  scrollPageBottomPadding,
  stickyFooterPadding,
} from "../lib/safeAreaInsets";
import { keyboardScrollPadding } from "../lib/keyboardInputScroll";
import {
  postCarouselImageCount,
  remapPostMediaGalleryIndex,
} from "../lib/feedPostLayout";
import { useScrollPinnedInput } from "../lib/useScrollPinnedInput";
import { FeedPostCard } from "../components/FeedPostCard";
import { NotificationPrePromptScreen } from "../components/NotificationPrePromptScreen";
import { PostGridCell } from "../components/PostGridCell";
import { ImageCropModal } from "../components/ImageCropModal";
import { HomeTopNavBar } from "../components/HomeTopNavBar";
import { PressAckButton } from "../components/PressAckButton";
import { FullscreenMediaViewer } from "../components/FullscreenMediaViewer";
import { VideoPostThumbnailModal } from "../components/VideoPostThumbnailModal";
import { OpenSourceLicensesScreen } from "../screens/OpenSourceLicensesScreen";
import { ReactionBubbleHost } from "../components/ReactionBubbleHost";
import { aggregateReactionCounts } from "../lib/reactionHelpers";
import {
  overlayMessageDocMetadata,
  type MessageDocMetadata,
} from "../messaging/messageMetadata";
import { readAvatarsByMessageId, type ReadByMap } from "../lib/readReceipts";
import { useInitialServerSync } from "../boot/useInitialServerSync";
import { clearLocalSocialCacheForEmail } from "../lib/localSocialCache";
import { FriendSafetyNumber } from "../components/FriendSafetyNumber";
import { availableStartChatFriends } from "../chat/availableStartChatFriends";
import { useActiveChatMessages } from "../chat/useActiveChatMessages";
import { useStartChatComposer } from "../chat/useStartChatComposer";
import { useInThreadComposer } from "../chat/useInThreadComposer";
import { useFriendRosterSync } from "../friends/useFriendRosterSync";
import { useFriendsController } from "../friends/useFriendsController";
import { useEncryptedProfileSync, useProfileController } from "../profile";
import { migrateLegacyDraftChats } from "../messaging/legacyChatMigration";
import { isLegacyDraftChatId } from "../messaging/localChatId";
import { promotePendingChatToRow } from "../messaging/promotePendingChat";
import { useMessagingController } from "../messaging/useMessagingController";
import { useMessagingSync } from "../messaging/useMessagingSync";
import {
  activeChatIdFromView,
  createMainNavSwipePan,
  mainNavSurfaceFromView,
  pendingDraftFromView,
  useAppNavigation,
  useMainNavSlide,
  viewAfterHardwareBack,
  viewAfterLeavingFriendProfile,
  type MainNavSurface,
} from "../shell";
import { useBackendSession, useSignedInSession } from "../session";
import {
  FIREBASE_ID_TOKEN_WARM_MS,
  NULL_AUTH_GRACE_MS,
} from "../session/firebaseAuthPersistence";
import { useFeedController, useFeedReactionListeners, useFeedSync, useFullscreenPostThread, usePostThreadActions, useReactionPicker } from "../feed";
import { usePhotoEditorSession } from "../media/usePhotoEditorSession";
import { useNotificationPermissionGate } from "../notifications";
import { usePairingParentActions } from "../addFriend";
import { updateOutgoingMessageContent } from "../messaging/send";
import { useOutgoingMessages } from "../messaging/useOutgoingMessages";
import { refreshFriendProfilesFromServer } from "../friends/refreshFriendProfiles";
import {
  capturePostPhoto as capturePostPhotoFromDevice,
  pickPostPhotos as pickPostPhotosFromLibrary,
  pickPostVideo as pickPostVideoFromLibrary,
  promptPostPhotoSource as promptPostPhotoSourceAlert,
  shareOwnedPostsWithNewFriend,
  uploadEncryptedPost,
  usePublishComposer,
} from "../posts";
import {
  readPostsSharedWithFriends,
  writePostsSharedWithFriends,
} from "../lib/postsSharedWithFriendsPersistence";
import { publishActivePresence } from "../presence/heartbeat";
import { usePresenceFirestoreListener } from "../presence/usePresenceFirestoreListener";
import { usePresenceHeartbeat } from "../presence/usePresenceHeartbeat";
import {
  mergeProfilePictureUrl,
  normalizeHttpsProfilePictureUrl,
} from "../lib/profilePictureUrl";
import {
  decryptPayloadForRecipient,
  ensureLocalKeyBundle,
  encryptPayloadForRecipients,
} from "../../e2eeCrypto";

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
  SavedBroadcastGroup,
  ThemePalette,
} from "../domain/types";
import {
  PLACEHOLDER_APP_PRODUCT_NAME,
  lastHomeTabStorageKey,
  lastViewStorageKey,
  parseFriendsListRestorePayload,
  parsePendingDraftPayload,
  pruneGhostEmptyChats,
  sanitizePersistedFriendsFromStorage,
} from "../lib/viewPersistence";
import { warmPostGridMediaCache } from "../lib/warmPostMediaCache";
import {
  collectDirectChatIdsToLockForFriend,
  isChatIdentityLocked,
  mergeIdentityLockedChatIds,
} from "../lib/identityLockedChats";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import {
  resolveParticipantDisplay,
  TOMBSTONE_DISPLAY_NAME,
} from "../lib/participantDisplay";
import { readFeedMutesForEmail } from "../lib/feedMutePersistence";
import {
  countUnreadFeedReactionPosts,
  markOwnedPostReactionsSeen,
  readFeedReactionSeenForEmail,
} from "../lib/feedReactionUnread";
import { mergeSyncedMessages, mergeSyncedPosts } from "../lib/mergeEncryptedSync";
import { mergeCloudChatsWithLocalReadBy, mergeReadByMaps } from "../lib/mergeChatReadBy";
import { yieldToUi } from "../lib/yieldToUi";
import { makeStyles } from "../styles/makeAppStyles";
import { AddFriendScreen } from "../screens/AddFriendScreen";
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
  DEMO_OFFLINE_ACCOUNTS,
  DEMO_OFFLINE_MODE,
  EMAIL_OTP_ENABLED,
  DEMO_SHARED_FRIEND_IDS,
  DEMO_USER_A_FRIEND_IDS,
  DEMO_USER_A_ONLY_FRIEND_IDS,
  DEMO_USER_B_FRIEND_IDS,
  DEMO_USER_B_ONLY_FRIEND_IDS,
  FAKE_BIOS,
  FEED_MUTE_CHOICES,
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
} from "../theme/preludeConstants";
import {
  readFriendKeyBundleCache,
  readSyncWatermarks,
  shouldResetSyncCacheForAppBuild,
  writeFriendKeyBundleCache,
  writeSyncWatermarks,
} from "../lib/clientSyncCache";


type SignedInTreeConstraint = {
  styles: any;
  theme: any;
  isDarkMode: any;
  isOnline: any;
  safeTop: any;
  fullScreenPost: any;
  fullScreenPostLive: any;
  closeFullscreenPost: any;
  composerKavEnabled: any;
  submitFullscreenPostComment: any;
  insets: any;
  feedPostCardShared: any;
  feedPostGalleryProps: any;
  togglePostReaction: any;
  setPostFullscreenThreadReplyKey: any;
  postCommentInputRef: any;
  postFullscreenThreadReplyKey: any;
  keyboardVisible: any;
  keyboardHeight: any;
  postCommentInput: any;
  handlePostCommentInputChange: any;
  postCommentTextRef: any;
  reactionDetailPost: any;
  setReactionDetailPost: any;
  feedReactionDetailRows: { userId: string; emoji: string; name: string }[];
  showHome: any;
  homeColumnSlideSurface: any;
  mainNavSlideStyle: any;
  homeNavIconHighlight: any;
  homeNavBadges: any;
  openPostComposer: any;
  openSettingsScreen: any;
  openMyProfile: any;
  openFriendsListFromHome: any;
  openHomeChatsFromNav: any;
  openHomeFeedFromNav: any;
  openAddFriendFromHome: any;
  confirmLogout: any;
  mainNavSwipePan: any;
  isSurfaceVisible: any;
  isHomeToHome: any;
  incomingMainNav: any;
  currentMainNav: any;
  prioritizedOnlineFriends: Friend[];
  onlineStripContentStyle: any;
  onlineStripLayout: any;
  findOrCreateChatWithFriend: any;
  renderAvatar: any;
  visibleSortedChats: Chat[];
  friendMap: any;
  lastMessageByChatId: any;
  resolvePd: any;
  resolvedStoredChatListTitle: any;
  unreadChatIdSet: any;
  openFriendProfile: any;
  openChatFromHome: any;
  openChatRowActions: any;
  unfriendedIds: any;
  serverFriendUidsForDisplay: any;
  identityLockedChatIdsSet: any;
  localAcceptedFriendIds: any;
  visibleThreadMessagesByChatId: any;
  openStandardComposer: any;
  displayedFeedPosts: Post[];
  feedRefreshing: any;
  setFeedDisplayLimit: any;
  setFeedRefreshing: any;
  setFeedPullNonce: Dispatch<SetStateAction<number>>;
  onFeedEndReached: any;
  feedLoadingMore: any;
  markFeedPostsForMediaResolve: any;
  feedViewableHydrateTimerRef: any;
  hydratePrivateThreadForPost: any;
  feedViewabilityConfig: any;
  feedMediaResolveIds: any;
  openPostViewerFromFeed: any;
  view: any;
  resolveFriendProfileCard: any;
  friendProfilePosts: any;
  friendProfileMediaPosts: Post[];
  postGridLayout: any;
  renderPostGridCell: any;
  visibleFriendProfileFeedPosts: Post[];
  friendProfileFeedHasMore: any;
  loadMoreProfileFeedPosts: any;
  myProfileScrollRef: any;
  myProfileBioPin: any;
  pickProfileImage: any;
  myProfilePictureUrl: any;
  myBio: any;
  myBioTextEntryOpen: any;
  setMyBioTextEntryOpen: any;
  bioInputRef: any;
  setMyBio: any;
  myProfileMediaPosts: Post[];
  confirmDeletePost: any;
  visibleMyProfileFeedPosts: Post[];
  myProfileFeedHasMore: any;
  backendSessionReady: any;
  pairingRegisterPinWithRetryParent: any;
  pairingAwaitPinRedeemParent: any;
  pairingConfirmPinReadParent: any;
  pairingConfirmRedeemerDualConfirmParent: any;
  pairingAwaitIssuerFinalConfirmParent: any;
  pairingFinalizePinOfferParent: any;
  ensurePairingLocationPermission: any;
  ensurePairingCameraPermission: any;
  pairingCancelPinOfferParent: any;
  pairingPollOfferStillPresentParent: any;
  pairingGetOfferStatusParent: any;
  registerAddFriendPairingAbort: any;
  setView: any;
  activeChatSharedMedia: Message[];
  videoPrepareRequestedIds: any;
  setVideoPrepareRequestedIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  openFullscreenMedia: any;
  publishPostScrollRef: any;
  publishCaptionPin: any;
  promptPostPhotoSource: any;
  postDraftImageUris: string[];
  postDraftVideoUri: any;
  postDraftImageCaptions: any;
  capturePostPhoto: any;
  pickPostPhotos: any;
  pickPostVideo: any;
  publishCaptionInputRef: any;
  postDraftText: any;
  setPostDraftText: any;
  publishPost: any;
  friendsListSearch: any;
  setFriendsListSearch: any;
  friendsListFiltered: Friend[];
  isFriendFeedMuted: any;
  openFriendProfileFromFriendsList: any;
  handleFriendsListFriendLongPress: any;
  showChatScreen: any;
  chatInputTextRef: any;
  sendMessage: any;
  onBackFromChat: any;
  canEditActiveGroupMeta: any;
  activeDirectCounterpartPd: any;
  activeChatKind: any;
  activeCounterpartIds: any;
  pendingDraft: PendingDraft | null;
  resolvedChat: Chat | null;
  setChatPictureDraft: any;
  activeHeaderPicture: any;
  setEditChatPictureOpen: any;
  chatScreenTitle: any;
  setChatTitleDraft: any;
  setEditChatMetaOpen: any;
  chatScreenTitleWithCount: any;
  setChatOverflowOpen: any;
  chatSearchVisible: any;
  chatSearch: any;
  setChatSearch: any;
  invertedChatMessagesForList: Message[];
  replyTargetMessageId: any;
  activeChatListRenderKey: any;
  readAvatarsForActiveChat: Record<string, string[]>;
  chatPaginationEnabled: any;
  handleChatListEndReached: any;
  chatLoadingOlder: any;
  chatListCanExpandLocally: any;
  getReactionEntries: any;
  retryFailedMessage: any;
  deleteFailedMessage: any;
  messageById: any;
  getCaptionedMediaLayout: any;
  reactTheme: any;
  getBackendSession: any;
  openReactionPickerForMessage: any;
  handleChatMessagePress: any;
  setSelectedBroadcastThreadFriendId: any;
  setMeasuredChatMediaByMessageId: Dispatch<SetStateAction<Record<string, { width: number; height: number }>>>;
  playingVideoMessageId: any;
  setVideoPlayAfterPrepareId: any;
  setPlayingVideoMessageId: Dispatch<SetStateAction<string | null>>;
  videoPlayAfterPrepareId: any;
  cancelVideoPrepare: any;
  rememberChatVideoDimensions: any;
  playingVoiceMessageId: any;
  voiceLoadingMessageId: any;
  voicePlaybackProgress: any;
  toggleVoiceMessagePlayback: any;
  isDirectTombstoneChat: any;
  editingMessage: any;
  setEditingMessageId: any;
  isActiveBroadcastCreator: any;
  voiceNoteMode: any;
  voiceRecordStartedAt: any;
  voiceRecordElapsedSec: any;
  pendingVoiceNote: any;
  togglePendingVoicePreview: any;
  previewVoicePlaying: any;
  discardPendingVoiceNote: any;
  sendPendingVoiceNote: any;
  pendingChatMediaAttachment: any;
  pendingChatMediaLayout: any;
  chatInput: any;
  discardPendingChatMedia: any;
  replyTargetMessage: any;
  setReplyTargetMessageId: any;
  showCompactComposer: any;
  broadcastRecipientComposerLocked: any;
  toggleVoiceNoteMode: any;
  sendCameraMedia: any;
  sendGalleryPhoto: any;
  sendGalleryVideo: any;
  chatInputRef: any;
  handleChatInputChange: any;
  onComposerPrimaryPress: any;
  chatComposerOpen: any;
  closeComposer: any;
  openBroadcastPicker: any;
  composerSearch: any;
  setComposerSearch: any;
  availableComposerFriends: Friend[];
  selectedComposerIds: any;
  toggleFriendSelection: any;
  onPressCreateStandardChat: any;
  broadcastPickerOpen: any;
  closeBroadcastPicker: any;
  setPendingStandardGroupCreateAfterTitle: any;
  setCreateTitleDraft: any;
  buildComposerHeaderTitle: any;
  setCreateTitleEditOpen: any;
  setBroadcastGroupDropdownOpen: Dispatch<SetStateAction<boolean>>;
  selectedBroadcastGroup: any;
  broadcastGroupDropdownOpen: any;
  savedBroadcastGroups: SavedBroadcastGroup[];
  applySavedBroadcastGroup: any;
  toggleSelectAllBroadcastFriends: any;
  allFriends: any;
  composerCustomTitle: any;
  setComposerCustomTitle: any;
  createOrOpenChat: any;
  saveBroadcastGroupPromptOpen: any;
  setSaveBroadcastGroupPromptOpen: any;
  setPendingBroadcastCreateIds: any;
  pendingBroadcastCreateIds: any;
  continueToBroadcastDraft: any;
  setBroadcastGroupNameDraft: any;
  setSaveBroadcastGroupNameModalOpen: any;
  saveBroadcastGroupNameModalOpen: any;
  broadcastGroupNameDraft: any;
  handleBroadcastGroupNameConfirm: any;
  createTitleEditOpen: any;
  setCreateGroupPictureUri: any;
  pendingStandardGroupCreateAfterTitle: any;
  pickCreateGroupPicture: any;
  createGroupPictureUri: any;
  createTitleDraft: any;
  composerMode: any;
  editChatMetaOpen: any;
  chatTitleDraft: any;
  saveChatTitle: any;
  editChatPictureOpen: any;
  chatPictureDraft: any;
  saveChatPicture: any;
  reactionPickerOpen: any;
  setReactionPickerOpen: any;
  setPostReactionTargetId: any;
  setCommentReactionTarget: any;
  setReactionTargetMessageId: any;
  messageActionTarget: any;
  postReactionTargetId: any;
  commentReactionTarget: any;
  startReplyToMessage: any;
  startEditMessage: any;
  unsendTargetMessage: any;
  reactionPickerActiveEmoji: any;
  removeActiveReaction: any;
  applyReaction: any;
  setIsDarkMode: any;
  hapticSettings: any;
  goToOpenSourceLicenses: any;
  setThemePickerOpen: any;
  colorThemeId: any;
  resetLocalStateForCurrentUser: any;
  confirmDeleteAccount: any;
  themePickerOpen: any;
  setColorThemeId: any;
  chatOverflowOpen: any;
  setMembersModalOpen: any;
  setChatSearchVisible: any;
  setAddMemberSearch: any;
  setAddMemberModalOpen: any;
  confirmLeaveChat: any;
  membersModalOpen: any;
  addMemberModalOpen: any;
  addMemberSearch: any;
  filteredFriendsToAdd: Friend[];
  addMemberToChat: any;
  eligibleFriendsToAdd: any;
  fullscreenMedia: any;
  setFullscreenMedia: any;
  setPostMediaGalleryIndex: any;
  imageCropVisible: any;
  imageCropUri: any;
  imageCropAspect: any;
  handleImageCropComplete: any;
  cancelImageCropFlow: any;
  videoThumbnailModalOpen: any;
  videoThumbnailDefaultPosterUri: any;
  videoThumbnailPreviewLoading: any;
  closeVideoThumbnailModal: any;
  finalizeVideoPosterAndPublish: any;
  photoEditorOpen: any;
  cancelPhotoEditor: any;
  setPhotoEditorInCrop: any;
  photoEditorCropExitTick: any;
  completePhotoEditor: any;
  photoEditorAsset: any;
  photoEditorMediaType: any;
  photoEditorTarget: any;
};
export function SignedInTree<P extends SignedInTreeConstraint>(props: P) {
  const {
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
  } = props;
  return (
    <View style={[styles.screenRoot, { backgroundColor: theme.background }]}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      {!isOnline ? (
        <View
          style={[styles.offlineBanner, { top: safeTop }]}
          accessibilityRole="text"
          accessibilityLabel="You are offline. Showing cached content."
        >
          <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
          <Text style={styles.offlineBannerText}>
            You&apos;re offline — showing cached content
          </Text>
        </View>
      ) : null}
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID="bioInputAccessory">
          <View style={styles.inputAccessoryBar}>
            <PressAckButton
              style={styles.inputAccessoryBarButton}
              onPress={() => {
                Keyboard.dismiss();
              }}
            >
              <Text style={styles.inputAccessoryBarButtonText}>Done</Text>
            </PressAckButton>
          </View>
        </InputAccessoryView>
      ) : null}

      {fullScreenPost && fullScreenPostLive ? (
        <Modal
          visible
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={closeFullscreenPost}
        >
          <KeyboardAvoidingView
            style={[styles.fullScreenPostRoot, { backgroundColor: theme.background }]}
            behavior="padding"
            enabled={composerKavEnabled}
            keyboardVerticalOffset={safeTop}
          >
            <View style={{ paddingTop: safeTop, flex: 1 }}>
              {Platform.OS === "ios" ? (
                <InputAccessoryView nativeID="postCommentInputAccessory">
                  <View style={styles.inputAccessoryBar}>
                    <PressAckButton
                      style={styles.inputAccessoryBarButton}
                      onPress={() => {
                        void submitFullscreenPostComment();
                      }}
                      accessibilityLabel="Send comment"
                    >
                      <Text style={styles.inputAccessoryBarButtonText}>Send</Text>
                    </PressAckButton>
                    <PressAckButton
                      style={styles.inputAccessoryBarButton}
                      onPress={() => Keyboard.dismiss()}
                      accessibilityLabel="Dismiss keyboard"
                    >
                      <Text style={styles.inputAccessoryBarButtonText}>Done</Text>
                    </PressAckButton>
                  </View>
                </InputAccessoryView>
              ) : null}
              <View style={styles.fullScreenPostHeader}>
                <PressAckButton
                  style={styles.iconButton}
                  onPress={closeFullscreenPost}
                  accessibilityLabel="Close full screen post"
                >
                  <Ionicons name="close" size={26} color={theme.text} />
                </PressAckButton>
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
                  {...feedPostGalleryProps(fullScreenPostLive)}
                  post={fullScreenPostLive}
                  inFullscreenModal
                  hideComposers
                  onToggleReaction={(emoji) => togglePostReaction(fullScreenPostLive, emoji)}
                  onOpenThreadReply={
                    fullScreenPostLive.authorId === CURRENT_USER_ID
                      ? (cid) => {
                          setPostFullscreenThreadReplyKey(`${fullScreenPostLive.id}:${cid}`);
                          requestAnimationFrame(() => postCommentInputRef.current?.focus());
                        }
                      : undefined
                  }
                />
              </ScrollViewUntilScroll>
              {fullScreenPostLive ? (
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
                      <PressAckButton
                        onPress={() => setPostFullscreenThreadReplyKey(null)}
                        style={styles.replyBannerClose}
                        accessibilityLabel="Leave thread reply"
                      >
                        <Ionicons name="close" size={16} color={theme.text} />
                      </PressAckButton>
                    </View>
                  ) : fullScreenPostLive.authorId === CURRENT_USER_ID ? (
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
                        paddingBottom: keyboardComposerBottomPadding(
                          insets.bottom,
                          keyboardVisible,
                          keyboardHeight
                        ),
                      },
                    ]}
                  >
                    <TextInput
                      ref={postCommentInputRef}
                      editable={
                        fullScreenPostLive.authorId !== CURRENT_USER_ID ||
                        !!postFullscreenThreadReplyKey
                      }
                      value={postCommentInput}
                      onChangeText={handlePostCommentInputChange}
                      placeholder={
                        fullScreenPostLive.authorId !== CURRENT_USER_ID || postFullscreenThreadReplyKey
                          ? postFullscreenThreadReplyKey
                            ? "Reply…"
                            : "Add comment ..."
                          : "Tap Reply on a comment above"
                      }
                      placeholderTextColor={theme.subtleText}
                      style={[
                        styles.chatInputMultiline,
                        fullScreenPostLive.authorId === CURRENT_USER_ID &&
                        !postFullscreenThreadReplyKey
                          ? { opacity: 0.55 }
                          : null,
                      ]}
                      multiline
                      textAlignVertical="top"
                      returnKeyType="send"
                      blurOnSubmit={false}
                      inputAccessoryViewID={Platform.OS === "ios" ? "postCommentInputAccessory" : undefined}
                      onSubmitEditing={() => {
                        if (readComposerTextTrimmed(postCommentTextRef)) {
                          void submitFullscreenPostComment();
                        }
                      }}
                    />
                    <PressAckButton
                      disabled={
                        (fullScreenPostLive.authorId === CURRENT_USER_ID &&
                          !postFullscreenThreadReplyKey) ||
                        !postCommentInput.trim()
                      }
                      style={[
                        styles.sendButtonChat,
                        (fullScreenPostLive.authorId === CURRENT_USER_ID &&
                          !postFullscreenThreadReplyKey) ||
                        !postCommentInput.trim()
                          ? { opacity: 0.45 }
                          : null,
                      ]}
                      onPress={() => void submitFullscreenPostComment()}
                      accessibilityLabel="Send comment"
                    >
                      <Ionicons name="send" size={16} color="#FFFFFF" />
                    </PressAckButton>
                  </View>
                </View>
              ) : null}
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
            <PressAckButton
              style={styles.reactionDetailModalBackdrop}
              onPress={() => setReactionDetailPost(null)}
              accessibilityLabel="Dismiss"
            />
            <View style={[styles.reactionDetailModalCard, { backgroundColor: theme.background }]}>
              <View style={styles.reactionDetailModalHeader}>
                <Text style={styles.reactionDetailModalTitle}>Reactions</Text>
                <PressAckButton
                  style={styles.iconButton}
                  onPress={() => setReactionDetailPost(null)}
                  accessibilityLabel="Close reactions"
                >
                  <Ionicons name="close" size={22} color={theme.text} />
                </PressAckButton>
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
        <Animated.View
          style={[
            styles.homeColumn,
            { paddingTop: safeTop, overflow: "hidden" as const, backgroundColor: theme.background },
            homeColumnSlideSurface ? mainNavSlideStyle(homeColumnSlideSurface) : null,
          ]}
        >
          <View style={{ paddingHorizontal: 14 }}>
          <HomeTopNavBar
            theme={theme}
            styles={styles}
            highlight={homeNavIconHighlight}
            badges={homeNavBadges}
            onOpenCreatePost={openPostComposer}
            onOpenSettings={openSettingsScreen}
            onOpenMyProfile={openMyProfile}
            onOpenFriendsList={openFriendsListFromHome}
            onOpenHomeChats={openHomeChatsFromNav}
            onOpenHomeFeed={openHomeFeedFromNav}
            onOpenAddFriend={openAddFriendFromHome}
            onLogout={confirmLogout}
          />
          </View>

          <View style={{ flex: 1, minHeight: 0, overflow: "hidden" as const }} {...mainNavSwipePan.panHandlers}>
          {isSurfaceVisible("chats") ? (
            <Animated.View
              style={[
                styles.homeMainSwipeLayer,
                { backgroundColor: theme.background },
                isHomeToHome ? StyleSheet.absoluteFillObject : null,
                isHomeToHome ? mainNavSlideStyle("chats") : null,
              ]}
              pointerEvents={incomingMainNav === "chats" && currentMainNav !== "chats" ? "none" : "auto"}
            >
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
                      <PressAckButton
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
                      </PressAckButton>
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
                  const isUnread = unreadChatIdSet.has(item.id);
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
                        <PressAckButton
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
                        </PressAckButton>
                        <PressAckButton
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
                                  isUnread ? styles.chatNameUnread : null,
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
                            <Text
                              style={[styles.chatPreview, isUnread ? styles.chatPreviewUnread : null]}
                              numberOfLines={1}
                            >
                              {buildHomeChatPreview(
                                item,
                                lastMessage,
                                friendMap,
                                unfriendedIds,
                                serverFriendUidsForDisplay,
                                identityLockedChatIdsSet,
                                localAcceptedFriendIds
                              )}
                            </Text>
                          </View>
                          <Text style={styles.chatTimestamp}>
                            {formatDayTime(
                              chatListSortTimestampMs(
                                item,
                                lastMessage,
                                visibleThreadMessagesByChatId[item.id] ?? []
                              )
                            )}
                          </Text>
                          {isUnread ? <View style={styles.chatUnreadDot} /> : null}
                        </PressAckButton>
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
                  <PressAckButton
                    style={styles.startChatButton}
                    onPress={openStandardComposer}
                  >
                    <MaterialCommunityIcons name="email-plus-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.startChatButtonText}>Start Chat</Text>
                  </PressAckButton>
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
            </Animated.View>
          ) : null}
          {isSurfaceVisible("feed") ? (
            <Animated.View
              style={[
                styles.homeMainSwipeLayer,
                { backgroundColor: theme.background },
                isHomeToHome ? StyleSheet.absoluteFillObject : null,
                isHomeToHome ? mainNavSlideStyle("feed") : null,
              ]}
              pointerEvents={incomingMainNav === "feed" && currentMainNav !== "feed" ? "none" : "auto"}
            >
              <FlatListUntilScroll
                style={styles.chatListFlex}
                data={displayedFeedPosts}
                keyExtractor={(item) => item.id}
                onScrollBeginDrag={() => {
                  suspendMediaPlayback();
                  setPlayingVideoMessageId(null);
                  setVideoPlayAfterPrepareId(null);
                }}
                initialNumToRender={FEED_UI_INITIAL_COUNT}
                maxToRenderPerBatch={2}
                windowSize={5}
                removeClippedSubviews
                contentContainerStyle={[
                  styles.feedList,
                  { paddingBottom: homeBottomActionClearance(insets.bottom) },
                ]}
                refreshControl={
                  <RefreshControl
                    refreshing={feedRefreshing}
                    onRefresh={() => {
                      setFeedDisplayLimit(FEED_UI_INITIAL_COUNT);
                      setFeedRefreshing(true);
                      setFeedPullNonce((n) => n + 1);
                    }}
                    tintColor={theme.accent}
                  />
                }
                onEndReached={onFeedEndReached}
                onEndReachedThreshold={0.35}
                ListFooterComponent={
                  feedLoadingMore ? (
                    <ActivityIndicator style={{ marginVertical: 16 }} color={theme.accent} />
                  ) : null
                }
                onViewableItemsChanged={({ viewableItems }: { viewableItems: ViewToken[] }) => {
                  const visiblePosts = viewableItems
                    .filter((v) => v.isViewable && v.item)
                    .map((v) => v.item as Post);
                  if (visiblePosts.length > 0) {
                    markFeedPostsForMediaResolve(visiblePosts.map((post) => post.id));
                    if (feedViewableHydrateTimerRef.current) {
                      clearTimeout(feedViewableHydrateTimerRef.current);
                    }
                    feedViewableHydrateTimerRef.current = setTimeout(() => {
                      for (const visiblePost of visiblePosts.slice(0, 3)) {
                        void hydratePrivateThreadForPost(visiblePost);
                      }
                    }, 500);
                  }
                }}
                viewabilityConfig={feedViewabilityConfig}
                ItemSeparatorComponent={() => <View style={styles.feedSeparator} />}
                ListEmptyComponent={<Text style={styles.feedEmpty}>No posts from friends yet.</Text>}
                renderItem={({ item }) => (
                  <FeedPostCard
                    {...feedPostCardShared}
                    {...feedPostGalleryProps(item)}
                    post={item}
                    resolveMediaEnabled={feedMediaResolveIds.has(item.id)}
                    onToggleReaction={(emoji) => togglePostReaction(item, emoji)}
                    onOpenViewer={() => openPostViewerFromFeed(item)}
                  />
                )}
              />
            </Animated.View>
          ) : null}
          </View>
        </Animated.View>
      ) : null}

      {view.screen === "friendProfile" && resolveFriendProfileCard(view.friendId) ? (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 20 }]}
          behavior="padding"
          enabled={composerKavEnabled}
          keyboardVerticalOffset={safeTop}
        >
          <View style={[styles.fullScreen, { paddingTop: safeTop }]}>
            <HomeTopNavBar
              theme={theme}
              styles={styles}
              highlight={homeNavIconHighlight}
              badges={homeNavBadges}
              onOpenCreatePost={openPostComposer}
              onOpenSettings={openSettingsScreen}
              onOpenMyProfile={openMyProfile}
              onOpenFriendsList={openFriendsListFromHome}
              onOpenHomeChats={openHomeChatsFromNav}
              onOpenHomeFeed={openHomeFeedFromNav}
              onOpenAddFriend={openAddFriendFromHome}
              onLogout={confirmLogout}
            />
            <ScrollViewUntilScroll
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={() => {
                suspendMediaPlayback();
                setPlayingVideoMessageId(null);
                setVideoPlayAfterPrepareId(null);
              }}
              contentContainerStyle={[
                styles.friendProfileScroll,
                keyboardHeight > 0 ? { paddingBottom: keyboardScrollPadding(keyboardHeight) } : null,
              ]}
            >
              <View style={styles.friendHeroImageFrame}>
                <Image
                  source={{ uri: resolveFriendProfileCard(view.friendId)?.profilePictureUrl }}
                  style={styles.friendHeroImageFill}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.friendHeroName}>
                {resolveFriendProfileCard(view.friendId)?.displayName}
              </Text>
              <FriendSafetyNumber
                friendUid={String(friendMap[view.friendId]?.backendUid ?? "")}
                style={styles.friendHeroStatus}
              />
              {(resolveFriendProfileCard(view.friendId)?.bio ?? "").trim().length > 0 ? (
                <Text style={styles.friendHeroBio}>
                  {resolveFriendProfileCard(view.friendId)?.bio}
                </Text>
              ) : null}
              <Text style={styles.friendHeroStatus}>
                {!isOnline
                  ? "Not connected to internet"
                  : resolveFriendProfileCard(view.friendId)?.online
                    ? "Online"
                    : "Offline"}
              </Text>
              {!isOnline && friendProfilePosts.length === 0 && friendProfileMediaPosts.length === 0 ? (
                <View style={styles.profilePostsSection}>
                  <Text style={styles.feedEmpty}>
                    Not connected to internet — posts and media can&apos;t be loaded right now.
                  </Text>
                </View>
              ) : (
                <>
                  {friendProfileMediaPosts.length > 0 ? (
                    <View style={styles.profilePostsSection}>
                      {chunkBy(friendProfileMediaPosts, 3).map((row, ri) => (
                        <View
                          key={`fp-row-${ri}`}
                          style={[styles.postGridRow, { marginBottom: postGridLayout.gap }]}
                        >
                          {row.map((p, ci) => (
                            <PressAckButton
                              key={p.id}
                              onPress={() => openPostViewerFromFeed(p)}
                              style={{
                                marginRight: ci < row.length - 1 ? postGridLayout.gap : 0,
                              }}
                            >
                              {renderPostGridCell(p)}
                            </PressAckButton>
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <View style={[styles.profilePostsSection, styles.profilePostsFeedList]}>
                    {visibleFriendProfileFeedPosts.map((post) => (
                      <FeedPostCard
                        {...feedPostCardShared}
                        {...feedPostGalleryProps(post)}
                        key={`friend-post-${post.id}`}
                        post={post}
                        onToggleReaction={(emoji) => togglePostReaction(post, emoji)}
                        onOpenViewer={() => openPostViewerFromFeed(post)}
                      />
                    ))}
                    {friendProfileFeedHasMore ? (
                      <PressAckButton
                        style={styles.profileFeedLoadMoreBtn}
                        onPress={loadMoreProfileFeedPosts}
                        accessibilityLabel="Load more posts"
                      >
                        <Text style={styles.profileFeedLoadMoreText}>Load more posts</Text>
                      </PressAckButton>
                    ) : null}
                  </View>
                </>
              )}
            </ScrollViewUntilScroll>
            <View style={[styles.profileBottomBar, { paddingBottom: stickyFooterPadding(insets.bottom) }]}>
              <PressAckButton
                style={styles.primaryButton}
                onPress={() => {
                  findOrCreateChatWithFriend(view.friendId);
                }}
              >
                <Text style={styles.primaryButtonText}>Start chat</Text>
              </PressAckButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {isSurfaceVisible("myProfile") ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: theme.background, zIndex: 20, overflow: "hidden" as const },
            mainNavSlideStyle("myProfile"),
          ]}
          pointerEvents={incomingMainNav === "myProfile" && currentMainNav !== "myProfile" ? "none" : "auto"}
        >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          enabled={composerKavEnabled}
          keyboardVerticalOffset={safeTop}
        >
          <View style={[styles.fullScreen, { paddingTop: safeTop }]} {...mainNavSwipePan.panHandlers}>
            <HomeTopNavBar
              theme={theme}
              styles={styles}
              highlight={homeNavIconHighlight}
              badges={homeNavBadges}
              onOpenCreatePost={openPostComposer}
              onOpenSettings={openSettingsScreen}
              onOpenMyProfile={openMyProfile}
              onOpenFriendsList={openFriendsListFromHome}
              onOpenHomeChats={openHomeChatsFromNav}
              onOpenHomeFeed={openHomeFeedFromNav}
              onOpenAddFriend={openAddFriendFromHome}
              onLogout={confirmLogout}
            />
            <ScrollViewUntilScroll
              ref={myProfileScrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScroll={myProfileBioPin.onScroll}
              onScrollBeginDrag={() => {
                suspendMediaPlayback();
                setPlayingVideoMessageId(null);
                setVideoPlayAfterPrepareId(null);
              }}
              scrollEventThrottle={16}
              contentContainerStyle={[
                styles.friendProfileScroll,
                keyboardHeight > 0 ? { paddingBottom: keyboardScrollPadding(keyboardHeight) } : null,
              ]}
            >
              <PressAckButton onPress={pickProfileImage}>
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
              </PressAckButton>
              {myBio.trim().length > 0 && !myBioTextEntryOpen ? (
                <PressAckButton
                  onLongPress={() => {
                    setMyBioTextEntryOpen(true);
                    setTimeout(() => {
                      bioInputRef.current?.focus();
                      myProfileBioPin.pinOnFocus();
                    }, 80);
                  }}
                  delayLongPress={450}
                  accessibilityLabel="Bio. Long press to edit."
                >
                  <Text style={styles.friendHeroBio}>{myBio}</Text>
                </PressAckButton>
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
                    onFocus={myProfileBioPin.pinOnFocus}
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
                        <PressAckButton
                          key={p.id}
                          onPress={() => openPostViewerFromFeed(p)}
                          onLongPress={() => confirmDeletePost(p)}
                          delayLongPress={450}
                          style={{
                            marginRight: ci < row.length - 1 ? postGridLayout.gap : 0,
                          }}
                        >
                          {renderPostGridCell(p)}
                        </PressAckButton>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={[styles.profilePostsSection, styles.profilePostsFeedList]}>
                {visibleMyProfileFeedPosts.map((post) => (
                  <FeedPostCard
                    {...feedPostCardShared}
                    {...feedPostGalleryProps(post)}
                    key={`my-post-${post.id}`}
                    post={post}
                    onToggleReaction={(emoji) => togglePostReaction(post, emoji)}
                    onOpenViewer={() => openPostViewerFromFeed(post)}
                  />
                ))}
                {myProfileFeedHasMore ? (
                  <PressAckButton
                    style={styles.profileFeedLoadMoreBtn}
                    onPress={loadMoreProfileFeedPosts}
                    accessibilityLabel="Load more posts"
                  >
                    <Text style={styles.profileFeedLoadMoreText}>Load more posts</Text>
                  </PressAckButton>
                ) : null}
              </View>
            </ScrollViewUntilScroll>
          </View>
        </KeyboardAvoidingView>
        </Animated.View>
      ) : null}

      {isSurfaceVisible("addFriend") ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: theme.background, zIndex: 26, overflow: "hidden" as const },
            mainNavSlideStyle("addFriend"),
          ]}
          pointerEvents={incomingMainNav === "addFriend" && currentMainNav !== "addFriend" ? "none" : "auto"}
          {...mainNavSwipePan.panHandlers}
        >
          <AddFriendScreen
            theme={theme}
            isDarkMode={isDarkMode}
            safeTop={safeTop}
            bottomInset={stickyFooterPadding(insets.bottom)}
            navHighlight={homeNavIconHighlight}
            navBadges={homeNavBadges}
            styles={styles}
            onOpenCreatePost={openPostComposer}
            onOpenSettings={openSettingsScreen}
            onOpenMyProfile={openMyProfile}
            onOpenFriendsList={openFriendsListFromHome}
            onOpenAddFriend={openAddFriendFromHome}
            onOpenHomeChats={openHomeChatsFromNav}
            onOpenHomeFeed={openHomeFeedFromNav}
            onLogout={confirmLogout}
            pairingBackendReady={backendSessionReady}
            onPairingRegisterPinWithRetry={pairingRegisterPinWithRetryParent}
            onPairingAwaitPinRedeem={pairingAwaitPinRedeemParent}
            onPairingConfirmPinRead={pairingConfirmPinReadParent}
            onPairingConfirmRedeemerDualConfirm={pairingConfirmRedeemerDualConfirmParent}
            onPairingAwaitIssuerFinalConfirm={pairingAwaitIssuerFinalConfirmParent}
            onPairingFinalizePinOffer={pairingFinalizePinOfferParent}
            onEnsurePairingLocationPermission={ensurePairingLocationPermission}
            onEnsurePairingCameraPermission={ensurePairingCameraPermission}
            onPairingCancelPinOffer={pairingCancelPinOfferParent}
            onPairingPollOfferStillPresent={pairingPollOfferStillPresentParent}
            onPairingGetOfferStatus={pairingGetOfferStatusParent}
            onRegisterPairingAbort={registerAddFriendPairingAbort}
          />
        </Animated.View>
      ) : null}

      {view.screen === "chatSharedMedia" ? (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 28 }]}
        >
          <View style={{ flex: 1, paddingTop: safeTop, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <PressAckButton
                onPress={() => setView({ screen: "chat", chatId: view.chatId })}
                style={styles.iconButton}
                accessibilityLabel="Back to chat"
              >
                <Ionicons name="arrow-back" size={22} color={theme.text} />
              </PressAckButton>
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
                <ChatMessageMediaResolver
                  message={m}
                  resolveEnabled={!m.mediaEncrypted || videoPrepareRequestedIds.has(m.id)}
                >
                  {(resolvedUri, resolving) => {
                    if (m.kind === "video" && m.mediaEncrypted && !resolvedUri) {
                      return (
                        <PressAckButton
                          onPress={() => {
                            setVideoPrepareRequestedIds((prev) => {
                              if (prev.has(m.id)) return prev;
                              const next = new Set(prev);
                              next.add(m.id);
                              return next;
                            });
                          }}
                          style={{ width: postGridLayout.cell, height: postGridLayout.cell }}
                        >
                          <View
                            style={[
                              styles.postGridCell,
                              { width: postGridLayout.cell, height: postGridLayout.cell },
                            ]}
                          >
                            {resolving ? (
                              <ActivityIndicator color={theme.accent} style={styles.postGridImage} />
                            ) : (
                              <View
                                style={[
                                  styles.postGridImage,
                                  { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
                                ]}
                              >
                                <Ionicons name="play" size={28} color="#fff" />
                              </View>
                            )}
                          </View>
                        </PressAckButton>
                      );
                    }
                    if (!resolvedUri) {
                      return <View style={{ height: 1 }} />;
                    }
                    return (
                <PressAckButton
                  onPress={() =>
                    openFullscreenMedia(
                      resolvedUri,
                      m.kind === "video" ? "video" : m.kind === "gif" ? "gif" : "photo"
                    )
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
                      <View
                        style={[
                          styles.postGridImage,
                          { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
                        ]}
                      >
                        <Ionicons name="videocam" size={22} color="rgba(255,255,255,0.65)" />
                      </View>
                      <View style={styles.postGridPlayBadge}>
                        <Ionicons name="play" size={18} color="#fff" />
                      </View>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.postGridCell,
                        { width: postGridLayout.cell, height: postGridLayout.cell },
                      ]}
                    >
                      <Image
                        source={{ uri: resolvedUri }}
                        style={styles.postGridImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}
                </PressAckButton>
                    );
                  }}
                </ChatMessageMediaResolver>
              )}
            />
          </View>
        </View>
      ) : null}

      {view.screen === "publishPost" ? (
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 27 }]}
          behavior="padding"
          enabled={composerKavEnabled}
          keyboardVerticalOffset={safeTop}
        >
          <View style={{ flex: 1, paddingTop: safeTop, paddingHorizontal: 16, minHeight: 0 }}>
            <HomeTopNavBar
              theme={theme}
              styles={styles}
              highlight={homeNavIconHighlight}
              badges={homeNavBadges}
              onOpenCreatePost={openPostComposer}
              onOpenSettings={openSettingsScreen}
              onOpenMyProfile={openMyProfile}
              onOpenFriendsList={openFriendsListFromHome}
              onOpenHomeChats={openHomeChatsFromNav}
              onOpenHomeFeed={openHomeFeedFromNav}
              onOpenAddFriend={openAddFriendFromHome}
              onLogout={confirmLogout}
            />

            <ScrollViewUntilScroll
              ref={publishPostScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                paddingBottom:
                  keyboardHeight > 0 ? keyboardScrollPadding(keyboardHeight, 12) : 12,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScroll={publishCaptionPin.onScroll}
              scrollEventThrottle={16}
              nestedScrollEnabled
            >
              {postDraftImageUris.length > 0 || postDraftVideoUri ? (
              <PressAckButton
                onPress={promptPostPhotoSource}
                style={[
                  styles.publishMediaSlot,
                  { borderColor: theme.divider, backgroundColor: theme.replyBannerQuotingOtherBg },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add photos to post"
              >
                {postDraftVideoUri ? (
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
                    {postDraftImageUris.map((uri, index) => (
                      <View key={uri}>
                        <Image source={{ uri }} style={styles.postComposerThumb} />
                        {postDraftImageCaptions[index]?.trim() ? (
                          <Text
                            numberOfLines={2}
                            style={{ color: theme.subtleText, fontSize: 11, maxWidth: 72, marginTop: 4 }}
                          >
                            {postDraftImageCaptions[index]}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </ScrollViewUntilScroll>
                )}
              </PressAckButton>
              ) : null}

              <View style={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }}>
              <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
                <PressAckButton
                  style={[styles.iconActionPill, { borderColor: theme.divider }]}
                  onPress={() => void capturePostPhoto()}
                  accessibilityLabel="Take photo"
                >
                  <Ionicons name="camera-outline" size={22} color={theme.text} />
                </PressAckButton>
                <PressAckButton
                  style={[styles.iconActionPill, { borderColor: theme.divider }]}
                  onPress={pickPostPhotos}
                  accessibilityLabel="Add photos from gallery"
                >
                  <Ionicons name="image-outline" size={22} color={theme.text} />
                </PressAckButton>
                <PressAckButton
                  style={[styles.iconActionPill, { borderColor: theme.divider }]}
                  onPress={pickPostVideo}
                  accessibilityLabel="Add video"
                >
                  <Ionicons name="videocam-outline" size={22} color={theme.text} />
                </PressAckButton>
              </View>

              <TextInput
                ref={publishCaptionInputRef}
                value={postDraftText}
                onChangeText={setPostDraftText}
                placeholder="Write something…"
                placeholderTextColor={theme.subtleText}
                multiline
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => publishPost()}
                onFocus={publishCaptionPin.pinOnFocus}
                style={[
                  styles.publishPostCaption,
                  {
                    flex: 0,
                    flexGrow: 0,
                    alignSelf: "stretch",
                    minHeight: 120,
                    marginTop: 16,
                    color: theme.text,
                    borderColor: theme.divider,
                    textAlign: "center",
                    textAlignVertical: "center",
                  },
                ]}
              />
              </View>
            </ScrollViewUntilScroll>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {isSurfaceVisible("friendsList") ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: theme.background, zIndex: 25, overflow: "hidden" as const },
            mainNavSlideStyle("friendsList"),
          ]}
          pointerEvents={incomingMainNav === "friendsList" && currentMainNav !== "friendsList" ? "none" : "auto"}
          {...mainNavSwipePan.panHandlers}
        >
          <View style={[styles.friendsListRoot, { paddingTop: safeTop }]}>
            <HomeTopNavBar
              theme={theme}
              styles={styles}
              highlight={homeNavIconHighlight}
              badges={homeNavBadges}
              onOpenCreatePost={openPostComposer}
              onOpenSettings={openSettingsScreen}
              onOpenMyProfile={openMyProfile}
              onOpenFriendsList={openFriendsListFromHome}
              onOpenHomeChats={openHomeChatsFromNav}
              onOpenHomeFeed={openHomeFeedFromNav}
              onOpenAddFriend={openAddFriendFromHome}
              onLogout={confirmLogout}
            />
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
                  <PressAckButton
                    style={styles.friendsListRow}
                    onPress={() => openFriendProfileFromFriendsList(item.id)}
                    onLongPress={() => handleFriendsListFriendLongPress(item)}
                    accessibilityLabel={
                      mutedInFeed
                        ? `${item.displayName}. Feed muted. Long press to unmute.`
                        : `${item.displayName}. Long press for more options.`
                    }
                  >
                    <View style={styles.friendsListAvatarWrap}>
                      {renderAvatar(item.profilePictureUrl, item.displayName.slice(0, 1), 44)}
                      {mutedInFeed ? (
                        <View
                          style={styles.feedMuteBadge}
                          accessibilityLabel="Feed muted"
                        >
                          <Ionicons name="volume-mute" size={12} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.friendsListName} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                  </PressAckButton>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.subtleText}>
                  {friendsListSearch.trim() ? "No friends match." : "No friends yet."}
                </Text>
              }
            />
          </View>
        </Animated.View>
      ) : null}

      {showChatScreen ? (
        <KeyboardAvoidingView
          style={[
            styles.chatScreen,
            { paddingTop: safeTop },
            {
              bottom: androidAbsoluteOverlayKeyboardBottom(keyboardVisible, keyboardHeight),
            },
          ]}
          behavior="padding"
          enabled={composerKavEnabled}
          /** KAV already has `paddingTop: safeTop`; avoid stacking large offsets (gap above keyboard). */
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <View style={{ flex: 1 }}>
          <ChatThreadErrorBoundary
            backgroundColor={theme.background}
            accentColor={theme.accent}
            textColor={theme.text}
          >
          {Platform.OS === "ios" ? (
            <InputAccessoryView nativeID="chatInputAccessory">
              <View style={styles.inputAccessoryBar}>
                <PressAckButton
                  style={styles.inputAccessoryBarButton}
                  onPress={() => {
                    if (readComposerTextTrimmed(chatInputTextRef)) {
                      sendMessage();
                    }
                    Keyboard.dismiss();
                  }}
                >
                  <Text style={styles.inputAccessoryBarButtonText}>Send</Text>
                </PressAckButton>
              </View>
            </InputAccessoryView>
          ) : null}
          <View style={styles.chatHeader}>
            <View style={[styles.chatHeaderSideRail, styles.chatHeaderSideRailLeft]}>
              <PressAckButton style={styles.iconButton} onPress={onBackFromChat}>
                <Ionicons name="chevron-back" size={24} color={theme.accent} />
              </PressAckButton>
              <PressAckButton
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
              </PressAckButton>
            </View>
            <View style={styles.chatHeaderTitleRail}>
              <PressAckButton
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
              </PressAckButton>
            </View>
            <View style={[styles.chatHeaderSideRail, styles.chatHeaderSideRailRight]}>
              <PressAckButton
                style={styles.iconButton}
                onPress={() => setChatOverflowOpen(true)}
                accessibilityLabel="Chat options"
              >
                <Ionicons name="ellipsis-vertical" size={20} color={theme.accent} />
              </PressAckButton>
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
            data={invertedChatMessagesForList}
            keyExtractor={(item) => item.id}
            onScrollBeginDrag={() => {
              suspendMediaPlayback();
              setPlayingVideoMessageId(null);
              setVideoPlayAfterPrepareId(null);
              setVideoPrepareRequestedIds((prev) => {
                if (!videoPlayAfterPrepareId || !prev.has(videoPlayAfterPrepareId)) return prev;
                const next = new Set(prev);
                next.delete(videoPlayAfterPrepareId);
                return next;
              });
            }}
            extraData={[replyTargetMessageId, activeChatListRenderKey, unfriendedIds, readAvatarsForActiveChat]}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews={false}
            updateCellsBatchingPeriod={50}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            onEndReached={chatPaginationEnabled ? handleChatListEndReached : undefined}
            onEndReachedThreshold={chatPaginationEnabled ? 0.25 : 0}
            ListFooterComponent={
              chatLoadingOlder || chatListCanExpandLocally ? (
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
                      displayName: peerPd?.displayName ?? TOMBSTONE_DISPLAY_NAME,
                      profilePictureUrl: peerPd?.profilePictureUrl ?? "",
                      letter: peerPd?.letter ?? "U",
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
              const failedMessageActions =
                isMine && item.deliveryStatus === "failed" && !item.unsentAt ? (
                  <View
                    style={[
                      styles.failedMessageActions,
                      isMine ? styles.failedMessageActionsMine : null,
                    ]}
                  >
                    <PressAckButton
                      style={styles.failedMessageActionBtn}
                      onPress={() => retryFailedMessage(item)}
                      accessibilityLabel="Try sending again"
                    >
                      <Ionicons name="refresh" size={14} color={theme.accent} />
                      <Text style={styles.failedMessageActionText}>Try again</Text>
                    </PressAckButton>
                    <PressAckButton
                      style={styles.failedMessageActionBtn}
                      onPress={() => deleteFailedMessage(item.id)}
                      accessibilityLabel="Delete message"
                    >
                      <Ionicons name="trash-outline" size={14} color={theme.danger} />
                      <Text style={styles.failedMessageDeleteText}>Delete</Text>
                    </PressAckButton>
                  </View>
                ) : null;
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

              const messageAvatar = isMine ? null : (
                <PressAckButton
                  style={styles.messageAvatarOther}
                  onPress={() => {
                    if (item.senderId === CURRENT_USER_ID) {
                      openMyProfile();
                      return;
                    }
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
                  disabled={item.senderId !== CURRENT_USER_ID && !senderProfileTapAllowed}
                >
                  {renderAvatar(sender.profilePictureUrl, sender.letter, 30)}
                </PressAckButton>
              );

              const bubbleCardStyle = item.unsentAt
                ? [
                    styles.messageCard,
                    styles.unsentMessageCard,
                    isMine ? styles.unsentMessageCardMine : styles.unsentMessageCardOther,
                  ]
                : [
                    styles.messageCard,
                    isMine ? styles.myMessageCard : styles.otherMessageCard,
                  ];

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
                        {messageDisplayText(messageById[item.replyToMessageId])}
                      </Text>
                    </View>
                  ) : null}
                  {item.unsentAt ? (
                    <Text style={isMine ? styles.messageSystemTextMine : styles.messageSystemText}>
                      {isMine ? "You unsent a message." : "Message removed."}
                    </Text>
                  ) : messageDisplayText(item).trim() ? (
                    <Text style={isMine ? styles.messageTextMine : styles.messageText}>
                      {messageDisplayText(item)}
                    </Text>
                  ) : null}
                </>
              );

              if ((item.kind === "photo" || item.kind === "gif") && messageHasResolvableMedia(item)) {
                return (
                  <ChatMessageMediaResolver message={item}>
                    {(resolvedUri) => {
                    if (!resolvedUri) {
                      return <View style={{ height: 1 }} />;
                    }
                    const hasPhotoBubbleContent =
                        !!item.replyToMessageId ||
                        !!item.unsentAt ||
                        messageDisplayText(item).trim().length > 0;
                      const captionedPhotoLayout = getCaptionedMediaLayout(item);
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
                        <PressAckButton
                          style={[
                                  ...bubbleCardStyle,
                                  styles.photoMediaBubble,
                                  isMine ? styles.photoMessageStackMine : styles.photoMessageStack,
                                  { width: captionedPhotoLayout.bubbleWidth },
                                ]}
                          delayLongPress={CHAT_MESSAGE_LONG_PRESS_MS}
                          onLongPress={() => {
                            if (item.unsentAt || DEMO_OFFLINE_MODE || !getBackendSession()) return;
                            openReactionPickerForMessage(item.id);
                          }}
                          onPress={() => {
                            handleChatMessagePress(item, isMine, () => {
                              if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                                setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                              } else {
                                openFullscreenMedia(
                                  resolvedUri,
                                  item.kind === "gif" ? "gif" : "photo"
                                );
                              }
                            });
                          }}
                        >
                          <>
                              <View style={[styles.photoMediaBubbleImageInset, chatMediaBubbleInsetStyle(hasPhotoBubbleContent)]}>
                                <View
                                  style={[
                                    styles.photoMediaBubbleImageClip,
                                    chatMediaInnerClipStyle(hasPhotoBubbleContent),
                                    {
                                      width: captionedPhotoLayout.imageWidth,
                                      height: captionedPhotoLayout.imageHeight,
                                    },
                                  ]}
                                >
                                  <Image
                                    source={{ uri: resolvedUri }}
                                    style={styles.photoMediaBubbleImage}
                                    resizeMode="cover"
                                    onLoad={(event) => {
                                      if (item.mediaWidth && item.mediaHeight) return;
                                      const src = event.nativeEvent.source;
                                      const w = Number(src?.width ?? 0);
                                      const h = Number(src?.height ?? 0);
                                      if (!w || !h) return;
                                      setMeasuredChatMediaByMessageId((prev) => {
                                        const cur = prev[item.id];
                                        if (cur?.width === w && cur?.height === h) return prev;
                                        return { ...prev, [item.id]: { width: w, height: h } };
                                      });
                                    }}
                                  />
                                </View>
                              </View>
                              {hasPhotoBubbleContent ? (
                                <View style={styles.photoMediaBubbleCaption}>{captionBlock}</View>
                              ) : null}
                            </>
                        </PressAckButton>
                      </ReactionBubbleHost>
                      <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                        {formatDayTime(item.createdAt)}
                        {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                        {mineDeliveryLabel}
                      </Text>
                      {failedMessageActions}
                    </View>
                  </View>
                      );
                    }}
                  </ChatMessageMediaResolver>
                );
              }

              if (item.kind === "video") {
                const videoPrepareRequested =
                  !item.mediaEncrypted || videoPrepareRequestedIds.has(item.id);
                const videoResolveEnabled =
                  messageHasResolvableMedia(item) &&
                  (!item.mediaEncrypted || videoPrepareRequested);
                const requestVideoPrepare = () => {
                  if (!item.mediaEncrypted || videoPrepareRequestedIds.has(item.id)) return;
                  setVideoPrepareRequestedIds((prev) => {
                    if (prev.has(item.id)) return prev;
                    const next = new Set(prev);
                    next.add(item.id);
                    return next;
                  });
                };

                return (
                  <ChatMessageMediaResolver
                    message={item}
                    resolveEnabled={videoResolveEnabled}
                    resolvePriority={videoPrepareRequested ? "high" : "normal"}
                  >
                    {(resolvedUri, resolving) => {
                  const hasVideoBubbleContent =
                    !!item.replyToMessageId ||
                    !!item.unsentAt ||
                    messageDisplayText(item).trim().length > 0;
                  const captionedVideoLayout = getCaptionedMediaLayout(item);
                  const videoIsPlaying = playingVideoMessageId === item.id;
                  const showVideoPlayButton = !videoIsPlaying;
                  const handleVideoMessagePress = () => {
                    if (isMine && item.deliveryStatus === "failed" && !item.unsentAt) {
                      retryFailedMessage(item);
                      return;
                    }
                    if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                      setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                      return;
                    }
                    if (videoIsPlaying) {
                      if (resolvedUri) {
                        openFullscreenMedia(resolvedUri, "video", {
                          mediaWidth: item.mediaWidth,
                          mediaHeight: item.mediaHeight,
                        });
                      }
                      return;
                    }
                    if (!messageHasResolvableMedia(item)) return;
                    requestVideoPrepare();
                    if (!resolvedUri) {
                      setVideoPlayAfterPrepareId(item.id);
                      return;
                    }
                    setPlayingVideoMessageId(item.id);
                  };
                  return (
                  <>
                  <ChatVideoAutoPlayWhenReady
                    messageId={item.id}
                    resolvedUri={resolvedUri}
                    pendingPlayMessageId={videoPlayAfterPrepareId}
                    onPlay={setPlayingVideoMessageId}
                    onClearPending={() => setVideoPlayAfterPrepareId(null)}
                  />
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
                        <View
                          style={[
                                  ...bubbleCardStyle,
                                  styles.photoMediaBubble,
                                  isMine ? styles.photoMessageStackMine : styles.photoMessageStack,
                                  { width: captionedVideoLayout.bubbleWidth },
                                ]}
                        >
                          <View style={[styles.photoMediaBubbleImageInset, chatMediaBubbleInsetStyle(hasVideoBubbleContent)]}>
                            <View
                              style={[
                                styles.videoMessageWrap,
                                styles.photoMediaBubbleVideo,
                                chatMediaInnerClipStyle(hasVideoBubbleContent),
                                isMine ? styles.videoMessageWrapMine : null,
                                {
                                  width: captionedVideoLayout.imageWidth,
                                  height: captionedVideoLayout.imageHeight,
                                },
                              ]}
                            >
                              <ChatVideoMessageBubble
                                resolvedUri={resolvedUri}
                                resolving={resolving}
                                preparePending={videoPlayAfterPrepareId === item.id}
                                width={captionedVideoLayout.imageWidth}
                                height={captionedVideoLayout.imageHeight}
                                isSending={item.deliveryStatus === "sending"}
                                isPlaying={videoIsPlaying}
                                showPlayOverlay={showVideoPlayButton}
                                accentColor={theme.accent}
                                playbackKey={item.id}
                                onPressSurface={handleVideoMessagePress}
                                onLongPress={() => {
                                  if (item.unsentAt || DEMO_OFFLINE_MODE || !getBackendSession()) return;
                                  openReactionPickerForMessage(item.id);
                                }}
                                messageId={item.id}
                                onCancelPrepare={() => cancelVideoPrepare(item.id)}
                                onPosterDimensions={rememberChatVideoDimensions}
                                onDidFinish={() => {
                                  setPlayingVideoMessageId((cur) => (cur === item.id ? null : cur));
                                }}
                              />
                              {item.videoTextOverlays?.map((o) => (
                                <Text
                                  key={o.id}
                                  pointerEvents="none"
                                  style={[
                                    styles.videoOverlayText,
                                    {
                                      left: o.relX * captionedVideoLayout.imageWidth,
                                      top: o.relY * captionedVideoLayout.imageHeight,
                                      width: o.relW * captionedVideoLayout.imageWidth,
                                      minHeight: o.relH * captionedVideoLayout.imageHeight,
                                      fontSize: Math.max(
                                        10,
                                        o.relFontSize * captionedVideoLayout.imageWidth
                                      ),
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
                          </View>
                        {hasVideoBubbleContent ? (
                          <View style={styles.photoMediaBubbleCaption}>{captionBlock}</View>
                        ) : null}
                        </View>
                      </ReactionBubbleHost>
                      <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                        {formatDayTime(item.createdAt)}
                        {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                        {mineDeliveryLabel}
                      </Text>
                      {failedMessageActions}
                    </View>
                  </View>
                  </>
                  );
                    }}
                  </ChatMessageMediaResolver>
                );
              }

              if (item.kind === "voice") {
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
                          <Text
                            style={isMine ? styles.messageSenderOutsideMine : styles.messageSenderOutside}
                          >
                            {sender.displayName}
                          </Text>
                        ) : null}
                        <ReactionBubbleHost
                          entries={item.unsentAt ? [] : reactionEntries}
                          align={reactionAlign}
                          theme={reactTheme}
                          style={messageReactionHostStyle}
                        >
                          <View
                            style={[
                              styles.messageCard,
                              styles.voiceMessageCard,
                              isMine ? styles.myMessageCard : styles.otherMessageCard,
                            ]}
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
                                <Text
                                  style={[styles.replyQuoteBody, { color: replyQuotePalette.body }]}
                                  numberOfLines={2}
                                >
                                  {messageById[item.replyToMessageId]?.text}
                                </Text>
                              </View>
                            ) : null}
                            {item.unsentAt ? (
                              <Text
                                style={isMine ? styles.messageSystemTextMine : styles.messageSystemText}
                              >
                                {isMine ? "You unsent a message." : "Message removed."}
                              </Text>
                            ) : (
                              <ChatVoiceNoteBubble
                                durationSec={item.durationSec ?? 0}
                                isMine={isMine}
                                isPlaying={playingVoiceMessageId === item.id}
                                isLoading={voiceLoadingMessageId === item.id}
                                positionMs={
                                  voicePlaybackProgress?.messageId === item.id
                                    ? voicePlaybackProgress.positionMs
                                    : 0
                                }
                                durationMs={
                                  voicePlaybackProgress?.messageId === item.id
                                    ? voicePlaybackProgress.durationMs
                                    : Math.max(1, item.durationSec ?? 1) * 1000
                                }
                                theme={theme}
                                styles={styles}
                                onPress={() => {
                                  handleChatMessagePress(item, isMine, () => {
                                    void toggleVoiceMessagePlayback(item);
                                  });
                                }}
                              />
                            )}
                          </View>
                        </ReactionBubbleHost>
                        <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                          {formatDayTime(item.createdAt)}
                          {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                          {mineDeliveryLabel}
                        </Text>
                        {failedMessageActions}
                      </View>
                    </View>
                );
              }

              return (
                <View style={styles.messageBlock}>
                  <View
                    style={[
                      isMine ? styles.messageRowMine : styles.messageRowOther,
                      styles.messageBlockRow,
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
                    <PressAckButton
                      style={bubbleCardStyle}
                      delayLongPress={CHAT_MESSAGE_LONG_PRESS_MS}
                      onLongPress={() => {
                        if (item.unsentAt || DEMO_OFFLINE_MODE || (!isOnline && !getBackendSession())) return;
                        openReactionPickerForMessage(item.id);
                      }}
                      onPress={() => {
                        handleChatMessagePress(item, isMine, () => {
                          if (activeChatKind === "broadcast" && item.broadcastThreadFriendId) {
                            setSelectedBroadcastThreadFriendId(item.broadcastThreadFriendId);
                          }
                        });
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
                            {messageDisplayText(messageById[item.replyToMessageId])}
                          </Text>
                        </View>
                      ) : null}
                      {item.unsentAt ? (
                        <Text style={isMine ? styles.messageSystemTextMine : styles.messageSystemText}>
                          {isMine ? "You unsent a message." : "Message removed."}
                        </Text>
                      ) : (
                        <Text style={isMine ? styles.messageTextMine : styles.messageText}>
                          {messageDisplayText(item)}
                        </Text>
                      )}
                    </PressAckButton>
                    </ReactionBubbleHost>
                    <Text style={isMine ? styles.messageMetaOutsideMine : styles.messageMetaOutside}>
                      {formatDayTime(item.createdAt)}
                      {item.editedAt ? ` • Edited ${formatDayTime(item.editedAt)}` : ""}
                      {mineDeliveryLabel}
                    </Text>
                    {failedMessageActions}
                  </View>
                </View>
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
                  <PressAckButton onPress={() => setEditingMessageId(null)} style={styles.replyBannerClose}>
                    <Ionicons name="close" size={16} color={theme.text} />
                  </PressAckButton>
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
                    {isActiveBroadcastCreator
                      ? "Broadcast mode: tap a friend's message to reply in that private thread. Send from the field below to post for everyone."
                      : "You see general broadcasts and the broadcaster's direct replies to you. Long-press any of those messages and choose Reply to respond privately."}
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
                      Voice note — tap the mic to record, then stop to preview before sending
                    </Text>
                  )}
                </View>
              ) : null}

              {pendingVoiceNote ? (
                <View
                  style={[
                    styles.replyBanner,
                    { borderBottomColor: theme.divider, backgroundColor: theme.replyBannerQuotingOtherBg },
                  ]}
                >
                  <Text style={[styles.replyBannerText, { color: theme.text, flex: 1 }]}>
                    Voice note ready ({pendingVoiceNote.durationSec}s)
                  </Text>
                  <View style={styles.voicePreviewActions}>
                    <PressAckButton
                      style={styles.attachButton}
                      onPress={() => void togglePendingVoicePreview()}
                      accessibilityLabel={previewVoicePlaying ? "Pause preview" : "Play preview"}
                    >
                      <Ionicons
                        name={previewVoicePlaying ? "pause-outline" : "play-outline"}
                        size={18}
                        color={theme.accent}
                      />
                    </PressAckButton>
                    <PressAckButton
                      style={styles.attachButton}
                      onPress={() => void discardPendingVoiceNote()}
                      accessibilityLabel="Discard voice note"
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </PressAckButton>
                    <PressAckButton
                      style={styles.sendButton}
                      onPress={() => void sendPendingVoiceNote()}
                      accessibilityLabel="Send voice note"
                    >
                      <Ionicons name="send" size={16} color="#FFFFFF" />
                    </PressAckButton>
                  </View>
                </View>
              ) : null}

              {pendingChatMediaAttachment && pendingChatMediaLayout ? (
                <View
                  style={[
                    styles.pendingChatMediaPreviewShell,
                    { borderBottomColor: theme.divider, backgroundColor: theme.background },
                  ]}
                >
                  <View style={styles.photoMessageColumnMine}>
                    <View
                      style={[
                        styles.messageCard,
                        styles.myMessageCard,
                        styles.photoMediaBubble,
                        styles.photoMessageStackMine,
                        { width: pendingChatMediaLayout.bubbleWidth },
                      ]}
                    >
                      <View style={[styles.photoMediaBubbleImageInset, chatMediaBubbleInsetStyle(!!chatInput.trim())]}>
                        <View
                          style={[
                            styles.photoMediaBubbleImageClip,
                            chatMediaInnerClipStyle(!!chatInput.trim()),
                            {
                              width: pendingChatMediaLayout.imageWidth,
                              height: pendingChatMediaLayout.imageHeight,
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: pendingChatMediaAttachment.uri }}
                            style={styles.photoMediaBubbleImage}
                            resizeMode="cover"
                            accessibilityIgnoresInvertColors
                          />
                        </View>
                      </View>
                      {chatInput.trim() ? (
                        <View style={styles.photoMediaBubbleCaption}>
                          <Text style={styles.messageTextMine}>{chatInput.trim()}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <PressAckButton
                    style={styles.pendingChatMediaDiscard}
                    onPress={discardPendingChatMedia}
                    accessibilityLabel="Discard photo"
                  >
                    <Ionicons name="close-circle" size={26} color={theme.subtleText} />
                  </PressAckButton>
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
                      <ChatReplyTargetPreview
                        message={replyTargetMessage}
                        textColor={theme.text}
                        subtleTextColor={theme.subtleText}
                        accentColor={theme.accent}
                        bodyStyle={styles.replyPreviewBody}
                        metaStyle={styles.replyPreviewMeta}
                        metaText={(() => {
                          const oneToOne =
                            activeChatKind === "standard" && activeCounterpartIds.length === 1;
                          if (oneToOne) return null;
                          const sid = replyTargetMessage.senderId;
                          return sid === CURRENT_USER_ID
                            ? "Replying to you"
                            : `Replying to ${friendMap[sid]?.displayName ?? "Unknown"}`;
                        })()}
                      />
                    </ScrollViewUntilScroll>
                    <PressAckButton
                      onPress={() => setReplyTargetMessageId(null)}
                      style={styles.replyPreviewClose}
                      accessibilityLabel="Cancel reply"
                    >
                      <Ionicons name="close" size={18} color={theme.text} />
                    </PressAckButton>
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
                      paddingBottom: keyboardComposerBottomPadding(
                        insets.bottom,
                        keyboardVisible,
                        keyboardHeight,
                        true
                      ),
                    },
                  ]}
                >
                  {!showCompactComposer && !broadcastRecipientComposerLocked ? (
                    <>
                      <PressAckButton
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
                      </PressAckButton>
                      <PressAckButton style={styles.attachButtonSmall} onPress={() => sendCameraMedia("photo")}>
                        <Ionicons name="camera-outline" size={16} color={theme.accent} />
                      </PressAckButton>
                      <PressAckButton style={styles.attachButtonSmall} onPress={sendGalleryPhoto}>
                        <Ionicons name="images-outline" size={16} color={theme.accent} />
                      </PressAckButton>
                      <PressAckButton
                        style={styles.attachButtonSmall}
                        onPress={sendGalleryVideo}
                        accessibilityLabel="Pick video from library"
                      >
                        <Ionicons name="film-outline" size={16} color={theme.accent} />
                      </PressAckButton>
                      <PressAckButton style={styles.attachButtonSmall} onPress={() => sendCameraMedia("video")}>
                        <Ionicons name="videocam-outline" size={16} color={theme.accent} />
                      </PressAckButton>
                    </>
                  ) : null}
                  <TextInput
                    ref={chatInputRef}
                    value={chatInput}
                    onChangeText={handleChatInputChange}
                    placeholder={
                      editingMessage
                        ? "Edit message..."
                        : broadcastRecipientComposerLocked
                          ? "Reply to the broadcaster to respond…"
                          : pendingChatMediaAttachment
                            ? "Add a caption (optional)…"
                            : "Message..."
                    }
                    placeholderTextColor={theme.subtleText}
                    editable={!broadcastRecipientComposerLocked}
                    style={[
                      styles.chatInputMultiline,
                      showCompactComposer && styles.chatInputMultilineCompact,
                      broadcastRecipientComposerLocked ? { opacity: 0.55 } : null,
                    ]}
                    multiline
                    textAlignVertical="top"
                    returnKeyType="send"
                    enablesReturnKeyAutomatically
                    blurOnSubmit={false}
                    inputAccessoryViewID={Platform.OS === "ios" ? "chatInputAccessory" : undefined}
                    onSubmitEditing={() => {
                      if (
                        readComposerTextTrimmed(chatInputTextRef) ||
                        pendingChatMediaAttachment
                      ) {
                        sendMessage();
                      }
                    }}
                  />
                  <PressAckButton
                    style={[
                      styles.sendButtonChat,
                      voiceNoteMode && voiceRecordStartedAt
                        ? { backgroundColor: theme.danger }
                        : null,
                      broadcastRecipientComposerLocked ? { opacity: 0.45 } : null,
                    ]}
                    onPress={onComposerPrimaryPress}
                    disabled={broadcastRecipientComposerLocked}
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
                  </PressAckButton>
                </View>
              </View>
            </>
          )}
          </ChatThreadErrorBoundary>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      <Modal visible={chatComposerOpen} animationType="slide" onRequestClose={closeComposer}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.background }}
          behavior="padding"
          enabled={composerKavEnabled}
          keyboardVerticalOffset={insets.top + 8}
        >
        <View
          style={[
            styles.modalScreen,
            {
              paddingTop: insets.top + 8,
              paddingBottom: keyboardVisible
                ? keyboardComposerBottomPadding(insets.bottom, keyboardVisible, keyboardHeight)
                : stickyFooterPadding(insets.bottom),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.chatScreenTitle}>Start Chat</Text>
            <PressAckButton onPress={closeComposer} style={styles.iconButton}>
              <Ionicons name="close" size={22} color={theme.accent} />
            </PressAckButton>
          </View>

          <PressAckButton style={styles.broadcastOptionRow} onPress={openBroadcastPicker}>
            <Ionicons name="megaphone-outline" size={20} color={theme.accent} />
            <Text style={styles.broadcastOptionText}>Broadcast</Text>
          </PressAckButton>

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
                <PressAckButton
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
                </PressAckButton>
              );
            }}
            ListEmptyComponent={<Text style={styles.subtleText}>No matching friends.</Text>}
            style={{ flex: 1, minHeight: 0 }}
          />

          <PressAckButton style={styles.primaryButton} onPress={onPressCreateStandardChat}>
            <Text style={styles.primaryButtonText}>Create chat</Text>
          </PressAckButton>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={broadcastPickerOpen} animationType="slide" onRequestClose={closeBroadcastPicker}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.background }}
          behavior="padding"
          enabled={composerKavEnabled}
          keyboardVerticalOffset={insets.top + 8}
        >
        <View
          style={[
            styles.modalScreen,
            {
              paddingTop: insets.top + 8,
              paddingBottom: keyboardVisible
                ? keyboardComposerBottomPadding(insets.bottom, keyboardVisible, keyboardHeight)
                : stickyFooterPadding(insets.bottom),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <PressAckButton
              style={styles.chatHeaderTitlePressable}
              onLongPress={() => {
                setPendingStandardGroupCreateAfterTitle(false);
                setCreateTitleDraft(buildComposerHeaderTitle());
                setCreateTitleEditOpen(true);
              }}
            >
              <Text style={styles.chatScreenTitle}>{buildComposerHeaderTitle()}</Text>
            </PressAckButton>
            <PressAckButton onPress={closeBroadcastPicker} style={styles.iconButton}>
              <Ionicons name="close" size={22} color={theme.accent} />
            </PressAckButton>
          </View>
          <Text style={styles.subtleText}>
            Select friends for a one-to-many broadcast. Replies stay private per friend thread.
          </Text>
          <PressAckButton
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
          </PressAckButton>
          {broadcastGroupDropdownOpen ? (
            <View style={styles.dropdownMenu}>
              {savedBroadcastGroups.length === 0 ? (
                <Text style={styles.subtleText}>No saved groups yet.</Text>
              ) : (
                savedBroadcastGroups.map((group) => (
                  <PressAckButton
                    key={group.id}
                    style={styles.dropdownItem}
                    onPress={() => applySavedBroadcastGroup(group)}
                  >
                    <Text style={styles.chatName}>{group.name}</Text>
                    <Text style={styles.subtleText}>{group.memberIds.length} friends</Text>
                  </PressAckButton>
                ))
              )}
            </View>
          ) : null}
          <PressAckButton style={styles.secondaryActionRow} onPress={toggleSelectAllBroadcastFriends}>
            <Text style={styles.secondaryButtonText}>
              {selectedComposerIds.length === allFriends.length ? "Clear all" : "Select all"}
            </Text>
          </PressAckButton>
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
                <PressAckButton
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
                </PressAckButton>
              );
            }}
            ListEmptyComponent={<Text style={styles.subtleText}>No matching friends.</Text>}
            style={{ flex: 1, minHeight: 0 }}
          />
          <PressAckButton style={styles.primaryButton} onPress={() => createOrOpenChat("broadcast")}>
            <Text style={styles.primaryButtonText}>Create broadcast</Text>
          </PressAckButton>
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
              <PressAckButton
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
              </PressAckButton>
              <PressAckButton
                style={[styles.broadcastModalBtn, styles.broadcastModalBtnPrimary]}
                onPress={() => {
                  setSaveBroadcastGroupPromptOpen(false);
                  setBroadcastGroupNameDraft(composerCustomTitle.trim() || "");
                  setSaveBroadcastGroupNameModalOpen(true);
                }}
              >
                <Text style={styles.broadcastModalBtnPrimaryText}>Yes</Text>
              </PressAckButton>
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
          behavior="padding"
          enabled={composerKavEnabled}
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
                <PressAckButton
                  style={[styles.broadcastModalBtn, styles.broadcastModalBtnOutline]}
                  onPress={() => {
                    setSaveBroadcastGroupNameModalOpen(false);
                    setSaveBroadcastGroupPromptOpen(true);
                  }}
                >
                  <Text style={styles.broadcastModalBtnOutlineText}>Back</Text>
                </PressAckButton>
                <PressAckButton
                  style={[styles.broadcastModalBtn, styles.broadcastModalBtnPrimary]}
                  onPress={handleBroadcastGroupNameConfirm}
                >
                  <Text style={styles.broadcastModalBtnPrimaryText}>Continue</Text>
                </PressAckButton>
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
          behavior="padding"
          enabled={composerKavEnabled}
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
                  <PressAckButton
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
                  </PressAckButton>
                  <TextInput
                    value={createTitleDraft}
                    onChangeText={setCreateTitleDraft}
                    placeholder="Group name (not required)"
                    placeholderTextColor={theme.subtleText}
                    style={styles.searchInput}
                  />
                  <View style={styles.broadcastModalActionRow}>
                    <PressAckButton
                      style={[styles.broadcastModalBtn, styles.broadcastModalBtnOutline]}
                      onPress={() => {
                        setPendingStandardGroupCreateAfterTitle(false);
                        setCreateTitleEditOpen(false);
                        setCreateGroupPictureUri(null);
                      }}
                    >
                      <Text style={styles.broadcastModalBtnOutlineText}>Cancel</Text>
                    </PressAckButton>
                    <PressAckButton
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
                    </PressAckButton>
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
                  <PressAckButton
                    style={styles.secondaryButton}
                    onPress={() => {
                      setPendingStandardGroupCreateAfterTitle(false);
                      setCreateTitleEditOpen(false);
                      setCreateGroupPictureUri(null);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </PressAckButton>
                  <PressAckButton
                    style={styles.primaryButton}
                    onPress={() => {
                      const next = createTitleDraft.trim();
                      setComposerCustomTitle(next);
                      setCreateTitleEditOpen(false);
                    }}
                  >
                    <Text style={styles.primaryButtonText}>Save</Text>
                  </PressAckButton>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editChatMetaOpen} transparent animationType="fade" onRequestClose={() => setEditChatMetaOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          enabled={composerKavEnabled}
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
              <PressAckButton style={styles.secondaryButton} onPress={() => setEditChatMetaOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </PressAckButton>
              <PressAckButton style={styles.primaryButton} onPress={saveChatTitle}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </PressAckButton>
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
          behavior="padding"
          enabled={composerKavEnabled}
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
              <PressAckButton style={styles.secondaryButton} onPress={() => setEditChatPictureOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </PressAckButton>
              <PressAckButton style={styles.primaryButton} onPress={saveChatPicture}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </PressAckButton>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={reactionPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setReactionPickerOpen(false);
          setPostReactionTargetId(null);
          setCommentReactionTarget(null);
          setReactionTargetMessageId(null);
        }}
      >
        <PressAckButton
          style={styles.settingsOverlay}
          onPress={() => {
            setReactionPickerOpen(false);
            setPostReactionTargetId(null);
            setCommentReactionTarget(null);
            setReactionTargetMessageId(null);
          }}
        >
          <PressAckButton style={styles.settingsCard} onPress={() => {}}>
            <Text style={styles.chatScreenTitle}>
              {messageActionTarget && !postReactionTargetId && !commentReactionTarget
                ? "Message"
                : "React"}
            </Text>
            {messageActionTarget && !postReactionTargetId && !commentReactionTarget ? (
              <>
                {!(
                  activeChatKind === "broadcast" &&
                  resolvedChat &&
                  !canReplyToBroadcastMessage(messageActionTarget, resolvedChat, CURRENT_USER_ID)
                ) ? (
                <PressAckButton
                  style={styles.menuRow}
                  onPress={() => {
                    setReactionPickerOpen(false);
                    startReplyToMessage();
                  }}
                >
                  <Feather name="corner-up-left" size={18} color={theme.text} />
                  <Text style={styles.menuRowText}>Reply</Text>
                </PressAckButton>
                ) : null}
                {messageActionTarget.senderId === CURRENT_USER_ID && !messageActionTarget.unsentAt ? (
                  <>
                    <PressAckButton
                      style={styles.menuRow}
                      onPress={() => {
                        setReactionPickerOpen(false);
                        startEditMessage();
                      }}
                    >
                      <Feather name="edit-2" size={18} color={theme.text} />
                      <Text style={styles.menuRowText}>Edit</Text>
                    </PressAckButton>
                    <PressAckButton
                      style={styles.menuRow}
                      onPress={() => {
                        setReactionPickerOpen(false);
                        unsendTargetMessage();
                      }}
                    >
                      <Feather name="trash-2" size={18} color={theme.danger} />
                      <Text style={[styles.menuRowText, { color: theme.danger }]}>Unsend</Text>
                    </PressAckButton>
                  </>
                ) : null}
                {reactionPickerActiveEmoji ? (
                  <PressAckButton style={styles.menuRow} onPress={removeActiveReaction}>
                    <Feather name="x-circle" size={18} color={theme.danger} />
                    <Text style={[styles.menuRowText, { color: theme.danger }]}>
                      {`Remove reaction (${reactionPickerActiveEmoji})`}
                    </Text>
                  </PressAckButton>
                ) : null}
                <View style={[styles.reactionPickerRow, { marginTop: 12 }]}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <PressAckButton key={emoji} style={styles.reactionChip} onPress={() => applyReaction(emoji)}>
                      <Text style={styles.reactionChipText}>{emoji}</Text>
                    </PressAckButton>
                  ))}
                </View>
              </>
            ) : (
              <>
                {reactionPickerActiveEmoji ? (
                  <PressAckButton style={styles.menuRow} onPress={removeActiveReaction}>
                    <Feather name="x-circle" size={18} color={theme.danger} />
                    <Text style={[styles.menuRowText, { color: theme.danger }]}>
                      {`Remove reaction (${reactionPickerActiveEmoji})`}
                    </Text>
                  </PressAckButton>
                ) : null}
              <View style={styles.reactionPickerRow}>
                {REACTION_EMOJIS.map((emoji) => (
                  <PressAckButton key={emoji} style={styles.reactionChip} onPress={() => applyReaction(emoji)}>
                    <Text style={styles.reactionChipText}>{emoji}</Text>
                  </PressAckButton>
                ))}
              </View>
              </>
            )}
          </PressAckButton>
        </PressAckButton>
      </Modal>

      {view.screen === "openSourceLicenses" ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, zIndex: 30 }]}>
          <OpenSourceLicensesScreen
            theme={theme}
            styles={styles}
            safeTop={safeTop}
            bottomPadding={scrollPageBottomPadding(insets.bottom, 24)}
            onBack={() => setView({ screen: "settings" })}
          />
        </View>
      ) : null}

      {isSurfaceVisible("settings") ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: theme.background, zIndex: 30, overflow: "hidden" as const },
            mainNavSlideStyle("settings"),
          ]}
          pointerEvents={incomingMainNav === "settings" && currentMainNav !== "settings" ? "none" : "auto"}
          {...mainNavSwipePan.panHandlers}
        >
          <View style={[styles.fullScreen, { paddingTop: safeTop }]}>
            <HomeTopNavBar
              theme={theme}
              styles={styles}
              highlight={homeNavIconHighlight}
              badges={homeNavBadges}
              onOpenCreatePost={openPostComposer}
              onOpenSettings={openSettingsScreen}
              onOpenMyProfile={openMyProfile}
              onOpenFriendsList={openFriendsListFromHome}
              onOpenHomeChats={openHomeChatsFromNav}
              onOpenHomeFeed={openHomeFeedFromNav}
              onOpenAddFriend={openAddFriendFromHome}
              onLogout={confirmLogout}
            />
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
              <View style={[styles.settingsRow, { paddingVertical: 12 }]}>
                <Text style={styles.chatName}>Haptic feedback</Text>
                <Switch
                  value={hapticSettings.systemEnabled && hapticSettings.userEnabled}
                  disabled={!hapticSettings.systemEnabled}
                  onValueChange={(next) => {
                    if (!hapticSettings.systemEnabled) return;
                    hapticSettings.setUserEnabled(next);
                  }}
                  thumbColor="#FFFFFF"
                  trackColor={{ false: "#95A1A8", true: theme.accent }}
                />
              </View>
              <PressAckButton
                style={[styles.settingsRow, { paddingVertical: 12 }]}
                onPress={goToOpenSourceLicenses}
              >
                <Text style={styles.chatName}>Open source licences</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.settingsRowHint}>MIT &amp; others</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.subtleText} />
                </View>
              </PressAckButton>
              <PressAckButton
                style={[styles.settingsRow, { paddingVertical: 12 }]}
                onPress={() => {
                  setThemePickerOpen(true);
                }}
              >
                <Text style={styles.chatName}>Colour theme</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.settingsRowHint}>
                    {colorThemeId === "green" ? "Green" : colorThemeId === "pink" ? "Hot pink" : "Fire orange"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.subtleText} />
                </View>
              </PressAckButton>
              <PressAckButton
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
              </PressAckButton>
              <PressAckButton
                style={[styles.settingsRow, { paddingVertical: 12 }]}
                onPress={confirmDeleteAccount}
              >
                <Text style={[styles.chatName, { color: theme.danger }]}>Delete account</Text>
                <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
              </PressAckButton>
            </ScrollViewUntilScroll>
          </View>
        </Animated.View>
      ) : null}

      <Modal
        visible={themePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setThemePickerOpen(false)}
      >
        <PressAckButton style={styles.settingsOverlay} onPress={() => setThemePickerOpen(false)}>
          <PressAckButton style={styles.settingsCard} onPress={() => {}}>
            <Text style={styles.chatScreenTitle}>Colour theme</Text>
            <PressAckButton
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
            </PressAckButton>
            <PressAckButton
              style={styles.themePickerOptionRow}
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
            </PressAckButton>
            <PressAckButton
              style={[styles.themePickerOptionRow, styles.themePickerOptionRowLast]}
              onPress={() => {
                setColorThemeId("orange");
                setThemePickerOpen(false);
              }}
            >
              <Text style={styles.chatName}>Fire orange</Text>
              {colorThemeId === "orange" ? (
                <Ionicons name="checkmark" size={22} color={theme.accent} />
              ) : (
                <View style={{ width: 22 }} />
              )}
            </PressAckButton>
            <PressAckButton style={styles.primaryButton} onPress={() => setThemePickerOpen(false)}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </PressAckButton>
          </PressAckButton>
        </PressAckButton>
      </Modal>

      <Modal
        visible={chatOverflowOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChatOverflowOpen(false)}
      >
        <PressAckButton style={styles.menuOverlay} onPress={() => setChatOverflowOpen(false)}>
          <PressAckButton style={styles.menuCard} onPress={() => {}}>
            <PressAckButton
              style={styles.menuRow}
              onPress={() => {
                setChatOverflowOpen(false);
                setMembersModalOpen(true);
              }}
            >
              <Feather name="users" size={18} color={theme.text} />
              <Text style={styles.menuRowText}>View chat members</Text>
            </PressAckButton>
            <PressAckButton
              style={styles.menuRow}
              onPress={() => {
                setChatOverflowOpen(false);
                setChatSearchVisible(true);
              }}
            >
              <Feather name="search" size={18} color={theme.text} />
              <Text style={styles.menuRowText}>Search in chat</Text>
            </PressAckButton>
            <PressAckButton
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
            </PressAckButton>
            {resolvedChat && resolvedChat.kind !== "broadcast" && !resolvedChat.isDraft ? (
              <PressAckButton
                style={styles.menuRow}
                onPress={() => {
                  setChatOverflowOpen(false);
                  setAddMemberSearch("");
                  setAddMemberModalOpen(true);
                }}
              >
                <Feather name="user-plus" size={18} color={theme.text} />
                <Text style={styles.menuRowText}>Add people</Text>
              </PressAckButton>
            ) : null}
            {resolvedChat && !resolvedChat.isDraft ? (
              <PressAckButton
                style={styles.menuRow}
                onPress={() => {
                  setChatOverflowOpen(false);
                  confirmLeaveChat();
                }}
              >
                <Feather name="log-out" size={18} color={theme.danger} />
                <Text style={[styles.menuRowText, { color: theme.danger }]}>Leave chat</Text>
              </PressAckButton>
            ) : null}
          </PressAckButton>
        </PressAckButton>
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
            <PressAckButton style={styles.primaryButton} onPress={() => setMembersModalOpen(false)}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </PressAckButton>
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
          behavior="padding"
          enabled={composerKavEnabled}
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
                  <PressAckButton style={styles.friendRow} onPress={() => addMemberToChat(item.id)}>
                    <View style={styles.friendRowLeft}>
                      {renderAvatar(item.profilePictureUrl, item.displayName.slice(0, 1), 36)}
                      <Text style={styles.chatName}>{item.displayName}</Text>
                    </View>
                    <Text style={styles.selectedText}>Add</Text>
                  </PressAckButton>
                )}
                ListEmptyComponent={
                  <Text style={styles.subtleText}>
                    {eligibleFriendsToAdd.length === 0
                      ? "No one else can be added — everyone who fits is already in this chat."
                      : "No matches."}
                  </Text>
                }
              />
              <PressAckButton
                style={styles.primaryButton}
                onPress={() => {
                  setAddMemberModalOpen(false);
                  setAddMemberSearch("");
                }}
              >
                <Text style={styles.primaryButtonText}>Close</Text>
              </PressAckButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <FullscreenMediaViewer
        item={fullscreenMedia}
        backgroundColor="#000000"
        onClose={() => setFullscreenMedia(null)}
        onGalleryIndexChange={(index, postId) => {
          if (postId) setPostMediaGalleryIndex(postId, index);
        }}
      />

      <ImageCropModal
        visible={imageCropVisible}
        imageUri={imageCropUri}
        fixedAspectRatio={imageCropAspect}
        theme={theme}
        onComplete={handleImageCropComplete}
        onCancel={cancelImageCropFlow}
      />

      <VideoPostThumbnailModal
        visible={videoThumbnailModalOpen}
        defaultPosterUri={videoThumbnailDefaultPosterUri}
        loadingPreview={videoThumbnailPreviewLoading}
        theme={theme}
        onUseFirstFrame={() => {
          closeVideoThumbnailModal();
          void finalizeVideoPosterAndPublish("skip");
        }}
        onChooseCustom={() => {
          closeVideoThumbnailModal();
          void finalizeVideoPosterAndPublish("pick");
        }}
        onCancel={closeVideoThumbnailModal}
      />

      {photoEditorOpen ? (
        <PhotoEditorModal
          visible={photoEditorOpen}
          onClose={cancelPhotoEditor}
          onCropModeChange={setPhotoEditorInCrop}
          cropExitTick={photoEditorCropExitTick}
          onComplete={completePhotoEditor}
          assetUri={photoEditorAsset?.uri ?? null}
          assetWidth={photoEditorAsset?.width ?? 0}
          assetHeight={photoEditorAsset?.height ?? 0}
          mediaType={photoEditorMediaType}
          previewSubmitLabel={
            photoEditorTarget === "profile"
              ? "Use photo"
              : photoEditorTarget === "chat"
                ? "Send"
                : "Post"
          }
          externalCaptionComposer={
            photoEditorMediaType === "photo" &&
            (photoEditorTarget === "chat" || photoEditorTarget === "post")
          }
          editContinueLabel={
            photoEditorMediaType === "photo" &&
            (photoEditorTarget === "chat" || photoEditorTarget === "post")
              ? "Done"
              : "Continue"
          }
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
