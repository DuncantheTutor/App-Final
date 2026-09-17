import { PanResponder } from "react-native";

import type { MainNavSurface } from "./mainNavOrder";

export function createMainNavSwipePan(params: {
  getSurface: () => MainNavSurface | null;
  getMinPageY: () => number;
  getChatsOnlineStripMaxY: () => number;
  /** True while a multi-image post carousel is handling the current touch. */
  isCarouselTouch?: () => boolean;
  onMove: (dx: number) => void;
  onRelease: (dx: number, vx: number) => void;
}) {
  const horizontalEnough = (dx: number, dy: number) =>
    Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) + 6;

  const shouldClaim = (pageY: number, dx: number, dy: number) => {
    const surface = params.getSurface();
    if (!surface) return false;
    if (pageY < params.getMinPageY()) return false;
    if (!horizontalEnough(dx, dy)) return false;
    if (surface === "chats" && pageY < params.getChatsOnlineStripMaxY()) {
      return false;
    }
    if (params.isCarouselTouch?.()) return false;
    return true;
  };

  return PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (evt, g) =>
      shouldClaim(evt.nativeEvent.pageY, g.dx, g.dy),
    onMoveShouldSetPanResponder: (evt, g) => shouldClaim(evt.nativeEvent.pageY, g.dx, g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      params.onMove(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      params.onRelease(g.dx, g.vx);
    },
    onPanResponderTerminate: (_, g) => {
      params.onRelease(g.dx, g.vx);
    },
  });
}
