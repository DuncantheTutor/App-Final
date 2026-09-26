import { Alert } from "react-native";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { debugSessionLog, firebaseAuth } from "../../firebaseAuthClient";
import { setTelemetryContext } from "../../telemetry";
import type { Chat, Friend, Message, MockAuthAccount, Post, ViewState } from "../domain/types";
import { storageGetItem } from "../lib/encryptedLocalStorage";
import { writeDeviceSignedInEmail } from "./deviceSignedInEmail";
import { normalizeMessagesForUi } from "../lib/messageDisplayText";
import { retainedMessageChatIds } from "../lib/messageRetentionChatIds";
import { trimInMemoryMessages } from "../lib/trimInMemoryMessages";
import { isCanonicalDirectChatId } from "../lib/directChatId";
import { CURRENT_USER_LOCAL_ID } from "../lib/resolveChatMemberBackendUid";
import { pruneGhostEmptyChats, sanitizePersistedFriendsFromStorage } from "../lib/viewPersistence";
import { readFeedMutesForEmail, type FeedMutedUntilByFriendId } from "../lib/feedMutePersistence";
import { readFeedReactionSeenForEmail } from "../lib/feedReactionUnread";
import { readPostsSharedWithFriends } from "../lib/postsSharedWithFriendsPersistence";
import { mergeProfilePictureUrl } from "../lib/profilePictureUrl";
import {
  readFriendKeyBundleCache,
  readSyncWatermarks,
  shouldResetSyncCacheForAppBuild,
} from "../lib/clientSyncCache";
import type { HomeTab } from "../shell/types";
import type { BackendSession } from "../messaging/types";
import type { AuthMode, EncryptedSyncState } from "./useSignedInSession";
import {
  ALL_INITIAL_MESSAGES,
  CHAT_INITIAL_MESSAGE_LIMIT,
  CURRENT_USER_ID,
  DEMO_OFFLINE_MODE,
  DEMO_USER_A_ONLY_FRIEND_IDS,
  DEMO_USER_B_ONLY_FRIEND_IDS,
  FRIENDS,
  INITIAL_CHATS,
  INITIAL_POSTS,
  buildDemoChatsAndMessages,
  buildDemoPostsForFriends,
  isPostAlive,
  postsStorageKeyForEmail,
  profileBioStorageKey,
  profilePictureStorageKey,
  socialMessagingStorageKeyForEmail,
} from "../theme/preludeConstants";

export type RestoreSignedInAccountDeps = {
  sessionEmailRef: MutableRefObject<string | null>;
  setSeenFeedReactionSigByPostId: Dispatch<SetStateAction<Record<string, string>>>;
  postsSharedWithFriendsRef: MutableRefObject<Set<string>>;
  sharePostsBackfillStartedRef: MutableRefObject<Set<string>>;
  messagesWatermarkMsRef: MutableRefObject<number>;
  messagesLastFullSyncAtRef: MutableRefObject<number>;
  postsWatermarkMsRef: MutableRefObject<number>;
  postsLastFullSyncAtRef: MutableRefObject<number>;
  deletedPostIdsRef: MutableRefObject<Set<string>>;
  recipientKeyCacheRef: MutableRefObject<Record<string, string>>;
  localSocialCacheSavedAtMsRef: MutableRefObject<number>;
  setHiddenChatIds: Dispatch<SetStateAction<string[]>>;
  hiddenServerConversationIdsRef: MutableRefObject<Set<string>>;
  replaceInbox: (nextChats: Chat[], nextMessages: Message[]) => void;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  setIdentityLockedChatIds: Dispatch<SetStateAction<string[]>>;
  hydrateFriends: (ritualFriends: Friend[], nextUnfriendedIds: string[]) => void;
  setPresenceOnlineByBackendUid: Dispatch<SetStateAction<Record<string, boolean>>>;
  setFeedMutedUntilByFriendId: Dispatch<SetStateAction<FeedMutedUntilByFriendId>>;
  hydrateMyProfile: (next: { displayName?: string; bio?: string; profilePictureUrl?: string | null }) => void;
  setInitialServerSyncDone: Dispatch<SetStateAction<boolean>>;
  markSignedIn: () => void;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;
  setView: Dispatch<SetStateAction<ViewState>>;
  setHomeTab: Dispatch<SetStateAction<HomeTab>>;
  setDemoPendingAddableQueue: Dispatch<SetStateAction<string[]>>;
  markSessionReady: (session: BackendSession) => void;
  setEncryptedSyncState: Dispatch<SetStateAction<EncryptedSyncState>>;
  backendInitGenerationRef: MutableRefObject<number>;
  initializeBackendSessionForAccount: (account: MockAuthAccount) => Promise<void>;
  retryInitializeBackendForAccount: (account: MockAuthAccount) => Promise<void>;
  clearSession: () => void;
  logoutRef: MutableRefObject<() => void>;
};

