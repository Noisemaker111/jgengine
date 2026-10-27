import type {
  BuilderActivePlacement,
  BuilderGroupDraft,
  BuilderItemType,
  BuilderPlacementSource,
  BuilderRoomDraft,
  BuilderState,
  BuilderTool,
} from "@/dev/builder/builderState";
import type { BuilderPrimitiveDraft } from "@llmville/game/builder/placement";
import type { BuilderSelectionRef } from "@llmville/game/builder/document";
import type { BuilderEditingScope } from "@/dev/builder/builderEditingScene";
import { defaultPlaceableForCategory, findPlaceableItem } from "@/dev/builder/builderPlaceableCatalog";
import type { MapData } from "@llmville/game/world/mapTypes";
import { isRecord } from "@jgengine/core/data/untyped";

export const BUILDER_SESSION_STORAGE_KEY = "llmville.dev.builder.session";
export const BUILDER_SESSION_VERSION = 1;

export type BuilderPropertiesTab = "tool" | "scene" | "save";

export interface BuilderSessionSnapshot {
  v: typeof BUILDER_SESSION_VERSION;
  savedAt: number;
  tool: BuilderTool;
  itemType: BuilderItemType;
  selectedPlaceableId: string;
  editingScope: BuilderEditingScope;
  activePlacement: BuilderActivePlacement | null;
  selectedRefs: BuilderSelectionRef[];
  activeMaterialKey: string;
  placementSource: BuilderPlacementSource;
  primitive: BuilderPrimitiveDraft;
  selectedCatalogModelKey: string;
  roomDraft: BuilderRoomDraft;
  groupDraft: BuilderGroupDraft;
  aiDraftPrompt: string;
  editingLibraryEntryId: string | null;
  editingPlacedDecorId: string | null;
  propertiesTab: BuilderPropertiesTab;
  mapData: MapData;
  undoStack: string[];
}

const VALID_TOOLS = new Set<BuilderTool>(["select", "wall", "primitive", "material", "delete", "stamp"]);
const VALID_ITEM_TYPES = new Set<BuilderItemType>(["asset", "gpu"]);
const VALID_SCOPES = new Set<BuilderEditingScope>(["room", "isolated"]);
const VALID_TABS = new Set<BuilderPropertiesTab>(["tool", "scene", "save"]);
const MAX_PERSISTED_UNDO = 20;

function sanitizeSelectedRefs(
  refs: readonly BuilderSelectionRef[],
  mapData: MapData,
): BuilderSelectionRef[] {
  const decorIds = new Set(mapData.decor.map((item) => item.id).filter((id): id is string => Boolean(id)));
  const wallCount = mapData.walls.length;
  return refs.filter((ref) => {
    if (ref.kind === "decor") return decorIds.has(ref.id);
    if (ref.kind === "wall") return ref.index >= 0 && ref.index < wallCount;
    return false;
  });
}

function sanitizePlaceableId(placeableId: string, itemType: BuilderItemType): string {
  if (findPlaceableItem(placeableId)) return placeableId;
  return defaultPlaceableForCategory(itemType).id;
}

function sanitizeEditingPlacedDecorId(
  decorId: string | null,
  mapData: MapData,
): string | null {
  if (!decorId) return null;
  return mapData.decor.some((item) => item.id === decorId) ? decorId : null;
}

function parseSessionSnapshot(raw: unknown): BuilderSessionSnapshot | null {
  if (!isRecord(raw)) return null;
  const {
    v, savedAt, tool, itemType, editingScope, selectedPlaceableId, mapData, selectedRefs, propertiesTab,
    activePlacement, activeMaterialKey, placementSource, primitive, selectedCatalogModelKey, roomDraft,
    groupDraft, aiDraftPrompt, editingLibraryEntryId, editingPlacedDecorId, undoStack,
  } = raw;
  if (v !== BUILDER_SESSION_VERSION) return null;
  if (typeof savedAt !== "number") return null;
  if (!VALID_TOOLS.has(tool as BuilderTool)) return null;
  if (!VALID_ITEM_TYPES.has(itemType as BuilderItemType)) return null;
  if (!VALID_SCOPES.has(editingScope as BuilderEditingScope)) return null;
  if (typeof selectedPlaceableId !== "string") return null;
  if (!isRecord(mapData)) return null;
  if (!Array.isArray(selectedRefs)) return null;
  if (!VALID_TABS.has(propertiesTab as BuilderPropertiesTab)) return null;

  return {
    v: BUILDER_SESSION_VERSION,
    savedAt,
    tool: tool as BuilderTool,
    itemType: itemType as BuilderItemType,
    selectedPlaceableId,
    editingScope: editingScope as BuilderEditingScope,
    activePlacement: (activePlacement as BuilderActivePlacement | null) ?? null,
    selectedRefs: selectedRefs as BuilderSelectionRef[],
    activeMaterialKey: typeof activeMaterialKey === "string" ? activeMaterialKey : "preset:accent-teal",
    placementSource: placementSource === "catalog" ? "catalog" : "primitive",
    primitive: (primitive as BuilderPrimitiveDraft) ?? {
      kind: "box",
      width: 1,
      height: 1,
      depth: 1,
      radius: 0.5,
      segments: 24,
    },
    selectedCatalogModelKey: typeof selectedCatalogModelKey === "string"
      ? selectedCatalogModelKey
      : "potted_plant",
    roomDraft: roomDraft as BuilderRoomDraft,
    groupDraft: groupDraft as BuilderGroupDraft,
    aiDraftPrompt: typeof aiDraftPrompt === "string" ? aiDraftPrompt : "",
    editingLibraryEntryId: typeof editingLibraryEntryId === "string" ? editingLibraryEntryId : null,
    editingPlacedDecorId: typeof editingPlacedDecorId === "string" ? editingPlacedDecorId : null,
    propertiesTab: propertiesTab as BuilderPropertiesTab,
    mapData: mapData as unknown as MapData,
    undoStack: Array.isArray(undoStack)
      ? undoStack.filter((entry): entry is string => typeof entry === "string").slice(-MAX_PERSISTED_UNDO)
      : [],
  };
}

