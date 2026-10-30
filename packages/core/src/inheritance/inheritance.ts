// @skill jgengine-gameplay
/** How one field passes from parents to child. */
export type InheritRule =
  /** The whole value from one parent; the higher one with chance higherChance (default 0.5). */
  | { pick: "either"; higherChance?: number }
  /** a*weight + b*(1-weight) (weight default 0.5), plus a uniform random offset in ±spread (default 0). */
  | { pick: "blend"; weight?: number; spread?: number };

/** Rare extra changes after inheritance: `rolls` tries, each with `chance`, adding `amount` to one random field of `fields`. */
export interface InheritMutation<K extends string> {
  rolls: number;
  chance: number;
  amount: number;
  fields: readonly K[];
}

/** How a child's values come from two parents. */
export interface InheritOptions<K extends string> {
  /** Per-field rules; fields without one use defaultRule. */
  rules?: Partial<Record<K, InheritRule>>;
  /** Default { pick: "either" }. */
  defaultRule?: InheritRule;
  mutation?: InheritMutation<K>;
}

/** The child's values and the fields that mutated, in roll order. */
export interface Inherited<K extends string> {
  values: Record<K, number>;
  mutations: K[];
}

const EITHER_RULE: InheritRule = { pick: "either" };
const EITHER_SHARE = 0.5;

function oneValue(rule: InheritRule, fromA: number, fromB: number, rng: () => number): number {
  if (rule.pick === "blend") {
    const weight = rule.weight ?? EITHER_SHARE;
    const spread = rule.spread ?? 0;
    return fromA * weight + fromB * (1 - weight) + (rng() * 2 - 1) * spread;
  }
  const higher = Math.max(fromA, fromB);
  const lower = Math.min(fromA, fromB);
  return rng() < (rule.higherChance ?? EITHER_SHARE) ? higher : lower;
}

/**
 * A child's values from two parents, field by field: each field picked whole from one parent or blended between
 * them, then a few rare mutation rolls adding to random fields.
 *
 * @capability value-inheritance a child's values from two parents per field, picked or blended, with rare mutations
 */
export function inheritValues<K extends string>(
  a: Readonly<Record<K, number>>,
  b: Readonly<Record<K, number>>,
  rng: () => number,
  options: InheritOptions<K> = {},
): Inherited<K> {
  // type-escape: Object.keys returns string keys; the fields are exactly the keys of K.
  const fields = Object.keys(a) as K[];
  const values: Record<K, number> = { ...a };
  for (const field of fields) {
    const rule = options.rules?.[field] ?? options.defaultRule ?? EITHER_RULE;
    values[field] = oneValue(rule, a[field], b[field] ?? 0, rng);
  }
  const mutations: K[] = [];
  const mutation = options.mutation;
  if (mutation !== undefined && mutation.fields.length > 0) {
    for (let roll = 0; roll < mutation.rolls; roll += 1) {
      if (rng() >= mutation.chance) continue;
      const field = mutation.fields[Math.min(mutation.fields.length - 1, Math.floor(rng() * mutation.fields.length))];
      if (field === undefined) continue;
      values[field] = (values[field] ?? 0) + mutation.amount;
      mutations.push(field);
    }
  }
  return { values, mutations };
}

/**
 * Spread `points` one at a time over `fields` at random, so two with the same total differ.
 *
 * @capability scatter-points spread points over fields at random so equal totals differ
 */
export function scatterPoints<K extends string>(points: number, fields: readonly K[], rng: () => number): Record<K, number> {
  const spread: Partial<Record<K, number>> = {};
  for (const field of fields) spread[field] = 0;
  for (let point = 0; point < points; point += 1) {
    const field = fields[Math.min(fields.length - 1, Math.floor(rng() * fields.length))];
    if (field === undefined) continue;
    spread[field] = (spread[field] ?? 0) + 1;
  }
  // type-escape: every field of K was set above; Partial exists only to build it without a cast per write.
  return spread as Record<K, number>;
}
