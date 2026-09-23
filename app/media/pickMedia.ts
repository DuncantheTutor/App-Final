import type { Dispatch, SetStateAction } from "react";
import * as ImagePicker from "expo-image-picker";

import type { SendChatPayloadInput } from "../messaging/sendChatPayload";
import { inferOutgoingMediaKind } from "../lib/mediaKind";
import { probeVideoDisplayDimensions } from "../lib/videoDisplayDimensions";
import {
  capturePostPhoto,
  pickPostPhotos,
  pickPostVideo,
  promptPostPhotoSource,
  type OpenPostPhotoEditor,
} from "../posts/pickPostMedia";
import type {
  PhotoEditorAsset,
  PhotoEditorMediaType,
  PhotoEditorPending,
  PhotoEditorTarget,
} from "./usePhotoEditorSession";

export async function pickProfilePhoto(deps: {
  openPhotoEditorDirect: (asset: PhotoEditorAsset, pending: PhotoEditorPending) => void;
}): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.92,
  });
  if (result.canceled || !result.assets[0]) return;
  const asset = result.assets[0];
  deps.openPhotoEditorDirect(
    { uri: asset.uri, width: asset.width ?? 1, height: asset.height ?? 1 },
    { target: "profile", mediaType: "photo", queue: [] }
  );
}

export async function pickGroupPicture(deps: {
  beginGroupPictureCrop: (uri: string) => void;
}): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return;
  deps.beginGroupPictureCrop(result.assets[0].uri);
}

export async function pickPostPhotoDraft(deps: {
  openPhotoEditorDirect: OpenPostPhotoEditor;
  setPostDraftVideoUri: Dispatch<SetStateAction<string | null>>;
}): Promise<void> {
  await pickPostPhotos(deps.openPhotoEditorDirect, () => deps.setPostDraftVideoUri(null));
}

export async function capturePostPhotoDraft(deps: {
  openPhotoEditorDirect: OpenPostPhotoEditor;
  setPostDraftVideoUri: Dispatch<SetStateAction<string | null>>;
}): Promise<void> {
  await capturePostPhoto(deps.openPhotoEditorDirect, () => deps.setPostDraftVideoUri(null));
}

export function promptPostPhotoDraft(deps: {
  openPhotoEditorDirect: OpenPostPhotoEditor;
  setPostDraftVideoUri: Dispatch<SetStateAction<string | null>>;
}): void {
  promptPostPhotoSource(deps.openPhotoEditorDirect, () => deps.setPostDraftVideoUri(null));
}

export async function choosePostVideo(deps: {
  setPostDraftImageUris: Dispatch<SetStateAction<string[]>>;
  setPostDraftImageCaptions: Dispatch<SetStateAction<string[]>>;
  setPostDraftVideoUri: Dispatch<SetStateAction<string | null>>;
}): Promise<void> {
  const uri = await pickPostVideo();
  if (!uri) return;
  deps.setPostDraftImageUris([]);
  deps.setPostDraftImageCaptions([]);
  deps.setPostDraftVideoUri(uri);
}

type ChatPickerDeps = {
  setPhotoEditorTarget: Dispatch<SetStateAction<PhotoEditorTarget>>;
  setPhotoEditorMediaType: Dispatch<SetStateAction<PhotoEditorMediaType>>;
  setPhotoEditorAsset: Dispatch<SetStateAction<PhotoEditorAsset | null>>;
  setPhotoEditorOpen: Dispatch<SetStateAction<boolean>>;
  openPhotoEditorDirect: (asset: PhotoEditorAsset, pending: PhotoEditorPending) => void;
};

export async function pickChatCameraMedia(
  mode: "photo" | "video",
  deps: ChatPickerDeps
): Promise<void> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return;
  deps.setPhotoEditorTarget("chat");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes:
      mode === "photo" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
    quality: mode === "photo" ? 0.85 : 0.72,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return;
  const asset = result.assets[0];
  if (mode === "photo") {
    deps.openPhotoEditorDirect(
      { uri: asset.uri, width: asset.width ?? 1, height: asset.height ?? 1 },
      { target: "chat", mediaType: "photo", queue: [] }
    );
    return;
  }
  deps.setPhotoEditorMediaType("video");
  deps.setPhotoEditorAsset({
    uri: asset.uri,
    width: asset.width ?? 1,
    height: asset.height ?? 1,
  });
  deps.setPhotoEditorOpen(true);
}

export async function pickChatGalleryPhoto(
  deps: ChatPickerDeps & { sendPayload: (payload: SendChatPayloadInput) => void }
): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return;
  deps.setPhotoEditorTarget("chat");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.92,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return;
  const asset = result.assets[0];
  const kind = inferOutgoingMediaKind(asset.uri, asset.type);
  if (kind === "gif") {
    deps.sendPayload({
      text: "",
      kind: "gif",
      mediaUri: asset.uri,
      mediaWidth: asset.width ?? undefined,
      mediaHeight: asset.height ?? undefined,
    });
    return;
  }
  deps.openPhotoEditorDirect(
    { uri: asset.uri, width: asset.width ?? 1, height: asset.height ?? 1 },
    { target: "chat", mediaType: "photo", queue: [] }
  );
}

export async function pickChatGalleryVideo(deps: ChatPickerDeps): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return;
  deps.setPhotoEditorTarget("chat");
  deps.setPhotoEditorOpen(true);
  deps.setPhotoEditorAsset(null);
  deps.setPhotoEditorMediaType("video");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    quality: 0.72,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) {
    deps.setPhotoEditorOpen(false);
    deps.setPhotoEditorAsset(null);
    deps.setPhotoEditorMediaType("photo");
    return;
  }
  const asset = result.assets[0];
  deps.setPhotoEditorAsset({
    uri: asset.uri,
    width: asset.width ?? 1,
    height: asset.height ?? 1,
  });
  void probeVideoDisplayDimensions(asset.uri).then((dims) => {
    if (!dims) return;
    deps.setPhotoEditorAsset((prev) =>
      prev ? { ...prev, width: dims.width, height: dims.height } : prev
    );
  });
}
