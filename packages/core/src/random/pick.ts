/**
 * Pick one item uniformly at random from `items` using `rng` (a `() => number` in `[0, 1)`); returns undefined when empty.
 *
 * @capability weighted-pick pick one item from a set with an injected random source
 */
export function pickUniform<T>(rng: () => number, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Pick one item with probability proportional to `weightOf(item)`; skips non-positive weights, returns undefined when nothing is eligible. */
export function pickWeighted<T>(rng: () => number, items: readonly T[], weightOf: (item: T) => number): T | undefined {
  let total = 0;
  for (const item of items) {
    const weight = weightOf(item);
    if (weight > 0) total += weight;
  }
  if (total <= 0) return undefined;
  let roll = rng() * total;
  for (const item of items) {
    const weight = weightOf(item);
    if (weight <= 0) continue;
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}
