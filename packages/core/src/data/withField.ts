/** The keys of `T` that may be left out. */
export type OptionalKey<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/**
 * A copy of `row` with the optional field `key` set to `value`, or left out when `value` is
 * `undefined`. An editor that clears a field this way stores no `key: undefined`, so the saved
 * document reads the same as one that never had the field.
 */
export function withField<T extends object, K extends OptionalKey<T>>(row: T, key: K, value: T[K] | undefined): T {
  const next = { ...row };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}
