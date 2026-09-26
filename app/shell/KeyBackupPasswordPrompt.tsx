import { useState } from "react";
import { ActivityIndicator, Modal, Text, TextInput, View } from "react-native";

import { PressAckButton } from "../components/PressAckButton";

type KeyBackupPasswordPromptProps = {
  visible: boolean;
  busy: boolean;
  error: string | null;
  theme: {
    background: string;
    text: string;
    subtleText: string;
    accent: string;
    danger: string;
  };
  onDismiss: () => void;
  onSubmit: (password: string) => void;
};

/** Asks for the account password so this phone can save a backup a new phone can open. */
export function KeyBackupPasswordPrompt({
  visible,
  busy,
  error,
  theme,
  onDismiss,
  onSubmit,
}: KeyBackupPasswordPromptProps) {
  const [password, setPassword] = useState("");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <View style={{ backgroundColor: theme.background, borderRadius: 16, padding: 20, gap: 12 }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            Keep messages on a new phone
          </Text>
          <Text style={{ color: theme.subtleText, fontSize: 15, lineHeight: 21 }}>
            Enter your account password once. It locks a copy of your message keys that a new phone can open when you sign in. The server cannot read that copy.
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={theme.subtleText}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={{
              borderWidth: 1,
              borderColor: theme.subtleText,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: theme.text,
            }}
          />
          {error ? <Text style={{ color: theme.danger, fontSize: 14 }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
            <PressAckButton onPress={onDismiss} disabled={busy}>
              <Text style={{ color: theme.subtleText, fontSize: 16 }}>Not now</Text>
            </PressAckButton>
            <PressAckButton
              onPress={() => onSubmit(password)}
              disabled={busy || password.trim().length === 0}
            >
              {busy ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "700" }}>Save</Text>
              )}
            </PressAckButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}
