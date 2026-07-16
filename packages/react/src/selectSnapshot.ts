export type SelectCache<TSnapshot, TSelected> = {
  ready: boolean;
  snapshot: TSnapshot;
  value: TSelected;
};

/** @internal */
export function createSelectCache<TSnapshot, TSelected>(): SelectCache<TSnapshot, TSelected> {
  return { ready: false, snapshot: undefined as TSnapshot, value: undefined as TSelected };
}

/** @internal */
export function readSelectSnapshot<TSnapshot, TSelected>(
  cache: SelectCache<TSnapshot, TSelected>,
  snapshot: TSnapshot,
  select: (snapshot: TSnapshot) => TSelected,
  isEqual: (previous: TSelected, next: TSelected) => boolean = Object.is,
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
