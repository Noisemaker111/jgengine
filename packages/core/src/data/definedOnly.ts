/** `T` with every field optional and never `undefined`: what is left after dropping undefined fields. @internal */
export type DefinedOnly<T extends object> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * `value` without its undefined fields, so `{ ...defaults, ...definedOnly(overrides) }` never erases a
 * default with an explicit `undefined`.
 * @internal
 */
export function definedOnly<T extends object>(value: T): DefinedOnly<T> {
  // type-escape: Object.fromEntries returns string keys; the filter keeps exactly T's defined fields.
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as DefinedOnly<T>;
}
