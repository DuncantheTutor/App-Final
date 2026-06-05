import "react-native-gesture-handler";
import { registerRootComponent } from "expo";
import type { ComponentType } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

const App =
  process.env.EXPO_PUBLIC_APP_VARIANT === "demo"
    ? (require("./AppDemo").default as ComponentType)
    : (require("./App").default as ComponentType);

function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

registerRootComponent(Root);
