import { Feather, Ionicons } from "@expo/vector-icons";
import * as VideoThumbnails from "expo-video-thumbnails";
import { memo, useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import type { Post } from "../domain/types";
import {
  postHasGridMedia,
  thumbnailFromResolvedMedia,
  useResolvedPostMedia,
} from "../hooks/useResolvedPostMedia";

export type PostGridCellProps = {
  post: Post;
  width: number;
  height: number;
  styles: Record<string, object>;
  subtleTextColor: string;
};

function PostGridCellView({ post, width, height, styles, subtleTextColor }: PostGridCellProps) {
  const resolved = useResolvedPostMedia(post, { resolveVideo: false });
  const [videoFrameUri, setVideoFrameUri] = useState<string | undefined>();

  const hasMedia = postHasGridMedia(post);
  const thumb = thumbnailFromResolvedMedia(resolved, videoFrameUri);
  const isVideo = !!(resolved.videoUri || post.videoUri || post.videoEncryptedMedia);

  useEffect(() => {
    setVideoFrameUri(undefined);
    if (resolved.imageUris[0] || resolved.videoPosterUri) return;
    const videoUri = resolved.videoUri?.trim();
    if (!videoUri) return;
    let cancelled = false;
    void VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.72 })
      .then((result) => {
        if (!cancelled && result.uri?.trim()) setVideoFrameUri(result.uri.trim());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [post.id, resolved.imageUris, resolved.videoPosterUri, resolved.videoUri]);

  return (
    <View style={[styles.postGridCell as object, { width, height }]}>
      {!hasMedia && post.text?.trim() ? (
        <View style={styles.postGridTextMiniWrap as object}>
          <Text style={styles.postGridTextMini as object} numberOfLines={5}>
            {post.text}
          </Text>
        </View>
      ) : thumb ? (
        <View style={StyleSheet.absoluteFillObject}>
          <Image
            source={{ uri: thumb }}
            style={styles.postGridImage as object}
            resizeMode="cover"
          />
          {isVideo ? (
            <View style={styles.postGridPlayBadge as object}>
              <Ionicons name="play" size={18} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      ) : hasMedia ? (
        <View style={[styles.postGridEmpty as object, { width, height }]}>
          <ActivityIndicator size="small" color={subtleTextColor} />
        </View>
      ) : (
        <View style={[styles.postGridEmpty as object, { width, height }]}>
          <Feather name="image" size={18} color={subtleTextColor} />
        </View>
      )}
    </View>
  );
}

export const PostGridCell = memo(PostGridCellView);
