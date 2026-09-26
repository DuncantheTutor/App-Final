import { useCallback } from "react";
import { sendComposerVoiceNote } from "../messaging/sendChatPayload";

type VoiceSendDeps = Parameters<typeof sendComposerVoiceNote>[0];

/** Voice-note send and the composer button that sends text or controls recording. */
export function useComposerPrimaryAction(
  params: VoiceSendDeps & {
    voiceNoteMode: boolean;
    pendingVoiceNote: unknown;
    voiceRecordStartedAt: number | null;
    stopVoiceRecordingForPreview: () => Promise<void> | void;
    startVoiceRecording: () => Promise<void> | void;
    sendMessage: () => void;
  }
) {
  const {
    preparePendingVoiceNoteForSend,
    sendPayload,
    setPendingVoiceNote,
    setVoiceNoteMode,
    voiceNoteMode,
    pendingVoiceNote,
    voiceRecordStartedAt,
    stopVoiceRecordingForPreview,
    startVoiceRecording,
    sendMessage,
  } = params;

  const sendPendingVoiceNote = useCallback(async () => {
    await sendComposerVoiceNote({
      preparePendingVoiceNoteForSend,
      sendPayload,
      setPendingVoiceNote,
      setVoiceNoteMode,
    });
  }, [preparePendingVoiceNoteForSend, sendPayload, setPendingVoiceNote, setVoiceNoteMode]);

  const onComposerPrimaryPress = useCallback(() => {
    if (voiceNoteMode) {
      if (pendingVoiceNote) {
        void sendPendingVoiceNote();
        return;
      }
      if (voiceRecordStartedAt) {
        void stopVoiceRecordingForPreview();
      } else {
        void startVoiceRecording();
      }
      return;
    }
    sendMessage();
  }, [
    voiceNoteMode,
    pendingVoiceNote,
    voiceRecordStartedAt,
    stopVoiceRecordingForPreview,
    sendPendingVoiceNote,
    startVoiceRecording,
    sendMessage,
  ]);

  return { sendPendingVoiceNote, onComposerPrimaryPress };
}