export function readBuilderSessionSnapshot(): BuilderSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(BUILDER_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = parseSessionSnapshot(JSON.parse(raw));
    if (!parsed) window.localStorage.removeItem(BUILDER_SESSION_STORAGE_KEY);
    return parsed;
  } catch {
    window.localStorage.removeItem(BUILDER_SESSION_STORAGE_KEY);
    return null;
  }
}

export function writeBuilderSessionSnapshot(snapshot: BuilderSessionSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BUILDER_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
}

export function buildSessionSnapshotFromState(state: BuilderState): BuilderSessionSnapshot {
  return {
    v: BUILDER_SESSION_VERSION,
    savedAt: Date.now(),
    tool: state.tool,
    itemType: state.itemType,
    selectedPlaceableId: state.selectedPlaceableId,
    editingScope: state.editingScope,
    activePlacement: state.activePlacement,
    selectedRefs: [...state.selectedRefs],
    activeMaterialKey: state.activeMaterialKey,
    placementSource: state.placementSource,
    primitive: state.primitive,
    selectedCatalogModelKey: state.selectedCatalogModelKey,
    roomDraft: state.roomDraft,
    groupDraft: state.groupDraft,
    aiDraftPrompt: state.aiDraft.prompt,
    editingLibraryEntryId: state.editingLibraryEntryId,
    editingPlacedDecorId: state.editingPlacedDecorId,
    propertiesTab: state.propertiesTab,
    mapData: state.mapData,
    undoStack: [...state.undoStack].slice(-MAX_PERSISTED_UNDO),
  };
}

export function applySessionSnapshot(
  base: BuilderState,
  snapshot: BuilderSessionSnapshot,
): BuilderState {
  const itemType = VALID_ITEM_TYPES.has(snapshot.itemType) ? snapshot.itemType : base.itemType;
  const selectedPlaceableId = sanitizePlaceableId(snapshot.selectedPlaceableId, itemType);
  const mapData = snapshot.mapData;
  const selectedRefs = sanitizeSelectedRefs(snapshot.selectedRefs, mapData);
  const editingPlacedDecorId = sanitizeEditingPlacedDecorId(snapshot.editingPlacedDecorId, mapData);

  return {
    ...base,
    tool: VALID_TOOLS.has(snapshot.tool) ? snapshot.tool : base.tool,
    itemType,
    selectedPlaceableId,
    editingScope: VALID_SCOPES.has(snapshot.editingScope) ? snapshot.editingScope : base.editingScope,
    activePlacement: snapshot.activePlacement,
    selectedRefs,
    activeMaterialKey: snapshot.activeMaterialKey,
    placementSource: snapshot.placementSource,
    primitive: snapshot.primitive,
    selectedCatalogModelKey: snapshot.selectedCatalogModelKey,
    roomDraft: snapshot.roomDraft ?? base.roomDraft,
    groupDraft: snapshot.groupDraft ?? base.groupDraft,
    aiDraft: { prompt: snapshot.aiDraftPrompt, status: "idle", error: null },
    editingLibraryEntryId: snapshot.editingLibraryEntryId,
    editingPlacedDecorId,
    propertiesTab: VALID_TABS.has(snapshot.propertiesTab) ? snapshot.propertiesTab : base.propertiesTab,
    mapData,
    undoStack: snapshot.undoStack,
    hoverRef: null,
    wallStart: null,
    assetSaveStatus: "idle",
    assetSaveError: null,
  };
}