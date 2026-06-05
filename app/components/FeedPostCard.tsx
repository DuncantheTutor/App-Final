import { Ionicons } from "@expo/vector-icons";
import { ResizeMode } from "expo-av";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, InteractionManager, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";

import { ScrollViewUntilScroll } from "../../ScrollUntilScroll";
import type { HoldToReactTheme } from "./HoldToReactButton";
import { ReactionBubbleHost } from "./ReactionBubbleHost";
import { VideoWithFadeControls } from "./VideoWithFadeControls";
import type { Post, PostComment } from "../domain/types";
import {
  DEFAULT_FEED_IMAGE_ASPECT,
  feedPostGalleryTallestHeight,
  feedPostImageHeightForAspect,
  feedPostMediaWidth,
  getCachedFeedImageAspect,
  preloadFeedImageAspects,
  rememberFeedImageAspect,
} from "../lib/feedPostLayout";
import { useResolvedPostMedia, postHasVideo } from "../hooks/useResolvedPostMedia";
import type { BackendSession } from "../messaging/types";

export type FeedPostAuthorMeta = { name: string; avatarUri?: string };

export type FeedPostCardProps = {
  post: Post;
  windowWidth: number;
  subtleTextColor: string;
  styles: Record<string, object>;
  reactTheme: HoldToReactTheme;
  currentUserId: string;
  visibleFriendIds: string[];
  demoOfflineMode: boolean;
  inFullscreenModal?: boolean;
  hideComposers?: boolean;
  resolveAuthorMeta: (authorId: string) => FeedPostAuthorMeta;
  resolveCanOpenProfile: (friendId: string) => boolean;
  formatTime: (ms: number) => string;
  renderAvatar: (
    uri: string | null | undefined,
    fallbackLetter: string,
    size: number,
    style?: object
  ) => ReactNode;
  getBackendSession: () => BackendSession | null;
  commentReactionEntries: (reactions?: Record<string, string>) => Array<[string, number]>;
  canReactToComment: (messageId: string) => boolean;
  onToggleReaction?: (emoji: string) => void;
  onOpenViewer?: () => void;
  /** Opens a single photo or video full-screen (does not open the post viewer). */
  onOpenMedia?: (
    uri: string,
    kind: "photo" | "video",
    options?: { galleryUris?: string[]; galleryIndex?: number; postId?: string }
  ) => void;
  /** When set with `onMediaGalleryIndexChange`, carousel index is controlled by the parent (e.g. sync with fullscreen gallery). */
  mediaGalleryIndex?: number;
  onMediaGalleryIndexChange?: (index: number) => void;
  onOpenThreadReply?: (anchorCommentId: string) => void;
  onOpenFriendProfile: (friendId: string) => void;
  onOpenMyProfile: () => void;
  onOpenPostActions: (post: Post) => void;
  onConfirmDeletePost: (post: Post) => void;
  onOpenReactionPickerForPost: (postId: string) => void;
  onOpenReactionPickerForComment: (
    postId: string,
    rootCommentId: string,
    threadCommentId?: string
  ) => void;
  onOpenReactionDetail: (post: Post) => void;
  /** When false, skips Tier B decrypt until the card is viewable (feed cold-start). */
  resolveMediaEnabled?: boolean;
};

