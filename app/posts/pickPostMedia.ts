import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

export type PostPhotoAsset = { uri: string; width: number; height: number };

export type OpenPostPhotoEditor = (
  asset: PostPhotoAsset,
  pending: {
    target: "post";
    mediaType: "photo";
    queue: PostPhotoAsset[];
  }
) => void;

export async function pickPostPhotos(
  openPhotoEditor: OpenPostPhotoEditor,
  onBeforeOpen?: () => void
): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.85,
    allowsEditing: false,
  });
  if (result.canceled || result.assets.length === 0) return;
  const normalized = result.assets.map((asset) => ({
    uri: asset.uri,
    width: asset.width ?? 1,
    height: asset.height ?? 1,
  }));
  const [first, ...rest] = normalized;
  if (!first) return;
  onBeforeOpen?.();
  openPhotoEditor(first, { target: "post", mediaType: "photo", queue: rest });
}

export async function capturePostPhoto(
  openPhotoEditor: OpenPostPhotoEditor,
  onBeforeOpen?: () => void
): Promise<void> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Camera needed", "Allow camera access to take a photo for your post.");
    return;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return;
  const asset = result.assets[0];
  onBeforeOpen?.();
  openPhotoEditor(
    { uri: asset.uri, width: asset.width ?? 1, height: asset.height ?? 1 },
    { target: "post", mediaType: "photo", queue: [] }
  );
}

export function promptPostPhotoSource(
  openPhotoEditor: OpenPostPhotoEditor,
  onBeforeOpen?: () => void
): void {
  Alert.alert("Add photo", "Take a new photo or choose from your gallery.", [
    { text: "Take photo", onPress: () => void capturePostPhoto(openPhotoEditor, onBeforeOpen) },
    { text: "Choose from gallery", onPress: () => void pickPostPhotos(openPhotoEditor, onBeforeOpen) },
    { text: "Cancel", style: "cancel" },
  ]);
}

export async function pickPostVideo(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}
