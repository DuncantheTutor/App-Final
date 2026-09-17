import { PanResponder } from "react-native";

import { neighborMainNav, type MainNavSurface } from "./mainNavOrder";

export function createMainNavSwipePan(params: {
  getSurface: () => MainNavSurface | null;
  goToSurface: (surface: MainNavSurface) => void;
  getMinPageY: () => number;
  getWindowWidth: () => number;
  getChatsOnlineStripMaxY: () => number;
}) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (evt, g) => {
      const surface = params.getSurface();
      if (!surface) return false;
      if (evt.nativeEvent.pageY < params.getMinPageY()) return false;
      const horizontal = Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) + 6;
      if (!horizontal) return false;
      if (surface === "feed") {
        const x = evt.nativeEvent.pageX;
        const edge = 28;
        const width = params.getWindowWidth();
        return x <= edge || x >= width - edge;
      }
      if (surface === "chats" && evt.nativeEvent.pageY < params.getChatsOnlineStripMaxY()) {
        return false;
      }
      return true;
    },
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 48 || Math.abs(g.dx) <= Math.abs(g.dy)) return;
      const current = params.getSurface();
      if (!current) return;
      const next = neighborMainNav(current, g.dx < 0 ? 1 : -1);
      if (next) params.goToSurface(next);
    },
  });
}
