import { useCallback, useRef, useState, type ReactNode } from "react";
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
  /** `send` = paper-plane nudge plus shimmer. `flash` = shimmer only. Never scales or resizes. */
  variant?: PressAckVariant;
  children?: ReactNode;
};

function clipRadius(style: StyleProp<ViewStyle> | undefined): number {
  const flat = StyleSheet.flatten(style);
  return typeof flat?.borderRadius === "number" ? flat.borderRadius : 0;
}

/**
 * Press acknowledgement that keeps the outer button size unchanged.
 * A diagonal highlight travels across the control inside an absolute clip.
 * Haptic and motion run in parallel with `onPress` (press is not delayed).
 */
export function PressAckButton({
  style,
  variant = "flash",
  children,
  disabled,
  onPress,
  onPressIn,
  onLayout,
  ...rest
}: Props) {
  const travel = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const [metrics, setMetrics] = useState({ w: 120, h: 40 });
  const radius = clipRadius(style);
  const bandW = Math.max(16, metrics.w * 0.34);

  const playAck = useCallback(() => {
    if (disabled) return;
    playPressHaptic();
    shimmer.stopAnimation();
    shimmer.setValue(0);
    Animated.timing(shimmer, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
    if (variant !== "send") return;
    travel.stopAnimation();
    travel.setValue(0);
    Animated.sequence([
      Animated.timing(travel, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(travel, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [disabled, shimmer, travel, variant]);

  const content =
    variant === "send" ? (
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
    );

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={onPress}
      onPressIn={(event) => {
        playAck();
        onPressIn?.(event);
      }}
      onLayout={(event) => {
        const w = Math.round(event.nativeEvent.layout.width);
        const h = Math.round(event.nativeEvent.layout.height);
        if (w > 0 && h > 0) {
          setMetrics((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        }
        onLayout?.(event);
      }}
      style={style}
    >
      {content}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.clip,
          { borderRadius: radius },
        ]}
      >
        <Animated.View
          style={[
            styles.band,
            {
              width: bandW,
              height: metrics.h * 3,
              top: -metrics.h,
              opacity: shimmer.interpolate({
                inputRange: [0, 0.08, 0.82, 1],
                outputRange: [0, 0.72, 0.72, 0],
              }),
              transform: [
                {
                  translateX: shimmer.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-bandW, metrics.w + bandW],
                  }),
                },
                { rotate: "-24deg" },
              ],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  band: {
    position: "absolute",
    left: 0,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
});
