/**
 * Builder state shape and the pure factories that seed it. The store class in
 * `builderStore` composes this slice with undo, sync, and persistence; every
 * value here is a plain document/state transform with no `this`.
 */
import type {
  DecorItemSpec,
  MaterialRegistry,
  MapData,
} from "@llmville/game/world/mapTypes";
import { createRoom } from "@llmville/game/world/worldBuilder";
import { getWorldModelAsset, WORLD_MODEL_CATALOG } from "@llmville/game/world/worldModelCatalog";

import {
  cloneSpec,
  normalizeBuilderMapData,
  type BuilderSelectionRef,
} from "@llmville/game/builder/document";
import {
  getBoundsDimensions,
  selectionBounds,
  type BuilderBounds3d,
} from "@llmville/game/builder/bounds";
import type {
  BuilderResizeAxis,
  BuilderResizeEdge,
  BuilderResizeSnapshot,
} from "@llmville/game/builder/resize";
import type { BuilderPrimitiveDraft } from "@llmville/game/builder/placement";

import { BUILDER_ASSETS } from "@/dev/builder/builderAssets";
import { resolveMaterial } from "@/dev/builder/builderMaterials";
import type { BuilderRecentAsset } from "@/dev/builder/builderPersistence";
import { DEV_BUILDER_ASSET_LIBRARY } from "@/dev/builder/assetLibrary";
import type { BuilderAssetLibraryEntry } from "@/dev/builder/builderLibrary";
import {
  createIsolatedAssetMapFromPlaceable,
  type BuilderEditingScope,
} from "@/dev/builder/builderEditingScene";
import { defaultPlaceableForCategory, type BuilderCategory } from "@/dev/builder/builderPlaceableCatalog";
import {
  applySessionSnapshot,
  readBuilderSessionSnapshot,
  type BuilderPropertiesTab,
} from "@/dev/builder/builderSession";

export type { BuilderPropertiesTab };

export type BuilderTool = "select" | "wall" | "primitive" | "material" | "delete" | "stamp";
export type BuilderItemType = BuilderCategory;
export type BuilderPlacementSource = "primitive" | "catalog";
export type BuilderLibrarySaveScope = "selection" | "scene";

export interface BuilderGroupDraft {
  slug: string;
  label: string;
  tags: string;
  prompt: string;
}

export interface BuilderRoomDraft {
  template: "custom";
  width: number;
  depth: number;
  wallHeight: number;
  wallThickness: number;
  floorMaterial: string;
  wallMaterial: string;
}

export interface BuilderAiDraft {
  prompt: string;
  status: "idle" | "generating" | "error";
  error: string | null;
}

export type BuilderActivePlacement =
  | { kind: "catalog"; modelKey: string; label: string }
  | { kind: "decor"; template: DecorItemSpec; label: string; idBase: string }
  | { kind: "recent"; recentId: string; label: string };

export interface BuilderUndoSnapshot {
  mapData: MapData;
  selectedRefs: readonly BuilderSelectionRef[];
}

export interface BuilderState {
  tool: BuilderTool;
  itemType: BuilderItemType;
  selectedPlaceableId: string;
  editingScope: BuilderEditingScope;
  activePlacement: BuilderActivePlacement | null;
  recentGeneratedAssets: readonly BuilderRecentAsset[];
  aiDraft: BuilderAiDraft;
  placementSource: BuilderPlacementSource;
  primitive: BuilderPrimitiveDraft;
  selectedCatalogModelKey: string;
  activeMaterialKey: string;
  materialRegistry: MaterialRegistry;
  selectedRefs: readonly BuilderSelectionRef[];
  hoverRef: BuilderSelectionRef | null;
  wallStart: [number, number] | null;
  mapData: MapData;
  roomDraft: BuilderRoomDraft;
  groupDraft: BuilderGroupDraft;
  library: readonly BuilderAssetLibraryEntry[];
  lastExport: string;
  lastPromotedModelKey: string | null;
  lastCatalogSnippet: string;
  editingLibraryEntryId: string | null;
  editingPlacedDecorId: string | null;
  assetSaveStatus: "idle" | "saving" | "saved" | "error";
  assetSaveError: string | null;
  undoStack: readonly string[];
  propertiesTab: BuilderPropertiesTab;
}

export interface BuilderResizeContext {
  fromBounds: BuilderBounds3d;
  snapshot: BuilderResizeSnapshot;
  refs: readonly BuilderSelectionRef[];
  axis?: BuilderResizeAxis;
  edge?: BuilderResizeEdge;
}

export const MAX_UNDO_STACK = 50;

