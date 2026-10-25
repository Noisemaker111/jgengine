/**
 * Universal token-research unlock system. Items across hardware, decor, cooling,
 * and racks cost data tokens to research-unlock, then money to buy.
 */

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

/** Token costs scale with catalog tier; 0 = free research (starter items). */
function hardwareTokenCost(index: number, unlockGameLevel: number): number {
  if (index === 0) return 0;
  if (unlockGameLevel <= 5) return 50 + index * 25;
  if (unlockGameLevel <= 25) return 200 + index * 40;
  if (unlockGameLevel <= 50) return 800 + index * 80;
  if (unlockGameLevel <= 70) return 3000 + index * 150;
  return 10000 + index * 500;
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
