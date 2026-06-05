import { InteractionManager } from "react-native";

/** Let navigation, taps, and paints run before heavy media work continues. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setImmediate(resolve);
    });
  });
}
