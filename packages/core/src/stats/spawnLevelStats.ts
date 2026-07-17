/**
 * Per-stat growth definition for one species. `base` is the level-1 value of the stat; `growth`
 * is how much a single distributed point adds, expressed as a fraction of `base` — so a point on a
 * `growth: 0.1` stat is worth +10% of base. The resolved value is `base * (1 + points * growth)`.
 */
export interface SpawnStatDef {
  base: number;
  growth: number;
}

/**
 * A species' stat table: every stat the creature owns keyed to its {@link SpawnStatDef}. The key
 * order is the deterministic order random points are distributed over, so a serialized species
 * definition reproduces the same rolls under the same rng sequence.
 */
export type SpawnSpeciesDef<TStat extends string> = Record<TStat, SpawnStatDef>;

/**
 * A single creature's serializable stat record — a reference to its species (`speciesId`), the
 * current `level`, the per-stat count of distributed points, and how many post-capture domestic
 * levels have been spent. Plain data: round-trips through JSON, save/load, and multiplayer sync.
 * Resolve display values with {@link resolveSpawnStats}.
 */
export interface CreatureStatInstance<TStat extends string> {
  speciesId: string;
  level: number;
  points: Record<TStat, number>;
  domesticLevels: number;
}

/**
 * Outcome of {@link applyCaptureEffectiveness}: the granted `bonusLevels`, the `tamedLevel`
 * (wild level plus bonus levels), and the post-capture {@link CreatureStatInstance}.
 * @internal
 */
export interface CaptureResult<TStat extends string> {
  bonusLevels: number;
  tamedLevel: number;
  instance: CreatureStatInstance<TStat>;
}

/**
 * Options for {@link spendDomesticLevel}. `maxDomesticLevels` caps how many post-capture levels a
 * creature may spend; once reached, further spends are refused.
 * @internal
 */
export interface SpendLevelOptions {
  maxDomesticLevels?: number;
}

/**
 * Result of {@link spendDomesticLevel}: the resulting instance and whether the level was applied
 * (`spent: false` when the domestic-level cap blocked it, leaving the instance untouched).
 * @internal
 */
