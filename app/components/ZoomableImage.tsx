import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

type Props = {
  uri: string;
  width: number;
  height: number;
  onZoomChange?: (zoomed: boolean) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Pinch-to-zoom with one-finger pan while zoomed in.
 */
export function ZoomableImage({ uri, width, height, onZoomChange }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(1);
  const baseTx = useRef(0);
  const baseTy = useRef(0);
  const zoomedRef = useRef(false);
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const [canPan, setCanPan] = useState(false);

  useEffect(() => {
    baseScale.current = 1;
    baseTx.current = 0;
    baseTy.current = 0;
    zoomedRef.current = false;
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
    setCanPan(false);
    onZoomChangeRef.current?.(false);
  }, [uri, scale, tx, ty]);

  const composed = useMemo(() => {
    const maxPanFor = (nextScale: number) => ({
      x: (width * Math.max(0, nextScale - 1)) / 2,
      y: (height * Math.max(0, nextScale - 1)) / 2,
    });

    const applyScale = (nextScale: number) => {
      const clampedScale = clamp(nextScale, 1, 4);
      scale.setValue(clampedScale);
      const max = maxPanFor(clampedScale);
      const nextTx = clamp(baseTx.current, -max.x, max.x);
      const nextTy = clamp(baseTy.current, -max.y, max.y);
      tx.setValue(nextTx);
      ty.setValue(nextTy);
      const zoomed = clampedScale > 1.02;
      if (zoomed !== zoomedRef.current) {
        zoomedRef.current = zoomed;
        onZoomChangeRef.current?.(zoomed);
      }
      if (!zoomed) {
        baseTx.current = 0;
        baseTy.current = 0;
        tx.setValue(0);
        ty.setValue(0);
      }
      return clampedScale;
    };

    const pinch = Gesture.Pinch()
      .onUpdate((event) => {
        applyScale(baseScale.current * event.scale);
      })
      .onEnd((event) => {
        const nextScale = applyScale(baseScale.current * event.scale);
        baseScale.current = nextScale;
        const max = maxPanFor(nextScale);
        baseTx.current = clamp(baseTx.current, -max.x, max.x);
        baseTy.current = clamp(baseTy.current, -max.y, max.y);
        setCanPan(nextScale > 1.02);
      });

    const pan = Gesture.Pan()
      .enabled(canPan)
      .minDistance(0)
      .maxPointers(1)
      .onUpdate((event) => {
        const max = maxPanFor(baseScale.current);
        tx.setValue(clamp(baseTx.current + event.translationX, -max.x, max.x));
        ty.setValue(clamp(baseTy.current + event.translationY, -max.y, max.y));
      })
      .onEnd((event) => {
        const max = maxPanFor(baseScale.current);
        baseTx.current = clamp(baseTx.current + event.translationX, -max.x, max.x);
        baseTy.current = clamp(baseTy.current + event.translationY, -max.y, max.y);
        tx.setValue(baseTx.current);
        ty.setValue(baseTy.current);
      });

    return Gesture.Simultaneous(pinch, pan);
  }, [canPan, height, scale, tx, ty, width]);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.host, { width, height }]} collapsable={false}>
        <Animated.View
          collapsable={false}
          style={{
            width,
            height,
            transform: [{ translateX: tx }, { translateY: ty }, { scale }],
          }}
        >
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
