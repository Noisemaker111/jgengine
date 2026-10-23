import {
  compareLootItems,
  rollLoot,
  type LootCatalog,
  type LootComparisonOptions,
  type LootItem,
  type LootRollOptions,
  type LootStatDelta,
} from "../loot/lootGen";
import { seededRng } from "../random/rng";

/** A rolled item with a stable instance id, so a stash, ledger and vendor stock can name it. */
export interface ItemDrop extends LootItem {
  id: string;
}

/** {@link rollDrop} options: the loot roll plus the instance id (defaults to `drop:<seed>`). */
export interface RollDropOptions extends LootRollOptions {
  id?: string;
}

/**
 * Roll one item from a seed. Same seed, catalog and options produce the same id, name, affixes,
 * stats and mass on every run; level gates which bases and affixes are in the pool.
 *
 * @capability item-roll roll one deterministic, level-gated item from a seed
 */
export function rollDrop(catalog: LootCatalog, seed: string | number, options: RollDropOptions = {}): ItemDrop {
  const item = rollLoot(catalog, seededRng(seed), options);
  return { ...item, id: options.id ?? `drop:${String(seed)}` };
}

/** A per-stat delta from the equipped item to the candidate; positive `delta` means the candidate is larger. */
export interface EquippedStatDelta extends LootStatDelta {
  /** Whether this stat reads better on the candidate, following `lowerIsBetter`. */
  better: "candidate" | "equipped" | "equal";
}

/** What a HUD renders when a drop lands: per-stat deltas against the worn item and one verdict. */
export interface EquippedComparison {
  candidateId: string;
  equippedId: string | null;
  deltas: readonly EquippedStatDelta[];
  scoreCandidate: number;
  scoreEquipped: number;
  /** `scoreCandidate - scoreEquipped`. */
  scoreDelta: number;
  better: "candidate" | "equipped" | "equal";
}

const NO_ITEM: LootItem = {
  baseId: "none",
  manufacturer: "none",
  rarity: "none",
  level: 0,
  name: "",
  parts: [],
  affixes: [],
  stats: {},
  mass: 0,
};

/**
 * Compare a dropped item against what is equipped, with one delta per stat and a weighted verdict.
 * The delta is `candidate - equipped`; `better` flips for stats the caller lists in
 * `lowerIsBetter`, so reload time improving does not read as worse. A missing equipped item
 * compares against zeros.
 *
 * @capability item-comparison show per-stat deltas and a weighted verdict for a drop against equipped gear
 */
export function compareToEquipped(
  candidate: ItemDrop,
  equipped: ItemDrop | null,
  options: LootComparisonOptions = {},
): EquippedComparison {
  const base = equipped ?? NO_ITEM;
  const comparison = compareLootItems(base, candidate, options);
  const lower = new Set(options.lowerIsBetter ?? []);
  const deltas: EquippedStatDelta[] = comparison.deltas.map((entry) => ({
    ...entry,
    better: entry.delta === 0 ? "equal" : (entry.delta > 0) !== lower.has(entry.stat) ? "candidate" : "equipped",
  }));
  return {
    candidateId: candidate.id,
    equippedId: equipped?.id ?? null,
    deltas,
    scoreCandidate: comparison.scoreB,
    scoreEquipped: comparison.scoreA,
    scoreDelta: comparison.scoreDelta,
    better: comparison.better === "b" ? "candidate" : comparison.better === "a" ? "equipped" : "equal",
  };
}

/**
 * Carried mass of a rolled item. Older saves may predate `mass`; those default to `1`.
 *
 * @capability item-weight read a rolled item's mass for a carry check
 */
export function itemMass(item: Pick<LootItem, "mass">): number {
  return item.mass !== undefined && Number.isFinite(item.mass) && item.mass > 0 ? item.mass : 1;
}
