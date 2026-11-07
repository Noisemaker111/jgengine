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

/** @internal */
export type LiveSelectCache<TSnapshot, TSelected> = {
  /** The selection a render shows: kept until its shape changes. */
  shaped: SelectCache<TSnapshot, TSelected>;
  /** The newest selection, and the one last handed to the writer. */
  latest: { value: TSelected } | null;
  applied: { value: TSelected } | null;
};

/** @internal */
export function createLiveSelectCache<TSnapshot, TSelected>(): LiveSelectCache<TSnapshot, TSelected> {
  return { shaped: createSelectCache(), latest: null, applied: null };
}

/** The selection as of its last shape change; selecting at a new snapshot also records the newest selection. @internal */
export function readLiveSnapshot<TSnapshot, TSelected>(
  cache: LiveSelectCache<TSnapshot, TSelected>,
  snapshot: TSnapshot,
  select: (snapshot: TSnapshot) => TSelected,
  sameShape: (previous: TSelected, next: TSelected) => boolean,
): TSelected {
  return readSelectSnapshot(
    cache.shaped,
    snapshot,
    (at) => {
      const value = select(at);
      cache.latest = { value };
      return value;
    },
    sameShape,
  );
}

/** The newest selection for the writer: every one once (`fresh`), or the newest again after a render. @internal */
export function takeLiveLatest<TSnapshot, TSelected>(cache: LiveSelectCache<TSnapshot, TSelected>, fresh: boolean): { value: TSelected } | null {
  const latest = cache.latest;
  if (latest === null || (fresh && latest === cache.applied)) return null;
  cache.applied = latest;
  return latest;
}
