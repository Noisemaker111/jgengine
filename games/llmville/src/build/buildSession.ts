import type { TerritoryOverlay } from "@jgengine/shell/TerritoryOverlay";
type ClaimHint = Pick<Parameters<typeof TerritoryOverlay>[0], "cells" | "cost" | "affordable">;
/**
 * Build session — placement draft, confirm/cancel/sell/pickup, storage selection,
 * and preview dispatch for one play session.
 */

import {
  BUILD_MENU_ITEMS,
  BUILD_MENU_TAB_SEQUENCE,
  countPlacedBuildItems,
  estimateBuildResalePrice,
  getPlacementBounds,
  getBuildMenuItemsForTab,
  isHardwareStorageItem,
  isInfrastructureBuildMenuItem,
  isSceneBuildMenuItem,
  type BuildMenuItem,
  type BuildMenuTabId,
  type BuildPlacementPreview,
  type PlacedBuildItem,
  type StorageItem,
} from "@llmville/game/build/build";
import { isBuildItemId, type BuildDirection, type BuildInventory, type BuildItemId } from "@llmville/game/build/catalog";
import { getHardwareDefinition, getRackCoolingUnitDefinition, isRackCoolingUnitId } from "@llmville/game/infrastructure/catalog";
import { hardwareResaleValue } from "@llmville/game/store/resale";
import type { PlacementCellPolicy } from "@llmville/game/datacenter/claims";
import { cellsForBounds } from "@llmville/game/datacenter/grid";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import { engineActions, useGameEngineState, wrapMutation, type GameEngine } from "@/runtime/gameEngine";
import { readPlayerPosition } from "@/runtime/playerPosition";
import { showActionError, showActionErrorThrottled } from "@/runtime/actionFeedback";
import type { ShopCatalogItem } from "@/store/store";
import { formatFacing } from "@llmville/game/world/cardinal";
import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { INTERACTION_TARGET_TYPE } from "@llmville/game/simulation/interaction";
import { useCallback, useMemo } from "react";

export interface BuildSessionWorldInput {
  engine: GameEngine;
  playerId: string;
  game: { _id: Id<"games"> } | null | undefined;
  canEditGame: boolean;
  buildInventory: BuildInventory;
  hardwareInventory: Record<string, number>;
  coolingInventory: Record<string, number>;
  shopItems: readonly ShopCatalogItem[] | undefined;
  placedBuildItems: readonly PlacedBuildItem[];
  racks: readonly PlacedRack[];
  isPointerLocked: boolean;
  placementCellPolicy: PlacementCellPolicy;
  money: number;
}

interface GameBuildHandlerState {
  gameId: Id<"games"> | null;
  build: {
    placementDraft: { itemId: BuildItemId; direction: BuildDirection } | null;
    placementPreview: BuildPlacementPreview | null;
  };
}

interface PlaceItemMutation {
  (args: { gameId: Id<"games">; externalId: string; itemId: BuildItemId; x: number; y: number; z: number; direction: BuildDirection }): Promise<unknown>;
}

interface SellStorageItemMutation {
  (args: { gameId: Id<"games">; itemId: string; externalId: string }): Promise<unknown>;
}

interface PickupItemMutation {
  (args: { gameId: Id<"games">; itemId: BuildMenuItem["id"]; externalId: string; playerX: number; playerZ: number }): Promise<unknown>;
}

