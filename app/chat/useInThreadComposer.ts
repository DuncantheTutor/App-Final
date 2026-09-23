import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, type TextInput } from "react-native";
import { Audio } from "expo-av";

import { logAppError } from "../../telemetry";
import { writeComposerText } from "../lib/syncedComposerText";
import { voiceSoundSource } from "../lib/resolveVoicePlayUri";
import { prepareVoicePlaybackAudioMode, VOICE_RECORDING_OPTIONS } from "../lib/voicePlaybackAudio";

export type PendingChatPhoto = {
  kind: "photo";
  uri: string;
  width: number;
  height: number;
};

export type PendingVoiceNote = {
  uri: string;
  durationSec: number;
};

/**
 * In-thread composer draft: text, voice-note recording, and a pending photo.
 * Sending the payload lives in `app/messaging/sendChatPayload`.
 */
export function useInThreadComposer(params: { chatScreenOpen: boolean }) {
  const { chatScreenOpen } = params;

  const [chatInput, setChatInput] = useState("");
  const [shouldFocusChatInput, setShouldFocusChatInput] = useState(false);
  const chatInputTextRef = useRef("");
  const chatInputRef = useRef<TextInput | null>(null);

  const [voiceNoteMode, setVoiceNoteMode] = useState(false);
  const [voiceRecordStartedAt, setVoiceRecordStartedAt] = useState<number | null>(null);
  const [voiceRecordElapsedSec, setVoiceRecordElapsedSec] = useState(0);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<PendingVoiceNote | null>(null);
  const [pendingChatMediaAttachment, setPendingChatMediaAttachment] = useState<PendingChatPhoto | null>(
    null
  );
  const [previewVoicePlaying, setPreviewVoicePlaying] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const voiceRecordStartedAtRef = useRef<number | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  const setChatInputSynced = useCallback((text: string) => {
    writeComposerText(chatInputTextRef, setChatInput, text);
  }, []);

  const cancelVoiceRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        /* ignore */
      }
      recordingRef.current = null;
    }
    voiceRecordStartedAtRef.current = null;
    setVoiceRecordStartedAt(null);
    setVoiceRecordElapsedSec(0);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const exitVoiceNoteMode = useCallback(async () => {
    await cancelVoiceRecording();
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    setPreviewVoicePlaying(false);
    setPendingVoiceNote(null);
    setVoiceNoteMode(false);
  }, [cancelVoiceRecording]);

  const toggleVoiceNoteMode = useCallback(() => {
    if (voiceNoteMode) {
      void exitVoiceNoteMode();
      return;
    }
    setVoiceNoteMode(true);
  }, [exitVoiceNoteMode, voiceNoteMode]);

  const startVoiceRecording = useCallback(async () => {
    if (recordingRef.current) return;
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone", "Allow microphone access to record voice notes.");
      return;
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      if (previewSoundRef.current) {
        await previewSoundRef.current.unloadAsync();
        previewSoundRef.current = null;
      }
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;
      const startedAt = Date.now();
      voiceRecordStartedAtRef.current = startedAt;
      setVoiceRecordStartedAt(startedAt);
      setVoiceRecordElapsedSec(0);
    } catch (err) {
      logAppError("voice.record_start", err, {});
      Alert.alert("Recording failed", "Could not start the voice note. Try again.");
      recordingRef.current = null;
      voiceRecordStartedAtRef.current = null;
      setVoiceRecordStartedAt(null);
    }
  }, []);

  const stopVoiceRecordingForPreview = useCallback(async () => {
    const recording = recordingRef.current;
    const startedAt = voiceRecordStartedAtRef.current;
    if (!recording || startedAt == null) return;

    let durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    let uri: string | null = null;
    try {
      const status = await recording.getStatusAsync();
      if (status.isRecording && typeof status.durationMillis === "number") {
        durationSec = Math.max(1, Math.round(status.durationMillis / 1000));
      }
      uri = recording.getURI();
      await recording.stopAndUnloadAsync();
    } catch (err) {
      logAppError("voice.record_stop", err, {});
      Alert.alert("Recording failed", "Could not finish the voice note. Try again.");
    } finally {
      recordingRef.current = null;
      voiceRecordStartedAtRef.current = null;
      setVoiceRecordStartedAt(null);
      setVoiceRecordElapsedSec(0);
      try {
        await prepareVoicePlaybackAudioMode();
      } catch {
        /* ignore */
      }
    }

    if (!uri) return;
    setPendingVoiceNote({ uri, durationSec });
  }, []);

  const togglePendingVoicePreview = useCallback(async () => {
    if (!pendingVoiceNote) return;
    if (previewVoicePlaying && previewSoundRef.current) {
      await previewSoundRef.current.stopAsync();
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
      setPreviewVoicePlaying(false);
      return;
    }
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    try {
      await prepareVoicePlaybackAudioMode();
      const source = voiceSoundSource(pendingVoiceNote.uri, "audio/mp4");
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false, volume: 1 });
      await sound.playAsync();
      previewSoundRef.current = sound;
      setPreviewVoicePlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          void sound.unloadAsync();
          if (previewSoundRef.current === sound) {
            previewSoundRef.current = null;
          }
          setPreviewVoicePlaying(false);
        }
      });
    } catch (err) {
      logAppError("voice.preview_playback", err, {});
      Alert.alert("Voice note", "Could not play this recording. Try recording again.");
      setPreviewVoicePlaying(false);
    }
  }, [pendingVoiceNote, previewVoicePlaying]);

  const discardPendingVoiceNote = useCallback(async () => {
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    setPreviewVoicePlaying(false);
    setPendingVoiceNote(null);
  }, []);

  const discardPendingChatMedia = useCallback(() => {
    setPendingChatMediaAttachment(null);
  }, []);

  /** Stop the preview sound before MainApp sends the note. The note itself stays until send clears it. */
  const preparePendingVoiceNoteForSend = useCallback(async () => {
    if (!pendingVoiceNote) return null;
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
    setPreviewVoicePlaying(false);
    return pendingVoiceNote;
  }, [pendingVoiceNote]);

  const clearComposerOnLeave = useCallback(() => {
    setChatInputSynced("");
    setShouldFocusChatInput(false);
    setVoiceNoteMode(false);
    setVoiceRecordStartedAt(null);
    setVoiceRecordElapsedSec(0);
    voiceRecordStartedAtRef.current = null;
    setPendingVoiceNote(null);
    setPendingChatMediaAttachment(null);
    setPreviewVoicePlaying(false);
    if (previewSoundRef.current) {
      void previewSoundRef.current.unloadAsync();
      previewSoundRef.current = null;
    }
  }, [setChatInputSynced]);

  useEffect(() => {
    if (!voiceRecordStartedAt) return;
    const tick = () => {
      setVoiceRecordElapsedSec(Math.max(0, Math.round((Date.now() - voiceRecordStartedAt) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [voiceRecordStartedAt]);

  useEffect(() => {
    if (!chatScreenOpen || !shouldFocusChatInput) return;
    const timer = setTimeout(() => {
      chatInputRef.current?.focus();
      setShouldFocusChatInput(false);
    }, 60);
    return () => clearTimeout(timer);
  }, [chatScreenOpen, shouldFocusChatInput]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      if (previewSoundRef.current) {
        void previewSoundRef.current.unloadAsync();
        previewSoundRef.current = null;
      }
    };
  }, []);

  return {
    chatInput,
    chatInputTextRef,
    chatInputRef,
    setChatInputSynced,
    shouldFocusChatInput,
    setShouldFocusChatInput,
    voiceNoteMode,
    setVoiceNoteMode,
    voiceRecordStartedAt,
    voiceRecordElapsedSec,
    pendingVoiceNote,
    setPendingVoiceNote,
    pendingChatMediaAttachment,
    setPendingChatMediaAttachment,
    previewVoicePlaying,
    cancelVoiceRecording,
    exitVoiceNoteMode,
    toggleVoiceNoteMode,
    startVoiceRecording,
    stopVoiceRecordingForPreview,
    togglePendingVoicePreview,
    discardPendingVoiceNote,
    discardPendingChatMedia,
    preparePendingVoiceNoteForSend,
    clearComposerOnLeave,
  };
}
