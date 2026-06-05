import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";

import { OPEN_SOURCE_LICENSES } from "../lib/openSourceLicenses";
import type { ThemePalette } from "../domain/types";

type Props = {
  theme: ThemePalette;
  styles: Record<string, object>;
  safeTop: number;
  bottomPadding: number;
  onBack: () => void;
};

export function OpenSourceLicensesScreen({ theme, styles, safeTop, bottomPadding, onBack }: Props) {
  return (
    <View style={[styles.fullScreen as object, { paddingTop: safeTop, backgroundColor: theme.background }]}>
      <View style={[styles.authTopBar as object, { marginBottom: 8 }]}>
        <Pressable onPress={onBack} style={styles.authTopLinkButton as object} accessibilityLabel="Back to settings">
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.chatScreenTitle as object, { flex: 1, textAlign: "center" }]}>Open source licences</Text>
        <View style={styles.authTopSideSpacer as object} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPadding, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.subtleText as object, { lineHeight: 20 }]}>
          This app includes open-source software. The notices below satisfy licence attribution requirements for
          key components.
        </Text>
        {OPEN_SOURCE_LICENSES.map((entry) => (
          <View
            key={entry.name}
            style={{
              borderWidth: 1,
              borderColor: theme.divider,
              borderRadius: 12,
              padding: 14,
              backgroundColor: theme.background,
            }}
          >
            <Text style={[styles.chatName as object, { marginBottom: 4 }]}>{entry.name}</Text>
            <Text style={[styles.subtleText as object, { marginBottom: 6 }]}>
              {entry.spdx} · {entry.copyright}
            </Text>
            <Text style={[styles.subtleText as object, { fontSize: 12, lineHeight: 18 }]}>{entry.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
