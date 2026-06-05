import { Ionicons } from "@expo/vector-icons";
import { ResizeMode } from "expo-av";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScrollViewUntilScroll } from "../../ScrollUntilScroll";
import { VideoWithFadeControls } from "./VideoWithFadeControls";

export type FullscreenMediaItem = {
  uri: string;
  kind: "photo" | "gif" | "video";
  mediaWidth?: number;
  mediaHeight?: number;
  /** Feed post gallery: swipe via horizontal pager while full-screen. */
  galleryUris?: readonly string[];
  galleryIndex?: number;
  /** When set, index changes sync back to the feed/post carousel for this post. */
  postId?: string;
};

type Props = {
  item: FullscreenMediaItem | null;
  backgroundColor: string;
  onClose: () => void;
  /** Called when the user swipes or uses chevrons to change the active gallery slide. */
  onGalleryIndexChange?: (index: number, postId?: string) => void;
};

/**
 * Full-screen media layer (not a dimmed dialog Modal).
 * Rendered as an absolute overlay so Android does not present a centered popup.
 */
export function FullscreenMediaViewer({ item, onClose, onGalleryIndexChange }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  /** Preserve feed carousel order/length so indices stay in sync (no dedupe). */
  const galleryUris = useMemo(() => {
    if (!item?.galleryUris?.length) return null;
    const list = item.galleryUris.filter((u) => u.trim().length > 0);
    return list.length > 1 ? list : null;
  }, [item?.galleryUris]);

  const initialIndex = useMemo(() => {
    if (!item || !galleryUris) return 0;
    const idx = item.galleryIndex ?? galleryUris.indexOf(item.uri);
    return Math.max(0, Math.min(idx >= 0 ? idx : 0, galleryUris.length - 1));
  }, [item, galleryUris]);

  const [galleryIndex, setGalleryIndex] = useState(initialIndex);
  const galleryScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    setGalleryIndex(initialIndex);
    if (galleryUris && galleryUris.length > 1) {
      requestAnimationFrame(() => {
        galleryScrollRef.current?.scrollTo({ x: initialIndex * windowW, animated: false });
      });
    }
  }, [initialIndex, item?.uri, galleryUris, windowW]);

  const publishIndex = useCallback(
    (next: number) => {
      setGalleryIndex(next);
      onGalleryIndexChange?.(next, item?.postId);
    },
    [item?.postId, onGalleryIndexChange]
  );

  const syncIndexFromOffset = useCallback(
    (offsetX: number) => {
      if (!galleryUris) return;
      const next = Math.round(offsetX / windowW);
      publishIndex(Math.max(0, Math.min(next, galleryUris.length - 1)));
    },
    [galleryUris, publishIndex, windowW]
  );

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (!galleryUris) return;
      const clamped = Math.max(0, Math.min(nextIndex, galleryUris.length - 1));
      publishIndex(clamped);
      galleryScrollRef.current?.scrollTo({ x: clamped * windowW, animated: true });
    },
    [galleryUris, publishIndex, windowW]
  );

  const goPrev = useCallback(() => {
    goToIndex(galleryIndex - 1);
  }, [galleryIndex, goToIndex]);

  const goNext = useCallback(() => {
    goToIndex(galleryIndex + 1);
  }, [galleryIndex, goToIndex]);

  /** Allow portrait and landscape while full-screen media is open; restore app default on close. */
  useEffect(() => {
    if (!item) return;
    void ScreenOrientation.unlockAsync();
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [item]);

  if (!item) return null;

  const activeUri =
    galleryUris && item.kind !== "video" ? (galleryUris[galleryIndex] ?? item.uri) : item.uri;

  const showGalleryChrome = !!galleryUris && item.kind !== "video";
  const canGoPrev = showGalleryChrome && galleryIndex > 0;
  const canGoNext = showGalleryChrome && galleryIndex < (galleryUris?.length ?? 0) - 1;

  return (
    <View style={styles.host} accessibilityViewIsModal importantForAccessibility="yes">
      <StatusBar style="light" hidden={Platform.OS === "android"} />
      <View style={styles.root}>
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 8 }]}
          onPress={onClose}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={30} color="#fff" />
        </Pressable>
        {item.kind === "video" ? (
          <View style={styles.videoStage}>
            <VideoWithFadeControls
              uri={item.uri}
              width={windowW}
              height={windowH}
              shouldPlay
              restartOnPlay
              resizeMode={ResizeMode.CONTAIN}
            />
          </View>
        ) : showGalleryChrome ? (
          <ScrollViewUntilScroll
            ref={galleryScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.galleryStrip}
            onMomentumScrollEnd={({ nativeEvent }) => syncIndexFromOffset(nativeEvent.contentOffset.x)}
            onScrollEndDrag={({ nativeEvent }) => syncIndexFromOffset(nativeEvent.contentOffset.x)}
          >
            {galleryUris.map((uri, slideIndex) => (
              <View key={`${slideIndex}-${uri}`} style={[styles.gallerySlide, { width: windowW }]}>
                <Image source={{ uri }} style={styles.fullImage} resizeMode="contain" />
              </View>
            ))}
          </ScrollViewUntilScroll>
        ) : (
          <Image source={{ uri: activeUri }} style={styles.fullImage} resizeMode="contain" />
        )}
        {showGalleryChrome ? (
          <>
            <Pressable
              style={[styles.chevron, styles.chevronLeft, !canGoPrev ? styles.chevronDisabled : null]}
              onPress={goPrev}
              disabled={!canGoPrev}
              accessibilityLabel="Previous photo"
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={[styles.chevron, styles.chevronRight, !canGoNext ? styles.chevronDisabled : null]}
              onPress={goNext}
              disabled={!canGoNext}
              accessibilityLabel="Next photo"
            >
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </Pressable>
            <View style={styles.countBadgeWrap}>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {galleryIndex + 1}/{galleryUris.length}
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    elevation: 100000,
    backgroundColor: "#000000",
  },
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  videoStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  galleryStrip: {
    flex: 1,
  },
  gallerySlide: {
    flex: 1,
    justifyContent: "center",
  },
  fullImage: {
    flex: 1,
    width: "100%",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    position: "absolute",
    top: "50%",
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
  },
  chevronLeft: {
    left: 12,
  },
  chevronRight: {
    right: 12,
  },
  chevronDisabled: {
    opacity: 0.35,
  },
  countBadgeWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: "center",
    zIndex: 8,
  },
  countBadge: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