function useBuildActions({
  engine,
  playerId,
  state,
  selectedBuildItem,
  buildInventory,
  placedBuildCounts,
  placeItemMutation,
  sellBuildItemMutation,
  pickupItemMutation,
}: {
  engine: GameEngine;
  playerId: string;
  state: GameBuildHandlerState;
  selectedBuildItem: StorageItem | null;
  buildInventory: Record<string, number>;
  placedBuildCounts: Record<string, number>;
  placeItemMutation: PlaceItemMutation;
  sellBuildItemMutation: SellStorageItemMutation;
  pickupItemMutation: PickupItemMutation;
}) {
  const onBuildPrimaryAction = useCallback((): boolean => {
    if (selectedBuildItem === null || state.gameId === null) {
      showActionErrorThrottled("build-not-ready", "Lab is still loading — try again in a moment.");
      return false;
    }
    if (isHardwareStorageItem(selectedBuildItem)) return false;
    const ownedCount = buildInventory[selectedBuildItem.id];
    if (ownedCount < 1) {
      showActionErrorThrottled(`build-stock-${selectedBuildItem.id}`, "Out of stock");
      return false;
    }
    if (!isInfrastructureBuildMenuItem(selectedBuildItem) && !isSceneBuildMenuItem(selectedBuildItem)) return false;
    engine.dispatch(engineActions.startPlacementDraft(selectedBuildItem.id));
    return true;
  }, [buildInventory, engine, selectedBuildItem, state.gameId]);

  const onBuildTrashAction = useCallback(() => {
    if (selectedBuildItem === null || state.gameId === null) {
      showActionErrorThrottled("build-not-ready", "Lab is still loading — try again in a moment.");
      return;
    }
    if (isHardwareStorageItem(selectedBuildItem)) {
      if (selectedBuildItem.count < 1) return;
      void wrapMutation(
        "sellBuildItem",
        sellBuildItemMutation({ gameId: state.gameId, itemId: selectedBuildItem.id, externalId: playerId }),
      );
      return;
    }
    const storageCount = buildInventory[selectedBuildItem.id];
    if (storageCount > 0) {
      void wrapMutation(
        "sellBuildItem",
        sellBuildItemMutation({ gameId: state.gameId, itemId: selectedBuildItem.id, externalId: playerId }),
      );
      return;
    }

    const placedCount = placedBuildCounts[selectedBuildItem.id] ?? 0;
    if (placedCount < 1) {
      showActionErrorThrottled(`build-none-placed-${selectedBuildItem.id}`, "Nothing placed to pick up");
      return;
    }
    const playerPosition = readPlayerPosition(engine);
    void wrapMutation<{ pickedUp?: boolean; reason?: string }>(
      "pickupItem",
      pickupItemMutation({
        gameId: state.gameId,
        itemId: selectedBuildItem.id,
        externalId: playerId,
        playerX: playerPosition.x,
        playerZ: playerPosition.z,
      }) as Promise<{ pickedUp?: boolean; reason?: string }>,
    ).then((result) => {
      if (!result?.pickedUp) showActionError(result?.reason);
    });
  }, [buildInventory, engine, pickupItemMutation, placedBuildCounts, playerId, selectedBuildItem, sellBuildItemMutation, state.gameId]);

  const onConfirmPlacement = useCallback(() => {
    if (state.gameId === null || state.build.placementDraft === null || state.build.placementPreview === null) return;

    if (!state.build.placementPreview.isValid) {
      // The preview already knows it's invalid; the mutation would just echo a
      // reason. Nudge the player toward the two most common causes instead of
      // failing silently.
      showActionErrorThrottled("place-invalid-preview", "invalid_placement");
      return;
    }

    void wrapMutation<{ placed?: boolean; reason?: string }>(
      "placeItem",
      placeItemMutation({
        gameId: state.gameId,
        externalId: playerId,
        itemId: state.build.placementDraft.itemId as BuildItemId,
        x: state.build.placementPreview.x,
        y: state.build.placementPreview.y,
        z: state.build.placementPreview.z,
        direction: state.build.placementDraft.direction,
      }) as Promise<{ placed?: boolean; reason?: string }>,
    ).then((result: { placed?: boolean; reason?: string } | undefined) => {
      if (result?.placed) {
        engine.dispatch(engineActions.clearPlacementDraft());
        return;
      }
      showActionError(result?.reason);
    });
  }, [engine, placeItemMutation, playerId, state.build.placementDraft, state.build.placementPreview, state.gameId]);

  return { onBuildPrimaryAction, onBuildTrashAction, onConfirmPlacement };
}

interface BuildSelectionState {
  activeTab: BuildMenuTabId;
  isOpen: boolean;
  nearbyItemId: string | null;
  selectionByTab: Partial<Record<BuildMenuTabId, number>>;
}

function getOwnedBuildItemsForTab(
  tab: BuildMenuTabId,
  buildInventory: BuildInventory,
): readonly BuildMenuItem[] {
  return getBuildMenuItemsForTab(tab).filter((item) => {
    const storageCount = buildInventory[item.id] ?? 0;
    return storageCount > 0;
  });
}

function storageHardwareResaleValue(itemId: string): number {
  return hardwareResaleValue(
    isRackCoolingUnitId(itemId)
      ? getRackCoolingUnitDefinition(itemId).buyPrice
      : getHardwareDefinition(itemId).buyPrice,
  );
}

function getHardwareStorageItems(
  hardwareInventory: Record<string, number>,
  coolingInventory: Record<string, number>,
  shopItems: readonly ShopCatalogItem[],
): StorageItem[] {
  return Object.entries({ ...hardwareInventory, ...coolingInventory })
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({
      id,
      name: shopItems.find((item) => item.id === id)?.label ?? id.replace(/_/g, " "),
      count,
      kind: "hardware" as const,
    }));
}

