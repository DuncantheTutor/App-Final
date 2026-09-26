import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";

import { NotificationPrePromptScreen } from "./components/NotificationPrePromptScreen";
import { AuthScreens } from "./shell/AuthScreens";
import { SignedInTree } from "./shell/SignedInTree";
import { KeyBackupPasswordPrompt } from "./shell/KeyBackupPasswordPrompt";
import { useMainAppModel } from "./shell/useMainAppModel";
import { PLACEHOLDER_APP_PRODUCT_NAME } from "./lib/viewPersistence";

function MainAppInner() {
  const model = useMainAppModel();

  if (model.phase === "splash") {
    return (
      <View style={{ flex: 1, backgroundColor: model.theme.background, paddingTop: model.safeTop }}>
        <StatusBar style={model.isDarkMode ? "light" : "dark"} />
        <View
          style={{
            flex: 1,
            backgroundColor: model.theme.background,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 28,
          }}
          accessible
          accessibilityLabel="Launching"
        >
          <Text
            style={{
              fontSize: 64,
              fontWeight: "900",
              letterSpacing: 0.5,
              color: model.theme.accent,
            }}
          >
            E
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 17,
              fontWeight: "600",
              textAlign: "center",
              color: model.theme.text,
            }}
          >
            {PLACEHOLDER_APP_PRODUCT_NAME}
          </Text>
        </View>
      </View>
    );
  }

  if (model.phase === "notification-wait") {
    return (
      <View style={{ flex: 1, backgroundColor: model.theme.background, paddingTop: model.safeTop }}>
        <StatusBar style={model.isDarkMode ? "light" : "dark"} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={model.theme.accent} />
        </View>
      </View>
    );
  }

  if (model.phase === "notification-prompt") {
    return (
      <View style={{ flex: 1, backgroundColor: model.theme.background }}>
        <StatusBar style={model.isDarkMode ? "light" : "dark"} />
        <NotificationPrePromptScreen
          theme={model.theme}
          styles={model.styles}
          productName={PLACEHOLDER_APP_PRODUCT_NAME}
          safeTop={model.safeTop}
          busy={model.notificationPrePromptBusy}
          onAllow={() => void model.onAllowNotificationsPrePrompt()}
          onDecline={() => void model.onDeclineNotificationsPrePrompt()}
        />
      </View>
    );
  }

  if (model.phase === "signed-out") {
    return <AuthScreens {...model.signedOutProps} />;
  }

  return (
    <>
      <SignedInTree {...model.signedInProps} />
      <KeyBackupPasswordPrompt
        visible={model.phase === "signed-in" && model.keyBackupPromptOpen}
        busy={model.keyBackupPromptBusy}
        error={model.keyBackupPromptError}
        theme={model.theme}
        onDismiss={model.dismissKeyBackupPrompt}
        onSubmit={(password) => void model.submitKeyBackupPassword(password)}
      />
    </>
  );
}

export default function MainApp() {
  return <MainAppInner />;
}
