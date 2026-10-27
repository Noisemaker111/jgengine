/** {@link inheritStats} odds. */
export interface InheritanceOptions<S extends string> {
  /** Chance each stat comes from the parent with more points in it. ARK: 0.55. */
  higherChance?: number;
  /** Rolls for a mutation, each adding `levels` points to a random stat of `stats`. ARK: 3 rolls at 2.5%, +2 levels. */
  mutations?: { rolls: number; chance: number; levels: number; stats: readonly S[] };
}

/** What a baby got from its parents: its points per stat and the stats that mutated, in roll order. */
export interface Inherited<S extends string> {
  points: Record<S, number>;
  mutations: S[];
}

/**
 * A baby's stat points from its two parents, stat by stat as ARK breeds them: each stat whole from one parent, the
 * stronger one more often, then a few small chances of a mutation adding points to one stat.
 * @capability stat-inheritance breed two parents' stat points into a baby's, favouring the stronger, with rare mutations
 */
export function inheritStats<S extends string>(
  mother: Readonly<Record<S, number>>,
  father: Readonly<Record<S, number>>,
  rng: () => number,
  options: InheritanceOptions<S> = {},
): Inherited<S> {
  const higherChance = options.higherChance ?? 0.55;
  const points = {} as Record<S, number>;
  for (const stat of Object.keys(mother) as S[]) {
    const high = Math.max(mother[stat], father[stat] ?? 0);
    const low = Math.min(mother[stat], father[stat] ?? 0);
    points[stat] = rng() < higherChance ? high : low;
  }
  const mutations: S[] = [];
  const mutation = options.mutations;
  if (mutation !== undefined && mutation.stats.length > 0) {
    for (let roll = 0; roll < mutation.rolls; roll += 1) {
      if (rng() >= mutation.chance) continue;
      const stat = mutation.stats[Math.min(mutation.stats.length - 1, Math.floor(rng() * mutation.stats.length))]!;
      points[stat] = (points[stat] ?? 0) + mutation.levels;
      mutations.push(stat);
    }
  }
  return { points, mutations };
}

/**
 * A creature's levels past the first spread over its stats one at a time at random, the way ARK hands out a wild
 * creature's levels: two of the same level differ in what they are good at.
 * @capability wild-stat-levels spread a creature's levels over its stats at random so same-level creatures differ
 */
export function scatterLevels<S extends string>(levels: number, stats: readonly S[], rng: () => number): Record<S, number> {
  const points = Object.fromEntries(stats.map((stat) => [stat, 0])) as Record<S, number>;
  for (let level = 0; level < levels; level += 1) {
    const stat = stats[Math.min(stats.length - 1, Math.floor(rng() * stats.length))]!;
    points[stat] += 1;
  }
  return points;
}
