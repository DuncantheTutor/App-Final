import { useRef } from "react";
import { Animated, Image, Platform, ScrollView, StyleSheet } from "react-native";
import { PinchGestureHandler, State, type HandlerStateChangeEvent, type PinchGestureHandlerEventPayload, type PinchGestureHandlerGestureEvent } from "react-native-gesture-handler";

type Props = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Pinch-to-zoom photo. iOS uses ScrollView bounce-zoom; Android uses a pinch handler.
 */
export function ZoomableImage({ uri, width, height }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const baseScale = useRef(1);

  if (Platform.OS === "ios") {
    return (
      <ScrollView
        style={{ width, height }}
        contentContainerStyle={{ width, height }}
        maximumZoomScale={4}
        minimumZoomScale={1}
        bouncesZoom
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </ScrollView>
    );
  }

  const onPinchEvent = (event: PinchGestureHandlerGestureEvent) => {
    const next = Math.min(4, Math.max(1, baseScale.current * event.nativeEvent.scale));
    scale.setValue(next);
  };

  const onPinchStateChange = (event: HandlerStateChangeEvent<PinchGestureHandlerEventPayload>) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    baseScale.current = Math.min(4, Math.max(1, baseScale.current * event.nativeEvent.scale));
    scale.setValue(baseScale.current);
  };

  return (
    <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
      <Animated.View style={[styles.androidHost, { width, height, transform: [{ scale }] }]}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Animated.View>
    </PinchGestureHandler>
  );
}

const styles = StyleSheet.create({
  androidHost: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
