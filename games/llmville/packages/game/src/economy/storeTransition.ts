import { BUILD_CATALOG, isBuildItemId } from "@llmville/game/build/catalog";
import {
  HARDWARE_CATALOG,
  getHardwareMemoryBandwidthGbps,
  type HardwareModuleDefinition,
} from "@llmville/game/infrastructure/catalog";
import {
  RACK_COOLING_CATALOG,
  isRackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";
import { computeRackHardwareStats } from "@llmville/game/infrastructure/infrastructure";
import {
  rackThermalInputs,
  type RackSnapshot,
} from "@llmville/game/infrastructure/infrastructure";
import { getRackCoolerOverheadKw } from "@llmville/game/infrastructure/infrastructure";
import {
  getResearchCatalogEntry,
  isResearchCatalogItem,
  isResearchUnlocked,
  type ResearchUnlocks,
} from "@llmville/game/research/researchUnlocks";

export function applyShopPriceMultiplier(basePrice: number, shopPriceMultiplier: number): number {
  return basePrice <= 0 ? 0 : Math.max(1, Math.floor(basePrice * shopPriceMultiplier));
}

/** Full-activity draw of installed hardware plus cooler overhead — what the grid feed must carry. */
export function computeInstalledPowerDrawKw(racks: readonly RackSnapshot[]): number {
  const hw = computeRackHardwareStats(racks);
  return Math.max(0, hw.totalPowerDrawWatts / 1000) + getRackCoolerOverheadKw(rackThermalInputs(racks));
}

/** Full-activity draw of cards sitting in stock — owning them commits the same grid capacity. */
export function computeStockedHardwarePowerDrawKw(inventory: Record<string, number>): number {
  return HARDWARE_CATALOG.reduce(
    (kw, hardware) => kw + ((inventory[hardware.id] ?? 0) * hardware.tdpWatts) / 1000,
    0,
  );
}

export function canAffordPowerForHardware(
  hardware: Pick<HardwareModuleDefinition, "tdpWatts">,
  currentPowerDrawKw: number,
  powerCapacityKw: number,
): boolean {
  return currentPowerDrawKw + hardware.tdpWatts / 1000 <= powerCapacityKw;
}

export function canAffordPowerForHardwareQuantity(
  hardware: Pick<HardwareModuleDefinition, "tdpWatts">,
  currentPowerDrawKw: number,
  powerCapacityKw: number,
  quantity: number,
): boolean {
  return currentPowerDrawKw + (quantity * hardware.tdpWatts) / 1000 <= powerCapacityKw;
}

export type ShopItemKind = "build" | "cooling" | "hardware" | "unknown";

export function classifyShopItem(itemId: string): ShopItemKind {
  if (isBuildItemId(itemId)) return "build";
  if (isRackCoolingUnitId(itemId)) return "cooling";
  if (HARDWARE_CATALOG.some((hardware) => hardware.id === itemId)) return "hardware";
  return "unknown";
}

export function buildShopItems(researchUnlocks?: ResearchUnlocks) {
  return [
    ...HARDWARE_CATALOG.map((hardware: HardwareModuleDefinition) => {
      const bandwidthGbps = getHardwareMemoryBandwidthGbps(hardware);
      const researched = isResearchUnlocked(researchUnlocks, hardware.id);
      return {
        id: hardware.id,
        label: hardware.name,
        description: `${hardware.vendor} · ${hardware.vramGb}GB · ${bandwidthGbps} GB/s · ${hardware.trainingPowerFp16} FP16 TFLOPS${hardware.fp8Tflops ? ` / ${hardware.fp8Tflops} FP8` : ""} · ${hardware.tdpWatts}W TDP.`,
        cost: hardware.buyPrice,
        kind: "hardware" as const,
        unlocked: researched,
        researchTokenCost: getResearchCatalogEntry(hardware.id)?.unlockDataTokens ?? 0,
        recommendedGameLevel: hardware.unlockGameLevel,
      };
    }),
    ...RACK_COOLING_CATALOG.map((unit) => ({
      id: unit.id,
      label: unit.name,
      description: `${unit.capacityKw} kW cooling · ${unit.coolantType} · +${unit.powerOverheadKw} kW draw.${unit.waterConsumption ? ` Water: ${unit.waterConsumption}u/bill.` : ""} ${unit.description}`,
      cost: unit.buyPrice,
      kind: "cooling" as const,
      unlocked: isResearchUnlocked(researchUnlocks, unit.id),
      researchTokenCost: unit.unlockDataTokens,
    })),
    ...BUILD_CATALOG.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description.replace("GPU", "hardware"),
      cost: item.price,
      kind: item.tab === "infrastructure" ? ("rack" as const) : ("decor" as const),
      unlocked: isResearchUnlocked(researchUnlocks, item.id),
      researchTokenCost: getResearchCatalogEntry(item.id)?.unlockDataTokens ?? 0,
    })),
  ];
}

export type ResearchUnlockDecision =
  | { unlocked: false; reason: string }
  | { unlocked: true; tokenCost: number };

export function decideResearchUnlock(args: {
  itemId: string;
  researchUnlocks: ResearchUnlocks | undefined;
  dataTokens: number;
}): ResearchUnlockDecision {
  if (!isResearchCatalogItem(args.itemId)) return { unlocked: false, reason: "Unknown item" };
  const entry = getResearchCatalogEntry(args.itemId);
  if (!entry) return { unlocked: false, reason: "Unknown item" };
  if (isResearchUnlocked(args.researchUnlocks, args.itemId)) {
    return { unlocked: false, reason: "Already researched" };
  }
  const tokenCost = entry.unlockDataTokens;
  if (tokenCost > 0 && args.dataTokens < tokenCost) {
    return { unlocked: false, reason: `Insufficient data tokens: need ${tokenCost.toLocaleString()}` };
  }
  return { unlocked: true, tokenCost };
}

export const MAX_PURCHASE_QUANTITY = 99;

/** Researched items buy with money; locked items show their research price in data tokens. */
export function canAffordShopPurchase(args: {
  researched: boolean;
  cost: number;
  researchTokenCost: number;
  money: number;
  dataTokens: number;
}): boolean {
  return args.researched ? args.money >= args.cost : args.dataTokens >= args.researchTokenCost;
}
