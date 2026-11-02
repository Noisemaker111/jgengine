/**
 * Universal token-research unlock system. Items across hardware, decor, cooling,
 * and racks cost data tokens to research-unlock, then money to buy.
 */

import { evaluatePredicate, type Predicate } from "@jgengine/core/rules/predicate";
import { tierAt, type ThresholdBoundary } from "@jgengine/core/threshold/thresholds";
import { HARDWARE_CATALOG } from "@llmville/game/infrastructure/catalog";
import { RACK_COOLING_CATALOG } from "@llmville/game/infrastructure/catalog";
import { RACK_CATALOG } from "@llmville/game/infrastructure/catalog";
import { DECOR_CATALOG } from "@llmville/game/store/decorCatalog";

export type ResearchUnlockEntry = { isUnlocked?: boolean };
export type ResearchUnlocks = Record<string, ResearchUnlockEntry>;

export const RESEARCH_ITEM_KIND_VALUES = ["hardware", "decor", "cooling", "rack"] as const;
export type ResearchItemKind = (typeof RESEARCH_ITEM_KIND_VALUES)[number];

export interface ResearchCatalogEntry {
  id: string;
  kind: ResearchItemKind;
  unlockDataTokens: number;
  buyPrice: number;
  label: string;
}

interface HardwareResearchTier {
  baseTokens: number;
  tokensPerIndex: number;
}

const TOP_HARDWARE_RESEARCH_TIER: HardwareResearchTier = { baseTokens: 10000, tokensPerIndex: 500 };

/** Hardware research tiers by the card's recommended game level: each step covers levels up to its `at`. */
const HARDWARE_RESEARCH_TIERS: readonly ThresholdBoundary<HardwareResearchTier>[] = [
  { at: 5, id: { baseTokens: 50, tokensPerIndex: 25 } },
  { at: 25, id: { baseTokens: 200, tokensPerIndex: 40 } },
  { at: 50, id: { baseTokens: 800, tokensPerIndex: 80 } },
  { at: 70, id: { baseTokens: 3000, tokensPerIndex: 150 } },
  { at: Number.POSITIVE_INFINITY, id: TOP_HARDWARE_RESEARCH_TIER },
];

/** Token costs scale with catalog tier; 0 = free research (starter items). */
function hardwareTokenCost(index: number, unlockGameLevel: number): number {
  if (index === 0) return 0;
  const tier = tierAt(HARDWARE_RESEARCH_TIERS, unlockGameLevel, { descending: true })?.id ?? TOP_HARDWARE_RESEARCH_TIER;
  return tier.baseTokens + index * tier.tokensPerIndex;
}

function decorTokenCost(index: number, price: number): number {
  if (index === 0) return 0;
  return Math.max(25, Math.floor(price * 0.4));
}

export const RESEARCH_CATALOG: readonly ResearchCatalogEntry[] = [
  ...HARDWARE_CATALOG.map((hw, index) => ({
    id: hw.id,
    kind: "hardware" as const,
    unlockDataTokens: hardwareTokenCost(index, hw.unlockGameLevel),
    buyPrice: hw.buyPrice,
    label: hw.name,
  })),
  ...DECOR_CATALOG.map((decor, index) => ({
    id: decor.id,
    kind: "decor" as const,
    unlockDataTokens: decorTokenCost(index, decor.price),
    buyPrice: decor.price,
    label: decor.label,
  })),
  ...RACK_COOLING_CATALOG.map((unit) => ({
    id: unit.id,
    kind: "cooling" as const,
    unlockDataTokens: unit.unlockDataTokens,
    buyPrice: unit.buyPrice,
    label: unit.name,
  })),
  ...RACK_CATALOG.map((rack) => ({
    id: rack.id,
    kind: "rack" as const,
    unlockDataTokens: rack.unlockDataTokens,
    buyPrice: rack.buyPrice,
    label: rack.label,
  })),
];

const RESEARCH_BY_ID = Object.fromEntries(RESEARCH_CATALOG.map((entry) => [entry.id, entry])) as Record<
  string,
  ResearchCatalogEntry
>;

export function getResearchCatalogEntry(itemId: string): ResearchCatalogEntry | null {
  return RESEARCH_BY_ID[itemId] ?? null;
}

export function isResearchCatalogItem(itemId: string): boolean {
  return itemId in RESEARCH_BY_ID;
}

export function isResearchUnlocked(
  researchUnlocks: ResearchUnlocks | undefined,
  itemId: string,
): boolean {
  return researchUnlocks?.[itemId]?.isUnlocked === true;
}

export function withResearchUnlocked(
  researchUnlocks: ResearchUnlocks | undefined,
  itemId: string,
): ResearchUnlocks {
  return {
    ...(researchUnlocks ?? {}),
    [itemId]: { isUnlocked: true },
  };
}

/** 0-token starter items per category, auto-unlocked at world creation. */
const AUTO_RESEARCH_UNLOCK_IDS = RESEARCH_CATALOG.filter(
  (entry) => entry.unlockDataTokens === 0,
).map((entry) => entry.id);

export function createDefaultResearchUnlocks(): ResearchUnlocks {
  return Object.fromEntries(AUTO_RESEARCH_UNLOCK_IDS.map((id) => [id, { isUnlocked: true }]));
}

/** Seed unlocks from owned inventory counts (migration / existing players). */
export function seedResearchUnlocksFromInventory(args: {
  hardwareInventory?: Record<string, number | undefined>;
  /** Rack-mounted cooler units held as cooling stock. */
  coolingInventory?: Record<string, number | undefined>;
  buildInventory?: Record<string, number | undefined>;
}): ResearchUnlocks {
  const unlocks = createDefaultResearchUnlocks();

  const markOwned = (inventory: Record<string, number | undefined> | undefined) => {
    if (!inventory) return;
    for (const [id, count] of Object.entries(inventory)) {
      if ((count ?? 0) > 0 && isResearchCatalogItem(id)) {
        unlocks[id] = { isUnlocked: true };
      }
    }
  };

  markOwned(args.hardwareInventory);
  markOwned(args.coolingInventory);
  markOwned(args.buildInventory);

  return unlocks;
}

export function getResearchTokenCost(itemId: string): number | null {
  return RESEARCH_BY_ID[itemId]?.unlockDataTokens ?? null;
}

/** The data-token Requirement on researching an entry; free research has none. */
export function researchRequirement(entry: Pick<ResearchCatalogEntry, "unlockDataTokens">): Predicate | undefined {
  return entry.unlockDataTokens > 0 ? { not: { lt: ["dataTokens", entry.unlockDataTokens] } } : undefined;
}

export function meetsResearchRequirement(
  entry: Pick<ResearchCatalogEntry, "unlockDataTokens">,
  dataTokens: number,
): boolean {
  return evaluatePredicate(researchRequirement(entry), { dataTokens });
}
