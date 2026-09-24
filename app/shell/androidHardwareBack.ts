import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Keyboard } from "react-native";

import type { Post, ViewState } from "../domain/types";
import { viewAfterHardwareBack } from "./routes";
import type { HomeTab } from "./types";

type FullscreenMedia = {
  uri: string;
  kind: "photo" | "gif" | "video";
  mediaWidth?: number;
  mediaHeight?: number;
  galleryUris?: string[];
  galleryIndex?: number;
  postId?: string;
};

type AndroidHardwareBackDeps = {
  imageCropVisible: boolean;
  cancelImageCropFlow: () => void;
  photoEditorOpen: boolean;
  photoEditorInCrop: boolean;
  setPhotoEditorCropExitTick: Dispatch<SetStateAction<number>>;
  cancelPhotoEditor: () => void;
  keyboardVisible: boolean;
  fullscreenMedia: FullscreenMedia | null;
  setFullscreenMedia: Dispatch<SetStateAction<FullscreenMedia | null>>;
  fullScreenPost: Post | null;
  closeFullscreenPost: () => void;
  reactionDetailPost: Post | null;
  setReactionDetailPost: Dispatch<SetStateAction<Post | null>>;
  themePickerOpen: boolean;
  setThemePickerOpen: Dispatch<SetStateAction<boolean>>;
  reactionPickerOpen: boolean;
  closeReactionPicker: () => void;
  postFullscreenThreadReplyKey: string | null;
  setPostFullscreenThreadReplyKey: Dispatch<SetStateAction<string | null>>;
  chatOverflowOpen: boolean;
  setChatOverflowOpen: Dispatch<SetStateAction<boolean>>;
  membersModalOpen: boolean;
  setMembersModalOpen: Dispatch<SetStateAction<boolean>>;
  addMemberModalOpen: boolean;
  setAddMemberModalOpen: Dispatch<SetStateAction<boolean>>;
  setAddMemberSearch: Dispatch<SetStateAction<string>>;
  editChatMetaOpen: boolean;
  setEditChatMetaOpen: Dispatch<SetStateAction<boolean>>;
  editChatPictureOpen: boolean;
  setEditChatPictureOpen: Dispatch<SetStateAction<boolean>>;
  saveBroadcastGroupNameModalOpen: boolean;
  setSaveBroadcastGroupNameModalOpen: Dispatch<SetStateAction<boolean>>;
  saveBroadcastGroupPromptOpen: boolean;
  setSaveBroadcastGroupPromptOpen: Dispatch<SetStateAction<boolean>>;
  createTitleEditOpen: boolean;
  setPendingStandardGroupCreateAfterTitle: Dispatch<SetStateAction<boolean>>;
  setCreateTitleEditOpen: Dispatch<SetStateAction<boolean>>;
  setCreateGroupPictureUri: Dispatch<SetStateAction<string | null>>;
  broadcastPickerOpen: boolean;
  setBroadcastPickerOpen: Dispatch<SetStateAction<boolean>>;
  chatComposerOpen: boolean;
  setChatComposerOpen: Dispatch<SetStateAction<boolean>>;
  chatSearchVisible: boolean;
  setChatSearchVisible: Dispatch<SetStateAction<boolean>>;
  setChatSearch: Dispatch<SetStateAction<string>>;
  voiceRecordStartedAt: number | null;
  cancelVoiceRecording: () => void | Promise<void>;
  pendingVoiceNote: unknown;
  discardPendingVoiceNote: () => void | Promise<void>;
  pendingChatMediaAttachment: unknown;
  discardPendingChatMedia: () => void;
  voiceNoteMode: boolean;
  exitVoiceNoteMode: () => void | Promise<void>;
  viewRef: MutableRefObject<ViewState>;
  onBackFromChat: () => void;
  closePublishPostScreen: () => void;
  abortAddFriendPairingRef: MutableRefObject<(() => void) | null>;
  goHome: (tab?: HomeTab) => void;
  setView: Dispatch<SetStateAction<ViewState>>;
};

