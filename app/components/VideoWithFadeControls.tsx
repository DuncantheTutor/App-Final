import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";

const CONTROLS_VISIBLE_MS = 1500;
const CONTROLS_FADE_DURATION_MS = 350;

function formatVideoTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type VideoWithFadeControlsProps = {
  uri: string;
  width: number;
  height: number;
  shouldPlay: boolean;
  /** When true, show centered play affordance (idle / finished). */
  showPlayOverlay?: boolean;
  /** Optional still shown behind the play overlay before the player mounts. */
  posterUri?: string | null;
  compact?: boolean;
  /** Keep the native player mounted while paused so decrypt/load can finish before play. */
  keepPlayerMounted?: boolean;
  resizeMode?: ResizeMode;
  onDidFinish?: () => void;
  /** Idle overlay tap — start inline playback. */
  onPressPlayOverlay?: () => void;
  /** @deprecated Prefer `onPressPlayOverlay` + `onOpenFullscreen`. Still used by chat bubbles. */
  onPressSurface?: () => void;
  /** Opens dedicated full-screen viewer (expand control + feed second-tap). */
  onOpenFullscreen?: () => void;
  onLongPress?: () => void;
  /** When true, rewind to 0 only if the clip had reached the end before play. */
  restartOnPlay?: boolean;
  /** Changing this remounts the player (reliable replay after `didJustFinish`). */
  playbackKey?: string | number;
};

