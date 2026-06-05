import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { ThemePalette } from "../domain/types";

type NotificationPrePromptScreenProps = {
  theme: ThemePalette;
  styles: Record<string, object>;
  productName: string;
  safeTop: number;
  busy?: boolean;
  onAllow: () => void;
  onDecline: () => void;
};

/** In-app explain-then-ask step before the OS notification permission sheet. */
export function NotificationPrePromptScreen({
  theme,
  styles,
  productName,
  safeTop,
  busy,
  onAllow,
  onDecline,
}: NotificationPrePromptScreenProps) {
  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.background,
          paddingTop: safeTop + 24,
          paddingHorizontal: 28,
          justifyContent: "center",
        },
      ]}
      accessible
      accessibilityLabel="Notification permission"
    >
      <View style={{ alignItems: "center", marginBottom: 28 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: theme.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="notifications-outline" size={36} color="#FFFFFF" />
        </View>
      </View>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "700",
          textAlign: "center",
          color: theme.text,
          marginBottom: 12,
        }}
      >
        Stay in the loop
      </Text>
      <Text
        style={{
          fontSize: 16,
          lineHeight: 23,
          textAlign: "center",
          color: theme.subtleText,
          marginBottom: 32,
        }}
      >
        Get notified when friends message you or react to your posts. {productName} loads your chats and
        feed in the background while you decide.
      </Text>
      <Pressable
        style={[styles.primaryButton, { alignSelf: "stretch", marginBottom: 12, opacity: busy ? 0.7 : 1 }]}
        onPress={onAllow}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Allow notifications"
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Allow notifications</Text>
        )}
      </Pressable>
      <Pressable
        style={{ alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16 }}
        onPress={onDecline}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Not now"
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: theme.subtleText }}>Not now</Text>
      </Pressable>
    </View>
  );
}