/** Android system back. Returns true when the press was consumed. */
export function handleAndroidHardwareBack(deps: AndroidHardwareBackDeps): boolean {
  const {
    imageCropVisible,
    cancelImageCropFlow,
    photoEditorOpen,
    photoEditorInCrop,
    setPhotoEditorCropExitTick,
    cancelPhotoEditor,
    keyboardVisible,
    fullscreenMedia,
    setFullscreenMedia,
    fullScreenPost,
    closeFullscreenPost,
    reactionDetailPost,
    setReactionDetailPost,
    themePickerOpen,
    setThemePickerOpen,
    reactionPickerOpen,
    closeReactionPicker,
    postFullscreenThreadReplyKey,
    setPostFullscreenThreadReplyKey,
    chatOverflowOpen,
    setChatOverflowOpen,
    membersModalOpen,
    setMembersModalOpen,
    addMemberModalOpen,
    setAddMemberModalOpen,
    setAddMemberSearch,
    editChatMetaOpen,
    setEditChatMetaOpen,
    editChatPictureOpen,
    setEditChatPictureOpen,
    saveBroadcastGroupNameModalOpen,
    setSaveBroadcastGroupNameModalOpen,
    saveBroadcastGroupPromptOpen,
    setSaveBroadcastGroupPromptOpen,
    createTitleEditOpen,
    setPendingStandardGroupCreateAfterTitle,
    setCreateTitleEditOpen,
    setCreateGroupPictureUri,
    broadcastPickerOpen,
    setBroadcastPickerOpen,
    chatComposerOpen,
    setChatComposerOpen,
    chatSearchVisible,
    setChatSearchVisible,
    setChatSearch,
    voiceRecordStartedAt,
    cancelVoiceRecording,
    pendingVoiceNote,
    discardPendingVoiceNote,
    pendingChatMediaAttachment,
    discardPendingChatMedia,
    voiceNoteMode,
    exitVoiceNoteMode,
    viewRef,
    onBackFromChat,
    closePublishPostScreen,
    abortAddFriendPairingRef,
    goHome,
    setView,
  } = deps;

  if (imageCropVisible) {
    cancelImageCropFlow();
    return true;
  }
  if (photoEditorOpen) {
    if (photoEditorInCrop) {
      setPhotoEditorCropExitTick((t) => t + 1);
      return true;
    }
    cancelPhotoEditor();
    return true;
  }
  if (keyboardVisible) {
    Keyboard.dismiss();
    return true;
  }
  if (fullscreenMedia) {
    setFullscreenMedia(null);
    return true;
  }
  if (fullScreenPost) {
    closeFullscreenPost();
    return true;
  }
  if (reactionDetailPost) {
    setReactionDetailPost(null);
    return true;
  }
  if (themePickerOpen) {
    setThemePickerOpen(false);
    return true;
  }
  if (reactionPickerOpen) {
    closeReactionPicker();
    return true;
  }
  if (postFullscreenThreadReplyKey) {
    setPostFullscreenThreadReplyKey(null);
    Keyboard.dismiss();
    return true;
  }
  if (chatOverflowOpen) {
    setChatOverflowOpen(false);
    return true;
  }
  if (membersModalOpen) {
    setMembersModalOpen(false);
    return true;
  }
  if (addMemberModalOpen) {
    setAddMemberModalOpen(false);
    setAddMemberSearch("");
    return true;
  }
  if (editChatMetaOpen) {
    setEditChatMetaOpen(false);
    return true;
  }
  if (editChatPictureOpen) {
    setEditChatPictureOpen(false);
    return true;
  }
  if (saveBroadcastGroupNameModalOpen) {
    setSaveBroadcastGroupNameModalOpen(false);
    setSaveBroadcastGroupPromptOpen(true);
    return true;
  }
  if (saveBroadcastGroupPromptOpen) {
    setSaveBroadcastGroupPromptOpen(false);
    return true;
  }
  if (createTitleEditOpen) {
    setPendingStandardGroupCreateAfterTitle(false);
    setCreateTitleEditOpen(false);
    setCreateGroupPictureUri(null);
    return true;
  }
  if (broadcastPickerOpen) {
    setBroadcastPickerOpen(false);
    return true;
  }
  if (chatComposerOpen) {
    setChatComposerOpen(false);
    return true;
  }
  if (chatSearchVisible) {
    setChatSearchVisible(false);
    setChatSearch("");
    return true;
  }
  if (voiceRecordStartedAt) {
    void cancelVoiceRecording();
    return true;
  }
  if (pendingVoiceNote) {
    void discardPendingVoiceNote();
    return true;
  }
  if (pendingChatMediaAttachment) {
    discardPendingChatMedia();
    return true;
  }
  if (voiceNoteMode) {
    void exitVoiceNoteMode();
    return true;
  }

  const v = viewRef.current;
  if (v.screen === "chat") {
    onBackFromChat();
    return true;
  }
  if (v.screen === "publishPost") {
    closePublishPostScreen();
    return true;
  }
  if (v.screen === "addFriend") {
    abortAddFriendPairingRef.current?.();
    goHome();
    return true;
  }
  const nextView = viewAfterHardwareBack(v);
  if (nextView) {
    setView(nextView);
    return true;
  }
  return false;
}
