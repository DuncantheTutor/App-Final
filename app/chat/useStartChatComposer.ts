import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import type { SavedBroadcastGroup } from "../domain/types";
import type { StartChatComposerMode } from "./availableStartChatFriends";

export type StartChatComposer = {
  chatComposerOpen: boolean;
  setChatComposerOpen: Dispatch<SetStateAction<boolean>>;
  broadcastPickerOpen: boolean;
  setBroadcastPickerOpen: Dispatch<SetStateAction<boolean>>;
  composerMode: StartChatComposerMode;
  setComposerMode: Dispatch<SetStateAction<StartChatComposerMode>>;
  selectedComposerIds: string[];
  setSelectedComposerIds: Dispatch<SetStateAction<string[]>>;
  composerCustomTitle: string;
  setComposerCustomTitle: Dispatch<SetStateAction<string>>;
  createTitleEditOpen: boolean;
  setCreateTitleEditOpen: Dispatch<SetStateAction<boolean>>;
  createTitleDraft: string;
  setCreateTitleDraft: Dispatch<SetStateAction<string>>;
  createGroupPictureUri: string | null;
  setCreateGroupPictureUri: Dispatch<SetStateAction<string | null>>;
  pendingStandardGroupCreateAfterTitle: boolean;
  setPendingStandardGroupCreateAfterTitle: Dispatch<SetStateAction<boolean>>;
  savedBroadcastGroups: SavedBroadcastGroup[];
  selectedBroadcastGroupId: string | null;
  setSelectedBroadcastGroupId: Dispatch<SetStateAction<string | null>>;
  broadcastGroupDropdownOpen: boolean;
  setBroadcastGroupDropdownOpen: Dispatch<SetStateAction<boolean>>;
  saveBroadcastGroupPromptOpen: boolean;
  setSaveBroadcastGroupPromptOpen: Dispatch<SetStateAction<boolean>>;
  broadcastGroupNameDraft: string;
  setBroadcastGroupNameDraft: Dispatch<SetStateAction<string>>;
  pendingBroadcastCreateIds: string[] | null;
  setPendingBroadcastCreateIds: Dispatch<SetStateAction<string[] | null>>;
  saveBroadcastGroupNameModalOpen: boolean;
  setSaveBroadcastGroupNameModalOpen: Dispatch<SetStateAction<boolean>>;
  composerSearch: string;
  setComposerSearch: Dispatch<SetStateAction<string>>;
  selectedBroadcastGroup: SavedBroadcastGroup | undefined;
  closeComposer: () => void;
  closeBroadcastPicker: () => void;
  openBroadcastPicker: () => void;
  openStandardComposer: () => void;
  toggleFriendSelection: (friendId: string) => void;
  toggleSelectAllBroadcast: (friendIds: string[]) => void;
  applySavedBroadcastGroup: (group: SavedBroadcastGroup) => void;
  commitSavedBroadcastGroup: (ids: string[], name: string, existingGroupId: string | null) => void;
  beginGroupTitleStep: () => void;
};

/**
 * Sole owner of Start Chat / broadcast-picker draft fields.
 * Opening a thread still goes through MainApp (`createOrOpenChat`).
 */
