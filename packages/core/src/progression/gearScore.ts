import { lootStatContributions, type LootComparisonOptions } from "../loot/lootGen";

/** The least a worn item must expose to be scored: its stat block, plus optional level and rarity for the gear-score terms. */
export interface GearSlotItem {
  stats: Readonly<Record<string, number>>;
  /** Item level, added as `levelWeight × level` when the option is set. */
  level?: number;
  /** Rarity id, looked up in `rarityScore` when the option names one. */
  rarity?: string;
}

/** Caller policy for a loadout score: stat weights, which stats read better small, and what level, rarity and an empty slot are worth. */
export interface GearScoreOptions extends Pick<LootComparisonOptions, "weights" | "lowerIsBetter"> {
  /** Points added per item level (default `0`, so level is ignored). */
  levelWeight?: number;
  /** Points added per rarity id (default none). */
  rarityScore?: Readonly<Record<string, number>>;
  /** Slot ids a complete loadout fills; named slots that are empty are reported and penalized. */
  expectedSlots?: readonly string[];
  /** Points removed per empty slot (default `0`). */
  emptySlotPenalty?: number;
}

/** A scored loadout: the total, each slot's share, each stat's signed contribution, and how complete it is. */
export interface GearScore {
  /** `Σ slotScore - emptySlotPenalty × emptySlots`. */
  score: number;
  /** Score per filled slot id. */
  bySlot: Readonly<Record<string, number>>;
  /** Signed weighted contribution per stat, summed across items. */
  byStat: Readonly<Record<string, number>>;
  /** Number of filled slots. */
  items: number;
  /** `score / items`, or `0` for an empty loadout. */
  average: number;
  /** Filled slots over expected slots, `1` when no slots are expected. */
  coverage: number;
  /** Expected slot ids with no item. */
  emptySlots: readonly string[];
}

/**
 * Score a whole loadout with one documented formula:
 *
 * `slotScore = Σ_stat value × weight × (lowerIsBetter ? -1 : 1) + levelWeight × level + rarityScore[rarity]`
 *
 * `score = Σ slotScore - emptySlotPenalty × emptySlots`, and `byStat` sums the stat term alone. The
 * stat term is `scoreLootStats`, the same weight policy `compareLootItems` uses, so an item swap and
 * a loadout total agree. Ties are exact; nothing here reads a clock or RNG.
 *
 * @capability gear-score score a loadout from stat weights, level, rarity and slot coverage
 */
export function gearScore(
  set: Readonly<Record<string, GearSlotItem | null | undefined>>,
  options: GearScoreOptions = {},
): GearScore {
  const bySlot: Record<string, number> = {};
  const byStat: Record<string, number> = {};
  const levelWeight = options.levelWeight ?? 0;
  const rarityScores = options.rarityScore ?? {};
  const emptySlotPenalty = options.emptySlotPenalty ?? 0;
  let total = 0;
  let items = 0;

  for (const slot of Object.keys(set).sort()) {
    const item = set[slot];
    if (item === null || item === undefined) continue;
    let slotScore = 0;
    const contributions = lootStatContributions(item.stats, options);
    for (const stat of Object.keys(contributions)) {
      const contribution = contributions[stat];
      slotScore += contribution;
      byStat[stat] = (byStat[stat] ?? 0) + contribution;
    }
    if (levelWeight !== 0 && item.level !== undefined) slotScore += levelWeight * item.level;
    if (item.rarity !== undefined) slotScore += rarityScores[item.rarity] ?? 0;
    bySlot[slot] = slotScore;
    total += slotScore;
    items += 1;
  }

  const expected = options.expectedSlots ?? [];
  const emptySlots = expected.filter((slot) => set[slot] === null || set[slot] === undefined);
  total -= emptySlotPenalty * emptySlots.length;

  return {
    score: total,
    bySlot,
    byStat,
    items,
    average: items === 0 ? 0 : total / items,
    coverage: expected.length === 0 ? 1 : (expected.length - emptySlots.length) / expected.length,
    emptySlots,
  };
}

/** Compare two loadouts; negative means `a` scores lower. */
export function compareGearSets(
  a: Readonly<Record<string, GearSlotItem | null | undefined>>,
  b: Readonly<Record<string, GearSlotItem | null | undefined>>,
  options: GearScoreOptions = {},
): { a: GearScore; b: GearScore; delta: number; better: "a" | "b" | "equal" } {
  const scoreA = gearScore(a, options);
  const scoreB = gearScore(b, options);
  const delta = scoreB.score - scoreA.score;
  return { a: scoreA, b: scoreB, delta, better: delta === 0 ? "equal" : delta > 0 ? "b" : "a" };
}
