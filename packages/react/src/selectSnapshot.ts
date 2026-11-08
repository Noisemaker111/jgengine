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

/** How many selection changes in {@link HOT_SELECTION_WINDOW_MS} make a component a per-frame re-render. @internal */
export const HOT_SELECTION_CHANGES = 40;
/** @internal */
export const HOT_SELECTION_WINDOW_MS = 2_000;

/**
 * Counts how often one component's store selection changes, and says once when it changes about as
 * often as frames draw: that component re-renders every frame, so what it selects is a value that
 * moves every frame (a timer, a position, a meter) or a whole object that a moving value is part of.
 * @internal
 */
export function createSelectionRate(now: () => number = () => performance.now()): { changed(): boolean } {
  let windowStart = 0;
  let changes = 0;
  let reported = false;
  return {
    changed() {
      if (reported) return false;
      const at = now();
      if (at - windowStart > HOT_SELECTION_WINDOW_MS) {
        windowStart = at;
        changes = 0;
      }
      changes += 1;
      if (changes < HOT_SELECTION_CHANGES) return false;
      reported = true;
      return true;
    },
  };
}
