import { devtools } from "../devtools/devtools";
import type { AffixPool, ItemBaseDef, RarityTier, RolledAffix } from "../item/affix";
import { slotAccepts, type MountSlotDef, type PartDef } from "../item/modularItem";
import { pickWeighted } from "../random/pick";

/** Cap on affixes one item may roll, so a bad catalog cannot make a drop cost unbounded work. */
export const MAX_LOOT_AFFIXES = 8;

/** A part a base can mount: its stats, a pick weight, and an optional word for the item name. */
export interface LootPartDef extends PartDef {
  /** Relative pick weight among parts eligible for the same slot (default `1`). */
  weight?: number;
  /** Word this part adds to the generated name, e.g. `"Riveted"`. */
  namePart?: string;
}

/** A base family (frame, housing, chassis — caller nouns) with its slots, stats and affix pools. */
export interface LootBaseDef extends ItemBaseDef {
  /** Relative pick weight among bases a manufacturer can produce (default `1`). */
  weight?: number;
  /** Lowest item level a roll may pick this base at; omitted means every level. */
  minLevel?: number;
  /** Mass at item level 1 in the caller's weight unit (default `1`); grows 10% per level. */
  mass?: number;
  /** Free-form tags for caller filters and UI. */
  tags?: readonly string[];
  /** Mount slots a roll fills; every declared slot receives one part. */
  slots?: readonly MountSlotDef[];
}

/**
 * A maker with a stat personality: its mark goes in the name, `bias` shifts stats additively,
 * `scale` multiplies them, and favored affix pools weigh more when this maker rolls the item.
 */
export interface LootManufacturerDef {
  id: string;
  /** The maker's mark as it reads in the item name. */
  name: string;
  /** Relative pick weight among manufacturers (default `1`). */
  weight?: number;
  /** Base ids this maker produces; omitted means every base. */
  bases?: readonly string[];
  /** Flat stat shifts applied after level scaling and rarity scaling. */
  bias?: Readonly<Record<string, number>>;
  /** Per-stat multipliers applied after `bias`. */
  scale?: Readonly<Record<string, number>>;
  /** Affix pool ids this maker favors. */
  favoredPools?: readonly string[];
  /** Weight multiplier for an affix from a favored pool (default `3`). */
  favoredWeight?: number;
}

/** Everything a roll reads: bases, parts, affixes, rarity odds, makers and the level curve. */
export interface LootCatalog {
  bases: readonly LootBaseDef[];
  parts: readonly LootPartDef[];
  pools: readonly AffixPool[];
  rarities: readonly RarityTier[];
  manufacturers: readonly LootManufacturerDef[];
  /** `[level, multiplier]` points, linearly interpolated and clamped; omitted means no level scaling. */
  levelScale?: readonly (readonly [number, number])[];
}

/** One part occupying one slot of a rolled item. */
export interface LootInstalledPart {
  slotId: string;
  partId: string;
  category: string;
}

/**
 * One rolled item: the base, maker, rarity, level, composed name, chosen parts, rolled affixes and
 * resolved stats. Plain JSON, so a save stores it and the instance registry can key it.
 */
export interface LootItem {
  /** Base definition id; also the registry `baseId` a generated drop is stored under. */
  baseId: string;
  manufacturer: string;
  rarity: string;
  level: number;
  name: string;
  parts: readonly LootInstalledPart[];
  affixes: readonly RolledAffix[];
  stats: Readonly<Record<string, number>>;
  /** Carried mass from the base def at this level; absent on saves made before mass existed. */
  mass?: number;
}

/** Pin any part of a roll; omitted fields are drawn from the catalog. */
export interface LootRollOptions {
  /** Item level, integer `>= 1` (default `1`). */
  level?: number;
  baseId?: string;
  manufacturer?: string;
  rarity?: string;
}

/** A defect found by {@link validateLootItem}. */
export type LootIssueCode =
  | "invalid-level"
  | "unknown-base"
  | "level-gated-base"
  | "unknown-manufacturer"
  | "manufacturer-base"
  | "unknown-rarity"
  | "duplicate-slot"
  | "unknown-slot"
  | "missing-slot-part"
  | "unknown-part"
  | "part-category"
  | "unknown-affix"
  | "duplicate-affix"
  | "invalid-affix"
  | "non-finite-stat"
  | "invalid-mass"
  | "empty-name";

