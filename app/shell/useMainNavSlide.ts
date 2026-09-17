import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

import { neighborMainNav, type MainNavSurface } from "./mainNavOrder";

export type MainNavIncoming = { surface: MainNavSurface; fromRight: boolean };

export function isHomeTabPair(a: MainNavSurface | null, b: MainNavSurface | null): boolean {
  return (a === "chats" && b === "feed") || (a === "feed" && b === "chats");
}

export function useMainNavSlide(params: {
  getCurrent: () => MainNavSurface | null;
  goToSurface: (surface: MainNavSurface) => void;
  getWidth: () => number;
}) {
  const { getCurrent, goToSurface, getWidth } = params;
  const dragX = useRef(new Animated.Value(0)).current;
  const incomingOffset = useRef(new Animated.Value(0)).current;
  const incomingTranslate = useMemo(
    () => Animated.add(dragX, incomingOffset),
    [dragX, incomingOffset]
  );
  const [incoming, setIncoming] = useState<MainNavIncoming | null>(null);
  const incomingRef = useRef<MainNavIncoming | null>(null);
  incomingRef.current = incoming;
  const lastDirRef = useRef<0 | 1 | -1>(0);
  const animatingRef = useRef(false);
  const pendingCommitSnapRef = useRef(false);

  useLayoutEffect(() => {
    if (!pendingCommitSnapRef.current) return;
    pendingCommitSnapRef.current = false;
    dragX.setValue(0);
    incomingOffset.setValue(0);
    lastDirRef.current = 0;
    incomingRef.current = null;
    animatingRef.current = false;
  });

  const isSurfaceVisible = useCallback(
    (surface: MainNavSurface) => getCurrent() === surface || incoming?.surface === surface,
    [getCurrent, incoming]
  );

  const slideStyle = useCallback(
    (surface: MainNavSurface) => {
      const current = getCurrent();
      if (current === surface) {
        return { transform: [{ translateX: dragX }] };
      }
      if (incoming?.surface === surface) {
        return { transform: [{ translateX: incomingTranslate }] };
      }
      return undefined;
    },
    [dragX, getCurrent, incoming, incomingTranslate]
  );

  const onDragMove = useCallback(
    (dx: number) => {
      if (animatingRef.current) return;
      const current = getCurrent();
      if (!current) return;
      const width = getWidth();
      const dir: 0 | 1 | -1 = dx < -4 ? 1 : dx > 4 ? -1 : lastDirRef.current;
      if (dir !== 0 && dir !== lastDirRef.current) {
        lastDirRef.current = dir;
        const next = neighborMainNav(current, dir);
        if (next) {
          const fromRight = dir === 1;
          incomingOffset.setValue(fromRight ? width : -width);
          const nextIncoming: MainNavIncoming = { surface: next, fromRight };
          incomingRef.current = nextIncoming;
          setIncoming(nextIncoming);
        } else {
          incomingRef.current = null;
          setIncoming(null);
        }
      }
      const next = incomingRef.current;
      if (!next) {
        dragX.setValue(dx * 0.22);
        return;
      }
      const max = width;
      const clamped = next.fromRight ? Math.max(-max, Math.min(0, dx)) : Math.min(max, Math.max(0, dx));
      dragX.setValue(clamped);
    },
    [dragX, getCurrent, getWidth, incomingOffset]
  );

  const finishReset = useCallback(() => {
    lastDirRef.current = 0;
    incomingRef.current = null;
    setIncoming(null);
    dragX.setValue(0);
    animatingRef.current = false;
  }, [dragX]);

  const onDragRelease = useCallback(
    (dx: number, vx: number) => {
      if (animatingRef.current) return;
      const width = getWidth();
      const next = incomingRef.current;
      const shouldCommit =
        !!next && (Math.abs(dx) > width * 0.22 || Math.abs(vx) > 0.55) && Math.sign(dx) !== 0;
      const commitMatches =
        !!next && ((next.fromRight && dx < 0) || (!next.fromRight && dx > 0));
      if (!shouldCommit || !commitMatches || !next) {
        animatingRef.current = true;
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 18,
          bounciness: 0,
        }).start(() => finishReset());
        return;
      }
      const dest = next.fromRight ? -width : width;
      const to = next.surface;
      animatingRef.current = true;
      Animated.timing(dragX, {
        toValue: dest,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          finishReset();
          return;
        }
        pendingCommitSnapRef.current = true;
        goToSurface(to);
        setIncoming(null);
      });
    },
    [dragX, finishReset, getWidth, goToSurface]
  );

  return {
    incoming,
    isSurfaceVisible,
    slideStyle,
    onDragMove,
    onDragRelease,
    isHomeToHome: isHomeTabPair(getCurrent(), incoming?.surface ?? null),
  };
}
