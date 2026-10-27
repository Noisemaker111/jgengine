/**
 * `T` after dropping its undefined fields: a field that may be `undefined` becomes optional and never
 * `undefined`; a field that is always defined stays required.
 */
export type DefinedOnly<T extends object> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

/**
 * `value` without its undefined fields, so `{ ...defaults, ...definedOnly(overrides) }` never erases a
 * default with an explicit `undefined`, and a record built from optional inputs can be written where
 * an optional field must be absent rather than `undefined`.
 */
export function definedOnly<T extends object>(value: T): DefinedOnly<T> {
  // type-escape: Object.fromEntries returns string keys; the filter keeps exactly T's defined fields.
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as DefinedOnly<T>;
}