/** One reason a rolled item is not legal against its catalog, with the offending value named. */
export interface LootValidationIssue {
  code: LootIssueCode;
  detail: string;
}

/** A per-stat comparison entry; `delta` is `b - a`, so positive means the second item is larger. */
export interface LootStatDelta {
  stat: string;
  a: number;
  b: number;
  delta: number;
}

/** How two items compare: every stat delta plus one weighted score for each. */
export interface LootComparison {
  /** Union of both items' stats, sorted by stat id. Missing stats count as `0`. */
  deltas: readonly LootStatDelta[];
  scoreA: number;
  scoreB: number;
  /** `scoreB - scoreA`. */
  scoreDelta: number;
  better: "a" | "b" | "equal";
}

/** Caller policy for the comparison score. */
export interface LootComparisonOptions {
  /** Weight per stat in the score (default `1` each). */
  weights?: Readonly<Record<string, number>>;
  /** Stats where a smaller number is better, e.g. reload time; flips their score sign. */
  lowerIsBetter?: readonly string[];
  /** Score difference under which the items count as equal (default `1e-9`). */
  tolerance?: number;
}

/** Saved counters of a {@link LootRoller}. */
export interface LootRollerState {
  rolls: number;
  byRarity: Readonly<Record<string, number>>;
}

/** Options for {@link createLootRoller}. */
export interface LootRollerOptions {
  /** Register a devtools probe under this name reporting roll counts per rarity. */
  devtoolsName?: string;
}

/**
 * A roll counter over one catalog: every roll goes through {@link rollLoot}, and the handle keeps
 * counters (a distribution readout in the debug overlay) that snapshot and restore as plain data.
 */