const DEFAULT_PRIMITIVE_DRAFT: BuilderPrimitiveDraft = {
  kind: "box",
  width: 1,
  height: 1,
  depth: 1,
  radius: 0.5,
  segments: 24,
};

const DEFAULT_GROUP_DRAFT: BuilderGroupDraft = {
  slug: "custom_asset",
  label: "Custom asset",
  tags: "asset",
  prompt: "",
};

export const BUILDER_ROOM_TEMPLATES: readonly BuilderRoomDraft[] = [
  {
    template: "custom",
    width: 10,
    depth: 10,
    wallHeight: 3.4,
    wallThickness: 0.25,
    floorMaterial: "garage-floor",
    wallMaterial: "garage-wall",
  },
];

export function refreshMapData(mapData: MapData): MapData {
  return normalizeBuilderMapData(mapData);
}

export function createBuilderRoom(draft: BuilderRoomDraft): MapData {
  const centerZ = -draft.depth / 2;
  const mapData = createRoom({
    mapId: "builder-room",
    width: draft.width,
    depth: draft.depth,
    wallHeight: draft.wallHeight,
    wallThickness: draft.wallThickness,
    floorMaterial: draft.floorMaterial,
    wallMaterial: draft.wallMaterial,
    ceilingColor: "#dbdde0",
    wallColor: resolveMaterial(draft.wallMaterial).color,
    floorRepeat: [draft.width, draft.depth],
    centerX: 0,
    centerZ,
  })
    .placePerimeterWalls()
    .setFrontDoor({ x: 0, z: 0 })
    .setDropoff({ x: 0, z: 0 })
    .build();
  return refreshMapData(mapData);
}

export function getBuilderSelectionBounds(
  mapData: MapData,
  selectedRefs: readonly BuilderSelectionRef[],
): BuilderBounds3d | null {
  return selectionBounds(BUILDER_ASSETS, mapData, selectedRefs);
}

export function getBuilderSelectionDimensions(bounds: BuilderBounds3d): { width: number; height: number; depth: number } {
  return getBoundsDimensions(bounds);
}

export function resolveStampTemplate(state: BuilderState, placement: BuilderActivePlacement): DecorItemSpec | null {
  if (placement.kind === "recent") {
    const recent = state.recentGeneratedAssets.find((entry) => entry.id === placement.recentId);
    return recent?.decor ? cloneSpec(recent.decor) : null;
  }
  if (placement.kind === "catalog") {
    const asset = getWorldModelAsset(placement.modelKey);
    const footprint = asset?.footprint ?? { width: 1, depth: 1 };
    return {
      type: "model",
      assetType: "model",
      modelKey: placement.modelKey,
      footprint,
      position: [0, 0, 0],
      castShadow: true,
      receiveShadow: true,
    };
  }
  return cloneSpec(placement.template);
}

export function createFreshBuilderState(): BuilderState {
  const defaultPlaceable = defaultPlaceableForCategory("asset");
  const { mapData, decorId } = createIsolatedAssetMapFromPlaceable(defaultPlaceable);
  return {
    tool: "select",
    itemType: "asset",
    selectedPlaceableId: defaultPlaceable.id,
    editingScope: "isolated",
    activePlacement: null,
    recentGeneratedAssets: [],
    aiDraft: { prompt: "", status: "idle", error: null },
    placementSource: "primitive",
    primitive: DEFAULT_PRIMITIVE_DRAFT,
    selectedCatalogModelKey: Object.keys(WORLD_MODEL_CATALOG)[0] ?? "potted_plant",
    activeMaterialKey: "preset:accent-teal",
    materialRegistry: {},
    selectedRefs: decorId ? [{ kind: "decor", id: decorId }] : [],
    hoverRef: null,
    wallStart: null,
    roomDraft: BUILDER_ROOM_TEMPLATES[0],
    mapData,
    groupDraft: {
      slug: defaultPlaceable.id,
      label: defaultPlaceable.label,
      tags: defaultPlaceable.category,
      prompt: DEFAULT_GROUP_DRAFT.prompt,
    },
    library: DEV_BUILDER_ASSET_LIBRARY,
    lastExport: "",
    lastPromotedModelKey: null,
    lastCatalogSnippet: "",
    editingLibraryEntryId: null,
    editingPlacedDecorId: decorId,
    assetSaveStatus: "idle",
    assetSaveError: null,
    undoStack: [],
    propertiesTab: "tool",
  };
}

export function initialBuilderState(): BuilderState {
  const session = readBuilderSessionSnapshot();
  if (!session) return createFreshBuilderState();
  const restored = applySessionSnapshot(createFreshBuilderState(), session);
  return {
    ...restored,
    mapData: refreshMapData(restored.mapData),
  };
}
