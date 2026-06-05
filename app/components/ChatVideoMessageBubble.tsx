import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { useVideoPoster } from "../hooks/useVideoPosterUri";
import { CHAT_MESSAGE_LONG_PRESS_MS } from "../theme/preludeConstants";
import { VideoWithFadeControls } from "./VideoWithFadeControls";

type Props = {
  resolvedUri: string | undefined;
  resolving: boolean;
  preparePending: boolean;
  width: number;
  height: number;
  isSending: boolean;
  isPlaying: boolean;
  showPlayOverlay: boolean;
  accentColor: string;
  onPressSurface: () => void;
  onLongPress: () => void;
  onCancelPrepare: () => void;
  onDidFinish: () => void;
  messageId: string;
  onPosterDimensions?: (messageId: string, width: number, height: number) => void;
  playbackKey: string;
};

export function ChatVideoMessageBubble({
  resolvedUri,
  resolving,
  preparePending,
  width,
  height,
  isSending,
  isPlaying,
  showPlayOverlay,
  accentColor,
  onPressSurface,
  onLongPress,
  onCancelPrepare,
  onDidFinish,
  messageId,
  onPosterDimensions,
  playbackKey,
}: Props) {
  const { posterUri, width: posterW, height: posterH } = useVideoPoster(
    resolvedUri,
    Boolean(resolvedUri) && !isPlaying
  );

  useEffect(() => {
    if (!posterW || !posterH || !onPosterDimensions) return;
    onPosterDimensions(messageId, posterW, posterH);
  }, [messageId, posterW, posterH, onPosterDimensions]);

  const preparing = resolving || preparePending;

  if (isSending) {
    return (
      <View
        style={{
          width,
          height,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1a1a1a",
        }}
      >
        <ActivityIndicator color={accentColor} size="large" />
      </View>
    );
  }

  if (isPlaying && resolvedUri) {
    return (
      <VideoWithFadeControls
        uri={resolvedUri}
        width={width}
        height={height}
        shouldPlay
        showPlayOverlay={false}
        compact
        restartOnPlay
        playbackKey={playbackKey}
        onLongPress={onLongPress}
        onDidFinish={onDidFinish}
        onOpenFullscreen={onPressSurface}
      />
    );
  }

  return (
    <Pressable
      style={{ width, height, backgroundColor: "#000" }}
      onPress={preparing ? onCancelPrepare : onPressSurface}
      onLongPress={onLongPress}
      delayLongPress={CHAT_MESSAGE_LONG_PRESS_MS}
      accessibilityRole="button"
      accessibilityLabel={preparing ? "Cancel preparing video" : "Play video"}
    >
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={{ width, height }} resizeMode="contain" />
      ) : (
        <View
          style={{
            width,
            height,
            backgroundColor: "#1a1a1a",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {preparing ? null : (
            <View style={styles.playCircle}>
              <Ionicons name="play" size={22} color="#fff" />
            </View>
          )}
        </View>
      )}
      {preparing ? (
        <View style={styles.prepareOverlay} pointerEvents="box-none">
          <ActivityIndicator color={accentColor} size="large" />
          <Text style={styles.prepareLabel}>Preparing video…</Text>
          <Pressable
            style={styles.cancelBtn}
            onPress={onCancelPrepare}
            accessibilityRole="button"
            accessibilityLabel="Cancel preparing video"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      ) : showPlayOverlay ? (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={22} color="#fff" />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  prepareOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 8,
    paddingHorizontal: 12,
  },
  prepareLabel: {
    color: "#eee",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  cancelBtn: {
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  cancelBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
});