export interface LootRoller {
  roll(rng: () => number, options?: LootRollOptions): LootItem;
  stats(): LootRollerState;
  snapshot(): LootRollerState;
  /** Replace counters; returns false without mutation when the state is malformed. */
  restore(next: LootRollerState): boolean;
  reset(): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

/** Check a catalog before rolling; throws `RangeError` naming the offending entry. */
export function assertLootCatalog(catalog: LootCatalog): void {
  check(catalog.bases.length > 0, 'Loot catalog field "bases" must not be empty');
  check(catalog.rarities.length > 0, 'Loot catalog field "rarities" must not be empty');

  const baseIds = new Set<string>();
  for (const base of catalog.bases) {
    check(base.id.trim() !== "", 'Loot base field "id" must not be empty');
    check(!baseIds.has(base.id), `Loot base "${base.id}" is declared twice`);
    baseIds.add(base.id);
    if (base.weight !== undefined) check(base.weight > 0, `Loot base "${base.id}" weight must be positive`);
    if (base.minLevel !== undefined) check(Number.isInteger(base.minLevel) && base.minLevel >= 1, `Loot base "${base.id}" minLevel must be an integer >= 1`);
    if (base.mass !== undefined) check(Number.isFinite(base.mass) && base.mass > 0, `Loot base "${base.id}" mass must be positive`);
  }

  const poolIds = new Set<string>();
  const affixIds = new Set<string>();
  for (const pool of catalog.pools) {
    check(pool.id.trim() !== "", 'Loot affix pool field "id" must not be empty');
    check(!poolIds.has(pool.id), `Loot affix pool "${pool.id}" is declared twice`);
    poolIds.add(pool.id);
    for (const affix of pool.affixes) {
      check(!affixIds.has(affix.id), `Loot affix "${affix.id}" is declared twice`);
      affixIds.add(affix.id);
      check(affix.weight > 0, `Loot affix "${affix.id}" weight must be positive`);
      if (affix.minLevel !== undefined) check(Number.isInteger(affix.minLevel) && affix.minLevel >= 1, `Loot affix "${affix.id}" minLevel must be an integer >= 1`);
      if (typeof affix.roll === "number") {
        check(Number.isFinite(affix.roll), `Loot affix "${affix.id}" roll must be finite`);
        if (affix.op === "mul") check(affix.roll > 0, `Loot affix "${affix.id}" multiplicative roll must be positive`);
      } else {
        const [min, max] = affix.roll;
        check(Number.isFinite(min) && Number.isFinite(max), `Loot affix "${affix.id}" roll range must be finite`);
        check(min <= max, `Loot affix "${affix.id}" roll range must ascend`);
        if (affix.op === "mul") check(min > 0, `Loot affix "${affix.id}" multiplicative roll must be positive`);
      }
    }
  }

  const partIds = new Set<string>();
  for (const part of catalog.parts) {
    check(part.id.trim() !== "", 'Loot part field "id" must not be empty');
    check(!partIds.has(part.id), `Loot part "${part.id}" is declared twice`);
    partIds.add(part.id);
    if (part.weight !== undefined) check(part.weight > 0, `Loot part "${part.id}" weight must be positive`);
  }

  const rarityIds = new Set<string>();
  for (const rarity of catalog.rarities) {
    check(rarity.id.trim() !== "", 'Loot rarity field "id" must not be empty');
    check(!rarityIds.has(rarity.id), `Loot rarity "${rarity.id}" is declared twice`);
    rarityIds.add(rarity.id);
    check(rarity.weight > 0, `Loot rarity "${rarity.id}" weight must be positive`);
    const [min, max] = typeof rarity.affixCount === "number"
      ? [rarity.affixCount, rarity.affixCount]
      : rarity.affixCount;
    check(Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min, `Loot rarity "${rarity.id}" affixCount must be an ascending integer range`);
    if (rarity.pools !== undefined) {
      for (const id of rarity.pools) check(poolIds.has(id), `Loot rarity "${rarity.id}" names unknown pool "${id}"`);
    }
    if (rarity.statScale !== undefined) check(rarity.statScale > 0, `Loot rarity "${rarity.id}" statScale must be positive`);
  }

  for (const base of catalog.bases) {
    for (const poolId of base.pools) {
      check(poolIds.has(poolId), `Loot base "${base.id}" names unknown affix pool "${poolId}"`);
    }
    for (const slot of base.slots ?? []) {
      const eligible = catalog.parts.some((part) => slotAccepts(slot, part.category));
      check(eligible, `Loot base "${base.id}" slot "${slot.id}" accepts no part category (${String(slot.accepts)})`);
    }
  }

  const makerIds = new Set<string>();
  for (const manufacturer of catalog.manufacturers) {
    check(manufacturer.id.trim() !== "", 'Loot manufacturer field "id" must not be empty');
    check(manufacturer.name.trim() !== "", `Loot manufacturer "${manufacturer.id}" must have a name`);
    check(!makerIds.has(manufacturer.id), `Loot manufacturer "${manufacturer.id}" is declared twice`);
    makerIds.add(manufacturer.id);
    if (manufacturer.weight !== undefined) check(manufacturer.weight > 0, `Loot manufacturer "${manufacturer.id}" weight must be positive`);
    for (const baseId of manufacturer.bases ?? []) {
      check(baseIds.has(baseId), `Loot manufacturer "${manufacturer.id}" names unknown base "${baseId}"`);
    }
    for (const poolId of manufacturer.favoredPools ?? []) {
      check(poolIds.has(poolId), `Loot manufacturer "${manufacturer.id}" names unknown pool "${poolId}"`);
    }
  }

  const points = catalog.levelScale ?? [];
  for (let i = 0; i < points.length; i += 1) {
    const [level, multiplier] = points[i]!;
    check(Number.isInteger(level) && level >= 1, 'Loot catalog levelScale levels must be integers >= 1');
    check(Number.isFinite(multiplier) && multiplier > 0, 'Loot catalog levelScale multipliers must be positive');
    if (i > 0) check(level > points[i - 1]![0], "Loot catalog levelScale levels must ascend");
  }
}

/** Stat multiplier at `level` from the catalog's level curve; `1` when the catalog declares none. */
export function lootLevelScale(catalog: LootCatalog, level: number): number {
  const points = catalog.levelScale ?? [];
  if (points.length === 0) return 1;
  if (level <= points[0]![0]) return points[0]![1];
  const last = points[points.length - 1]!;
  if (level >= last[0]) return last[1];
  for (let i = 1; i < points.length; i += 1) {
    const [hiLevel, hiScale] = points[i]!;
    if (level > hiLevel) continue;
    const [loLevel, loScale] = points[i - 1]!;
    const t = (level - loLevel) / (hiLevel - loLevel);
    return loScale + (hiScale - loScale) * t;
  }
  return last[1];
}

function resolveStatScale(rarity: RarityTier): number {
  return rarity.statScale ?? 1;
}

function rollAffixValue(roll: number | [number, number], op: "add" | "mul", scale: number, rng: () => number): number {
  const raw = typeof roll === "number" ? roll : roll[0] + rng() * (roll[1] - roll[0]);
  return op === "mul" ? raw : raw * scale;
}

function affixCountOf(rarity: RarityTier, rng: () => number): number {
  const [min, max] = typeof rarity.affixCount === "number"
    ? [rarity.affixCount, rarity.affixCount]
    : rarity.affixCount;
  const span = max - min;
  const count = min + (span === 0 ? 0 : Math.floor(rng() * (span + 1)));
  return Math.min(MAX_LOOT_AFFIXES, Math.max(0, count));
}

function findOrThrow<T extends { id: string }>(items: readonly T[], id: string, field: string): T {
  const found = items.find((item) => item.id === id);
  if (found === undefined) throw new RangeError(`Loot ${field} "${id}" is not in the catalog`);
  return found;
}

function weighted<T>(rng: () => number, items: readonly T[], weightOf: (item: T) => number, field: string): T {
  const picked = pickWeighted(rng, items, weightOf);
  if (picked === undefined) throw new Error(`Loot catalog has no eligible ${field}`);
  return picked;
}

function candidateAffixes(
  catalog: LootCatalog,
  base: LootBaseDef,
  rarity: RarityTier,
  level: number,
): { affix: AffixPool["affixes"][number]; poolId: string }[] {
  const out: { affix: AffixPool["affixes"][number]; poolId: string }[] = [];
  for (const poolId of base.pools) {
    if (rarity.pools !== undefined && !rarity.pools.includes(poolId)) continue;
    const pool = catalog.pools.find((entry) => entry.id === poolId);
    if (pool === undefined) continue;
    for (const affix of pool.affixes) {
      if (affix.minLevel !== undefined && affix.minLevel > level) continue;
      out.push({ affix, poolId });
    }
  }
  return out;
}

function composeLootName(
  base: LootBaseDef,
  rarity: RarityTier,
  manufacturer: LootManufacturerDef,
  parts: readonly LootInstalledPart[],
  affixes: readonly RolledAffix[],
  catalog: LootCatalog,
): string {
  const namePartById = new Map<string, { position: "prefix" | "suffix"; text: string }>();
  for (const pool of catalog.pools) {
    for (const affix of pool.affixes) if (affix.namePart !== undefined) namePartById.set(affix.id, affix.namePart);
  }
  const partWord = parts
    .map((installed) => catalog.parts.find((part) => part.id === installed.partId)?.namePart)
    .find((word) => word !== undefined);
  const prefixWord = affixes.map((affix) => namePartById.get(affix.id)).find((part) => part?.position === "prefix")?.text;
  const suffixWord = affixes.map((affix) => namePartById.get(affix.id)).find((part) => part?.position === "suffix")?.text;
  return [manufacturer.name, rarity.namePart, partWord, prefixWord, base.name, suffixWord]
    .filter((word): word is string => word !== undefined && word.trim() !== "")
    .join(" ");
}

/**
 * Roll one item from a catalog: a base and maker, a weighted rarity, one part per slot, rarity-count
 * affixes, level-scaled stats and a name composed from maker, rarity, part, affix words and base.
 * Deterministic for a given `rng`; every field it reads is caller data. Validate a catalog built
 * outside {@link createLootRoller} once with {@link assertLootCatalog} before rolling from it.
 *
 * @capability loot-generation roll a named item from bases, parts, affixes, rarity weights, manufacturer personalities and level scaling
 */
export function rollLoot(catalog: LootCatalog, rng: () => number, options: LootRollOptions = {}): LootItem {
  const level = options.level ?? 1;
  check(Number.isInteger(level) && level >= 1, `Loot item level must be an integer >= 1; got ${String(level)}`);
  const scale = lootLevelScale(catalog, level);

  const manufacturer = options.manufacturer === undefined
    ? weighted(
      rng,
      catalog.manufacturers.filter((maker) => options.baseId === undefined || maker.bases === undefined || maker.bases.includes(options.baseId)),
      (maker) => maker.weight ?? 1,
      "manufacturer",
    )
    : findOrThrow(catalog.manufacturers, options.manufacturer, "manufacturer");

  const basePool = catalog.bases.filter((base) =>
    (base.minLevel === undefined || base.minLevel <= level)
    && (manufacturer.bases === undefined || manufacturer.bases.includes(base.id)),
  );
  const base = options.baseId === undefined
    ? weighted(rng, basePool, (entry) => entry.weight ?? 1, "base")
    : findOrThrow(catalog.bases, options.baseId, "base");
  check(
    manufacturer.bases === undefined || manufacturer.bases.includes(base.id),
    `Loot manufacturer "${manufacturer.id}" does not produce base "${base.id}"`,
  );
  check(
    base.minLevel === undefined || base.minLevel <= level,
    `Loot base "${base.id}" needs item level ${base.minLevel}, got ${level}`,
  );

  const rarity = options.rarity === undefined
    ? weighted(rng, catalog.rarities, (tier) => tier.weight, "rarity")
    : findOrThrow(catalog.rarities, options.rarity, "rarity");

  const parts: LootInstalledPart[] = [];
  for (const slot of base.slots ?? []) {
    const eligible = catalog.parts.filter((part) => slotAccepts(slot, part.category));
    const part = weighted(rng, eligible, (entry) => entry.weight ?? 1, `part for slot "${slot.id}"`);
    parts.push({ slotId: slot.id, partId: part.id, category: part.category });
  }

  const candidates = candidateAffixes(catalog, base, rarity, level);
  const favors = manufacturer.favoredPools ?? [];
  const favorWeight = manufacturer.favoredWeight ?? 3;
  const remaining = candidates.slice();
  const affixes: RolledAffix[] = [];
  const target = affixCountOf(rarity, rng);
  for (let i = 0; i < target && remaining.length > 0; i += 1) {
    const picked = weighted(
      rng,
      remaining,
      (entry) => entry.affix.weight * (favors.includes(entry.poolId) ? favorWeight : 1),
      "affix",
    );
    remaining.splice(remaining.indexOf(picked), 1);
    const op = picked.affix.op ?? "add";
    affixes.push({
      id: picked.affix.id,
      stat: picked.affix.stat,
      op,
      value: rollAffixValue(picked.affix.roll, op, scale, rng),
    });
  }

  const stats: Record<string, number> = {};
  const add = (stat: string, amount: number) => {
    stats[stat] = (stats[stat] ?? 0) + amount;
  };
  const mul = (stat: string, factor: number) => {
    stats[stat] = (stats[stat] ?? 0) * factor;
  };

  const rarityScale = resolveStatScale(rarity);
  for (const [stat, value] of Object.entries(base.baseStats)) add(stat, value * rarityScale * scale);
  for (const installed of parts) {
    const part = catalog.parts.find((entry) => entry.id === installed.partId);
    if (part === undefined) continue;
    for (const [stat, value] of Object.entries(part.stats ?? {})) add(stat, value * scale);
    for (const [stat, factor] of Object.entries(part.multipliers ?? {})) mul(stat, factor);
  }
  for (const [stat, value] of Object.entries(manufacturer.bias ?? {})) add(stat, value * scale);
  for (const [stat, factor] of Object.entries(manufacturer.scale ?? {})) mul(stat, factor);
  for (const affix of affixes) {
    if (affix.op === "mul") mul(affix.stat, affix.value);
    else add(affix.stat, affix.value);
  }
  for (const stat of Object.keys(stats)) stats[stat] = Math.round(stats[stat]! * 1000) / 1000;
  const mass = Math.round((base.mass ?? 1) * (1 + 0.1 * (level - 1)) * 100) / 100;

  return {
    baseId: base.id,
    manufacturer: manufacturer.id,
    rarity: rarity.id,
    level,
    name: composeLootName(base, rarity, manufacturer, parts, affixes, catalog),
    parts,
    affixes,
    stats,
    mass,
  };
}

/**
 * Check one rolled item against its catalog: base, maker and rarity exist, every slot holds an
 * eligible part, affixes belong to the base's pools, stats are finite and the item is named.
 *
 * @capability loot-validation check a rolled item against its catalog and report each defect with its code
 */
export function validateLootItem(item: LootItem, catalog: LootCatalog): LootValidationIssue[] {
  const issues: LootValidationIssue[] = [];
  if (!Number.isInteger(item.level) || item.level < 1) {
    issues.push({ code: "invalid-level", detail: `level ${String(item.level)} is not an integer >= 1` });
  }
  const base = catalog.bases.find((entry) => entry.id === item.baseId);
  if (base === undefined) {
    issues.push({ code: "unknown-base", detail: `base "${item.baseId}" is not in the catalog` });
  } else if (base.minLevel !== undefined && base.minLevel > item.level) {
    issues.push({ code: "level-gated-base", detail: `base "${base.id}" needs item level ${base.minLevel}, got ${item.level}` });
  }
  const manufacturer = catalog.manufacturers.find((entry) => entry.id === item.manufacturer);
  if (manufacturer === undefined) {
    issues.push({ code: "unknown-manufacturer", detail: `manufacturer "${item.manufacturer}" is not in the catalog` });
  } else if (base !== undefined && manufacturer.bases !== undefined && !manufacturer.bases.includes(base.id)) {
    issues.push({ code: "manufacturer-base", detail: `manufacturer "${manufacturer.id}" does not produce "${base.id}"` });
  }
  const rarity = catalog.rarities.find((entry) => entry.id === item.rarity);
  if (rarity === undefined) {
    issues.push({ code: "unknown-rarity", detail: `rarity "${item.rarity}" is not in the catalog` });
  }

  const seenSlots = new Set<string>();
  for (const installed of item.parts) {
    if (seenSlots.has(installed.slotId)) {
      issues.push({ code: "duplicate-slot", detail: `slot "${installed.slotId}" holds more than one part` });
      continue;
    }
    seenSlots.add(installed.slotId);
    const slot = base?.slots?.find((entry) => entry.id === installed.slotId);
    if (base !== undefined && slot === undefined) {
      issues.push({ code: "unknown-slot", detail: `base "${base.id}" has no slot "${installed.slotId}"` });
      continue;
    }
    const part = catalog.parts.find((entry) => entry.id === installed.partId);
    if (part === undefined) {
      issues.push({ code: "unknown-part", detail: `part "${installed.partId}" is not in the catalog` });
      continue;
    }
    if (slot !== undefined && !slotAccepts(slot, part.category)) {
      issues.push({ code: "part-category", detail: `part "${part.id}" (${part.category}) does not fit slot "${slot.id}"` });
    }
  }
  for (const slot of base?.slots ?? []) {
    if (!seenSlots.has(slot.id)) issues.push({ code: "missing-slot-part", detail: `slot "${slot.id}" has no part` });
  }

  const allowed = base === undefined || rarity === undefined ? null : candidateAffixes(catalog, base, rarity, item.level);
  const seenAffixes = new Set<string>();
  for (const affix of item.affixes) {
    if (seenAffixes.has(affix.id)) {
      issues.push({ code: "duplicate-affix", detail: `affix "${affix.id}" is rolled twice` });
      continue;
    }
    seenAffixes.add(affix.id);
    if (allowed !== null && !allowed.some((entry) => entry.affix.id === affix.id)) {
      issues.push({ code: "unknown-affix", detail: `affix "${affix.id}" is not in the pools this base and rarity offer` });
    }
    if (!Number.isFinite(affix.value) || (affix.op === "mul" && affix.value <= 0)) {
      issues.push({ code: "invalid-affix", detail: `affix "${affix.id}" value ${String(affix.value)} is not usable` });
    }
  }

  for (const [stat, value] of Object.entries(item.stats)) {
    if (!Number.isFinite(value)) issues.push({ code: "non-finite-stat", detail: `stat "${stat}" is ${String(value)}` });
  }
  if (item.mass !== undefined && (!Number.isFinite(item.mass) || item.mass <= 0)) {
    issues.push({ code: "invalid-mass", detail: `mass ${String(item.mass)} is not a positive number` });
  }
  if (item.name.trim() === "") issues.push({ code: "empty-name", detail: "item has no name" });

  return issues;
}

/**
 * Per-stat weighted contribution: `value × weight`, negated for stats listed in `lowerIsBetter`.
 * This is the single weight policy behind {@link scoreLootStats}, {@link compareLootItems} and a
 * gear score, so an item and a whole loadout are never ranked by different arithmetic.
 *
 * @capability loot-score split one stat block into per-stat weighted contributions
 */
export function lootStatContributions(
  stats: Readonly<Record<string, number>>,
  options: Pick<LootComparisonOptions, "weights" | "lowerIsBetter"> = {},
): Record<string, number> {
  const weights = options.weights ?? {};
  const lower = new Set(options.lowerIsBetter ?? []);
  const out: Record<string, number> = {};
  for (const stat of Object.keys(stats)) {
    out[stat] = (stats[stat] ?? 0) * (weights[stat] ?? 1) * (lower.has(stat) ? -1 : 1);
  }
  return out;
}

/**
 * One stat block's weighted score: the sum of `value × weight`, negated for stats listed in
 * `lowerIsBetter`. Pair it with {@link lootStatContributions} when a caller also needs the split.
 *
 * @capability loot-score score one stat block with caller weights and lower-is-better stats
 */
export function scoreLootStats(
  stats: Readonly<Record<string, number>>,
  options: Pick<LootComparisonOptions, "weights" | "lowerIsBetter"> = {},
): number {
  let score = 0;
  for (const value of Object.values(lootStatContributions(stats, options))) score += value;
  return score;
}

/**
 * Compare two rolled items: every stat delta plus one weighted score for each, with caller-named
 * weights and which stats read better when small.
 *
 * @capability loot-comparison compare two rolled items with per-stat deltas and a weighted score
 */
export function compareLootItems(a: LootItem, b: LootItem, options: LootComparisonOptions = {}): LootComparison {
  const stats = [...new Set([...Object.keys(a.stats), ...Object.keys(b.stats)])].sort();
  const deltas: LootStatDelta[] = [];
  for (const stat of stats) {
    const valueA = a.stats[stat] ?? 0;
    const valueB = b.stats[stat] ?? 0;
    deltas.push({ stat, a: valueA, b: valueB, delta: valueB - valueA });
  }
  const scoreA = scoreLootStats(a.stats, options);
  const scoreB = scoreLootStats(b.stats, options);
  const scoreDelta = scoreB - scoreA;
  const tolerance = options.tolerance ?? 1e-9;
  const better = Math.abs(scoreDelta) <= tolerance ? "equal" : scoreDelta > 0 ? "b" : "a";
  return { deltas, scoreA, scoreB, scoreDelta, better };
}

/**
 * Wrap a catalog in a roll counter: same results as {@link rollLoot}, plus counts by rarity for a
 * debug overlay, snapshot/restore of those counts, and an optional devtools probe.
 *
 * @capability loot-roller roll items from one validated catalog while counting drops per rarity for a debug probe
 */
export function createLootRoller(catalog: LootCatalog, options: LootRollerOptions = {}): LootRoller {
  assertLootCatalog(catalog);
  let rolls = 0;
  const byRarity = new Map<string, number>();

  const readState = (): LootRollerState => ({ rolls, byRarity: Object.fromEntries(byRarity) });

  const probe = options.devtoolsName === undefined
    ? null
    : devtools.probes.register(options.devtoolsName, () => readState());

  return {
    roll(rng, rollOptions) {
      const item = rollLoot(catalog, rng, rollOptions);
      rolls += 1;
      byRarity.set(item.rarity, (byRarity.get(item.rarity) ?? 0) + 1);
      return item;
    },
    stats: readState,
    snapshot: readState,
    restore(next) {
      if (!Number.isInteger(next.rolls) || next.rolls < 0) return false;
      const counts = new Map<string, number>();
      for (const [rarity, count] of Object.entries(next.byRarity)) {
        if (!Number.isInteger(count) || count < 0) return false;
        counts.set(rarity, count);
      }
      rolls = next.rolls;
      byRarity.clear();
      for (const [rarity, count] of counts) byRarity.set(rarity, count);
      return true;
    },
    reset() {
      rolls = 0;
      byRarity.clear();
    },
    dispose() {
      probe?.();
    },
  };
}