export async function restoreSignedInAccount(
  account: MockAuthAccount,
  deps: RestoreSignedInAccountDeps
): Promise<void> {
  const {
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
  } = deps;
  const emailKey = account.email.trim().toLowerCase();
  sessionEmailRef.current = emailKey;
  void writeDeviceSignedInEmail(emailKey).catch(() => undefined);
  const allSeedIds = FRIENDS.map((f) => f.id);
  const hasSeedGraph = !!(account.seedFriendIds && account.seedFriendIds.length > 0);
  const demoGraph = DEMO_OFFLINE_MODE && hasSeedGraph ? buildDemoChatsAndMessages(account.seedFriendIds ?? []) : null;
  let nextChats: Chat[] = demoGraph ? demoGraph.chats : hasSeedGraph ? INITIAL_CHATS : [];
  let nextMessages: Message[] = demoGraph ? demoGraph.messages : hasSeedGraph ? ALL_INITIAL_MESSAGES : [];
  let nextUnfriendedIds =
    account.seedFriendIds && account.seedFriendIds.length > 0
      ? allSeedIds.filter((id) => !account.seedFriendIds!.includes(id))
      : allSeedIds;
  let nextPosts: Post[] =
    DEMO_OFFLINE_MODE && hasSeedGraph
      ? buildDemoPostsForFriends(account.seedFriendIds ?? [])
      : hasSeedGraph
        ? INITIAL_POSTS
        : [];
  let restoredRitualFriends: Friend[] = [];
  let nextIdentityLockedChatIds: string[] = [];
  let nextFeedMutes: Record<string, number | null> = {};
  try {
    const [rawPosts, rawSocial, persistedWatermarks, persistedFriendKeys, persistedFeedMutes, persistedPostsShared, persistedFeedReactionSeen] =
      await Promise.all([
        storageGetItem(postsStorageKeyForEmail(emailKey)),
        storageGetItem(socialMessagingStorageKeyForEmail(emailKey)),
        readSyncWatermarks(emailKey),
        readFriendKeyBundleCache(emailKey),
        readFeedMutesForEmail(emailKey),
        readPostsSharedWithFriends(emailKey),
        readFeedReactionSeenForEmail(emailKey),
      ]);
    nextFeedMutes = persistedFeedMutes;
    setSeenFeedReactionSigByPostId(persistedFeedReactionSeen);
    postsSharedWithFriendsRef.current = persistedPostsShared;
    sharePostsBackfillStartedRef.current = new Set();

    /**
     * Seed the in-memory sync refs from disk so the boot-time
     * `listEncryptedMessages` / `listEncryptedPosts` calls can ask for
     * `sinceMs = watermark - 5_000` instead of replaying the full backlog.
     * After an APK update, reset cursors so stale blobs cannot block fresh pulls.
     */
    if (shouldResetSyncCacheForAppBuild(persistedWatermarks)) {
      messagesWatermarkMsRef.current = 0;
      messagesLastFullSyncAtRef.current = 0;
      postsWatermarkMsRef.current = 0;
      postsLastFullSyncAtRef.current = 0;
    } else {
      messagesWatermarkMsRef.current = persistedWatermarks.messagesWatermarkMs;
      messagesLastFullSyncAtRef.current = persistedWatermarks.messagesLastFullSyncAt;
      postsWatermarkMsRef.current = persistedWatermarks.postsWatermarkMs;
      postsLastFullSyncAtRef.current = persistedWatermarks.postsLastFullSyncAt;
    }
    deletedPostIdsRef.current = new Set(persistedWatermarks.deletedPostIds ?? []);
    /**
     * Seed the friend public-key cache from disk so the first outbound
     * message after a cold start doesn't need a `getFriendKeyBundles`
     * round-trip before it can encrypt.
     */
    recipientKeyCacheRef.current = { ...persistedFriendKeys };
    if (!hasSeedGraph && !demoGraph && rawSocial) {
      try {
        const parsedSocial = JSON.parse(rawSocial) as {
          savedAtMs?: unknown;
          chats?: unknown;
          messages?: unknown;
          hiddenChatIds?: unknown;
          addedFriendsFromRitual?: unknown;
          unfriendedIds?: unknown;
          identityLockedChatIds?: unknown;
        };
        localSocialCacheSavedAtMsRef.current = Math.max(
          0,
          Number(parsedSocial.savedAtMs ?? 0) || 0
        );
        if (Array.isArray(parsedSocial.chats)) {
          nextChats = parsedSocial.chats as Chat[];
        }
        if (Array.isArray(parsedSocial.messages)) {
          nextMessages = normalizeMessagesForUi(parsedSocial.messages as Message[]);
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
        nextMessages = trimInMemoryMessages(
          nextMessages,
          retainedMessageChatIds({
            chats: nextChats,
            messages: nextMessages,
            sessionAppUid: null,
            friendMap: {},
            friendIdToBackendUid: {},
            currentUserId: CURRENT_USER_ID,
            currentUserLocalId: CURRENT_USER_LOCAL_ID,
            unfriendedIds: nextUnfriendedIds,
          }),
          CHAT_INITIAL_MESSAGE_LIMIT
        );
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
          nextPosts = parsedPosts.filter(
            (p) => isPostAlive(p) && !deletedPostIdsRef.current.has(p.id)
          );
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
  replaceInbox(nextChats, nextMessages);
  setPosts(nextPosts);
  setIdentityLockedChatIds(nextIdentityLockedChatIds);
  hydrateFriends(ritualFriendsFiltered, nextUnfriendedIds);
  setPresenceOnlineByBackendUid({});
  setFeedMutedUntilByFriendId(nextFeedMutes);
  const [persistedProfilePic, persistedBio] = await Promise.all([
    storageGetItem(profilePictureStorageKey(emailKey)).catch(() => null),
    storageGetItem(profileBioStorageKey(emailKey)).catch(() => null),
  ]);
  const initialBio = persistedBio ?? account.bio ?? "";
  hydrateMyProfile({
    bio: initialBio,
    profilePictureUrl:
      mergeProfilePictureUrl(persistedProfilePic, account.profilePictureUrl) || null,
  });

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
  markSignedIn();
  // #region agent log
  debugSessionLog("MainApp.tsx:applySignedInAccount", "set signedIn true", "H1", {
    hasFirebaseUser: Boolean(firebaseAuth.currentUser),
  });
  // #endregion
  setAuthMode("login");
  setView({ screen: "home" });
  setHomeTab("feed");
  if (DEMO_OFFLINE_MODE) {
    const queue = account.username === "User A" ? DEMO_USER_A_ONLY_FRIEND_IDS.slice(0, 20) : DEMO_USER_B_ONLY_FRIEND_IDS.slice(0, 20);
    setDemoPendingAddableQueue(queue);
  }

  if (DEMO_OFFLINE_MODE) {
    const demoUid = `demo-${account.username.toLowerCase().replace(/\s+/g, "-")}`;
    markSessionReady({ uid: demoUid, deviceId: "demo-offline-device" });
    setTelemetryContext({ uid: demoUid, deviceId: "demo-offline-device" });
    setEncryptedSyncState({ profile: "ok", posts: "ok", messages: "ok", lastSuccessAt: Date.now() });
    setInitialServerSyncDone(true);
    return;
  }

  const initGen = ++backendInitGenerationRef.current;
  void (async () => {
    try {
      await initializeBackendSessionForAccount(account);
      if (backendInitGenerationRef.current !== initGen) return;
    } catch (err) {
      if (backendInitGenerationRef.current !== initGen) return;
      const message = err instanceof Error ? err.message : String(err ?? "");
      clearSession();
      setTelemetryContext({ uid: null, deviceId: null });
      setEncryptedSyncState({
        profile: "error",
        posts: "error",
        messages: "error",
        lastSuccessAt: null,
      });
      const retry = () => void retryInitializeBackendForAccount(account);
      const buttons = [
        { text: "Retry", onPress: retry },
        { text: "Logout", style: "destructive" as const, onPress: () => logoutRef.current() },
      ];
      if (/already exists for this email|already-exists/i.test(message)) {
        Alert.alert(
          "Account already exists",
          "An account already exists for this email address. Please sign in instead of creating a new account.",
          [{ text: "OK", style: "destructive" as const, onPress: () => logoutRef.current() }]
        );
      } else if (
        /already active on another device|active session belongs to a different device|permission-denied/i.test(
          message
        )
      ) {
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
  })();
}
