import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useCallback } from "react";

import { isBuildItemId, type BuildItemId } from "@llmville/game/build/catalog";
import type { PersonalUpgradeId } from "@llmville/game/user/personalUpgrades";
import { TUTORIAL_STAGE } from "@llmville/game/tutorial/tutorialStages";
import { withEditAccess, wrapMutation } from "@/runtime/gameEngine";
import { showActionError } from "@/runtime/actionFeedback";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";

export function formatCompactNumber(value: number): string {
  // Handle negatives via their magnitude so bankrupt players get compact
  // labels too (previously -2_000_000 rendered as a full-width raw number).
  const sign = value < 0 ? "-" : "";
  const flooredValue = Math.floor(Math.abs(value));

  if (flooredValue < 1_000) {
    return `${sign}${flooredValue}`;
  }

  if (flooredValue < 100_000) {
    return `${sign}${(flooredValue / 1_000).toFixed(1)}k`;
  }

  if (flooredValue < 1_000_000) {
    return `${sign}${Math.floor(flooredValue / 1_000)}k`;
  }

  return `${sign}${(flooredValue / 1_000_000).toFixed(2)}M`;
}

/** Cash reads to the cent under $1,000 and abbreviates above it. */
export function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? "-" : "";
  if (abs < 1_000) return `${sign}${abs.toFixed(2)}`;
  return `${sign}${formatCompactNumber(abs)}`;
}

interface BuildOrderItem {
  itemId: string;
  quantity: number;
}

function isBuildOrderItem(value: BuildOrderItem): value is { itemId: BuildItemId; quantity: number } {
  return isBuildItemId(value.itemId);
}

interface UseGameEconomyActionsParams {
  canEditGame: boolean;
  gameId: Id<"games"> | null;
  playerId: string;
  tutorialStage: string;
  buyMutation: (args: { gameId: Id<"games">; itemId: string; quantity?: number; externalId: string }) => Promise<{ ok: boolean; itemCount?: number; kind?: string; reason?: string }>;
  buyPersonalUpgradeMutation: (args: { gameId: Id<"games">; upgradeId: PersonalUpgradeId }) => Promise<unknown>;
  unlockResearchItemMutation: (args: { gameId: Id<"games">; itemId: string; externalId?: string }) => Promise<{ unlocked: boolean }>;
  onHardwarePurchased: (count: number) => void;
}

export function useGameEconomyActions({
  canEditGame,
  gameId,
  playerId,
  tutorialStage,
  buyMutation,
  buyPersonalUpgradeMutation,
  unlockResearchItemMutation,
  onHardwarePurchased,
}: UseGameEconomyActionsParams) {
  const onBuyItem = useCallback((itemId: string) => {
    // One storefront verb — the backend (store.buy) resolves hardware / cooling / furniture.
    return withEditAccess({ canEditGame, gameId }, (editableGameId) =>
      wrapMutation(
        "buy",
        buyMutation({ gameId: editableGameId, itemId, externalId: playerId }).then((result) => {
          if (result.ok && result.kind === "hardware" && tutorialStage === TUTORIAL_STAGE.buyGpus) {
            onHardwarePurchased(result.itemCount ?? 1);
          }
          if (!result.ok) showActionError(result.reason);
          return result;
        }),
      ),
    );
  }, [buyMutation, canEditGame, gameId, onHardwarePurchased, playerId, tutorialStage]);

  const onPlaceOrder = useCallback(async (
    buildItems: { itemId: string; quantity: number }[],
    hardwareItems: { hardwareModelId: HardwareModelId; quantity: number }[],
  ) => {
    const editableGameId = withEditAccess({ canEditGame, gameId }, (resolvedGameId) => resolvedGameId);
    if (editableGameId === undefined) {
      return false;
    }

    // No cart on the backend — each line is its own store.buy (quantity batches same-item buys).
    let allSuccess = true;
    let hardwarePurchased = 0;

    for (const item of buildItems.filter(isBuildOrderItem)) {
      const result = await wrapMutation(
        "buy",
        buyMutation({ gameId: editableGameId, itemId: item.itemId, quantity: item.quantity, externalId: playerId }),
        { fallback: { ok: false, reason: undefined as string | undefined } },
      );
      if (!result.ok) {
        allSuccess = false;
        showActionError(result.reason);
      }
    }

    for (const item of hardwareItems) {
      const result = await wrapMutation(
        "buy",
        buyMutation({ gameId: editableGameId, itemId: item.hardwareModelId, quantity: item.quantity, externalId: playerId }),
        { fallback: { ok: false, reason: undefined as string | undefined } },
      );
      if (!result.ok) {
        allSuccess = false;
        showActionError(result.reason);
      } else if ("itemCount" in result) {
        hardwarePurchased += result.itemCount ?? item.quantity;
      }
    }

    if (hardwarePurchased > 0 && tutorialStage === TUTORIAL_STAGE.buyGpus) {
      onHardwarePurchased(hardwarePurchased);
    }

    return allSuccess;
  }, [buyMutation, canEditGame, gameId, onHardwarePurchased, playerId, tutorialStage]);

  const onBuyPersonalUpgrade = useCallback((upgradeId: PersonalUpgradeId) => {
    return withEditAccess({ canEditGame, gameId }, (editableGameId) =>
      wrapMutation(
        "buyPersonalUpgrade",
        buyPersonalUpgradeMutation({ gameId: editableGameId, upgradeId }),
      ),
    );
  }, [buyPersonalUpgradeMutation, canEditGame, gameId]);

  const onUnlockResearch = useCallback((itemId: string) => {
    return withEditAccess({ canEditGame, gameId }, (editableGameId) =>
      wrapMutation(
        "unlockResearchItem",
        unlockResearchItemMutation({ gameId: editableGameId, itemId, externalId: playerId }),
      ),
    );
  }, [canEditGame, gameId, playerId, unlockResearchItemMutation]);

  return {
    onBuyItem,
    onPlaceOrder,
    onBuyPersonalUpgrade,
    onUnlockResearch,
  };
}
