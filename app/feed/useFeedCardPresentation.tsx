import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { Image, Text, View } from "react-native";
import type { Post } from "../domain/types";
import { PostGridCell } from "../components/PostGridCell";
import { friendDisplayNameFromProfile } from "../lib/friendDisplayName";
import { postCarouselImageCount } from "../lib/feedPostLayout";
import { aggregateReactionCounts } from "../lib/reactionHelpers";
import type { BackendSession } from "../messaging/types";
import { CURRENT_USER_ID, DEMO_OFFLINE_MODE, formatDayTime } from "../theme/preludeConstants";

type AuthorMeta = { name: string; avatarUri?: string };
type ResolvePd = (friendId: string) => { displayName: string; profilePictureUrl?: string | null; canOpenProfile: boolean };

/** Author labels, reaction rows, gallery index, and the props shared by every feed card. */
export function useFeedCardPresentation(params: {
  myProfilePictureUrl: string | null;
  resolvePd: ResolvePd;
  friendMap: Record<string, { displayName?: string; backendUid?: string | null }>;
  unfriendedIds: string[];
  serverFriendUidsForDisplay: ReadonlySet<string> | null;
  visibleFriendIds: string[];
  reactionDetailPost: Post | null;
  theme: { accent: string; divider: string; text: string; subtleText: string; background: string };
  windowWidth: number;
  styles: Record<string, object>;
  postGridLayout: { cell: number };
  postMediaGalleryIndexByPostId: Record<string, number>;
  setPostMediaGalleryIndex: (postId: string, index: number) => void;
  getBackendSession: () => BackendSession | null;
  backendUidToFriendId: Record<string, string>;
  openFriendProfile: (friendId: string, from: "home") => void;
  openMyProfile: () => void;
  openFeedPostActions: (post: Post) => void;
  confirmDeletePost: (post: Post) => void;
  openReactionPickerForPost: (postId: string) => void;
  openReactionPickerForComment: (postId: string, messageId: string) => void;
  setReactionDetailPost: Dispatch<SetStateAction<Post | null>>;
  feedCarouselTouchRef: { current: boolean };
  openFullscreenMedia: (
    uri: string,
    kind: "photo" | "video",
    options?: { galleryUris?: string[]; galleryIndex?: number; postId?: string }
  ) => void;
}) {
  const {
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
  } = params;

  const postAuthorMeta = useCallback(
    (authorId: string): AuthorMeta => {
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
      .filter(([userId]) => userId === CURRENT_USER_ID || visibleFriendIds.includes(userId))
      .map(([userId, emoji]) => ({
        userId,
        emoji,
        name:
          userId === CURRENT_USER_ID
            ? "You"
            : friendDisplayNameFromProfile(friendMap[userId]?.displayName, friendMap[userId]?.backendUid ?? userId),
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
        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.38 }}>{fallbackLetter}</Text>
      </View>
    );
  };

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
      return aggregateReactionCounts(reactions, session?.uid ?? null, backendUidToFriendId, visibleFriendIds);
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
      if (raw === undefined) return { onMediaGalleryIndexChange };
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

  return {
    postAuthorMeta,
    feedReactionDetailRows,
    reactTheme,
    renderAvatar,
    renderPostGridCell,
    commentReactionEntries,
    feedPostGalleryProps,
    feedPostCardShared,
  };
}
