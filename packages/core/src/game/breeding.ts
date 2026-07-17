/**
 * Deterministic creature breeding & genetics — a genre-agnostic engine primitive for
 * taming/husbandry games. Everything here operates over plain serializable records so a
 * genome round-trips through save/load and multiplayer sync, and every random decision is
 * driven by an injected `rng: () => number` (values in `[0, 1)`) so identical inputs and an
 * identical rng stream always produce the identical offspring.
 *
 * The lifecycle it models:
 *  - **inheritance** — each stat is drawn independently from the higher or lower parent,
 *  - **mutation** — a bounded number of rolls that boost a stat, bump a heritable lineage
 *    counter, and optionally flag a cosmetic/color mutation, gated by a soft cap,
 *  - **imprint** — a rearing bonus accrued by fulfilling care requests over maturation,
 *  - **incubation & maturation** — temperature-gated gestation viability and stage resolution.
 *
 * No species tables, coordinates, or game content live here; callers supply their own stat
 * ids and tuning.
 */

/** A stat block: stat id → numeric point value. Plain serializable record, no ordering assumed. */
export type StatBlock = Record<string, number>;

/**
 * A creature's heritable genome. `stats` are the inherited/mutated point values;
 * `mutationCount` and `colorMutationCount` are the lineage counters that carry across
 * generations and drive the mutation soft cap. Fully serializable — no methods or closures.
 */
export interface Genome {
  stats: StatBlock;
  /** Accumulated point mutations in this creature's lineage. Heritable, monotonic. */
  mutationCount: number;
  /** Accumulated cosmetic/color mutations in this creature's lineage. Heritable, monotonic. */
  colorMutationCount: number;
}

/** One mutation that occurred while breeding a single offspring. */
export interface MutationEvent {
  /** Stat id that received the point delta. */
  stat: string;
  /** Points added to that stat (the configured `mutationDelta`). */
  delta: number;
  /** True when this mutation was also flagged cosmetic/color. */
  color: boolean;
}

/**
 * Soft-cap rule for mutation eligibility. When a parent's `mutationCount` exceeds
 * `threshold` its lineage is considered "capped"; the per-roll mutation chance is then
 * either zeroed (`mode: "block"`) or scaled by `reducedFactor` (`mode: "reduce"`).
 * `scope` decides whether it takes `both` parents capped, or `either` one, to trigger.
 */
export interface MutationSoftCap {
  /** Counter value a parent must exceed to count as capped. Default `20`. */
  threshold?: number;
  /** Trigger when `both` parents are capped (default) or `either` one is. */
  scope?: "both" | "either";
  /** Zero the chance (`block`, default) or scale it by `reducedFactor` (`reduce`). */
  mode?: "block" | "reduce";
  /** Multiplier applied to the base chance when `mode: "reduce"` and capped. Default `0.5`. */
  reducedFactor?: number;
}

/** Tuning for {@link breedOffspring}. Every field has an ARK-style default; all are optional. */
export interface BreedConfig {
  /** Per-stat probability the offspring inherits the higher parent's value. Default `0.55`. */
  higherStatChance?: number;
  /** Number of independent mutation rolls per offspring. Default `3`. */
  mutationRolls?: number;
  /** Probability each mutation roll succeeds (before the soft cap). Default `0.025`. */
  mutationChance?: number;
  /** Points added to a random stat by a successful mutation. Default `2`. */
  mutationDelta?: number;
  /** Probability a successful mutation is additionally flagged cosmetic. Default `0.5`. */
  colorMutationChance?: number;
  /** Mutation-count soft cap rule. Defaults to `{ threshold: 20, scope: "both", mode: "block" }`. */
  mutationSoftCap?: MutationSoftCap;
}

/** Result of {@link breedOffspring}: the new genome plus the mutations that produced it. */
export interface BreedResult {
  genome: Genome;
  mutations: readonly MutationEvent[];
}

const DEFAULT_HIGHER_STAT_CHANCE = 0.55;
const DEFAULT_MUTATION_ROLLS = 3;
const DEFAULT_MUTATION_CHANCE = 0.025;
const DEFAULT_MUTATION_DELTA = 2;
const DEFAULT_COLOR_MUTATION_CHANCE = 0.5;
const DEFAULT_SOFT_CAP_THRESHOLD = 20;
const DEFAULT_REDUCED_FACTOR = 0.5;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Per-roll mutation chance after applying the soft cap to both parents. Exposed so callers
 * and tests can inspect the exact gating rule without breeding.
 *
 * @internal
 */