export interface SpendLevelResult<TStat extends string> {
  instance: CreatureStatInstance<TStat>;
  spent: boolean;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function normalizeLevel(level: number): number {
  const floored = Math.floor(level);
  return floored < 1 ? 1 : floored;
}

/**
 * Scatter `count` points one at a time across `statIds`, choosing each target uniformly from the
 * injected rng. Mutates `into` in place; bounded by `count`. The rng draws the sole source of
 * randomness, so an identical rng sequence reproduces an identical distribution.
 */
function distributePoints<TStat extends string>(
  statIds: readonly TStat[],
  count: number,
  rng: () => number,
  into: Record<TStat, number>,
): void {
  const n = statIds.length;
  if (n === 0 || count <= 0) return;
  for (let i = 0; i < count; i++) {
    let index = Math.floor(rng() * n);
    if (index >= n) index = n - 1;
    if (index < 0) index = 0;
    const stat = statIds[index]!;
    into[stat] = (into[stat] ?? 0) + 1;
  }
}

function zeroedPoints<TStat extends string>(statIds: readonly TStat[]): Record<TStat, number> {
  const points = {} as Record<TStat, number>;
  for (const stat of statIds) points[stat] = 0;
  return points;
}

/**
 * Roll a fresh wild creature at `level`: distribute `(level - 1)` points randomly across the
 * species' stats using the injected rng and return a serializable {@link CreatureStatInstance}.
 * Deterministic — the same rng sequence yields the same point spread. Levels below 1 clamp to 1
 * (no points). Use `seededRng` from `../random/rng` for a persisted, reproducible stream.
 *
 * @capability spawn-level-roll distribute a wild creature's spawn level into random per-stat points
 */
export function rollSpawnInstance<TStat extends string>(
  speciesId: string,
  species: SpawnSpeciesDef<TStat>,
  level: number,
  rng: () => number,
): CreatureStatInstance<TStat> {
  const statIds = Object.keys(species) as TStat[];
  const points = zeroedPoints(statIds);
  const normalized = normalizeLevel(level);
  distributePoints(statIds, normalized - 1, rng, points);
  return { speciesId, level: normalized, points, domesticLevels: 0 };
}

/**
 * Resolve an instance's live stat values from its distributed points:
 * `value = base * (1 + points * growth)` per stat. Stats with zero points return their base.
 *
 * @capability spawn-stat-values resolve a creature's per-stat values from its distributed points
 */
export function resolveSpawnStats<TStat extends string>(
  species: SpawnSpeciesDef<TStat>,
  instance: CreatureStatInstance<TStat>,
): Record<TStat, number> {
  const out = {} as Record<TStat, number>;
  for (const stat of Object.keys(species) as TStat[]) {
    const def = species[stat];
    const pts = instance.points[stat] ?? 0;
    out[stat] = def.base * (1 + pts * def.growth);
  }
  return out;
}

/**
 * Bonus levels granted by a capture at the given effectiveness:
 * `floor(level * clamp01(effectiveness) / 2)`. A perfect (1.0) capture grants half the wild
 * level; a botched (0) capture grants none. Effectiveness outside `[0,1]` clamps.
 *
 * @capability capture-bonus-levels convert wild level and capture effectiveness into bonus levels
 */
export function captureBonusLevels(level: number, effectiveness: number): number {
  return Math.floor((normalizeLevel(level) * clamp01(effectiveness)) / 2);
}

/**
 * Apply a capture at the given effectiveness: compute bonus levels via {@link captureBonusLevels},
 * distribute those extra points randomly with the injected rng, and return the post-capture
 * instance (level raised to the tamed total) alongside the granted bonus levels and tamed level.
 * The input instance is not mutated.
 *
 * @capability capture-effectiveness-tame apply capture effectiveness to grant and distribute bonus levels
 */
export function applyCaptureEffectiveness<TStat extends string>(
  species: SpawnSpeciesDef<TStat>,
  instance: CreatureStatInstance<TStat>,
  effectiveness: number,
  rng: () => number,
): CaptureResult<TStat> {
  const bonusLevels = captureBonusLevels(instance.level, effectiveness);
  const statIds = Object.keys(species) as TStat[];
  const points = { ...instance.points };
  distributePoints(statIds, bonusLevels, rng, points);
  const tamedLevel = instance.level + bonusLevels;
  return {
    bonusLevels,
    tamedLevel,
    instance: { ...instance, level: tamedLevel, points },
  };
}

/**
 * Spend one earned post-capture level into `stat`, adding a single growth increment (one point)
 * and raising both `level` and `domesticLevels`. When `maxDomesticLevels` is set and already
 * reached, the spend is refused (`spent: false`) and the instance is returned untouched. Pure:
 * returns a new instance rather than mutating the input.
 *
 * @capability domestic-level-spend spend an earned post-capture level into a chosen stat under a cap
 */
export function spendDomesticLevel<TStat extends string>(
  instance: CreatureStatInstance<TStat>,
  stat: TStat,
  options?: SpendLevelOptions,
): SpendLevelResult<TStat> {
  const cap = options?.maxDomesticLevels;
  if (cap !== undefined && instance.domesticLevels >= cap) {
    return { instance, spent: false };
  }
  const points = { ...instance.points };
  points[stat] = (points[stat] ?? 0) + 1;
  return {
    instance: {
      ...instance,
      points,
      level: instance.level + 1,
      domesticLevels: instance.domesticLevels + 1,
    },
    spent: true,
  };
}

/**
 * Deep-copy an instance into a detached, serializable record — the transport/save counterpart of
 * {@link restoreSpawnInstance}. Copies the points map so later edits don't leak into the snapshot.
 *
 * @capability spawn-instance-snapshot deep-copy a creature stat instance into a serializable record
 */
export function snapshotSpawnInstance<TStat extends string>(
  instance: CreatureStatInstance<TStat>,
): CreatureStatInstance<TStat> {
  return {
    speciesId: instance.speciesId,
    level: instance.level,
    domesticLevels: instance.domesticLevels,
    points: { ...instance.points },
  };
}

/**
 * Rehydrate a creature stat instance from decoded data (e.g. `JSON.parse` output), returning a
 * fresh deep copy the caller owns. Inverse of {@link snapshotSpawnInstance}.
 *
 * @capability spawn-instance-restore rehydrate a creature stat instance from decoded snapshot data
 */
export function restoreSpawnInstance<TStat extends string>(
  data: CreatureStatInstance<TStat>,
): CreatureStatInstance<TStat> {
  return snapshotSpawnInstance(data);
}
