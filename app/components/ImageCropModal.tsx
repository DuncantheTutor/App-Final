import { ImageEditor, type ImageData } from "expo-dynamic-image-crop";
import { StatusBar } from "expo-status-bar";
import { Modal } from "react-native";

type CropModalTheme = {
  background: string;
  accent?: string;
  text?: string;
  subtleText?: string;
  divider?: string;
};

type Props = {
  visible: boolean;
  imageUri: string | null;
  /** When set (e.g. 1 for square), crop box keeps that aspect ratio. */
  fixedAspectRatio?: number;
  theme: CropModalTheme;
  onComplete: (data: ImageData) => void;
  onCancel: () => void;
};

/**
 * Option B: MIT crop UI (expo-dynamic-image-crop) before the in-app PhotoEditorModal.
 */
export function ImageCropModal({
  visible,
  imageUri,
  fixedAspectRatio,
  theme,
  onComplete,
  onCancel,
}: Props) {
  if (!visible || !imageUri) return null;

  const isDark = theme.background.toLowerCase() !== "#ffffff";

  const controlColor = isDark ? "#FFFFFF" : "#111111";

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ImageEditor
        isVisible
        imageUri={imageUri}
        dynamicCrop={fixedAspectRatio == null}
        fixedAspectRatio={fixedAspectRatio}
        onEditingComplete={onComplete}
        onEditingCancel={onCancel}
        editorOptions={{
          controlBar: {
            cancelButton: { text: "Cancel", color: controlColor, iconName: "x" },
            cropButton: { text: "Crop", color: controlColor, iconName: "crop" },
            backButton: { text: "Back", color: controlColor, iconName: "arrow-left" },
            saveButton: { text: "Done", color: controlColor, iconName: "check" },
          },
        }}
      />
    </Modal>
  );
}