function effectiveMutationChance(a: Genome, b: Genome, config: BreedConfig): number {
  const base = config.mutationChance ?? DEFAULT_MUTATION_CHANCE;
  const cap = config.mutationSoftCap;
  const threshold = cap?.threshold ?? DEFAULT_SOFT_CAP_THRESHOLD;
  const scope = cap?.scope ?? "both";
  const mode = cap?.mode ?? "block";
  const aOver = a.mutationCount > threshold;
  const bOver = b.mutationCount > threshold;
  const capped = scope === "both" ? aOver && bOver : aOver || bOver;
  if (!capped) return base;
  return mode === "reduce" ? base * (cap?.reducedFactor ?? DEFAULT_REDUCED_FACTOR) : 0;
}

/**
 * Breed one offspring from two parents. For each stat present in either parent (iterated in
 * sorted id order for a stable rng stream) the offspring independently inherits the higher
 * parent's value with probability `higherStatChance` (default `0.55`), else the lower — a
 * per-stat coin flip, so a strong parent does not guarantee a strong child. Then up to
 * `mutationRolls` mutation rolls fire at the soft-capped chance; each success adds
 * `mutationDelta` to a random stat, bumps the heritable `mutationCount`, and is flagged
 * cosmetic with probability `colorMutationChance`. Lineage counters carry as the max of the
 * two parents plus the new mutations, keeping them monotonic and heritable.
 *
 * Deterministic: the same parents, config, and rng sequence yield byte-identical results.
 *
 * @capability creature-breeding deterministic stat inheritance, mutation, and lineage genetics for taming games
 */
export function breedOffspring(
  parentA: Genome,
  parentB: Genome,
  rng: () => number,
  config: BreedConfig = {},
): BreedResult {
  const higherChance = config.higherStatChance ?? DEFAULT_HIGHER_STAT_CHANCE;
  const rolls = Math.max(0, Math.floor(config.mutationRolls ?? DEFAULT_MUTATION_ROLLS));
  const delta = config.mutationDelta ?? DEFAULT_MUTATION_DELTA;
  const colorChance = config.colorMutationChance ?? DEFAULT_COLOR_MUTATION_CHANCE;

  // Stable union of stat ids so the rng stream does not depend on object key order.
  const statIds = Array.from(new Set([...Object.keys(parentA.stats), ...Object.keys(parentB.stats)])).sort();

  const stats: StatBlock = {};
  for (const id of statIds) {
    const av = parentA.stats[id];
    const bv = parentB.stats[id];
    // A stat missing on one side behaves as if both parents shared the present value:
    // one rng draw is still consumed so adding a stat to a parent cannot shift the stream.
    const present = av ?? bv ?? 0;
    const high = av === undefined || bv === undefined ? present : Math.max(av, bv);
    const low = av === undefined || bv === undefined ? present : Math.min(av, bv);
    stats[id] = rng() < higherChance ? high : low;
  }

  const chance = effectiveMutationChance(parentA, parentB, config);
  const mutations: MutationEvent[] = [];
  let newMutations = 0;
  let newColor = 0;

  for (let i = 0; i < rolls; i++) {
    if (rng() >= chance) continue;
    newMutations += 1;
    let stat = "";
    if (statIds.length > 0) {
      const index = Math.min(statIds.length - 1, Math.floor(rng() * statIds.length));
      stat = statIds[index]!;
      stats[stat] = (stats[stat] ?? 0) + delta;
    }
    const color = rng() < colorChance;
    if (color) newColor += 1;
    mutations.push({ stat, delta: stat === "" ? 0 : delta, color });
  }

  const genome: Genome = {
    stats,
    mutationCount: Math.max(parentA.mutationCount, parentB.mutationCount) + newMutations,
    colorMutationCount: Math.max(parentA.colorMutationCount, parentB.colorMutationCount) + newColor,
  };

  return { genome, mutations };
}

/** Options controlling how an imprint bonus is applied. */
export interface ImprintBonusConfig {
  /** Stat multiplier at full imprint, applied to everyone. Default `0.20` (+20%). */
  statBonusAtFull?: number;
  /** Extra multiplier at full imprint, applied only for the imprinting owner. Default `0.30` (+30%). */
  handlerBonusAtFull?: number;
}

const DEFAULT_STAT_BONUS = 0.2;
const DEFAULT_HANDLER_BONUS = 0.3;

