import type { LootEntry } from "@jgengine/core/loot/lootTable";

/** One colour of supply crate, as ARK's wiki gives them for The Island. */
export interface SupplyTier {
  id: string;
  label: string;
  /** The level a survivor needs to open it (ARK wiki, The Island). */
  minLevel: number;
  /** Its beam's colour. */
  color: string;
  /** How many picks from `loot` one crate holds. */
  rolls: number;
  loot: readonly LootEntry[];
}

/**
 * The six crate colours and what each holds. Levels are ARK's. The white and green resource ranges are the wiki's
 * (stone and flint 7–15, thatch 30–90 … for white; 20–40, 40–100 … for green); higher tiers and the items in each are
 * approximate, scaled the same way over the things Fernwild has: better crates, more metal, stone walls and saddles.
 */
export const SUPPLY_TIERS: readonly SupplyTier[] = [
  {
    id: "white", label: "White", minLevel: 3, color: "#f2f2f2", rolls: 3,
    loot: [
      { item: "stone", count: [7, 15], weight: 3 }, { item: "flint", count: [7, 15], weight: 3 }, { item: "thatch", count: [30, 90], weight: 3 },
      { item: "wood", count: [15, 30], weight: 3 }, { item: "fiber", count: [30, 80], weight: 3 }, { item: "hide", count: [25, 50], weight: 2 },
      { item: "mejoberry", count: [10, 30], weight: 2 }, { item: "stone_pick", count: 1, weight: 1 }, { item: "stone_hatchet", count: 1, weight: 1 },
      { item: "spear", count: 1, weight: 1 }, { item: "torch", count: 1, weight: 1 }, { item: "waterskin", count: 1, weight: 1 },
      { item: "cloth_shirt", count: 1, weight: 1 }, { item: "cloth_pants", count: 1, weight: 1 },
    ],
  },
  {
    id: "green", label: "Green", minLevel: 15, color: "#4cd964", rolls: 4,
    loot: [
      { item: "stone", count: [20, 40], weight: 3 }, { item: "flint", count: [20, 40], weight: 3 }, { item: "wood", count: [40, 100], weight: 3 },
      { item: "fiber", count: [50, 100], weight: 3 }, { item: "hide", count: [40, 80], weight: 3 }, { item: "narcotic", count: [5, 10], weight: 2 },
      { item: "cooked_meat", count: [5, 15], weight: 2 }, { item: "slingshot", count: 1, weight: 1 }, { item: "wooden_club", count: 1, weight: 1 },
      { item: "cloth_hat", count: 1, weight: 1 }, { item: "cloth_gloves", count: 1, weight: 1 }, { item: "cloth_boots", count: 1, weight: 1 },
      { item: "hide_sleeping_bag", count: 1, weight: 1 }, { item: "phiomia_saddle", count: 1, weight: 1 },
    ],
  },
  {
    id: "blue", label: "Blue", minLevel: 25, color: "#3a7bff", rolls: 5,
    loot: [
      { item: "metal", count: [20, 50], weight: 3 }, { item: "sparkpowder", count: [20, 40], weight: 2 }, { item: "oil", count: [10, 20], weight: 2 },
      { item: "narcotic", count: [10, 25], weight: 2 }, { item: "stimulant", count: [10, 20], weight: 2 }, { item: "raw_prime_meat", count: [3, 6], weight: 2 },
      { item: "wooden_foundation", count: [2, 5], weight: 1 }, { item: "wooden_wall", count: [2, 5], weight: 1 }, { item: "wooden_ceiling", count: [2, 4], weight: 1 },
      { item: "storage_box", count: [1, 2], weight: 1 }, { item: "phiomia_saddle", count: 1, weight: 1 }, { item: "raptor_saddle", count: 1, weight: 1 },
    ],
  },
  {
    id: "purple", label: "Purple", minLevel: 35, color: "#b05cff", rolls: 5,
    loot: [
      { item: "metal", count: [50, 100], weight: 3 }, { item: "obsidian", count: [10, 30], weight: 2 }, { item: "crystal", count: [10, 30], weight: 2 },
      { item: "oil", count: [20, 40], weight: 2 }, { item: "narcotic", count: [25, 50], weight: 2 }, { item: "stimulant", count: [20, 40], weight: 1 },
      { item: "stone_foundation", count: [2, 6], weight: 1 }, { item: "stone_wall", count: [2, 6], weight: 1 }, { item: "stone_ceiling", count: [2, 4], weight: 1 },
      { item: "reinforced_wooden_door", count: 1, weight: 1 }, { item: "raptor_saddle", count: 1, weight: 1 },
    ],
  },
  {
    id: "yellow", label: "Yellow", minLevel: 45, color: "#ffd43a", rolls: 6,
    loot: [
      { item: "metal", count: [100, 200], weight: 3 }, { item: "obsidian", count: [30, 60], weight: 2 }, { item: "crystal", count: [30, 60], weight: 2 },
      { item: "sparkpowder", count: [40, 80], weight: 2 }, { item: "raw_prime_meat", count: [10, 20], weight: 1 }, { item: "narcotic", count: [50, 80], weight: 2 },
      { item: "stone_foundation", count: [4, 10], weight: 1 }, { item: "stone_wall", count: [4, 10], weight: 1 }, { item: "stone_doorframe", count: [1, 3], weight: 1 },
      { item: "reinforced_wooden_door", count: [1, 2], weight: 1 }, { item: "raptor_saddle", count: 1, weight: 1 },
    ],
  },
  {
    id: "red", label: "Red", minLevel: 60, color: "#ff3b30", rolls: 7,
    loot: [
      { item: "metal", count: [200, 300], weight: 3 }, { item: "obsidian", count: [60, 100], weight: 2 }, { item: "crystal", count: [60, 100], weight: 2 },
      { item: "oil", count: [50, 100], weight: 2 }, { item: "sparkpowder", count: [60, 100], weight: 2 }, { item: "narcotic", count: [80, 100], weight: 1 },
      { item: "stone_foundation", count: [6, 12], weight: 1 }, { item: "stone_wall", count: [6, 12], weight: 1 }, { item: "stone_pillar", count: [2, 6], weight: 1 },
      { item: "reinforced_wooden_door", count: [2, 3], weight: 1 }, { item: "raptor_saddle", count: 1, weight: 1 },
    ],
  },
];

const BY_ID = new Map(SUPPLY_TIERS.map((tier) => [tier.id, tier]));

export function supplyTier(id: string): SupplyTier | null {
  return BY_ID.get(id) ?? null;
}
