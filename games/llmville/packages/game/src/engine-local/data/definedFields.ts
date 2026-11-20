/**
 * Passing optional values on to something that takes optional fields. With exact optional property
 * types, a field set to `undefined` is not the same as a field left out, so a value that may be
 * missing has to be dropped rather than passed as `undefined`.
 *
 * @capability defined-fields pass maybe-missing values on as optional fields, leaving out the ones that are undefined
 */

/** The fields of `T` with `undefined` taken out of each value: the ones that were set stay, the rest are left out. */
export type DefinedFields<T> = { [K in keyof T]?: T[K] & ({} | null) };

/**
 * `fields` without the entries whose value is `undefined`, typed so the result spreads into props or
 * options that take those fields as optional: `<mesh {...definedFields({ rotation, scale })} />`.
 */
export function definedFields<T extends object>(fields: T): DefinedFields<T> {
  const out: DefinedFields<T> = {};
  for (const key in fields) {
    if (!Object.hasOwn(fields, key)) continue;
    const value = fields[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
