import { ImageEditor, type ControlBarActions, type ImageData } from "expo-dynamic-image-crop";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Modal, Pressable, Text, View } from "react-native";

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

function CropDoneBar({
  actions,
  controlColor,
  accentColor,
  barBg,
}: {
  actions: ControlBarActions;
  controlColor: string;
  accentColor: string;
  barBg: string;
}) {
  const saveAfterCropRef = useRef(false);

  useEffect(() => {
    if (!saveAfterCropRef.current || !actions.isEdit) return;
    saveAfterCropRef.current = false;
    actions.onSave();
  }, [actions.isEdit, actions.onSave]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: barBg,
      }}
    >
      <Pressable
        onPress={actions.isEdit ? actions.onBack : actions.onCancel}
        accessibilityLabel={actions.isEdit ? "Back" : "Cancel"}
      >
        <Text style={{ color: controlColor, fontSize: 17, fontWeight: "600" }}>
          {actions.isEdit ? "Back" : "Cancel"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          if (actions.isEdit) {
            actions.onSave();
            return;
          }
          saveAfterCropRef.current = true;
          void actions.onCrop();
        }}
        accessibilityLabel="Done"
      >
        <Text style={{ color: accentColor, fontSize: 17, fontWeight: "700" }}>Done</Text>
      </Pressable>
    </View>
  );
}

/**
 * MIT crop UI (expo-dynamic-image-crop). One tap on Done crops and saves.
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
  const barBg = isDark ? "#111111" : "#F4F4F4";
  const accentColor = theme.accent ?? controlColor;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ImageEditor
        isVisible
        useModal={false}
        imageUri={imageUri}
        dynamicCrop={fixedAspectRatio == null}
        fixedAspectRatio={fixedAspectRatio}
        onEditingComplete={onComplete}
        onEditingCancel={onCancel}
        customControlBar={(actions) => (
          <CropDoneBar
            actions={actions}
            controlColor={controlColor}
            accentColor={accentColor}
            barBg={barBg}
          />
        )}
      />
    </Modal>
  );
}