function FeedPostCardView({
  post,
  windowWidth,
  subtleTextColor,
  styles,
  reactTheme,
  currentUserId,
  visibleFriendIds,
  demoOfflineMode,
  inFullscreenModal,
  hideComposers,
  resolveAuthorMeta,
  resolveCanOpenProfile,
  formatTime,
  renderAvatar,
  getBackendSession,
  commentReactionEntries,
  canReactToComment,
  onToggleReaction,
  onOpenViewer,
  onOpenMedia,
  mediaGalleryIndex,
  onMediaGalleryIndexChange,
  onOpenThreadReply,
  onOpenFriendProfile,
  onOpenMyProfile,
  onOpenPostActions,
  onConfirmDeletePost,
  onOpenReactionPickerForPost,
  onOpenReactionPickerForComment,
  onOpenReactionDetail,
  resolveMediaEnabled = true,
}: FeedPostCardProps) {
  const meta = resolveAuthorMeta(post.authorId);
  const canDelete = post.authorId === currentUserId;
  const hasVideoPost = postHasVideo(post);
  const [feedVideoDecryptRequested, setFeedVideoDecryptRequested] = useState(false);
  const resolvedMedia = useResolvedPostMedia(post, {
    enabled: resolveMediaEnabled,
    resolveVideo: feedVideoDecryptRequested,
  });
  const mediaUris = resolvedMedia.imageUris;
  const feedVideoUri = resolvedMedia.videoUri;
  const feedVideoPosterUri = resolvedMedia.videoPosterUri;
  const feedVideoPreparing =
    feedVideoDecryptRequested &&
    !feedVideoUri &&
    !!post.videoEncryptedMedia &&
    !post.videoUri?.trim();
  const [feedVideoInlinePlaying, setFeedVideoInlinePlaying] = useState(false);
  const [feedVideoFinished, setFeedVideoFinished] = useState(false);
  const [feedVideoPlaybackKey, setFeedVideoPlaybackKey] = useState(0);
  const mediaUrisKey = mediaUris.join("\0");
  const [internalPhotoIndex, setInternalPhotoIndex] = useState(0);
  const isGalleryIndexControlled = mediaGalleryIndex != null;
  const photoIndex = isGalleryIndexControlled ? (mediaGalleryIndex ?? 0) : internalPhotoIndex;
  const setPhotoIndex = (next: number) => {
    onMediaGalleryIndexChange?.(next);
    if (!isGalleryIndexControlled) setInternalPhotoIndex(next);
  };
  const [imageAspectByUri, setImageAspectByUri] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const uri of mediaUris) {
      const cached = getCachedFeedImageAspect(uri);
      if (cached != null) init[uri] = cached;
    }
    return init;
  });
  const mediaScrollRef = useRef<ScrollView | null>(null);
  const syncedGalleryIndexRef = useRef<number | null>(null);
  const photoIndexRef = useRef(0);
  const feedMediaWidth = feedPostMediaWidth(windowWidth);

  const friendOnlyReactionEntries = useMemo(() => {
    return Object.entries(post.feedReactions ?? {}).filter(
      ([userId]) => userId === currentUserId || visibleFriendIds.includes(userId)
    );
  }, [post.feedReactions, visibleFriendIds, currentUserId]);

  const aggregatedFeedReactions = useMemo(() => {
    const m = new Map<string, number>();
    for (const [, emoji] of friendOnlyReactionEntries) {
      m.set(emoji, (m.get(emoji) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [friendOnlyReactionEntries]);

  const isPostOwnerView = post.authorId === currentUserId;
  const visibleComments = useMemo(() => {
    const comments = post.comments ?? [];
    if (isPostOwnerView) return comments;
    return comments.filter((comment) => comment.authorId === currentUserId);
  }, [post.comments, isPostOwnerView, currentUserId]);

  const sortedComments = useMemo(
    () => [...visibleComments].sort((a, b) => a.createdAt - b.createdAt),
    [visibleComments]
  );

  useEffect(() => {
    if (!isGalleryIndexControlled) setInternalPhotoIndex(0);
    syncedGalleryIndexRef.current = null;
  }, [post.id, isGalleryIndexControlled]);

  useEffect(() => {
    setFeedVideoDecryptRequested(false);
    setFeedVideoInlinePlaying(false);
    setFeedVideoFinished(false);
    setFeedVideoPlaybackKey(0);
  }, [post.id]);

  useEffect(() => {
    if (!feedVideoUri || !feedVideoInlinePlaying) return;
    setFeedVideoFinished(false);
  }, [feedVideoUri, feedVideoInlinePlaying]);

  useEffect(() => {
    if (!isGalleryIndexControlled || mediaGalleryIndex == null || mediaUris.length <= 1) return;
    const clamped = Math.max(0, Math.min(mediaGalleryIndex, mediaUris.length - 1));
    if (clamped !== mediaGalleryIndex) {
      onMediaGalleryIndexChange?.(clamped);
      return;
    }
    if (clamped < (syncedGalleryIndexRef.current ?? 0)) return;
    if (syncedGalleryIndexRef.current === clamped) return;
    syncedGalleryIndexRef.current = clamped;
    mediaScrollRef.current?.scrollTo({ x: clamped * feedMediaWidth, animated: false });
  }, [isGalleryIndexControlled, mediaGalleryIndex, mediaUris.length, feedMediaWidth, onMediaGalleryIndexChange]);

  const syncPhotoIndexFromOffset = useCallback(
    (offsetX: number) => {
      const next = Math.round(offsetX / feedMediaWidth);
      const clamped = Math.max(0, Math.min(next, mediaUris.length - 1));
      syncedGalleryIndexRef.current = clamped;
      setPhotoIndex(clamped);
    },
    [feedMediaWidth, mediaUris.length, setPhotoIndex]
  );

  useEffect(() => {
    if (mediaUris.length === 0) return;
    const task = InteractionManager.runAfterInteractions(() => {
      preloadFeedImageAspects(mediaUris, (uri, aspect) => {
        setImageAspectByUri((current) => {
          if (current[uri] === aspect) return current;
          return { ...current, [uri]: aspect };
        });
      });
    });
    return () => task.cancel();
  }, [post.id, mediaUrisKey]);

  const mediaTallestHeight = useMemo(
    () => feedPostGalleryTallestHeight(feedMediaWidth, mediaUris, imageAspectByUri),
    [feedMediaWidth, mediaUris, imageAspectByUri]
  );

  photoIndexRef.current = photoIndex;

  /** Carousel height changes (aspect preload) must not reset the active slide. */
  useEffect(() => {
    if (mediaUris.length <= 1) return;
    const targetIndex = Math.max(0, Math.min(photoIndexRef.current, mediaUris.length - 1));
    requestAnimationFrame(() => {
      mediaScrollRef.current?.scrollTo({ x: targetIndex * feedMediaWidth, animated: false });
    });
  }, [mediaTallestHeight, feedMediaWidth, mediaUris.length]);

  const goToPhoto = useCallback(
    (nextIndex: number) => {
      if (mediaUris.length <= 1) return;
      const clamped = Math.max(0, Math.min(nextIndex, mediaUris.length - 1));
      syncedGalleryIndexRef.current = clamped;
      setPhotoIndex(clamped);
      mediaScrollRef.current?.scrollTo({ x: clamped * feedMediaWidth, animated: true });
    },
    [mediaUris.length, feedMediaWidth, setPhotoIndex]
  );

  const canHoldToReactOnPost =
    !inFullscreenModal && !demoOfflineMode && !!getBackendSession();

  const handlePostLongPress = useCallback(() => {
    if (canHoldToReactOnPost) {
      onOpenReactionPickerForPost(post.id);
    } else if (canDelete) {
      onConfirmDeletePost(post);
    }
  }, [
    canHoldToReactOnPost,
    canDelete,
    post,
    onOpenReactionPickerForPost,
    onConfirmDeletePost,
  ]);

  const feedVideoHeight = feedPostImageHeightForAspect(feedMediaWidth, 16 / 9);

  const requestFeedVideoPlayback = useCallback(() => {
    setFeedVideoFinished(false);
    setFeedVideoInlinePlaying(true);
    if (post.videoEncryptedMedia && !post.videoUri?.trim()) {
      setFeedVideoDecryptRequested(true);
    }
  }, [post.videoEncryptedMedia, post.videoUri]);

  const renderFeedVideoSurface = () => (
    <View style={styles.postFeedVideoWrap as object}>
      <View
        style={[
          styles.postFeedVideo as object,
          {
            width: feedMediaWidth,
            height: feedVideoHeight,
            borderRadius: 0,
          },
        ]}
      >
        {feedVideoUri ? (
          <VideoWithFadeControls
            uri={feedVideoUri}
            width={feedMediaWidth}
            height={feedVideoHeight}
            posterUri={feedVideoPosterUri}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={feedVideoInlinePlaying && !feedVideoFinished}
            showPlayOverlay={!feedVideoInlinePlaying || feedVideoFinished}
            restartOnPlay
            playbackKey={`${post.id}:${feedVideoPlaybackKey}`}
            onPressPlayOverlay={requestFeedVideoPlayback}
            onOpenFullscreen={() => onOpenMedia?.(feedVideoUri, "video", { postId: post.id })}
            onLongPress={handlePostLongPress}
            onDidFinish={() => {
              setFeedVideoInlinePlaying(false);
              setFeedVideoFinished(true);
              setFeedVideoPlaybackKey((key) => key + 1);
            }}
          />
        ) : feedVideoPreparing ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#000",
              gap: 10,
            }}
          >
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text style={{ color: "#ccc", fontSize: 13, fontWeight: "600" }}>Preparing video…</Text>
          </View>
        ) : (
          <Pressable
            style={{ flex: 1, backgroundColor: "#000" }}
            onPress={requestFeedVideoPlayback}
            onLongPress={handlePostLongPress}
            delayLongPress={400}
            accessibilityRole="button"
            accessibilityLabel="Play video"
          >
            {feedVideoPosterUri ? (
              <Image
                source={{ uri: feedVideoPosterUri }}
                style={{ width: feedMediaWidth, height: feedVideoHeight }}
                resizeMode="contain"
              />
            ) : null}
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingLeft: 4,
                }}
              >
                <Ionicons name="play" size={28} color="#fff" />
              </View>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderPrivateCommentStack = (
    entry: {
      id: string;
      authorId: string;
      text: string;
      createdAt: number;
      reactions?: Record<string, string>;
      parentCommentId: string;
      syncState?: PostComment["syncState"];
    },
    isRootComment: boolean
  ) => {
    const align: "left" | "right" = entry.authorId === currentUserId ? "right" : "left";
    const reactionEntries = commentReactionEntries(entry.reactions);
    const addDisabled = !canReactToComment(entry.id);
    const session = getBackendSession();
    const authorLabel =
      entry.authorId === currentUserId ? "You" : resolveAuthorMeta(entry.authorId).name;
    const openCommentReactionPicker = () => {
      if (addDisabled || demoOfflineMode || !session) return;
      onOpenReactionPickerForComment(
        post.id,
        isRootComment ? entry.id : entry.parentCommentId,
        isRootComment ? undefined : entry.id
      );
    };
    return (
      <Pressable
        onLongPress={openCommentReactionPicker}
        delayLongPress={400}
        disabled={addDisabled || demoOfflineMode || !session}
        style={[
          styles.privateCommentPlainRow as object,
          align === "right" ? (styles.privateCommentPlainRowRight as object) : null,
        ]}
        accessibilityHint="Press and hold to react"
      >
        <Text style={styles.privateCommentAuthorLine as object}>{authorLabel}</Text>
        {entry.text.trim() ? (
          <ReactionBubbleHost entries={reactionEntries} align={align} theme={reactTheme}>
            <Text style={styles.privateCommentBody as object}>{entry.text}</Text>
          </ReactionBubbleHost>
        ) : null}
        {entry.syncState === "posting" ? (
          <Text style={styles.privateCommentSyncLine as object}>Posting…</Text>
        ) : entry.syncState === "posted" ? (
          <Text style={styles.privateCommentSyncLine as object}>Posted</Text>
        ) : entry.syncState === "failed" ? (
          <Text style={[styles.privateCommentSyncLine as object, styles.privateCommentSyncFailed as object]}>
            Could not post
          </Text>
        ) : null}
        <Text style={styles.privateCommentTimeLine as object}>{formatTime(entry.createdAt)}</Text>
      </Pressable>
    );
  };

  const renderCommentThreadBlock = (comment: PostComment) => {
    const threadReplies = [...(comment.thread ?? [])].sort((a, b) => a.createdAt - b.createdAt);
    return (
      <View key={comment.id} style={styles.privateCommentCard as object}>
        {renderPrivateCommentStack(
          {
            id: comment.id,
            authorId: comment.authorId,
            text: comment.text,
            createdAt: comment.createdAt,
            reactions: comment.reactions,
            parentCommentId: comment.id,
            syncState: comment.syncState,
          },
          true
        )}
        {threadReplies.map((entry) => (
          <View key={entry.id} style={styles.privateThreadEntry as object}>
            {renderPrivateCommentStack({ ...entry, parentCommentId: comment.id }, false)}
          </View>
        ))}
        {inFullscreenModal && onOpenThreadReply && isPostOwnerView ? (
          <Pressable
            style={styles.postCommentPlaceholderBar as object}
            onPress={() => onOpenThreadReply(comment.id)}
          >
            <Text style={styles.postCommentPlaceholderText as object}>
              {`Reply to ${resolveAuthorMeta(comment.authorId).name}...`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.postFeedCard as object}>
      <ReactionBubbleHost
        entries={aggregatedFeedReactions}
        align="left"
        theme={reactTheme}
        reserveReactionSpace
        onPressSummary={
          aggregatedFeedReactions.length > 0 ? () => onOpenReactionDetail(post) : undefined
        }
        style={styles.feedReactionHost as object}
      >
        <Pressable
          onPress={() => {
            if (!inFullscreenModal) {
              onOpenViewer?.();
            }
          }}
          onLongPress={handlePostLongPress}
          delayLongPress={400}
          disabled={inFullscreenModal}
          accessibilityHint={
            canHoldToReactOnPost
              ? "Press and hold to react"
              : canDelete
                ? "Press and hold to delete"
                : undefined
          }
        >
          <View style={styles.postFeedHeaderRow as object}>
            <Pressable
              onPress={() => {
                if (post.authorId === currentUserId) {
                  onOpenMyProfile();
                  return;
                }
                if (resolveCanOpenProfile(post.authorId)) {
                  onOpenFriendProfile(post.authorId);
                }
              }}
              accessibilityLabel={`Open ${meta.name} profile`}
            >
              {renderAvatar(meta.avatarUri, meta.name.slice(0, 1), 34)}
            </Pressable>
            <View style={styles.postFeedHeaderTextCol as object}>
              <Text style={styles.postFeedAuthor as object} numberOfLines={1}>
                {meta.name}
              </Text>
              <Text style={styles.postFeedTime as object}>{formatTime(post.createdAt)}</Text>
            </View>
            <Pressable
              style={styles.postFeedHeaderAction as object}
              onPress={() => onOpenPostActions(post)}
              accessibilityLabel="Post actions"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={subtleTextColor} />
            </Pressable>
          </View>
          {post.text?.trim() ? (
            <View style={styles.postFeedBodyWrap as object}>
              <Text style={styles.postFeedBody as object}>{post.text}</Text>
            </View>
          ) : null}
        </Pressable>

        {mediaUris.length > 0 ? (
          <View
            style={[
              styles.postFeedMediaWrap as object,
              mediaUris.length > 1 ? { height: mediaTallestHeight } : null,
            ]}
          >
            <ScrollViewUntilScroll
              ref={mediaScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={[
                styles.postFeedImageStrip as object,
                { borderRadius: 0 },
                mediaUris.length > 1 ? { height: mediaTallestHeight } : null,
              ]}
              onMomentumScrollEnd={({ nativeEvent }) =>
                syncPhotoIndexFromOffset(nativeEvent.contentOffset.x)
              }
              onScrollEndDrag={({ nativeEvent }) =>
                syncPhotoIndexFromOffset(nativeEvent.contentOffset.x)
              }
            >
              {mediaUris.map((uri, slideIndex) => {
                const aspect =
                  imageAspectByUri[uri] ??
                  getCachedFeedImageAspect(uri) ??
                  DEFAULT_FEED_IMAGE_ASPECT;
                const naturalHeight = feedPostImageHeightForAspect(feedMediaWidth, aspect);
                const slideHeight =
                  mediaUris.length > 1 ? mediaTallestHeight : naturalHeight;
                return (
                  <Pressable
                    key={`${post.id}-slide-${slideIndex}`}
                    style={[
                      styles.postFeedImageSlide as object,
                      { width: feedMediaWidth, height: slideHeight },
                    ]}
                    onPress={() => {
                      onOpenMedia?.(uri, "photo", {
                        galleryUris: mediaUris,
                        galleryIndex: slideIndex,
                        postId: post.id,
                      });
                    }}
                    onLongPress={handlePostLongPress}
                    delayLongPress={400}
                    accessibilityRole="button"
                    accessibilityLabel="View photo full screen"
                    accessibilityHint={
                      canHoldToReactOnPost ? "Press and hold to react" : undefined
                    }
                  >
                    <Image
                      source={{ uri }}
                      style={[
                        styles.postFeedImageFullWidth as object,
                        { width: feedMediaWidth, height: slideHeight },
                      ]}
                      resizeMode="contain"
                      onLoad={(event) => {
                        const src = event.nativeEvent.source;
                        const w = Number(src?.width ?? 0);
                        const h = Number(src?.height ?? 0);
                        if (!w || !h) return;
                        const stored = rememberFeedImageAspect(uri, w / h);
                        if (stored == null) return;
                        setImageAspectByUri((current) => {
                          if (current[uri] === stored) return current;
                          if (current[uri] != null) return current;
                          return { ...current, [uri]: stored };
                        });
                      }}
                    />
                  </Pressable>
                );
              })}
            </ScrollViewUntilScroll>
            {mediaUris.length > 1 ? (
              <>
                <Pressable
                  style={[
                    styles.postCarouselChevron as object,
                    styles.postCarouselChevronLeft as object,
                  ]}
                  onPress={() => goToPhoto(photoIndex - 1)}
                  accessibilityLabel="Previous photo"
                >
                  <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  style={[
                    styles.postCarouselChevron as object,
                    styles.postCarouselChevronRight as object,
                  ]}
                  onPress={() => goToPhoto(photoIndex + 1)}
                  accessibilityLabel="Next photo"
                >
                  <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                </Pressable>
                <View style={styles.postCarouselCountBadge as object}>
                  <Text style={styles.postCarouselCountText as object}>
                    {photoIndex + 1}/{mediaUris.length}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {hasVideoPost ? renderFeedVideoSurface() : null}
      </ReactionBubbleHost>

      {inFullscreenModal ? (
        <View style={styles.privateCommentInlineSection as object}>
          {sortedComments.map((comment) => renderCommentThreadBlock(comment))}
        </View>
      ) : null}
    </View>
  );
}

export const FeedPostCard = memo(FeedPostCardView);
