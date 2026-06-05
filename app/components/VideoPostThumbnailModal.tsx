import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  defaultPosterUri: string | null;
  loadingPreview: boolean;
  theme: {
    background: string;
    text: string;
    subtleText: string;
    divider: string;
    accent: string;
  };
  onUseFirstFrame: () => void;
  onChooseCustom: () => void;
  onCancel: () => void;
};

/**
 * Explains that the default video thumbnail is the first frame and shows a preview
 * before the user publishes or picks a custom image.
 */
export function VideoPostThumbnailModal({
  visible,
  defaultPosterUri,
  loadingPreview,
  theme,
  onUseFirstFrame,
  onChooseCustom,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background,
              borderColor: theme.divider,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>Video thumbnail</Text>
          <Text style={[styles.body, { color: theme.subtleText }]}>
            By default, your post uses the first frame of the video as the thumbnail (shown below).
            You can pick a different image instead — it will appear letterboxed on black in the
            feed, not pasted over the video.
          </Text>

          <View style={styles.previewStage}>
            {loadingPreview ? (
              <ActivityIndicator color={theme.accent} />
            ) : defaultPosterUri ? (
              <Image source={{ uri: defaultPosterUri }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <Ionicons name="videocam-outline" size={40} color={theme.subtleText} />
            )}
          </View>
          <Text style={[styles.previewCaption, { color: theme.subtleText }]}>Default: first frame</Text>

          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={onUseFirstFrame}
            disabled={loadingPreview}
          >
            <Text style={styles.primaryBtnText}>Use first frame</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, { borderColor: theme.divider }]}
            onPress={onChooseCustom}
            disabled={loadingPreview}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Choose custom thumbnail</Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={[styles.cancelBtnText, { color: theme.subtleText }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  previewStage: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewCaption: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 14,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 8,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
  },
});