export function VideoWithFadeControls({
  uri,
  width,
  height,
  shouldPlay,
  showPlayOverlay = false,
  posterUri,
  compact = false,
  keepPlayerMounted = false,
  resizeMode,
  onDidFinish,
  onPressPlayOverlay,
  onPressSurface,
  onOpenFullscreen,
  onLongPress,
  restartOnPlay = false,
  playbackKey,
}: VideoWithFadeControlsProps) {
  const videoRef = useRef<Video | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(0)).current;
  const [controlsVisible, setControlsVisible] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  isScrubbingRef.current = isScrubbing;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const fadeControlsOut = useCallback(() => {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: CONTROLS_FADE_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setControlsVisible(false);
    });
  }, [controlsOpacity]);

  const showControlsBriefly = useCallback(() => {
    clearHideTimer();
    setControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    hideTimerRef.current = setTimeout(() => {
      if (!isScrubbingRef.current) fadeControlsOut();
    }, CONTROLS_VISIBLE_MS);
  }, [clearHideTimer, controlsOpacity, fadeControlsOut]);

  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  useEffect(() => {
    const run = async () => {
      const ref = videoRef.current;
      if (!ref) return;
      if (!shouldPlay) {
        await ref.pauseAsync();
        setIsPlaying(false);
        fadeControlsOut();
        return;
      }
      const status = await ref.getStatusAsync();
      if (status.isLoaded && restartOnPlay) {
        const duration = status.durationMillis ?? 0;
        const atEnd = duration > 0 && (status.positionMillis ?? 0) >= duration - 250;
        if (atEnd) {
          await ref.setPositionAsync(0);
          setPositionMs(0);
        }
      }
      await ref.playAsync();
      setIsPlaying(true);
      showControlsBriefly();
    };
    void run();
    // Intentionally only `shouldPlay` — avoid rewinding when controls/scrub state changes.
  }, [shouldPlay]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        setPositionMs(status.positionMillis ?? 0);
        setDurationMs(status.durationMillis ?? 0);
        setIsPlaying(false);
        onDidFinish?.();
        return;
      }
      const nextPosition = status.positionMillis ?? 0;
      const nextDuration = status.durationMillis ?? 0;
      const nextPlaying = status.isPlaying;
      if (!isScrubbing) {
        setPositionMs((cur) => (Math.abs(cur - nextPosition) >= 250 ? nextPosition : cur));
      }
      setDurationMs((cur) => (cur !== nextDuration ? nextDuration : cur));
      setIsPlaying((cur) => (cur !== nextPlaying ? nextPlaying : cur));
    },
    [onDidFinish, isScrubbing]
  );

  const togglePlayPause = useCallback(async () => {
    const ref = videoRef.current;
    if (!ref) return;
    const status = await ref.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await ref.pauseAsync();
      setIsPlaying(false);
      showControlsBriefly();
      return;
    }
    if (status.positionMillis >= (status.durationMillis ?? 0) - 250 && status.durationMillis) {
      await ref.setPositionAsync(0);
    }
    await ref.playAsync();
    setIsPlaying(true);
    showControlsBriefly();
  }, [showControlsBriefly]);

  const seekToMs = useCallback(
    async (targetMs: number) => {
      const ref = videoRef.current;
      if (!ref) return;
      const status = await ref.getStatusAsync();
      const duration = status.isLoaded ? (status.durationMillis ?? durationMs) : durationMs;
      if (!duration) return;
      const clamped = Math.max(0, Math.min(targetMs, duration));
      setPositionMs(clamped);
      setIsScrubbing(false);
      await ref.setPositionAsync(clamped);
      if (shouldPlay) {
        await ref.playAsync();
        setIsPlaying(true);
      }
      showControlsBriefly();
    },
    [durationMs, shouldPlay, showControlsBriefly]
  );

  const videoResize = resizeMode ?? (compact ? ResizeMode.CONTAIN : ResizeMode.COVER);
  const mountPlayer = shouldPlay || !showPlayOverlay || keepPlayerMounted;

  const videoNode = mountPlayer ? (
    <Video
      key={playbackKey ?? uri}
      ref={videoRef}
      source={{ uri }}
      style={{ width, height }}
      resizeMode={videoResize}
      shouldPlay={shouldPlay}
      isLooping={false}
      useNativeControls={false}
      onPlaybackStatusUpdate={onPlaybackStatusUpdate}
    />
  ) : null;

  const idleSurface = posterUri ? (
    <Image source={{ uri: posterUri }} style={{ width, height }} resizeMode="contain" />
  ) : (
    <View
      style={{ width, height, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}
    >
      <View style={[styles.playCircle, compact && styles.playCircleCompact]}>
        <Ionicons name="play" size={compact ? 22 : 32} color="#fff" />
      </View>
    </View>
  );

  const handleVideoSurfacePress = useCallback(() => {
    showControlsBriefly();
  }, [showControlsBriefly]);

  const controlsNode = controlsVisible ? (
      <Animated.View
        style={[
          styles.controlsBar,
          compact && styles.controlsBarCompact,
          { opacity: controlsOpacity },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.transportBtn}
          onPress={() => void togglePlayPause()}
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={compact ? 20 : 26} color="#fff" />
        </Pressable>
        <View style={styles.seekTrackWrap} pointerEvents="box-none">
          <Slider
            style={styles.seekSlider}
            value={positionMs}
            minimumValue={0}
            maximumValue={Math.max(durationMs, 1)}
            step={1}
            onSlidingStart={() => {
              setIsScrubbing(true);
              clearHideTimer();
              setControlsVisible(true);
              Animated.timing(controlsOpacity, {
                toValue: 1,
                duration: 120,
                useNativeDriver: true,
              }).start();
            }}
            onValueChange={(value) => setPositionMs(value)}
            onSlidingComplete={(value) => {
              void seekToMs(value);
            }}
            minimumTrackTintColor="rgba(255,255,255,0.95)"
            maximumTrackTintColor="rgba(255,255,255,0.28)"
            thumbTintColor="#FFFFFF"
            disabled={!durationMs}
          />
        </View>
        <Text style={[styles.timeLabel, compact && styles.timeLabelCompact]}>
          {formatVideoTime(positionMs)}
          {durationMs > 0 ? ` / ${formatVideoTime(durationMs)}` : ""}
        </Text>
        {onOpenFullscreen ? (
          <Pressable
            style={styles.transportBtn}
            onPress={() => onOpenFullscreen()}
            accessibilityLabel="Full screen"
          >
            <Ionicons name="expand" size={compact ? 18 : 22} color="#fff" />
          </Pressable>
        ) : null}
      </Animated.View>
    ) : null;

  if (showPlayOverlay) {
    return (
      <Pressable
        style={{ width, height, backgroundColor: "#000" }}
        onLongPress={onLongPress}
        delayLongPress={400}
        onPress={() => (onPressPlayOverlay ?? onPressSurface)?.()}
        accessibilityRole="button"
        accessibilityLabel="Play video"
      >
        {videoNode ?? idleSurface}
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={[styles.playCircle, compact && styles.playCircleCompact]}>
            <Ionicons name="play" size={compact ? 22 : 32} color="#fff" />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ width, height, backgroundColor: "#000" }}>
      <Pressable
        style={{ width, height }}
        onLongPress={onLongPress}
        delayLongPress={400}
        onPress={handleVideoSurfacePress}
        accessibilityRole="button"
      >
        {videoNode}
      </Pressable>
      {controlsNode}
    </View>
  );
}

const styles = StyleSheet.create({
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  playCircleCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  controlsBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    elevation: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  controlsBarCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  transportBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  seekTrackWrap: {
    flex: 1,
    justifyContent: "center",
    minHeight: 28,
  },
  seekSlider: {
    width: "100%",
    height: 28,
  },
  timeLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 72,
    textAlign: "right",
  },
  timeLabelCompact: {
    fontSize: 10,
    minWidth: 58,
  },
});
