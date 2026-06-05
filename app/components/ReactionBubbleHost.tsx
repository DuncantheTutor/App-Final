import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { HoldToReactTheme } from "./HoldToReactButton";

export type ReactionBubbleAlign = "left" | "right";

type AttachedReactionBubblesProps = {
  entries: Array<[string, number]>;
  align: ReactionBubbleAlign;
  theme: HoldToReactTheme;
  onPress?: () => void;
};

/** Small pill cluster overlapping the bottom edge of a message/comment/post bubble. */
export function AttachedReactionBubbles({
  entries,
  align,
  theme,
  onPress,
}: AttachedReactionBubblesProps) {
  if (entries.length === 0) return null;

  const bg = theme.background.trim().toLowerCase();
  const isDark =
    bg === "#000000" ||
    bg === "#000" ||
    (bg.startsWith("#") &&
      bg.length >= 4 &&
      Number.parseInt(bg.replace("#", "").slice(0, 6).padEnd(6, "0"), 16) < 0x404040);
  const pill = (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: isDark ? "#2c2c2e" : "#ffffff",
          borderColor: theme.divider,
        },
      ]}
    >
      {entries.map(([emoji, count]) => (
        <View key={emoji} style={styles.emojiSlot}>
          <Text style={styles.emojiText}>{emoji}</Text>
          {count > 1 ? (
            <Text style={[styles.countText, { color: theme.subtleText }]}>{count}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );

  return (
    <View
      style={[styles.attachedLayer, align === "right" ? styles.attachedLayerRight : styles.attachedLayerLeft]}
      pointerEvents="box-none"
    >
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="View reactions">
          {pill}
        </Pressable>
      ) : (
        pill
      )}
    </View>
  );
}

type ReactionBubbleHostProps = {
  children: ReactNode;
  entries: Array<[string, number]>;
  align: ReactionBubbleAlign;
  theme: HoldToReactTheme;
  onPressSummary?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Keep bottom inset for reaction pills even before reactions load (avoids feed layout jump). */
  reserveReactionSpace?: boolean;
};

/** Wraps a bubble; renders attached reaction pill at the bottom when `entries` is non-empty. */
export function ReactionBubbleHost({
  children,
  entries,
  align,
  theme,
  onPressSummary,
  style,
  reserveReactionSpace = false,
}: ReactionBubbleHostProps) {
  const hasReactions = entries.length > 0;
  const reserveSpace = reserveReactionSpace || hasReactions;
  return (
    <View
      style={[
        styles.host,
        align === "right" ? styles.hostRight : styles.hostLeft,
        reserveSpace ? styles.hostWithReactions : null,
        style,
      ]}
    >
      {children}
      {hasReactions ? (
        <AttachedReactionBubbles
          entries={entries}
          align={align}
          theme={theme}
          onPress={onPressSummary}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "relative",
    maxWidth: "100%",
  },
  hostLeft: {
    alignSelf: "flex-start",
  },
  hostRight: {
    alignSelf: "flex-end",
  },
  hostWithReactions: {
    marginBottom: 14,
  },
  attachedLayer: {
    position: "absolute",
    bottom: -14,
    zIndex: 4,
    elevation: 4,
  },
  attachedLayerLeft: {
    left: 4,
  },
  attachedLayerRight: {
    right: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    alignSelf: "flex-start",
    maxWidth: 280,
    gap: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  emojiSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingHorizontal: 1,
  },
  emojiText: {
    fontSize: 13,
    lineHeight: 16,
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
});