/**
 * Imprint gained per fulfilled care request when `requestCount` requests are scheduled over
 * the maturation window: `1 / requestCount`, so fulfilling every request reaches full (1.0)
 * imprint. Returns `0` for a non-positive request count.
 *
 * @capability imprint-increment per-care-request imprint gain across a maturation schedule
 */
export function imprintIncrementPerRequest(requestCount: number): number {
  return requestCount > 0 ? 1 / requestCount : 0;
}

/**
 * Apply the imprint rearing bonus to a stat block. Every stat is scaled by
 * `1 + statBonusAtFull * imprint`; when `asOwner` is set, the imprinting handler additionally
 * gets `1 + handlerBonusAtFull * imprint`. `imprint` is a 0..1 fraction (clamped) and scales
 * both bonuses linearly, so half-imprint yields half the bonus. Returns a fresh stat block.
 *
 * @capability imprint-bonus apply imprint stat and handler bonuses at an imprint fraction
 */
export function applyImprintBonus(
  stats: StatBlock,
  imprint: number,
  config: ImprintBonusConfig = {},
  options: { asOwner?: boolean } = {},
): StatBlock {
  const fraction = clamp01(imprint);
  const statBonus = config.statBonusAtFull ?? DEFAULT_STAT_BONUS;
  const handlerBonus = config.handlerBonusAtFull ?? DEFAULT_HANDLER_BONUS;
  let multiplier = 1 + statBonus * fraction;
  if (options.asOwner) multiplier *= 1 + handlerBonus * fraction;
  const out: StatBlock = {};
  for (const id of Object.keys(stats)) out[id] = stats[id]! * multiplier;
  return out;
}

/** Serializable incubation/gestation state advanced by {@link tickIncubation}. */
export interface IncubationState {
  /** Remaining egg/embryo health; incubation fails at `0`. */
  health: number;
  /** Accumulated in-range incubation time; only advances while temperature is viable. */
  elapsed: number;
}

/** Temperature gate for {@link tickIncubation}. */
export interface IncubationConfig {
  minTemp: number;
  maxTemp: number;
  /** Health lost per unit `dt` while temperature is outside `[minTemp, maxTemp]`. Default `1`. */
  healthLossPerTick?: number;
}

/**
 * Advance incubation one tick. While `temperature` is within `[minTemp, maxTemp]` the embryo
 * makes progress (`elapsed += dt`) and keeps its health; outside the range it makes no
 * progress and loses `healthLossPerTick * dt` health (clamped at `0`). Pure — returns a new
 * state, never mutates the input.
 *
 * @capability incubation-tick advance egg incubation health inside/outside its temperature range
 */
export function tickIncubation(
  state: IncubationState,
  temperature: number,
  dt: number,
  config: IncubationConfig,
): IncubationState {
  if (dt <= 0) return { health: state.health, elapsed: state.elapsed };
  const inRange = temperature >= config.minTemp && temperature <= config.maxTemp;
  if (inRange) return { health: state.health, elapsed: state.elapsed + dt };
  const loss = (config.healthLossPerTick ?? 1) * dt;
  return { health: Math.max(0, state.health - loss), elapsed: state.elapsed };
}

/**
 * True while the incubation still has health to hatch.
 *
 * @capability incubation-viability test whether an egg incubation still has health to hatch
 */
export function incubationViable(state: IncubationState): boolean {
  return state.health > 0;
}

/** A maturation stage keyed by the elapsed fraction (0..1) at which it begins. */
export interface MaturationStage {
  id: string;
  /** Fraction of the maturation duration at which this stage starts (inclusive). */
  at: number;
}

/**
 * Resolve the maturation stage for an elapsed time against a duration. Computes the clamped
 * `elapsed / duration` fraction and returns the id of the last stage whose `at` threshold has
 * been reached (boundaries inclusive). Stages need not be pre-sorted. Returns `""` when no
 * stage qualifies (e.g. an empty list or all thresholds above the current fraction).
 *
 * @capability maturation-stage resolve the baby/juvenile/adolescent/adult stage from elapsed maturation
 */
export function maturationStage(
  elapsed: number,
  duration: number,
  stages: readonly MaturationStage[],
): string {
  const fraction = duration > 0 ? clamp01(elapsed / duration) : 1;
  let bestId = "";
  let bestAt = -Infinity;
  for (const stage of stages) {
    if (stage.at <= fraction && stage.at >= bestAt) {
      bestAt = stage.at;
      bestId = stage.id;
    }
  }
  return bestId;
}
