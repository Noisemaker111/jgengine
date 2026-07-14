import { useCallback, useRef, useSyncExternalStore } from "react";

/** The minimal external-store shape both the editor session and UI store satisfy. */
export interface SubscribableStore<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
}

/**
 * Subscribe a component to a **selected slice** of an external store (editor session or UI store)
 * via `useSyncExternalStore`. The component re-renders only when `selector`'s output changes by
 * `isEqual` (default `Object.is`) — a gizmo drag no longer rerenders panels that read an unrelated
 * slice. The selected value is memoized so an equal slice keeps its reference (no render churn).
 */
export function useStoreSelector<S, T>(
  store: SubscribableStore<S>,
  selector: (state: S) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ value: T } | null>(null);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;

  const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store]);
  const getSnapshot = useCallback((): T => {
    const next = selectorRef.current(store.getState());
    if (cache.current !== null && equalRef.current(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next };
    return next;
  }, [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Shallow array equality — for selectors that return id lists (`selection`) or small tuples. */
export function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** The visible slice of a fixed-row-height list: which rows to mount and the spacer geometry. */
export interface VirtualWindow {
  /** First row index to render (inclusive). */
  start: number;
  /** Last row index to render (exclusive). */
  end: number;
  /** Pixel height of the spacer above the first rendered row. */
  offsetTop: number;
  /** Total scroll height of the full list. */
  totalHeight: number;
}

/**
 * Pure windowing math for a fixed-row-height virtual list: given the scroll offset and viewport,
 * returns the `[start, end)` row range to mount (padded by `overscan`) plus the spacer heights, so
 * a 10,000-row outliner only ever mounts the visible handful. No DOM, unit-testable.
 */
export function virtualWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  rowCount: number,
  overscan = 6,
): VirtualWindow {
  const totalHeight = rowCount * rowHeight;
  if (rowCount <= 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return { start: 0, end: rowCount, offsetTop: 0, totalHeight };
  }
  const clampedScroll = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight)));
  const first = Math.floor(clampedScroll / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(rowCount, first + visible + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight };
}
