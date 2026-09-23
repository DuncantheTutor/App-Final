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
import { restoreKeyBundleFromCloudIfMissing, uploadKeyBundleToCloudBackup } from "../lib/e2eeKeyBackup";
import {
  restoreSocialSnapshotFromCloud,
  uploadSocialSnapshotToCloud,
} from "../lib/socialSnapshotBackup";
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


type AuthScreensConstraint = {
  keyboardVisible: any;
  keyboardHeight: any;
  theme: any;
  styles: any;
  safeTop: any;
  insets: any;
  isDarkMode: any;
  authMode: any;
  setAuthMode: any;
  loginEmail: any;
  setLoginEmail: any;
  loginPassword: any;
  setLoginPassword: any;
  loginPasswordVisible: any;
  setLoginPasswordVisible: Dispatch<SetStateAction<boolean>>;
  loginDemoOrSubmit: any;
  loginOtp: any;
  setLoginOtp: any;
  requestLoginOtpCode: any;
  completeLoginWithOtp: any;
  signupEmail: any;
  setSignupEmail: any;
  signupUsername: any;
  setSignupUsername: any;
  signupPhoneNumber: any;
  setSignupPhoneNumber: any;
  signupPassword: any;
  setSignupPassword: any;
  signupPasswordVisible: any;
  setSignupPasswordVisible: Dispatch<SetStateAction<boolean>>;
  signupPasswordConfirm: any;
  setSignupPasswordConfirm: any;
  signupPasswordConfirmVisible: any;
  setSignupPasswordConfirmVisible: Dispatch<SetStateAction<boolean>>;
  startSignup: any;
  signupOtp: any;
  setSignupOtp: any;
  requestSignupOtp: any;
  completeSignupWithOtp: any;
};
export function AuthScreens<P extends AuthScreensConstraint>(props: P) {
  const {
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
  } = props;
  const authScrollContentStyle = {
    flexGrow: 1,
    justifyContent: "center" as const,
    paddingBottom: keyboardVisible ? keyboardScrollPadding(keyboardHeight, 32) : 8,
    paddingTop: 8,
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
    <View
      style={[
        styles.screen,
        {
          paddingTop: safeTop + 10,
          paddingBottom: keyboardVisible
            ? keyboardScrollPadding(keyboardHeight, insets.bottom + 16)
            : stickyFooterPadding(insets.bottom),
        },
      ]}
    >
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      {authMode === "login" || (!EMAIL_OTP_ENABLED && authMode === "loginOtp") ? (
        <View style={styles.authLoginRoot}>
          <View style={styles.authTopBar}>
            <View style={styles.authTopSideSpacer} />
            {DEMO_OFFLINE_MODE ? (
              <View style={styles.authTopSideSpacer} />
            ) : (
              <PressAckButton onPress={() => setAuthMode("signup")} style={styles.authTopLinkButton}>
                <Text style={styles.authTopLinkText}>Sign up</Text>
              </PressAckButton>
            )}
          </View>
          <ScrollViewUntilScroll
            style={{ flex: 1 }}
            contentContainerStyle={authScrollContentStyle}
            keyboardShouldPersistTaps="handled"
          >
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
                <PressAckButton
                  onPress={() => setLoginPasswordVisible((v) => !v)}
                  style={styles.passwordVisibilityButton}
                  accessibilityLabel={loginPasswordVisible ? "Hide password" : "Show password"}
                >
                  <Ionicons
                    name={loginPasswordVisible ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={theme.subtleText}
                  />
                </PressAckButton>
              </View>
              <PressAckButton style={styles.primaryButton} onPress={loginDemoOrSubmit}>
                <Text style={styles.primaryButtonText}>Login</Text>
              </PressAckButton>
            </View>
          </ScrollViewUntilScroll>
        </View>
      ) : EMAIL_OTP_ENABLED && authMode === "loginOtp" ? (
        <View style={styles.authLoginRoot}>
          <View style={styles.authTopBar}>
            <PressAckButton onPress={() => setAuthMode("login")} style={styles.authTopLinkButton}>
              <Ionicons name="arrow-back" size={20} color={theme.text} />
            </PressAckButton>
            <View style={styles.authTopSideSpacer} />
          </View>
          <ScrollViewUntilScroll
            style={{ flex: 1 }}
            contentContainerStyle={authScrollContentStyle}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.authCard, { width: "100%", maxWidth: 420 }]}>
              <Text style={styles.authHeading}>Verification code</Text>
              <Text style={styles.subtleText}>
                Enter the 6-digit code for {loginEmail.trim()}. Tap “Request OTP code” first, then “Verify OTP”
                after you enter it. On Android your phone will ask for SMS access so only messages that match your
                sign-in can fill the code automatically.
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
                <PressAckButton style={[styles.primaryButton, { flex: 1 }]} onPress={() => void requestLoginOtpCode()}>
                  <Text style={styles.primaryButtonText}>Request OTP code</Text>
                </PressAckButton>
                <PressAckButton style={[styles.primaryButton, { flex: 1 }]} onPress={completeLoginWithOtp}>
                  <Text style={styles.primaryButtonText}>Verify OTP</Text>
                </PressAckButton>
              </View>
            </View>
          </ScrollViewUntilScroll>
        </View>
      ) : authMode === "signup" || (!EMAIL_OTP_ENABLED && authMode === "signupOtp") ? (
        <ScrollViewUntilScroll
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.authCard,
            authScrollContentStyle,
            {
              paddingBottom: keyboardVisible
                ? keyboardScrollPadding(keyboardHeight, 20)
                : scrollPageBottomPadding(insets.bottom, 20),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authTopBar}>
            <PressAckButton onPress={() => setAuthMode("login")} style={styles.authTopLinkButton}>
              <Ionicons name="arrow-back" size={20} color={theme.text} />
            </PressAckButton>
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
            <PressAckButton
              onPress={() => setSignupPasswordVisible((v) => !v)}
              style={styles.passwordVisibilityButton}
              accessibilityLabel={signupPasswordVisible ? "Hide password" : "Show password"}
            >
              <Ionicons
                name={signupPasswordVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.subtleText}
              />
            </PressAckButton>
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
            <PressAckButton
              onPress={() => setSignupPasswordConfirmVisible((v) => !v)}
              style={styles.passwordVisibilityButton}
              accessibilityLabel={signupPasswordConfirmVisible ? "Hide password" : "Show password"}
            >
              <Ionicons
                name={signupPasswordConfirmVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.subtleText}
              />
            </PressAckButton>
          </View>
          <PressAckButton style={styles.primaryButton} onPress={startSignup}>
            <Text style={styles.primaryButtonText}>Create account</Text>
          </PressAckButton>
        </ScrollViewUntilScroll>
      ) : (
        <View style={styles.authLoginRoot}>
          <View style={styles.authTopBar}>
            <PressAckButton onPress={() => setAuthMode("signup")} style={styles.authTopLinkButton}>
              <Ionicons name="arrow-back" size={20} color={theme.text} />
            </PressAckButton>
            <View style={styles.authTopSideSpacer} />
          </View>
          <ScrollViewUntilScroll
            style={{ flex: 1 }}
            contentContainerStyle={authScrollContentStyle}
            keyboardShouldPersistTaps="handled"
          >
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
              <View style={{ flexDirection: "row", gap: 10 }}>
                <PressAckButton
                  style={[styles.primaryButton, { flex: 1 }]}
                  onPress={() => void requestSignupOtp()}
                >
                  <Text style={styles.primaryButtonText}>Request new OTP</Text>
                </PressAckButton>
                <PressAckButton style={[styles.primaryButton, { flex: 1 }]} onPress={completeSignupWithOtp}>
                  <Text style={styles.primaryButtonText}>Verify OTP</Text>
                </PressAckButton>
              </View>
            </View>
          </ScrollViewUntilScroll>
        </View>
      )}
    </View>
    </View>
  );
}
