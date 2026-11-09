export type SelectCache<TSnapshot, TSelected> = {
  ready: boolean;
  snapshot: TSnapshot;
  value: TSelected;
};

/** @internal */
export function createSelectCache<TSnapshot, TSelected>(): SelectCache<TSnapshot, TSelected> {
  return { ready: false, snapshot: undefined as TSnapshot, value: undefined as TSelected };
}

/**
 * Whether two selections show the same thing: the same value, or arrays or plain objects whose
 * entries are each the same value. A selector that picks several fields into a new object or array
 * is equal to the last one while every field is, so the component does not re-render for a store
 * change it does not show.
 */
export function shallowEqual(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  if (typeof previous !== "object" || typeof next !== "object" || previous === null || next === null) return false;
  if (Array.isArray(previous)) {
    if (!Array.isArray(next) || previous.length !== next.length) return false;
    for (let index = 0; index < previous.length; index += 1) if (!Object.is(previous[index], next[index])) return false;
    return true;
  }
  if (Array.isArray(next) || Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next)) return false;
  const prototype: unknown = Object.getPrototypeOf(previous);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(previous);
  if (keys.length !== Object.keys(next).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key) || !Object.is(Reflect.get(previous, key), Reflect.get(next, key))) return false;
  }
  return true;
}

/** @internal */
export function readSelectSnapshot<TSnapshot, TSelected>(
  cache: SelectCache<TSnapshot, TSelected>,
  snapshot: TSnapshot,
  select: (snapshot: TSnapshot) => TSelected,
  isEqual: (previous: TSelected, next: TSelected) => boolean = shallowEqual,
): TSelected {
  if (cache.ready && Object.is(cache.snapshot, snapshot)) return cache.value;
  const next = select(snapshot);
  if (cache.ready && isEqual(cache.value, next)) {
    cache.snapshot = snapshot;
    return cache.value;
  }
  cache.ready = true;
  cache.snapshot = snapshot;
  cache.value = next;
  return cache.value;
}

/** Frames or ticks a selection is watched over before it is judged. @internal */
export const HOT_SELECTION_WINDOW = 60;
/** Share of those frames or ticks it may change on before it counts as a per-frame or per-tick re-render. @internal */
export const HOT_SELECTION_SHARE = 0.9;

/** Which clock a hot selection kept pace with. */
export type HotSelectionPace = "frame" | "tick";

/**
 * Watches one component's store selection and says when it changes on nearly every rendered frame
 * or nearly every simulation tick over a window: that component re-renders as often as the game
 * draws or steps, so what it selects is a value that moves every frame or tick (a timer, a position,
 * a meter) or a whole object one is part of. Judged in frames and ticks rather than seconds, so a
 * 360 fps PC and a software-rendered host give the same verdict. @internal
 */
export function createSelectionHeat(): { changed(frame: number, tick: number): HotSelectionPace | null } {
  const frames = { start: Number.NaN, last: Number.NaN, changes: 0 };
  const ticks = { start: Number.NaN, last: Number.NaN, changes: 0 };
  const judge = (window: typeof frames, at: number): boolean => {
    if (Number.isNaN(window.start) || at < window.start) {
      window.start = at;
      window.last = Number.NaN;
      window.changes = 0;
    }
    if (at !== window.last) {
      window.last = at;
      window.changes += 1;
    }
    const span = at - window.start;
    if (span < HOT_SELECTION_WINDOW) return false;
    const hot = window.changes >= span * HOT_SELECTION_SHARE;
    window.start = at;
    window.last = at;
    window.changes = 0;
    return hot;
  };
  return {
    changed(frame, tick) {
      if (judge(frames, frame)) return "frame";
      if (judge(ticks, tick)) return "tick";
      return null;
    },
  };
}

let devFrames = 0;
let devFrameLoop = false;

/** Rendered frames since the first store hook mounted, counted on the page's own animation frames (dev builds only). @internal */
export function devFrameIndex(): number {
  if (!devFrameLoop && typeof requestAnimationFrame === "function") {
    devFrameLoop = true;
    const count = () => {
      devFrames += 1;
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  }
  return devFrames;
}
