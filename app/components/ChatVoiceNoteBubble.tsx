import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

type ThemeColors = {
  accent: string;
  mineBubbleText: string;
  subtleText: string;
};

function formatVoiceTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type ChatVoiceNoteBubbleProps = {
  durationSec: number;
  isMine: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  theme: ThemeColors;
  styles: {
    voicePlayRow: object;
    voiceProgressColumn: object;
    voiceProgressTrack: object;
    voiceProgressFill: object;
    voiceProgressFillMine: object;
    voiceTimeLabel: object;
    voiceTimeLabelMine: object;
  };
  onPress: () => void;
};

export function ChatVoiceNoteBubble({
  durationSec,
  isMine,
  isPlaying,
  isLoading,
  positionMs,
  durationMs,
  theme,
  styles,
  onPress,
}: ChatVoiceNoteBubbleProps) {
  const fallbackDurationMs = Math.max(1, durationSec) * 1000;
  const totalMs = durationMs > 0 ? durationMs : fallbackDurationMs;
  const progress = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;
  const elapsedSec = Math.floor(positionMs / 1000);
  const totalSec = Math.floor(totalMs / 1000);

  return (
    <Pressable
      style={styles.voicePlayRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? "Pause voice note" : "Play voice note"}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={isMine ? theme.mineBubbleText : theme.accent} />
      ) : (
        <Ionicons
          name={isPlaying ? "pause-circle-outline" : "play-circle-outline"}
          size={28}
          color={isMine ? theme.mineBubbleText : theme.accent}
        />
      )}
      <View style={styles.voiceProgressColumn}>
        <View style={styles.voiceProgressTrack}>
          <View
            style={[
              isMine ? styles.voiceProgressFillMine : styles.voiceProgressFill,
              { width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
        <Text style={isMine ? styles.voiceTimeLabelMine : styles.voiceTimeLabel}>
          {formatVoiceTime(elapsedSec)} / {formatVoiceTime(totalSec)}
        </Text>
      </View>
    </Pressable>
  );
}
