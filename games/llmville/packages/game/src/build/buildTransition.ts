import {
  isPlacementValidAt,
  type PlacementPreviewContext,
} from "@llmville/game/build/build";
import {
  isBuildItemId,
  isInfrastructureBuildItem,
  type BuildDirection,
  type BuildInventory,
  type BuildItemId,
  type InfrastructureBuildItemId,
} from "@llmville/game/build/catalog";
import type { RackInstalledHardwareSlot } from "@llmville/game/infrastructure/infrastructure";
import { squaredDistance2d } from "@llmville/game/world/grid";

export const BUILD_ERRORS = {
  unknownItem: "Unknown build item",
  outOfStock: "Out of stock",
  invalidPlacement: "Invalid placement",
  notPlaced: "Nothing placed to pick up",
} as const;

/** Adjust a build-item count in storage inventory, clamped to >= 0. Shared with the storefront. */
export function adjustBuildInventoryCount(
  inventory: BuildInventory,
  itemId: BuildItemId,
  delta: number,
): BuildInventory {
  return { ...inventory, [itemId]: Math.max(0, Math.floor((inventory[itemId] ?? 0) + delta)) };
}

export interface PlacedRackRow {
  rackType: InfrastructureBuildItemId;
  position: { x: number; y: number; z: number };
  rotationY: number;
  installedHardwareModuleIds: RackInstalledHardwareSlot[];
  state: "idle";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlacedBuildItemRow {
  itemId: Exclude<BuildItemId, InfrastructureBuildItemId>;
  x: number;
  y: number;
  z: number;
  direction: BuildDirection;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type PlaceBuildItemDecision =
  | { placed: false; reason: string }
  | { placed: true; inventory: BuildInventory; row: { kind: "rack"; rack: PlacedRackRow } | { kind: "buildItem"; item: PlacedBuildItemRow } };

export function decidePlaceBuildItem(args: {
  itemId: string;
  position: { x: number; y: number; z: number };
  direction: BuildDirection;
  inventory: BuildInventory;
  context: Omit<PlacementPreviewContext, "itemId" | "direction">;
  createdBy: string;
  now: number;
}): PlaceBuildItemDecision {
  if (!isBuildItemId(args.itemId)) return { placed: false, reason: BUILD_ERRORS.unknownItem };
  if ((args.inventory[args.itemId] ?? 0) < 1) return { placed: false, reason: BUILD_ERRORS.outOfStock };

  const valid = isPlacementValidAt(
    { x: args.position.x, z: args.position.z },
    { ...args.context, itemId: args.itemId, direction: args.direction },
  );
  if (!valid) return { placed: false, reason: BUILD_ERRORS.invalidPlacement };

  const inventory = adjustBuildInventoryCount(args.inventory, args.itemId, -1);
  if (isInfrastructureBuildItem(args.itemId)) {
    return {
      placed: true,
      inventory,
      row: {
        kind: "rack",
        rack: {
          rackType: args.itemId,
          position: args.position,
          rotationY: args.direction * (Math.PI / 2),
          installedHardwareModuleIds: [],
          state: "idle",
          createdBy: args.createdBy,
          createdAt: args.now,
          updatedAt: args.now,
        },
      },
    };
  }
  return {
    placed: true,
    inventory,
    row: {
      kind: "buildItem",
      item: {
        itemId: args.itemId,
        x: args.position.x,
        y: args.position.y,
        z: args.position.z,
        direction: args.direction,
        createdBy: args.createdBy,
        createdAt: args.now,
        updatedAt: args.now,
      },
    },
  };
}

function nearestByDistance<T>(
  rows: readonly T[],
  toPoint: (row: T) => { x: number; z: number },
  origin: { x: number; z: number },
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    const distance = squaredDistance2d(origin, toPoint(row));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = row;
    }
  }
  return best;
}

export type PickupBuildItemDecision =
  | { pickedUp: false; reason: string }
  | { pickedUp: true; target: { kind: "rack" | "buildItem"; id: string }; inventory: BuildInventory };

/** Picks the nearest matching placement; the runtime returns installed equipment to stock atomically. */
export function decidePickupBuildItem(args: {
  itemId: string;
  player: { x: number; z: number };
  racks: readonly { id: string; rackType: string; x: number; z: number; installedHardwareCount: number }[];
  placedBuildItems: readonly { id: string; itemId: string; x: number; z: number }[];
  inventory: BuildInventory;
}): PickupBuildItemDecision {
  if (!isBuildItemId(args.itemId)) return { pickedUp: false, reason: BUILD_ERRORS.unknownItem };

  const target = isInfrastructureBuildItem(args.itemId)
    ? nearestByDistance(
        args.racks.filter((rack) => rack.rackType === args.itemId),
        (rack) => rack,
        args.player,
      )
    : nearestByDistance(
        args.placedBuildItems.filter((item) => item.itemId === args.itemId),
        (item) => item,
        args.player,
      );
  if (!target) return { pickedUp: false, reason: BUILD_ERRORS.notPlaced };

  return {
    pickedUp: true,
    target: { kind: isInfrastructureBuildItem(args.itemId) ? "rack" : "buildItem", id: target.id },
    inventory: adjustBuildInventoryCount(args.inventory, args.itemId, 1),
  };
}
