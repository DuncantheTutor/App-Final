import { forwardRef, useCallback, useState, type ReactElement } from "react";
import {
  FlatList,
  ScrollView,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from "react-native";

function mergeScrollBeginHandlers(
  reveal: () => void,
  user?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
) {
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    reveal();
    user?.(e);
  };
}

function makeMergedOnScroll(
  horizontal: boolean | null | undefined,
  reveal: () => void,
  user?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
) {
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (!!horizontal) {
      if (contentSize.width > layoutMeasurement.width + 1 && Math.abs(contentOffset.x) > 0.5) {
        reveal();
      }
    } else if (contentSize.height > layoutMeasurement.height + 1 && Math.abs(contentOffset.y) > 0.5) {
      reveal();
    }
    user?.(e);
  };
}

/** Scrollbar stays hidden until the user scrolls (per instance). */
export const ScrollViewUntilScroll = forwardRef<ScrollView, ScrollViewProps>(function ScrollViewUntilScroll(
  { onScrollBeginDrag, onMomentumScrollBegin, onScroll, horizontal, ...rest },
  ref
) {
  const [showIndicators, setShowIndicators] = useState(false);
  const reveal = useCallback(() => setShowIndicators(true), []);

  return (
    <ScrollView
      ref={ref}
      {...rest}
      horizontal={horizontal}
      persistentScrollbar={false}
      showsVerticalScrollIndicator={horizontal ? false : showIndicators}
      showsHorizontalScrollIndicator={horizontal ? showIndicators : false}
      onScrollBeginDrag={mergeScrollBeginHandlers(reveal, onScrollBeginDrag)}
      onMomentumScrollBegin={mergeScrollBeginHandlers(reveal, onMomentumScrollBegin)}
      onScroll={makeMergedOnScroll(horizontal, reveal, onScroll)}
      scrollEventThrottle={rest.scrollEventThrottle ?? 16}
    />
  );
});

export function FlatListUntilScroll<ItemT>(props: FlatListProps<ItemT>): ReactElement | null {
  const { onScrollBeginDrag, onMomentumScrollBegin, onScroll, horizontal, ...rest } = props;
  const [showIndicators, setShowIndicators] = useState(false);
  const reveal = useCallback(() => setShowIndicators(true), []);

  return (
    <FlatList
      {...rest}
      horizontal={horizontal}
      persistentScrollbar={false}
      showsVerticalScrollIndicator={horizontal ? false : showIndicators}
      showsHorizontalScrollIndicator={horizontal ? showIndicators : false}
      onScrollBeginDrag={mergeScrollBeginHandlers(reveal, onScrollBeginDrag)}
      onMomentumScrollBegin={mergeScrollBeginHandlers(reveal, onMomentumScrollBegin)}
      onScroll={makeMergedOnScroll(horizontal, reveal, onScroll)}
      scrollEventThrottle={rest.scrollEventThrottle ?? 16}
    />
  );
}
