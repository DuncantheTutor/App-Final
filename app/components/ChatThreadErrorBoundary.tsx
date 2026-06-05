import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { logAppError } from "../../telemetry";

type Props = {
  children: ReactNode;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
};

type State = {
  error: Error | null;
};

/** Catches render errors in the active chat thread so the whole app does not white-screen. */
export class ChatThreadErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logAppError("chat.thread_render", error, { componentStack: info.componentStack ?? "" });
  }

  private handleTryAgain = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: this.props.backgroundColor,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ color: this.props.textColor, fontSize: 16, textAlign: "center" }}>
            This chat could not be displayed. You can go back and open the chat again.
          </Text>
          <Pressable
            onPress={this.handleTryAgain}
            style={{
              marginTop: 16,
              backgroundColor: this.props.accentColor,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
