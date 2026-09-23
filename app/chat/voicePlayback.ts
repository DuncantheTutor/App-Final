import { Audio } from "expo-av";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Alert } from "react-native";

import type { Message } from "../domain/types";
import { prepareVoicePlaybackAudioMode } from "../lib/voicePlaybackAudio";
import { resolveVoicePlayUri, voiceSoundSource } from "../lib/resolveVoicePlayUri";
import { logAppError } from "../../telemetry";

export type VoicePlaybackProgress = {
  messageId: string;
  positionMs: number;
  durationMs: number;
};

type ToggleVoicePlaybackDeps = {
  playingVoiceMessageId: string | null;
  messageSoundRef: MutableRefObject<Audio.Sound | null>;
  setPlayingVoiceMessageId: Dispatch<SetStateAction<string | null>>;
  setVoicePlaybackProgress: Dispatch<SetStateAction<VoicePlaybackProgress | null>>;
  setVoiceLoadingMessageId: Dispatch<SetStateAction<string | null>>;
};

/** Play or stop one voice note. The same message stops; a different one replaces the current sound. */
export async function toggleVoiceMessagePlayback(
  message: Message,
  deps: ToggleVoicePlaybackDeps
): Promise<void> {
  const {
    playingVoiceMessageId,
    messageSoundRef,
    setPlayingVoiceMessageId,
    setVoicePlaybackProgress,
    setVoiceLoadingMessageId,
  } = deps;

  if (playingVoiceMessageId === message.id && messageSoundRef.current) {
    await messageSoundRef.current.stopAsync();
    await messageSoundRef.current.unloadAsync();
    messageSoundRef.current = null;
    setPlayingVoiceMessageId(null);
    setVoicePlaybackProgress(null);
    return;
  }

  setVoiceLoadingMessageId(message.id);
  try {
    const playUri = await resolveVoicePlayUri(message);
    if (!playUri) {
      Alert.alert("Voice note", "Could not load this voice note. Ask the sender to send it again.");
      return;
    }

    await prepareVoicePlaybackAudioMode();

    if (messageSoundRef.current) {
      await messageSoundRef.current.unloadAsync();
      messageSoundRef.current = null;
    }

    const source = voiceSoundSource(playUri, message.mediaEncrypted?.contentType);
    const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false, volume: 1 });
    await sound.playAsync();
    messageSoundRef.current = sound;
    setPlayingVoiceMessageId(message.id);
    const fallbackDurationMs = Math.max(1, message.durationSec ?? 1) * 1000;
    setVoicePlaybackProgress({
      messageId: message.id,
      positionMs: 0,
      durationMs: fallbackDurationMs,
    });

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        void sound.unloadAsync();
        if (messageSoundRef.current === sound) {
          messageSoundRef.current = null;
        }
        setPlayingVoiceMessageId(null);
        setVoicePlaybackProgress(null);
        return;
      }
      const nextPosition = status.positionMillis ?? 0;
      const nextDuration = status.durationMillis ?? fallbackDurationMs;
      setVoicePlaybackProgress((prev) => {
        if (prev?.messageId !== message.id) {
          return { messageId: message.id, positionMs: nextPosition, durationMs: nextDuration };
        }
        const positionMs =
          Math.abs(prev.positionMs - nextPosition) >= 200 ? nextPosition : prev.positionMs;
        const durationMs = prev.durationMs !== nextDuration ? nextDuration : prev.durationMs;
        if (
          positionMs === prev.positionMs &&
          durationMs === prev.durationMs
        ) {
          return prev;
        }
        return { messageId: message.id, positionMs, durationMs };
      });
    });
  } catch (err) {
    logAppError("voice.playback", err, { messageId: message.id });
    Alert.alert("Voice note", "Could not play this voice note.");
    setPlayingVoiceMessageId(null);
    setVoicePlaybackProgress(null);
  } finally {
    setVoiceLoadingMessageId((cur) => (cur === message.id ? null : cur));
  }
}
