/**
 * Build feature: storage catalog, placement geometry, and prop presentation.
 */
import {
  BUILD_CATALOG,
  computeBuildResaleValue,
  isBuildItemId,
  isInfrastructureBuildItem,
  isPlaceableBuildItem,
} from "@llmville/game/build/catalog";
import { getBuildItemFootprint } from "@llmville/game/build/geometry";
import { resolveBuildItemPlacementBounds } from "@llmville/game/build/placementBounds";
import { TILE_SIZE } from "@llmville/game/world/grid";
import { boundsOverlap } from "@llmville/game/world/bounds";
import { cellKey, cellsForBounds } from "@llmville/game/datacenter/grid";
import type { PlacementCellPolicy } from "@llmville/game/datacenter/claims";
import { isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import type {
  BuildDirection,
  BuildItemId,
  BuildItemDefinition,
  BuildTabId,
  InfrastructureBuildItemId,
  PlaceableBuildItemId,
} from "@llmville/game/build/catalog";
import type { RoomBounds, WorldPoint } from "@llmville/game/world/grid";

// --- Domain identifiers ------------------------------------------------------

/** Storage tabs: an "all" overview, the three build tabs, plus hardware. */
export type BuildMenuTabId = "all" | BuildTabId | "hardware";

export const BUILD_MENU_TAB_SEQUENCE: readonly BuildMenuTabId[] = [
  "all",
  "infrastructure",
  "decor",
  "hardware",
];

const BUILD_TAB_LABELS: Record<BuildMenuTabId, string> = {
  all: "All",
  infrastructure: "Racks",
  decor: "Decor",
  hardware: "GPUs",
};

export function getBuildTabLabel(tab: BuildMenuTabId): string {
  return BUILD_TAB_LABELS[tab] ?? tab;
}

// --- Storage items (build menu + hardware) ----------------------------------

export interface BuildMenuItem extends BuildItemDefinition {
  /** Display name (mirrors {@link BuildItemDefinition.label}). */
  name: string;
  kind: "build";
}

export interface HardwareStorageItem {
  id: string;
  name: string;
  count: number;
  kind: "hardware";
}

export type StorageItem = BuildMenuItem | HardwareStorageItem;

export const BUILD_MENU_ITEMS: readonly BuildMenuItem[] = BUILD_CATALOG.map((item) => ({
  ...item,
  name: item.label,
  kind: "build" as const,
}));

export function getBuildMenuItemsForTab(tab: BuildMenuTabId): readonly BuildMenuItem[] {
  if (tab === "all") return BUILD_MENU_ITEMS;
  if (tab === "hardware") return [];
  return BUILD_MENU_ITEMS.filter((item) => item.tab === tab);
}

export function isHardwareStorageItem(item: StorageItem): item is HardwareStorageItem {
  return item.kind === "hardware";
}

export function isInfrastructureBuildMenuItem(item: StorageItem): boolean {
  return item.kind === "build" && item.tab === "infrastructure";
}

export function isSceneBuildMenuItem(item: StorageItem): boolean {
  return item.kind === "build" && item.tab === "decor";
}

export function isRackBuildPlacementItem(id: string): id is InfrastructureBuildItemId {
  return isBuildItemId(id) && isInfrastructureBuildItem(id);
}

export function estimateBuildResalePrice(price: number): number {
  return computeBuildResaleValue(price);
}

// --- Placed items ------------------------------------------------------------

export interface CoreBuildPlacementDraft<TItemId extends string = string> {
  itemId: TItemId;
  direction: BuildDirection;
}

export interface CorePlacedBuildItem {
  id: string;
  itemId: string;
  x: number;
  y: number;
  z: number;
  direction: BuildDirection;
}

export interface PlacedBuildItem extends CorePlacedBuildItem {
  itemId: PlaceableBuildItemId;
}

export interface BuildPlacementPreview {
  x: number;
  y: number;
  z: number;
  isValid: boolean;
}

/** Wrap any signed number into the canonical 0–3 build direction. */
export function normalizeBuildDirection(value: number): BuildDirection {
  const wrapped = (((Math.round(value) % 4) + 4) % 4) as BuildDirection;
  return wrapped;
}

type RawPlacedBuildItem = {
  id: string;
  itemId: string;
  x: number;
  y: number;
  z: number;
  direction: number;
};

export function mapPlacedBuildItems(
  items?: readonly RawPlacedBuildItem[] | null,
): PlacedBuildItem[] {
  if (!items) return [];
  const mapped: PlacedBuildItem[] = [];
  for (const item of items) {
    if (!isPlaceableBuildItem(item.itemId as BuildItemId)) continue;
    mapped.push({
      id: item.id,
      itemId: item.itemId as PlaceableBuildItemId,
      x: item.x,
      y: item.y,
      z: item.z,
      direction: normalizeBuildDirection(item.direction),
    });
  }
  return mapped;
}

/** Count placed instances (racks + scene props) keyed by item id. */
export function countPlacedBuildItems(
  racks: readonly { rackType: string }[],
  placedBuildItems: readonly { itemId: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rack of racks) {
    counts[rack.rackType] = (counts[rack.rackType] ?? 0) + 1;
  }
  for (const item of placedBuildItems) {
    counts[item.itemId] = (counts[item.itemId] ?? 0) + 1;
  }
  return counts;
}

// --- Placement geometry ------------------------------------------------------

function rotatedFootprintHalfExtents(itemId: string, direction: BuildDirection) {
  const footprint = getBuildItemFootprint(itemId as BuildItemId);
  const rotated =
    direction % 2 === 1
      ? { width: footprint.depth, depth: footprint.width }
      : footprint;
  return {
    halfX: (rotated.width * TILE_SIZE) / 2,
    halfZ: (rotated.depth * TILE_SIZE) / 2,
  };
}

/** Axis-aligned world bounds an item occupies at `point`. */
export function getPlacementBounds(
  itemId: string,
  point: WorldPoint,
  direction: BuildDirection,
): RoomBounds {
  const meshBounds = resolveBuildItemPlacementBounds(itemId, point, direction);
  if (meshBounds) return meshBounds;

  const { halfX, halfZ } = rotatedFootprintHalfExtents(itemId, direction);
  return {
    minX: point.x - halfX,
    maxX: point.x + halfX,
    minZ: point.z - halfZ,
    maxZ: point.z + halfZ,
  };
}

const BUILD_DIRECTIONS: readonly BuildDirection[] = [0, 1, 2, 3];

const PLACEMENT_REACH_ORIGIN: WorldPoint = { x: 0, z: 0 };

/** Greatest distance from an item's placement point to any edge of its bounds, over every direction. */
export function buildPlacementReach(itemId: string): number {
  return Math.max(
    ...BUILD_DIRECTIONS.map((direction) => {
      const bounds = getPlacementBounds(itemId, PLACEMENT_REACH_ORIGIN, direction);
      return Math.max(-bounds.minX, bounds.maxX, -bounds.minZ, bounds.maxZ);
    }),
  );
}

export const MAX_BUILD_PLACEMENT_REACH: number = Math.max(
  ...BUILD_CATALOG.map((item) => buildPlacementReach(item.id)),
);

/** Rack yaw (radians, quarter turns) → canonical build direction. */
export function rotationYToDirection(rotationY: number): BuildDirection {
  return normalizeBuildDirection(rotationY / (Math.PI / 2));
}

export function collidesWithExistingRacks(
  point: WorldPoint,
  racks: readonly { rackType: string; x: number; z: number; rotationY: number }[],
  direction: BuildDirection,
  itemId: string,
): boolean {
  const bounds = getPlacementBounds(itemId, point, direction);
  return racks.some((rack) =>
    boundsOverlap(
      bounds,
      getPlacementBounds(rack.rackType, { x: rack.x, z: rack.z }, rotationYToDirection(rack.rotationY)),
    ),
  );
}

export function collidesWithExistingBuildItems(
  itemId: string,
  point: WorldPoint,
  direction: BuildDirection,
  placedBuildItems: readonly { itemId: string; x: number; z: number; direction: BuildDirection }[],
): boolean {
  const bounds = getPlacementBounds(itemId, point, direction);
  return placedBuildItems.some((item) =>
    boundsOverlap(
      bounds,
      getPlacementBounds(item.itemId, { x: item.x, z: item.z }, item.direction),
    ),
  );
}

export function claimedCellKeySet(
  cells: readonly { cx: number; cz: number }[],
): ReadonlySet<string> {
  return new Set(cells.map((cell) => cellKey(cell)));
}

export interface PlacementPreviewContext {
  itemId: BuildItemId;
  direction: BuildDirection;
  racks: readonly { rackType: string; x: number; z: number; rotationY: number }[];
  placedBuildItems: readonly { itemId: string; x: number; z: number; direction: BuildDirection }[];
  cellPolicy: PlacementCellPolicy;
}

/** Ray length from camera along look direction for placement targeting. */
export function placementRayLengthFromCamera(
  cameraY: number,
  lookDirectionY: number,
): number {
  let rayLength = 4;
  if (lookDirectionY < -0.05) {
    const projectedLength = -cameraY / lookDirectionY;
    if (projectedLength > 0 && Number.isFinite(projectedLength)) {
      rayLength = Math.min(12, projectedLength);
    }
  }
  return rayLength;
}

export function isPlacementValidAt(
  point: WorldPoint,
  context: PlacementPreviewContext,
): boolean {
  const { itemId, direction, racks, placedBuildItems, cellPolicy } = context;
  const bounds = getPlacementBounds(itemId, point, direction);
  const cells = cellsForBounds(bounds);
  if (cells.some((cell) => !cellPolicy.canUse(cell))) return false;
  if (cells.some((cell) => isStructuralColumnCell(cell))) return false;
  if (collidesWithExistingRacks(point, racks, direction, itemId)) return false;
  return !collidesWithExistingBuildItems(itemId, point, direction, placedBuildItems);
}

/** Pure placement preview from camera pose — shared by scene preview and tests. */
export function computePlacementPreview(
  cameraPosition: { x: number; y: number; z: number },
  lookDirection: { x: number; y: number; z: number },
  context: PlacementPreviewContext,
): BuildPlacementPreview {
  const rayLength = placementRayLengthFromCamera(cameraPosition.y, lookDirection.y);
  const target = {
    x: cameraPosition.x + lookDirection.x * rayLength,
    z: cameraPosition.z + lookDirection.z * rayLength,
  };

  return {
    x: target.x,
    y: 0,
    z: target.z,
    isValid: isPlacementValidAt(target, context),
  };
}

// --- Prop presentation -------------------------------------------------------

export interface BuildPropMaterialPresentation {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  transparent: boolean;
  opacity: number;
}

const SOLID_PROP_PRESENTATION: BuildPropMaterialPresentation = {
  color: "#e2e8f0",
  emissive: "#1e293b",
  emissiveIntensity: 0.1,
  transparent: false,
  opacity: 1,
};

const GHOST_VALID_COLOR = "#34d399";
const GHOST_INVALID_COLOR = "#fb7185";

/** Material props spread onto a prop's meshes: solid when placed, tinted ghost while drafting. */
export function getBuildPropMaterialPresentation(
  ghost: boolean,
  isValid: boolean,
): BuildPropMaterialPresentation {
  if (!ghost) return SOLID_PROP_PRESENTATION;
  const color = isValid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
  return {
    color,
    emissive: color,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.55,
  };
}
