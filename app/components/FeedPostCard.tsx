import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import { ScrollViewUntilScroll } from "../../ScrollUntilScroll";
import type { HoldToReactTheme } from "./HoldToReactButton";
import { ReactionBubbleHost } from "./ReactionBubbleHost";
import type { Post, PostComment } from "../domain/types";
import {
  DEFAULT_FEED_IMAGE_ASPECT,
  feedPostImageHeightForAspect,
  feedPostMediaWidth,
  getCachedFeedImageAspect,
  preloadFeedImageAspects,
  rememberFeedImageAspect,
} from "../lib/feedPostLayout";
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
  videoShouldPlay?: boolean;
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
  videoShouldPlay,
  resolveAuthorMeta,
  resolveCanOpenProfile,
  formatTime,
  renderAvatar,
  getBackendSession,
  commentReactionEntries,
  canReactToComment,
  onToggleReaction,
  onOpenViewer,
  onOpenThreadReply,
  onOpenFriendProfile,
  onOpenMyProfile,
  onOpenPostActions,
  onConfirmDeletePost,
  onOpenReactionPickerForPost,
  onOpenReactionPickerForComment,
  onOpenReactionDetail,
}: FeedPostCardProps) {
  const meta = resolveAuthorMeta(post.authorId);
  const canDelete = post.authorId === currentUserId;
  const mediaUris = post.imageUris ?? [];
  const mediaUrisKey = mediaUris.join("\0");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imageAspectByUri, setImageAspectByUri] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const uri of mediaUris) {
      const cached = getCachedFeedImageAspect(uri);
      if (cached != null) init[uri] = cached;
    }
    return init;
  });
  const mediaScrollRef = useRef<ScrollView | null>(null);
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
    setPhotoIndex(0);
  }, [post.id]);

  useEffect(() => {
    if (mediaUris.length === 0) return;
    preloadFeedImageAspects(mediaUris, (uri, aspect) => {
      setImageAspectByUri((current) => {
        if (current[uri] === aspect) return current;
        return { ...current, [uri]: aspect };
      });
    });
  }, [post.id, mediaUrisKey]);

  const goToPhoto = (nextIndex: number) => {
    if (mediaUris.length <= 1) return;
    const clamped = Math.max(0, Math.min(nextIndex, mediaUris.length - 1));
    setPhotoIndex(clamped);
    mediaScrollRef.current?.scrollTo({ x: clamped * feedMediaWidth, animated: true });
  };

  const renderPrivateCommentStack = (
    entry: {
      id: string;
      authorId: string;
      text: string;
      createdAt: number;
      reactions?: Record<string, string>;
      parentCommentId: string;
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
          onLongPress={() => {
            if (onToggleReaction && !demoOfflineMode && getBackendSession()) {
              onOpenReactionPickerForPost(post.id);
            } else if (canDelete) {
              onConfirmDeletePost(post);
            }
          }}
          delayLongPress={400}
          disabled={inFullscreenModal}
          accessibilityHint={
            onToggleReaction
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

          {mediaUris.length > 0 ? (
            <View style={styles.postFeedMediaWrap as object}>
              <ScrollViewUntilScroll
                ref={mediaScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.postFeedImageStrip as object}
                onMomentumScrollEnd={({ nativeEvent }) => {
                  const next = Math.round(nativeEvent.contentOffset.x / feedMediaWidth);
                  setPhotoIndex(Math.max(0, Math.min(next, mediaUris.length - 1)));
                }}
              >
                {mediaUris.map((uri) => {
                  const aspect =
                    imageAspectByUri[uri] ??
                    getCachedFeedImageAspect(uri) ??
                    DEFAULT_FEED_IMAGE_ASPECT;
                  const slideHeight = feedPostImageHeightForAspect(feedMediaWidth, aspect);
                  return (
                    <View key={uri} style={{ width: feedMediaWidth, height: slideHeight }}>
                      <Image
                        source={{ uri }}
                        style={{ width: feedMediaWidth, height: slideHeight }}
                        resizeMode="cover"
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
                    </View>
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

          {post.videoUri ? (
            <View style={styles.postFeedVideoWrap as object}>
              <Video
                style={[
                  styles.postFeedVideo as object,
                  {
                    width: feedMediaWidth,
                    height: feedPostImageHeightForAspect(feedMediaWidth, 16 / 9),
                  },
                ]}
                source={{ uri: post.videoUri }}
                usePoster={!!post.videoPosterUri}
                posterSource={post.videoPosterUri ? { uri: post.videoPosterUri } : undefined}
                resizeMode={ResizeMode.COVER}
                useNativeControls={!videoShouldPlay}
                isMuted
                shouldPlay={!!videoShouldPlay}
              />
            </View>
          ) : null}
        </Pressable>
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
