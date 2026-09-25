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

type Props = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

function clipRadius(style: StyleProp<ViewStyle> | undefined): number {
  const flat = StyleSheet.flatten(style);
  return typeof flat?.borderRadius === "number" ? flat.borderRadius : 0;
}

/** Solid accent (or other chromatic) fills only. Posts, nav icons, and text rows stay still. */
function fillWarrantsShimmer(style: StyleProp<ViewStyle> | undefined): boolean {
  const bg = StyleSheet.flatten(style)?.backgroundColor;
  if (typeof bg !== "string") return false;
  const match = bg.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return false;
  const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1;
  if (alpha < 0.6) return false;
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 40 || min > 230) return false;
  return max - min >= 28;
}

/**
 * Press acknowledgement that keeps the outer button size unchanged.
 * Accent fills get a soft wipe that fades back to the original colour.
 * Haptic and motion run in parallel with `onPress` (press is not delayed).
 */
export function PressAckButton({
  style,
  children,
  disabled,
  onPress,
  onPressIn,
  onLayout,
  ...rest
}: Props) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const [metrics, setMetrics] = useState({ w: 120, h: 40 });
  const radius = clipRadius(style);
  const showShimmer = fillWarrantsShimmer(style);
  const bandW = Math.max(28, metrics.w * 0.72);

  const playAck = useCallback(() => {
    if (disabled) return;
    playPressHaptic();
    if (!showShimmer) return;
    shimmer.stopAnimation();
    shimmer.setValue(0);
    Animated.timing(shimmer, {
      toValue: 1,
      duration: 680,
      useNativeDriver: true,
    }).start();
  }, [disabled, showShimmer, shimmer]);

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
      {children}
      {showShimmer ? (
        <Animated.View pointerEvents="none" style={[styles.clip, { borderRadius: radius }]}>
          <Animated.View
            style={[
              styles.band,
              {
                width: bandW,
                height: metrics.h * 2.4,
                top: -metrics.h * 0.7,
                opacity: shimmer.interpolate({
                  inputRange: [0, 0.22, 0.55, 1],
                  outputRange: [0, 0.38, 0.16, 0],
                }),
                transform: [
                  {
                    translateX: shimmer.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-bandW, metrics.w + bandW * 0.2],
                    }),
                  },
                ],
              },
            ]}
          />
        </Animated.View>
      ) : null}
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
    backgroundColor: "rgba(255,255,255,0.55)",
  },
});