function deriveBuildSelection({
  build,
  buildInventory,
  hardwareInventory,
  coolingInventory,
  shopItems,
}: {
  build: BuildSelectionState;
  buildInventory: BuildInventory;
  hardwareInventory: Record<string, number>;
  coolingInventory: Record<string, number>;
  shopItems: readonly ShopCatalogItem[] | undefined;
}) {
  const buildItems = getOwnedBuildItemsForTab(build.activeTab, buildInventory);
  const hardwareItems = getHardwareStorageItems(hardwareInventory, coolingInventory, shopItems ?? []);

  let activeBuildItems: readonly StorageItem[];
  if (build.activeTab === "hardware") {
    activeBuildItems = hardwareItems;
  } else if (build.activeTab === "all") {
    activeBuildItems = [...buildItems, ...hardwareItems];
  } else {
    activeBuildItems = buildItems;
  }

  let items = [...activeBuildItems];
  if (build.isOpen && build.nearbyItemId) {
    const targetItem = BUILD_MENU_ITEMS.find((item) => item.id === build.nearbyItemId);
    if (targetItem && (build.activeTab === "all" || targetItem.tab === build.activeTab)) {
      const alreadyInList = items.some((item) => item.id === targetItem.id);
      if (!alreadyInList) {
        items = [targetItem, ...items];
      }
    }
  }
  activeBuildItems = items;

  const rawSelection = build.selectionByTab[build.activeTab] ?? 0;
  const interactionSelection = build.nearbyItemId
    ? activeBuildItems.findIndex((item) => item.id === build.nearbyItemId)
    : -1;
  const selectedBuildIndexRaw = interactionSelection >= 0 ? interactionSelection : rawSelection;
  const selectedBuildIndex = Math.min(selectedBuildIndexRaw, Math.max(0, activeBuildItems.length - 1));

  return {
    activeBuildItems,
    selectedBuildIndex,
    selectedBuildItem: activeBuildItems[selectedBuildIndex] ?? null,
  };
}

export interface BuildViewModel {
  buildTabs: readonly BuildMenuTabId[];
  activeBuildTab: BuildMenuTabId;
  activeBuildItems: readonly StorageItem[];
  buildInventory: BuildInventory;
  selectedBuildItem: StorageItem | null;
  selectedBuildItemIndex: number;
  selectedBuildPriceLabel: string;
  buildPrimaryActionLabel: string;
  isBuildPrimaryActionDisabled: boolean;
  isBuildTrashActionDisabled: boolean;
  buildPlacementModeActive: boolean;
  placementDraftItemId: BuildItemId | null;
  placementDraftDirection: BuildDirection;
  placementPreview: BuildPlacementPreview | null;
  placedBuildItems: readonly PlacedBuildItem[];
  onBuildPrimaryAction: () => void;
  onBuildTrashAction: () => void;
  onConfirmPlacement: () => void;
  onPlacementPreviewChange: (preview: BuildPlacementPreview | null) => void;
  onCycleBuildTab: (direction: -1 | 1) => void;
  onSetBuildTab: (tab: BuildMenuTabId) => void;
  onCycleBuildItem: (direction: -1 | 1) => void;
  onSetBuildItemIndex: (index: number) => void;
  placementFacingLabel: string;
  placementClaimHint: ClaimHint | null;
  onRotatePlacement: () => void;
  buildItemCount: number;
}

function usePlacementClaimHint({
  itemId,
  direction,
  preview,
  cellPolicy,
  money,
}: {
  itemId: BuildItemId | null;
  direction: BuildDirection;
  preview: BuildPlacementPreview | null;
  cellPolicy: PlacementCellPolicy;
  money: number;
}): ClaimHint | null {
  return useMemo(() => {
    if (itemId === null || preview === null) return null;
    const footprint = cellsForBounds(getPlacementBounds(itemId, { x: preview.x, z: preview.z }, direction));
    const quote = cellPolicy.quote(footprint);
    const newKeys = new Set(quote.newCells.map((cell) => `${cell.cx},${cell.cz}`));
    const cells = footprint.map((cell) => ({ key: `${cell.cx},${cell.cz}`, x: cell.cx, z: cell.cz,
      status: !cellPolicy.canUse(cell) ? "blocked" as const : newKeys.has(`${cell.cx},${cell.cz}`) ? "claimable" as const : "owned" as const }));
    if (quote.newCells.length === 0 && cells.every((cell) => cell.status === "owned")) return null;
    return { cells, cost: quote.totalCost, affordable: money >= quote.totalCost };
  }, [cellPolicy, direction, itemId, money, preview]);
}

