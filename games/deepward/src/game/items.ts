import type { AffixPool, RarityTier } from "@jgengine/core/item/affix";
import { compareToEquipped, itemMass, rollDrop, type EquippedComparison, type ItemDrop } from "@jgengine/core/loot/drop";
import { assertLootCatalog, validateLootItem, type LootBaseDef, type LootCatalog, type LootComparisonOptions, type LootItem, type LootManufacturerDef } from "@jgengine/core/loot/lootGen";
import type { SalvageTable } from "@jgengine/core/loot/salvage";
import { salvageValue } from "@jgengine/core/loot/salvage";

/** A Deepward item is a rolled drop: its kind is its base, and its number is the level of the room it came from. */
export type ItemKind = "wire" | "polymer" | "cells" | "ink" | "service-rifle";
export interface ItemKindDef { name: string; maker: string; rarity: string; found: string; w: number; h: number; color: string; detail: string }
/** How rare the kind of thing is to find at all; the roll's own rarity is the second axis. */
export const ITEMS: Record<ItemKind, ItemKindDef> = {
  wire: { name: "Copper spool", maker: "Bellwether", rarity: "Common", found: "Stocked", w: 1, h: 1, color: "#dfaa70", detail: "Wire · feeds Marrow's Case Bench" },
  polymer: { name: "Suit seals", maker: "Vigil", rarity: "Common", found: "Issue", w: 2, h: 1, color: "#c8d3b5", detail: "Polymer · armor and tank seals" },
  cells: { name: "Power cells", maker: "Meridian", rarity: "Uncommon", found: "Stocked", w: 1, h: 2, color: "#8bd7bf", detail: "Cells · the Garage and station power" },
  ink: { name: "Printer ink", maker: "Bellwether", rarity: "Rare", found: "Restricted", w: 2, h: 2, color: "#be9adc", detail: "Ink · only found beside a working printer" },
  "service-rifle": { name: "Service rifle", maker: "Kessler", rarity: "Uncommon", found: "Issue", w: 3, h: 1, color: "#83bbda", detail: "One hand · 30 damage · six-round magazine" },
};
export type Item = ItemDrop;

/** The kind behind a rolled item; every saved item's base is one of Deepward's five. */
export function kindOf(item: Pick<LootItem, "baseId">): ItemKind {
  if (!Object.hasOwn(ITEMS, item.baseId)) throw new Error(`deepward: unknown item base "${item.baseId}"`);
  return item.baseId as ItemKind;
}

/** The five-tier ladder from the design; rarity owns how many affixes a roll carries. */
export const RARITIES: readonly RarityTier[] = [
  { id: "common", weight: 46, affixCount: 0 },
  { id: "uncommon", weight: 30, affixCount: 1, statScale: 1.08, namePart: "Tuned" },
  { id: "rare", weight: 16, affixCount: 2, statScale: 1.18, namePart: "Custom" },
  { id: "epic", weight: 6, affixCount: 3, statScale: 1.3, namePart: "Prototype" },
  { id: "legendary", weight: 2, affixCount: 4, statScale: 1.45, namePart: "Prime" },
];

/**
 * Authored pools. Weight is the shared pick weight: a heavier affix lands more often, and a
 * manufacturer that favors a pool multiplies it. Every affix id is unique across the catalog.
 */
const POOLS: readonly AffixPool[] = [
  {
    id: "supply",
    affixes: [
      { id: "rated", stat: "value", op: "mul", roll: [1.12, 1.4], weight: 3, namePart: { position: "prefix", text: "Rated" } },
      { id: "sealed", stat: "value", op: "add", roll: [4, 11], weight: 2, minLevel: 2, namePart: { position: "suffix", text: "Sealed" } },
      { id: "bulk", stat: "value", op: "mul", roll: [0.8, 0.94], weight: 2, namePart: { position: "suffix", text: "Bulk" } },
    ],
  },
  {
    id: "kessler",
    affixes: [
      { id: "ported", stat: "damage", op: "add", roll: [2, 8], weight: 3, namePart: { position: "prefix", text: "Ported" } },
      { id: "wired", stat: "rate", op: "mul", roll: [1.06, 1.18], weight: 2, minLevel: 2, namePart: { position: "suffix", text: "Wired" } },
      { id: "match", stat: "damage", op: "mul", roll: [1.08, 1.22], weight: 1, minLevel: 3, namePart: { position: "suffix", text: "Match" } },
    ],
  },
];

