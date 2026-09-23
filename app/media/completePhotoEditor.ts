import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert, Keyboard, type TextInput } from "react-native";

import { callEmulatorFunction } from "../../backendBridge";
import { firebaseAuth } from "../../firebaseAuthClient";
import { mediaUriNeedsFirebaseUpload, uploadSharedMediaFromDevice } from "../../mediaStorageUpload";
import type { PhotoEditorResult } from "../../PhotoEditorModal";
import { storageGetItem, storageSetItem } from "../lib/encryptedLocalStorage";
import { normalizeHttpsProfilePictureUrl } from "../lib/profilePictureUrl";
import type { BackendSession } from "../messaging/types";
import type { SendChatPayloadInput } from "../messaging/sendChatPayload";
import type { PendingChatPhoto } from "../chat/useInThreadComposer";
import type { PostPhotoAsset } from "../posts/pickPostMedia";
import { profilePictureStorageKey, profileUsernameStorageKey, usernameForProfileUpsert } from "../theme/preludeConstants";
import type { PhotoEditorAsset, PhotoEditorMediaType, PhotoEditorPending, PhotoEditorTarget } from "./usePhotoEditorSession";

export type CompletePhotoEditorDeps = {
  chatInputRef: MutableRefObject<TextInput | null>;
  photoEditorTarget: PhotoEditorTarget;
  setPhotoEditorOpen: Dispatch<SetStateAction<boolean>>;
  setPhotoEditorAsset: Dispatch<SetStateAction<PhotoEditorAsset | null>>;
  setPhotoEditorMediaType: Dispatch<SetStateAction<PhotoEditorMediaType>>;
  setPhotoEditorTarget: Dispatch<SetStateAction<PhotoEditorTarget>>;
  setMyProfilePictureUrl: Dispatch<SetStateAction<string | null>>;
  getBackendSession: () => BackendSession | null;
  sessionEmailRef: MutableRefObject<string | null>;
  myBio: string;
  appendEditedPostPhoto: (uri: string, caption?: string) => void;
  queuedPostPhotoAssets: PostPhotoAsset[];
  openPhotoEditorDirect: (asset: PhotoEditorAsset, pending: PhotoEditorPending) => void;
  setQueuedPostPhotoAssets: Dispatch<SetStateAction<PostPhotoAsset[]>>;
  resetPhotoEditor: (nextTarget?: PhotoEditorTarget) => void;
  sendPayload: (payload: SendChatPayloadInput) => void;
  setPendingChatMediaAttachment: Dispatch<SetStateAction<PendingChatPhoto | null>>;
  setShouldFocusChatInput: Dispatch<SetStateAction<boolean>>;
};

export function completePhotoEditorSession(result: PhotoEditorResult, deps: CompletePhotoEditorDeps): void {
  const {
    chatInputRef,
    photoEditorTarget,
    setPhotoEditorOpen,
    setPhotoEditorAsset,
    setPhotoEditorMediaType,
    setPhotoEditorTarget,
    setMyProfilePictureUrl,
    getBackendSession,
    sessionEmailRef,
    myBio,
    appendEditedPostPhoto,
    queuedPostPhotoAssets,
    openPhotoEditorDirect,
    setQueuedPostPhotoAssets,
    resetPhotoEditor,
    sendPayload,
    setPendingChatMediaAttachment,
    setShouldFocusChatInput,
  } = deps;

  Keyboard.dismiss();
  chatInputRef.current?.blur();
  if (photoEditorTarget === "profile") {
    setPhotoEditorOpen(false);
    setPhotoEditorAsset(null);
    setPhotoEditorMediaType("photo");
    setPhotoEditorTarget("chat");
    if (result.mediaKind === "photo") {
      // Local `file://` URIs are unreachable for other devices AND get
      // evicted from the cache directory between launches, so we MUST upload
      // to Firebase Storage and persist the resulting HTTPS download URL.
      // Set a temporary preview from the local URI so the user sees the
      // change instantly; replace it with the HTTPS URL once the upload
      // settles. Only the HTTPS URL is ever written to encrypted profile
      // sync (the debounced `putEncryptedProfile` effect picks it up).
      setMyProfilePictureUrl(result.uri);
      void (async () => {
        try {
          const authUid = firebaseAuth.currentUser?.uid;
          if (!authUid || !mediaUriNeedsFirebaseUpload(result.uri)) return;
          const uploaded = await uploadSharedMediaFromDevice(result.uri, authUid);
          setMyProfilePictureUrl(uploaded.downloadUrl);
          const session = getBackendSession();
          const email = sessionEmailRef.current?.trim();
          if (email) {
            void storageSetItem(profilePictureStorageKey(email), uploaded.downloadUrl).catch(() => {});
          }
          if (session && email) {
            const persistedUsername =
              (await storageGetItem(profileUsernameStorageKey(email)))?.trim() ?? "";
            let serverUsername = "";
            try {
              const profilesRes = await callEmulatorFunction<{
                profiles?: Record<string, { username?: string } | null>;
              }>("getUserProfiles", {
                uid: session.uid,
                deviceId: session.deviceId,
                targetUids: [session.uid],
              });
              serverUsername = String(profilesRes.profiles?.[session.uid]?.username ?? "").trim();
            } catch {
              /* keep existing server username */
            }
            const usernameForUpsert = usernameForProfileUpsert({
              email,
              persistedUsername,
              serverUsername,
            });
            await callEmulatorFunction("upsertUserProfile", {
              uid: session.uid,
              deviceId: session.deviceId,
              ...(usernameForUpsert ? { username: usernameForUpsert } : {}),
              bio: myBio,
              profilePictureUrl: uploaded.downloadUrl,
            });
          }
        } catch (err) {
          Alert.alert(
            "Couldn't save profile picture",
            err instanceof Error && err.message ? err.message : "Please try again."
          );
          const email = sessionEmailRef.current?.trim().toLowerCase();
          void (async () => {
            const prior =
              email
                ? (await storageGetItem(profilePictureStorageKey(email)).catch(() => null)) ??
                  null
                : null;
            const restored = normalizeHttpsProfilePictureUrl(prior) || null;
            setMyProfilePictureUrl(restored);
          })();
        }
      })();
    }
    return;
  }
  if (photoEditorTarget === "post") {
    if (result.mediaKind === "photo") {
      appendEditedPostPhoto(result.uri, result.caption);
    }
    if (queuedPostPhotoAssets.length > 0) {
      const [next, ...rest] = queuedPostPhotoAssets;
      if (next) {
        openPhotoEditorDirect(next, { target: "post", mediaType: "photo", queue: rest });
      }
      return;
    }
    setQueuedPostPhotoAssets([]);
    resetPhotoEditor();
    return;
  }
  resetPhotoEditor();
  if (result.mediaKind === "video") {
    sendPayload({
      text: result.caption,
      kind: "video",
      mediaUri: result.uri,
      mediaWidth: result.width,
      mediaHeight: result.height,
      videoTextOverlays: result.videoTextOverlays,
    });
    return;
  }
  setPendingChatMediaAttachment({
    kind: "photo",
    uri: result.uri,
    width: result.width,
    height: result.height,
  });
  setShouldFocusChatInput(true);
}