export function useBuildSession({
  world,
  isStorageOpenOnTablet,
  onToggleTablet,
}: {
  world: BuildSessionWorldInput;
  isStorageOpenOnTablet: boolean;
  onToggleTablet: (nextOpen?: boolean) => void;
}): BuildViewModel {
  const placeItemMutation = useMutation(api.build.place);
  const sellBuildItemMutation = useMutation(api.store.sell);
  const pickupItemMutation = useMutation(api.build.pickup);
  const buildState = useGameEngineState(world.engine, (current) => current.build);
  const interactionTarget = useGameEngineState(world.engine, (current) => current.interaction.target);

  const placedBuildCounts = useMemo(
    () => countPlacedBuildItems(world.racks, world.placedBuildItems),
    [world.placedBuildItems, world.racks],
  );

  const { activeBuildItems, selectedBuildIndex, selectedBuildItem } = useMemo(
    () =>
      deriveBuildSelection({
        build: {
          ...buildState,
          isOpen: isStorageOpenOnTablet && !world.isPointerLocked,
          nearbyItemId: interactionTarget?.type === INTERACTION_TARGET_TYPE.placedItem ? interactionTarget.itemId : null,
        },
        buildInventory: world.buildInventory,
        hardwareInventory: world.hardwareInventory,
        coolingInventory: world.coolingInventory,
        shopItems: world.shopItems,
      }),
    [
      buildState,
      interactionTarget,
      isStorageOpenOnTablet,
      world.buildInventory,
      world.coolingInventory,
      world.hardwareInventory,
      world.isPointerLocked,
      world.shopItems,
    ],
  );

  const { onBuildPrimaryAction, onBuildTrashAction, onConfirmPlacement } = useBuildActions({
    engine: world.engine,
    playerId: world.playerId,
    state: {
      gameId: world.game?._id ?? null,
      build: {
        placementDraft:
          buildState.placementDraft !== null && isBuildItemId(buildState.placementDraft.itemId)
            ? {
              itemId: buildState.placementDraft.itemId,
              direction: buildState.placementDraft.direction,
            }
            : null,
        placementPreview: buildState.placementPreview,
      },
    },
    selectedBuildItem,
    buildInventory: world.buildInventory,
    placedBuildCounts,
    placeItemMutation,
    sellBuildItemMutation,
    pickupItemMutation,
  });

  const onPlacementPreviewChange = useCallback((preview: BuildPlacementPreview | null) => {
    world.engine.dispatch(engineActions.setPlacementPreview(preview));
  }, [world.engine]);

  // While the world query bundle loads, canEditGame is false; don't tell a
  // player they lack access when the data simply hasn't arrived yet.
  const editDeniedReason = world.game == null ? undefined : "Unauthorized";
  const editDeniedLoading = world.game == null;

  const onBuildPrimaryActionIfAllowed = useCallback(() => {
    if (!world.canEditGame) {
      showActionErrorThrottled("build-view-only", editDeniedLoading ? "Lab is still loading — try again in a moment." : editDeniedReason);
      return;
    }
    const started = onBuildPrimaryAction();
    if (started && !world.isPointerLocked) {
      onToggleTablet(false);
    }
  }, [editDeniedLoading, editDeniedReason, onBuildPrimaryAction, onToggleTablet, world.canEditGame, world.isPointerLocked]);

  const onBuildTrashActionIfAllowed = useCallback(() => {
    if (!world.canEditGame) {
      showActionErrorThrottled("build-view-only", editDeniedLoading ? "Lab is still loading — try again in a moment." : editDeniedReason);
      return;
    }
    onBuildTrashAction();
  }, [editDeniedLoading, editDeniedReason, onBuildTrashAction, world.canEditGame]);

  const onConfirmPlacementIfAllowed = useCallback(() => {
    if (!world.canEditGame) {
      showActionErrorThrottled("build-view-only", editDeniedLoading ? "Lab is still loading — try again in a moment." : editDeniedReason);
      return;
    }
    onConfirmPlacement();
  }, [editDeniedLoading, editDeniedReason, onConfirmPlacement, world.canEditGame]);

  const isHardware = selectedBuildItem !== null && isHardwareStorageItem(selectedBuildItem);
  const selectedBuildMenuItem = selectedBuildItem !== null && !isHardwareStorageItem(selectedBuildItem)
    ? selectedBuildItem
    : null;
  const buildItemPrice = selectedBuildMenuItem?.price ?? 0;
  const ownedCount = selectedBuildItem !== null && !isHardware ? (world.buildInventory[selectedBuildItem.id] ?? 0) : 0;
  const placedCount = selectedBuildItem !== null && !isHardware ? (placedBuildCounts[selectedBuildItem.id] ?? 0) : 0;

  const selectedBuildPriceLabel =
    selectedBuildItem === null
      ? "N/A"
      : isHardware
        ? `EST $${storageHardwareResaleValue(selectedBuildItem.id).toLocaleString()}`
        : ownedCount > 0
          ? `EST $${estimateBuildResalePrice(buildItemPrice).toLocaleString()}`
          : placedCount > 0
            ? "Placed in game"
            : `$${buildItemPrice.toLocaleString()}`;

  const buildPrimaryActionLabel =
    selectedBuildItem === null
      ? "Unavailable"
      : isHardware
        ? "Configure at rack"
        : ownedCount > 0
          ? "Place Item"
          : "Out of Stock";

  const isBuildPrimaryActionDisabled =
    selectedBuildItem === null
    || isHardware
    || ownedCount < 1;

  const isBuildTrashActionDisabled = selectedBuildItem === null
    || (isHardware ? false : ownedCount < 1 && placedCount < 1);
  const buildPlacementModeActive = buildState.placementDraft !== null;
  const placementDraftItemId =
    buildState.placementDraft !== null && isBuildItemId(buildState.placementDraft.itemId)
      ? buildState.placementDraft.itemId
      : null;
  const placementDraftDirection: BuildDirection = buildState.placementDraft?.direction ?? 0;
  const placementFacingLabel = formatFacing(placementDraftDirection);
  const placementClaimHint = usePlacementClaimHint({
    itemId: placementDraftItemId,
    direction: placementDraftDirection,
    preview: buildState.placementPreview,
    cellPolicy: world.placementCellPolicy,
    money: world.money,
  });

  return useMemo(() => ({
    buildTabs: BUILD_MENU_TAB_SEQUENCE,
    activeBuildTab: buildState.activeTab,
    activeBuildItems,
    buildInventory: world.buildInventory,
    selectedBuildItem,
    selectedBuildItemIndex: selectedBuildIndex,
    selectedBuildPriceLabel,
    buildPrimaryActionLabel,
    isBuildPrimaryActionDisabled,
    isBuildTrashActionDisabled,
    buildPlacementModeActive,
    placementDraftItemId,
    placementDraftDirection,
    placementPreview: buildState.placementPreview,
    placedBuildItems: world.placedBuildItems,
    onBuildPrimaryAction: onBuildPrimaryActionIfAllowed,
    onBuildTrashAction: onBuildTrashActionIfAllowed,
    onConfirmPlacement: onConfirmPlacementIfAllowed,
    onPlacementPreviewChange,
    onCycleBuildTab: (direction: -1 | 1) => world.engine.dispatch(engineActions.cycleBuildTab(direction)),
    onSetBuildTab: (tab: BuildMenuTabId) => world.engine.dispatch(engineActions.setBuildTab(tab)),
    onCycleBuildItem: (direction: -1 | 1) => world.engine.dispatch(engineActions.cycleBuildItem(direction, activeBuildItems.length)),
    onSetBuildItemIndex: (index: number) => world.engine.dispatch(engineActions.setBuildItemIndex(index)),
    placementFacingLabel,
    placementClaimHint,
    onRotatePlacement: () => {
      if (buildPlacementModeActive) {
        world.engine.dispatch(engineActions.rotateBuildDraft());
        return;
      }
      world.engine.dispatch(engineActions.rotatePlacement());
    },
    buildItemCount: activeBuildItems.length,
  }), [
    activeBuildItems,
    buildPlacementModeActive,
    buildPrimaryActionLabel,
    buildState.activeTab,
    buildState.placementPreview,
    isBuildPrimaryActionDisabled,
    isBuildTrashActionDisabled,
    onBuildPrimaryActionIfAllowed,
    onBuildTrashActionIfAllowed,
    onConfirmPlacementIfAllowed,
    onPlacementPreviewChange,
    placementDraftDirection,
    placementDraftItemId,
    placementFacingLabel,
    placementClaimHint,
    selectedBuildIndex,
    selectedBuildItem,
    selectedBuildPriceLabel,
    world.buildInventory,
    world.engine,
    world.placedBuildItems,
  ]);
}
