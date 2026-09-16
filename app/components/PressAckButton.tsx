import { useCallback, useRef, type ReactNode } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { playPressHaptic } from "../lib/haptics";

export type PressAckVariant = "send" | "flash";

type Props = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  /** `send` = paper-plane nudge inside the circle. `flash` = in-bounds highlight. Never scales. */
  variant?: PressAckVariant;
  children: ReactNode;
};

/**
 * Press acknowledgement that keeps the outer button size unchanged.
 * Haptic + inner motion run in parallel with `onPress` (press is not delayed).
 */
export function PressAckButton({
  style,
  variant = "flash",
  children,
  disabled,
  onPress,
  onPressIn,
  ...rest
}: Props) {
  const travel = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const playAck = useCallback(() => {
    if (disabled) return;
    playPressHaptic();
    if (variant === "send") {
      travel.stopAnimation();
      travel.setValue(0);
      Animated.sequence([
        Animated.timing(travel, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(travel, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
      return;
    }
    flash.stopAnimation();
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [disabled, flash, travel, variant]);

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={onPress}
      onPressIn={(event) => {
        playAck();
        onPressIn?.(event);
      }}
      style={[style, styles.clip]}
    >
      {variant === "send" ? (
        <Animated.View
          style={{
            opacity: travel.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
            transform: [
              { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) },
              { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
            ],
          }}
        >
          {children}
        </Animated.View>
      ) : (
        children
      )}
      {variant === "flash" ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flash,
            {
              opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }),
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
  },
});
