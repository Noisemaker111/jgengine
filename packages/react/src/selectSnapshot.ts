export type SelectCache<TSnapshot, TSelected> = {
  ready: boolean;
  snapshot: TSnapshot;
  value: TSelected;
};

/** @internal */
export function createSelectCache<TSnapshot, TSelected>(): SelectCache<TSnapshot, TSelected> {
  return { ready: false, snapshot: undefined as TSnapshot, value: undefined as TSelected };
}

/** Values a selection is compared over before it counts as changed, so a huge selection cannot stall a frame. */
const SELECTION_BUDGET = 4_000;

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameView(previous: unknown, next: unknown, budget: { left: number }): boolean {
  if (Object.is(previous, next)) return true;
  if (typeof previous !== "object" || typeof next !== "object" || previous === null || next === null) return false;
  budget.left -= 1;
  if (budget.left < 0) return false;
  if (Array.isArray(previous)) {
    if (!Array.isArray(next) || previous.length !== next.length) return false;
    for (let index = 0; index < previous.length; index += 1) if (!sameView(previous[index], next[index], budget)) return false;
    return true;
  }
  if (Array.isArray(next) || !isPlainObject(previous) || !isPlainObject(next)) return false;
  const keys = Object.keys(previous);
  if (keys.length !== Object.keys(next).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key) || !sameView(Reflect.get(previous, key), Reflect.get(next, key), budget)) return false;
  }
  return true;
}

/**
 * Whether two selections show the same thing: the same value, or arrays and plain objects whose
 * entries are the same all the way down (a record or class instance compares by identity). A
 * selector that builds a view (`{ title, steps: [{ id, label, done }] }`) is unchanged while every
 * value in it is, so the component does not re-render for a store change it does not show.
 */
export function selectionEqual(previous: unknown, next: unknown): boolean {
  return sameView(previous, next, { left: SELECTION_BUDGET });
}

/** @internal */
export function readSelectSnapshot<TSnapshot, TSelected>(
  cache: SelectCache<TSnapshot, TSelected>,
  snapshot: TSnapshot,
  select: (snapshot: TSnapshot) => TSelected,
  isEqual: (previous: TSelected, next: TSelected) => boolean = selectionEqual,
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
