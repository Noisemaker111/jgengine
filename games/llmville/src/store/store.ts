import { parseHardwareModelId } from "@llmville/game/infrastructure/catalog";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import type { PersonalUpgradeId } from "@llmville/game/user/personalUpgrades";
import { useCallback } from "react";

import type { PlacedBuildItem } from "@llmville/game/build/build";
import type { PlacedRack } from "@/infrastructure/infrastructure";

export type ShopItemId = string;
export type ShopItemKind = string;

export interface ShopItem {
  id: ShopItemId;
  label: string;
  description: string;
  cost: number;
  kind: ShopItemKind;
}

export interface ShopCatalogItem extends ShopItem {
  unlocked?: boolean;
  researchTokenCost?: number;
}

export interface PersonalUpgradeItem {
  id: PersonalUpgradeId;
  label: string;
  cost: number;
  owned: boolean;
  description: string;
  currentLevel?: number;
  maxLevel?: number;
}

export function mergeOwnedBuildQuantitiesForStore(
  buildInventory: Record<string, number>,
  placedBuildItems: readonly PlacedBuildItem[],
): Record<string, number> {
  const counts: Record<string, number> = { ...buildInventory };
  for (const item of placedBuildItems) {
    counts[item.itemId] = (counts[item.itemId] ?? 0) + 1;
  }
  return counts;
}

export function mergeOwnedHardwareQuantitiesForStore(
  hardwareInventory: Record<string, number>,
  racks: readonly PlacedRack[],
): Record<string, number> {
  const counts: Record<string, number> = { ...hardwareInventory };
  for (const rack of racks) {
    for (const hardwareModelId of rack.installedHardwareModuleIds) {
      if (hardwareModelId === null) {
        continue;
      }
      counts[hardwareModelId] = (counts[hardwareModelId] ?? 0) + 1;
    }
  }
  return counts;
}

export type StorePlaceOrderFn = (
  buildItems: { itemId: string; quantity: number }[],
  hardwareItems: { hardwareModelId: HardwareModelId; quantity: number }[],
) => Promise<boolean>;

export function useStoreCheckoutHandlers(onPlaceOrder: StorePlaceOrderFn) {
  const handleBuyBuild = useCallback(
    async (itemId: string, quantity?: number) => onPlaceOrder([{ itemId, quantity: quantity ?? 1 }], []),
    [onPlaceOrder],
  );

  const handleBuyHardware = useCallback(
    async (itemId: string, quantity?: number) => {
      const hardwareModelId = parseHardwareModelId(itemId);
      if (hardwareModelId === null) {
        return false;
      }
      return onPlaceOrder([], [{ hardwareModelId, quantity: quantity ?? 1 }]);
    },
    [onPlaceOrder],
  );

  return { handleBuyBuild, handleBuyHardware };
}
