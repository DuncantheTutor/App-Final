import { Feather } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { AttachedReactionBubbles } from "./ReactionBubbleHost";
import { REACTION_EMOJIS } from "../theme/preludeConstants";

export type HoldToReactTheme = {
  accent: string;
  divider: string;
  text: string;
  subtleText: string;
  background: string;
};

type HoldToReactButtonProps = {
  activeEmoji?: string;
  onPick: (emoji: string) => void;
  disabled?: boolean;
  theme: HoldToReactTheme;
  accessibilityLabel?: string;
  /** `icon` = compact smile (default). `plus` is deprecated — use long-press on the parent surface. */
  variant?: "icon" | "plus";
};

export function HoldToReactButton({
  activeEmoji,
  onPick,
  disabled,
  theme,
  accessibilityLabel = "Add reaction",
  variant = "icon",
}: HoldToReactButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressOpenedRef = useRef(false);

  const openPicker = () => {
    if (disabled) return;
    setPickerOpen(true);
  };

  const handlePick = (emoji: string) => {
    setPickerOpen(false);
    onPick(emoji);
  };

  const isPlus = variant === "plus";
  const triggerStyle = isPlus ? styles.triggerPlus : styles.trigger;
  const triggerSize = isPlus ? 22 : 32;

  return (
    <>
      <Pressable
        onLongPress={() => {
          longPressOpenedRef.current = true;
          openPicker();
        }}
        delayLongPress={400}
        disabled={disabled}
        style={[
          triggerStyle,
          { borderColor: theme.divider, backgroundColor: `${theme.divider}55` },
          activeEmoji ? { borderColor: theme.accent, backgroundColor: `${theme.accent}22` } : null,
          isPlus ? { width: triggerSize, height: triggerSize, borderRadius: triggerSize / 2 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Press and hold to choose a reaction"
      >
        {activeEmoji ? (
          <Text style={[styles.triggerEmoji, isPlus ? styles.triggerEmojiPlus : null]}>{activeEmoji}</Text>
        ) : isPlus ? (
          <Feather name="plus" size={14} color={theme.accent} />
        ) : (
          <Feather name="smile" size={15} color={theme.accent} />
        )}
      </Pressable>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.card, { backgroundColor: theme.background }]} onPress={() => {}}>
            <Text style={[styles.title, { color: theme.text }]}>React</Text>
            <View style={styles.emojiRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => handlePick(emoji)}
                  style={[
                    styles.emojiChip,
                    { borderColor: theme.divider },
                    activeEmoji === emoji ? { borderColor: theme.accent } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${emoji}`}
                >
                  <Text style={styles.emojiChipText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.hint, { color: theme.subtleText }]}>
              Tap an emoji · same choice again removes yours
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Inline fallback; prefer `ReactionBubbleHost` wrapping the parent bubble. */
export function ReactionSummaryChips({
  entries,
  onPressSummary,
  theme,
  align = "left",
}: {
  entries: Array<[string, number]>;
  onPressSummary?: () => void;
  theme: HoldToReactTheme;
  align?: "left" | "right";
}) {
  return (
    <AttachedReactionBubbles
      entries={entries}
      align={align}
      theme={theme}
      onPress={onPressSummary}
    />
  );
}

/** Opens the shared reaction picker modal (for long-press on bubbles/cards). */
export function ReactionPickerModal({
  visible,
  activeEmoji,
  onPick,
  onClose,
  theme,
}: {
  visible: boolean;
  activeEmoji?: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
  theme: HoldToReactTheme;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.background }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.text }]}>React</Text>
          <View style={styles.emojiRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  onClose();
                  onPick(emoji);
                }}
                style={[
                  styles.emojiChip,
                  { borderColor: theme.divider },
                  activeEmoji === emoji ? { borderColor: theme.accent } : null,
                ]}
              >
                <Text style={styles.emojiChipText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerPlus: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerEmoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  triggerEmojiPlus: {
    fontSize: 13,
    lineHeight: 15,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  emojiChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  emojiChipText: {
    fontSize: 22,
  },
  hint: {
    marginTop: 10,
    fontSize: 12,
    textAlign: "center",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
  },
  summaryEmoji: {
    fontSize: 14,
  },
  summaryCount: {
    fontSize: 11,
    fontWeight: "700",
  },
});