export function useStartChatComposer(): StartChatComposer {
  const [chatComposerOpen, setChatComposerOpen] = useState(false);
  const [broadcastPickerOpen, setBroadcastPickerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<StartChatComposerMode>("standard");
  const [selectedComposerIds, setSelectedComposerIds] = useState<string[]>([]);
  const [composerCustomTitle, setComposerCustomTitle] = useState("");
  const [createTitleEditOpen, setCreateTitleEditOpen] = useState(false);
  const [createTitleDraft, setCreateTitleDraft] = useState("");
  const [createGroupPictureUri, setCreateGroupPictureUri] = useState<string | null>(null);
  const [pendingStandardGroupCreateAfterTitle, setPendingStandardGroupCreateAfterTitle] =
    useState(false);
  const [savedBroadcastGroups, setSavedBroadcastGroups] = useState<SavedBroadcastGroup[]>([]);
  const [selectedBroadcastGroupId, setSelectedBroadcastGroupId] = useState<string | null>(null);
  const [broadcastGroupDropdownOpen, setBroadcastGroupDropdownOpen] = useState(false);
  const [saveBroadcastGroupPromptOpen, setSaveBroadcastGroupPromptOpen] = useState(false);
  const [broadcastGroupNameDraft, setBroadcastGroupNameDraft] = useState("");
  const [pendingBroadcastCreateIds, setPendingBroadcastCreateIds] = useState<string[] | null>(null);
  const [saveBroadcastGroupNameModalOpen, setSaveBroadcastGroupNameModalOpen] = useState(false);
  const [composerSearch, setComposerSearch] = useState("");

  const selectedBroadcastGroup = useMemo(
    () =>
      selectedBroadcastGroupId
        ? savedBroadcastGroups.find((group) => group.id === selectedBroadcastGroupId)
        : undefined,
    [savedBroadcastGroups, selectedBroadcastGroupId]
  );

  const closeComposer = useCallback(() => {
    setChatComposerOpen(false);
    setComposerSearch("");
    setSelectedComposerIds([]);
    setComposerCustomTitle("");
    setCreateGroupPictureUri(null);
    setSelectedBroadcastGroupId(null);
    setBroadcastGroupDropdownOpen(false);
    setComposerMode("standard");
  }, []);

  const closeBroadcastPicker = useCallback(() => {
    setBroadcastPickerOpen(false);
    setComposerSearch("");
    setSelectedComposerIds([]);
    setComposerCustomTitle("");
    setSelectedBroadcastGroupId(null);
    setBroadcastGroupDropdownOpen(false);
    setComposerMode("standard");
  }, []);

  const openBroadcastPicker = useCallback(() => {
    setComposerMode("broadcast");
    setBroadcastPickerOpen(true);
    setChatComposerOpen(false);
    setComposerSearch("");
    setComposerCustomTitle("");
    setSelectedBroadcastGroupId(null);
    setBroadcastGroupDropdownOpen(false);
  }, []);

  const openStandardComposer = useCallback(() => {
    setComposerMode("standard");
    setSelectedComposerIds([]);
    setComposerSearch("");
    setComposerCustomTitle("");
    setSelectedBroadcastGroupId(null);
    setBroadcastGroupDropdownOpen(false);
    setChatComposerOpen(true);
  }, []);

  const toggleFriendSelection = useCallback(
    (friendId: string) => {
      setSelectedComposerIds((current) =>
        current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]
      );
      if (composerMode === "broadcast") {
        setSelectedBroadcastGroupId(null);
      }
    },
    [composerMode]
  );

  const toggleSelectAllBroadcast = useCallback((friendIds: string[]) => {
    setSelectedComposerIds((current) => (current.length === friendIds.length ? [] : friendIds));
    setSelectedBroadcastGroupId(null);
  }, []);

  const applySavedBroadcastGroup = useCallback((group: SavedBroadcastGroup) => {
    setSelectedComposerIds(group.memberIds);
    setSelectedBroadcastGroupId(group.id);
    setComposerCustomTitle(group.name);
    setBroadcastGroupDropdownOpen(false);
  }, []);

  const commitSavedBroadcastGroup = useCallback(
    (ids: string[], name: string, existingGroupId: string | null) => {
      if (existingGroupId) {
        setSavedBroadcastGroups((current) =>
          current.map((g) => (g.id === existingGroupId ? { ...g, memberIds: ids, name } : g))
        );
        setSelectedBroadcastGroupId(existingGroupId);
      } else {
        const group: SavedBroadcastGroup = {
          id: `bg-${Date.now()}`,
          name,
          memberIds: ids,
        };
        setSavedBroadcastGroups((current) => [group, ...current]);
        setSelectedBroadcastGroupId(group.id);
      }
      setSaveBroadcastGroupNameModalOpen(false);
      setPendingBroadcastCreateIds(null);
    },
    []
  );

  const beginGroupTitleStep = useCallback(() => {
    setPendingStandardGroupCreateAfterTitle(true);
    setCreateGroupPictureUri(null);
    setCreateTitleDraft("");
    setCreateTitleEditOpen(true);
  }, []);

  return {
    chatComposerOpen,
    setChatComposerOpen,
    broadcastPickerOpen,
    setBroadcastPickerOpen,
    composerMode,
    setComposerMode,
    selectedComposerIds,
    setSelectedComposerIds,
    composerCustomTitle,
    setComposerCustomTitle,
    createTitleEditOpen,
    setCreateTitleEditOpen,
    createTitleDraft,
    setCreateTitleDraft,
    createGroupPictureUri,
    setCreateGroupPictureUri,
    pendingStandardGroupCreateAfterTitle,
    setPendingStandardGroupCreateAfterTitle,
    savedBroadcastGroups,
    selectedBroadcastGroupId,
    setSelectedBroadcastGroupId,
    broadcastGroupDropdownOpen,
    setBroadcastGroupDropdownOpen,
    saveBroadcastGroupPromptOpen,
    setSaveBroadcastGroupPromptOpen,
    broadcastGroupNameDraft,
    setBroadcastGroupNameDraft,
    pendingBroadcastCreateIds,
    setPendingBroadcastCreateIds,
    saveBroadcastGroupNameModalOpen,
    setSaveBroadcastGroupNameModalOpen,
    composerSearch,
    setComposerSearch,
    selectedBroadcastGroup,
    closeComposer,
    closeBroadcastPicker,
    openBroadcastPicker,
    openStandardComposer,
    toggleFriendSelection,
    toggleSelectAllBroadcast,
    applySavedBroadcastGroup,
    commitSavedBroadcastGroup,
    beginGroupTitleStep,
  };
}