const BASES: readonly LootBaseDef[] = [
  { id: "wire", name: "Copper spool", baseStats: { value: 12 }, pools: ["supply"], mass: 1.5 },
  { id: "polymer", name: "Suit seals", baseStats: { value: 9 }, pools: ["supply"], mass: 2 },
  { id: "cells", name: "Power cells", baseStats: { value: 18 }, pools: ["supply"], mass: 2.5 },
  { id: "ink", name: "Printer ink", baseStats: { value: 45 }, pools: ["supply"], mass: 6 },
  { id: "service-rifle", name: "Service rifle", baseStats: { value: 60, damage: 30, rate: 2 }, pools: ["kessler"], mass: 7 },
];

const MANUFACTURERS: readonly LootManufacturerDef[] = [
  { id: "bellwether", name: "Bellwether", bases: ["wire", "ink"], favoredPools: ["supply"] },
  { id: "vigil", name: "Vigil", bases: ["polymer"], bias: { value: -2 } },
  { id: "meridian", name: "Meridian", bases: ["cells"], scale: { value: 1.1 } },
  { id: "kessler", name: "Kessler", bases: ["service-rifle"], favoredPools: ["kessler"] },
];

/** Every Deepward item roll reads this one table; a bad entry throws at module load. */
export const ITEM_CATALOG: LootCatalog = {
  bases: BASES,
  parts: [],
  pools: POOLS,
  rarities: RARITIES,
  manufacturers: MANUFACTURERS,
  levelScale: [[1, 1], [4, 1.28], [8, 1.55], [12, 1.9]],
};
assertLootCatalog(ITEM_CATALOG);

/** Item level is the depth of the room it was found in, and the same seed always rolls the same item. */
export function rollItem(kind: ItemKind, level: number, seed: string, id: string): Item {
  return rollDrop(ITEM_CATALOG, seed, { id, level: Math.min(12, Math.max(1, Math.round(level))), baseId: kind });
}

/** What the rail assays an item at, in scrip: the roll's own value stat, never a separate table. */
export function itemValue(item: Item): number {
  return Math.max(0, Math.round(item.stats.value ?? 0));
}

export function itemWeight(item: Item): number {
  return itemMass(item);
}

/** One hand's numbers, read off the rolled rifle so an affix changes what firing does. */
export function weaponStats(item: Item): { damage: number; interval: number; range: number; label: string } {
  return {
    damage: Math.max(1, Math.round(item.stats.damage ?? 30)),
    interval: Math.max(0.12, 1 / Math.max(0.2, item.stats.rate ?? 2)),
    range: 30,
    label: item.name,
  };
}

/** How a candidate reads against the prepared rifle: damage, rate and counter value. */
export const COMPARE_OPTIONS: LootComparisonOptions = { weights: { damage: 1, rate: 30, value: 0.02 } };

export function compareToPrepared(candidate: Item, equipped: Item | null): EquippedComparison {
  return compareToEquipped(candidate, equipped, COMPARE_OPTIONS);
}

/** What the counter pays for breaking an item down: level × rate × rarity, floored. */
export const BREAKDOWN: SalvageTable = {
  currency: "scrip",
  perLevel: 6,
  rarityMultiplier: { common: 1, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 3 },
  minimum: 3,
};

/** The scrip a break-down pays for this instance, read from the shared salvage table. */
export function breakdownValue(item: Item): number {
  return salvageValue(item, BREAKDOWN).amount;
}

/** Defects in a roll or its saved bytes, named by the shared validator. */
export function itemIssues(item: LootItem): string[] {
  return validateLootItem(item, ITEM_CATALOG).map(issue => `${issue.code}: ${issue.detail}`);
}

/** The stat lines the counter and cache print, in a stable order. */
export function statLines(item: Item): { stat: string; label: string; value: number; unit: string; digits: number }[] {
  const label: Record<string, { label: string; unit: string; digits: number }> = {
    damage: { label: "Damage", unit: "", digits: 0 },
    rate: { label: "Rate", unit: "/s", digits: 2 },
    value: { label: "Assay", unit: " scrip", digits: 0 },
  };
  const order = ["damage", "rate", "value"];
  return Object.keys(item.stats)
    .filter(stat => label[stat] !== undefined)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map(stat => ({ stat, ...label[stat]!, value: item.stats[stat]! }));
}
