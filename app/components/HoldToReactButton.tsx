import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

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
};

export function HoldToReactButton({
  activeEmoji,
  onPick,
  disabled,
  theme,
  accessibilityLabel = "Tap to react",
}: HoldToReactButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = () => {
    if (disabled) return;
    setPickerOpen(true);
  };

  const handlePick = (emoji: string) => {
    setPickerOpen(false);
    onPick(emoji);
  };

  return (
    <>
      <Pressable
        onPress={openPicker}
        disabled={disabled}
        style={[
          styles.trigger,
          { borderColor: theme.divider, backgroundColor: `${theme.divider}55` },
          activeEmoji ? { borderColor: theme.accent, backgroundColor: `${theme.accent}22` } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Opens the reaction picker"
      >
        {activeEmoji ? (
          <Text style={styles.triggerEmoji}>{activeEmoji}</Text>
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

export function ReactionSummaryChips({
  entries,
  onPressSummary,
  theme,
}: {
  entries: Array<[string, number]>;
  onPressSummary?: () => void;
  theme: HoldToReactTheme;
}) {
  if (entries.length === 0) return null;
  const body = (
    <View style={styles.summaryRow}>
      {entries.map(([emoji, count]) => (
        <View
          key={emoji}
          style={[
            styles.summaryChip,
            { backgroundColor: theme.background === "#000000" ? "rgba(255,255,255,0.08)" : `${theme.divider}cc` },
          ]}
        >
          <Text style={styles.summaryEmoji}>{emoji}</Text>
          {count > 1 ? <Text style={[styles.summaryCount, { color: theme.subtleText }]}>{count}</Text> : null}
        </View>
      ))}
    </View>
  );
  if (!onPressSummary) return body;
  return (
    <Pressable onPress={onPressSummary} accessibilityRole="button" accessibilityLabel="View reactions">
      {body}
    </Pressable>
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
  triggerEmoji: {
    fontSize: 16,
    lineHeight: 18,
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
    gap: 6,
    flex: 1,
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
  },
  summaryEmoji: {
    fontSize: 16,
  },
  summaryCount: {
    fontSize: 12,
    fontWeight: "700",
  },
});
