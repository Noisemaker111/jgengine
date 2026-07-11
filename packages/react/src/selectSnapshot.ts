export type SelectCache<T> = { value: T; ready: boolean };

export function createSelectCache<T>(): SelectCache<T> {
  return { value: undefined as T, ready: false };
}

export function readSelectSnapshot<T>(
  cache: SelectCache<T>,
  compute: () => T,
  isEqual: (previous: T, next: T) => boolean = Object.is,
): T {
  const next = compute();
  if (cache.ready && isEqual(cache.value, next)) return cache.value;
  cache.value = next;
  cache.ready = true;
  return cache.value;
}
