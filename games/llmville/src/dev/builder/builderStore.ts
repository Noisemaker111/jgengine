/**
 * Dev builder store — the app shell around the portable builder core in
 * `@llmville/game/builder/*`. This layer owns React subscription, UI drafts,
 * undo history, scene composition, and persistence via `builderPersistence`. All document
 * math and transforms live in the core.
 */
import { useSyncExternalStore } from "react";

import type { DecorItemSpec, MaterialRegistry, MapData } from "@llmville/game/world/mapTypes";
import { getDecorItemBounds } from "@llmville/game/world/mapDecor";
import { snapWorldToGrid } from "@llmville/game/world/grid";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";

import {
  cloneSpec,
  findDecorIndexById,
  getMapGrid,
  hasSelectionRef,
  isSameSelectionRef,
  isSelectionRefPresent,
  nextUniqueDecorId,
  selectionWithoutRef,
  type BuilderSelectionRef,
} from "@llmville/game/builder/document";
import {
  clampSelectionBounds,
  computeFootprintFromBounds,
  findHitRef,
  MIN_SELECTION_AXIS_SIZE,
  selectionBounds,
  type BuilderBounds3d,
} from "@llmville/game/builder/bounds";
import {
  applyFloorMaterial,
  applyMaterialToRefs,
  applyWallMaterial,
  buildGroupFromSelection,
  deleteRefs as deleteRefsFromMap,
  duplicateSelection as duplicateSelectionInMap,
  glueSelection as glueSelectionInMap,
  moveSelection as moveSelectionInMap,
  rotateSelection90 as rotateSelection90InMap,
  ungroupDecor,
} from "@llmville/game/builder/operations";
import {
  catalogModelToDecor,
  decorToStampTemplate,
  primitiveToDecor,
  stampDecorAt,
  type BuilderPrimitiveDraft,
  type BuilderPrimitiveKind,
} from "@llmville/game/builder/placement";
import {
  createResizeSnapshot,
  patchMapDataForResize,
  type BuilderResizeAxis,
  type BuilderResizeEdge,
} from "@llmville/game/builder/resize";
import {
  buildCatalogSnippet,
  buildSelectionPayload,
  buildWorldBuilderSnippet,
  exportBuilderMapJson,
  parseTags,
  slugify,
} from "@llmville/game/builder/serialize";
import { computeWallSegment } from "@llmville/game/builder/walls";

import { BUILDER_ASSETS } from "@/dev/builder/builderAssets";
import {
  BUILDER_MATERIAL_OPTIONS,
  resolveMaterial,
  type BuilderMaterialOption,
} from "@/dev/builder/builderMaterials";
import {
  fetchRecentAssets,
  fetchRepoLibraryEntries,
  loadLocalLibraryEntries,
  MAX_RECENT_GENERATED_ASSETS,
  persistLocalLibraryEntries,
  persistRecentAssets,
  recentAssetStatus,
  requestGeneratedAsset,
  saveSourceLibraryEntries,
  type BuilderRecentAsset,
} from "@/dev/builder/builderPersistence";
import { DEV_BUILDER_ASSET_LIBRARY } from "@/dev/builder/assetLibrary";
import {
  mergeLibraryEntries,
  type BuilderAssetLibraryEntry,
} from "@/dev/builder/builderLibrary";
import {
  createIsolatedAssetMapFromDecor,
  createIsolatedAssetMapFromPlaceable,
} from "@/dev/builder/builderEditingScene";
import {
  defaultPlaceableForCategory,
  findPlaceableByCatalogModel,
  findPlaceableItem,
  isCatalogBuilderCategory,
  type BuilderPlaceableItem,
} from "@/dev/builder/builderPlaceableCatalog";
import {
  buildSessionSnapshotFromState,
  readBuilderSessionSnapshot,
  writeBuilderSessionSnapshot,
} from "@/dev/builder/builderSession";
import {
  BUILDER_ROOM_TEMPLATES,
  createBuilderRoom,
  getBuilderSelectionBounds,
  getBuilderSelectionDimensions,
  initialBuilderState,
  MAX_UNDO_STACK,
  refreshMapData,
  resolveStampTemplate,
  type BuilderActivePlacement,
  type BuilderAiDraft,
  type BuilderGroupDraft,
  type BuilderItemType,
  type BuilderLibrarySaveScope,
  type BuilderPlacementSource,
  type BuilderPropertiesTab,
  type BuilderResizeContext,
  type BuilderRoomDraft,
  type BuilderState,
  type BuilderTool,
  type BuilderUndoSnapshot,
} from "@/dev/builder/builderState";

export type {
  BuilderActivePlacement,
  BuilderAiDraft,
  BuilderBounds3d,
  BuilderGroupDraft,
  BuilderItemType,
  BuilderLibrarySaveScope,
  BuilderMaterialOption,
  BuilderPlacementSource,
  BuilderPrimitiveDraft,
  BuilderPrimitiveKind,
  BuilderPropertiesTab,
  BuilderRecentAsset,
  BuilderResizeAxis,
  BuilderResizeContext,
  BuilderResizeEdge,
  BuilderRoomDraft,
  BuilderSelectionRef,
  BuilderState,
  BuilderTool,
};
export type { BuilderRecentAssetStatus } from "@/dev/builder/builderPersistence";
export {
  BUILDER_MATERIAL_OPTIONS,
  BUILDER_ROOM_TEMPLATES,
  getBuilderSelectionBounds,
  getBuilderSelectionDimensions,
  recentAssetStatus,
};

type Listener = () => void;

const SCENE_ENDPOINT = "/__llmville-builder/scene";
const BUILDER_HEARTBEAT_ENDPOINT = "/__llmville-builder/heartbeat";
const BUILDER_SOURCE_HEADER = "x-llmville-builder-source";

class BuilderStoreImpl {
  private state: BuilderState = initialBuilderState();
  private serverVersion = 0;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private sessionPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionHydratedFromStorage = readBuilderSessionSnapshot() !== null;

  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): Readonly<BuilderState> {
    return this.state;
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private setState(next: Partial<BuilderState>) {
    this.state = { ...this.state, ...next };
    this.emit();
    this.scheduleSessionPersist();
  }

  private scheduleSessionPersist() {
    if (typeof window === "undefined") return;
    if (this.sessionPersistTimer) clearTimeout(this.sessionPersistTimer);
    this.sessionPersistTimer = setTimeout(() => {
      this.sessionPersistTimer = null;
      this.persistSession();
    }, 400);
  }

  persistSession() {
    if (typeof window === "undefined") return;
    writeBuilderSessionSnapshot(buildSessionSnapshotFromState(this.state));
  }

  private replaceMapData(mapData: MapData, selectedRefs: readonly BuilderSelectionRef[] = this.state.selectedRefs) {
    this.setState({
      mapData: refreshMapData(mapData),
      selectedRefs,
      wallStart: null,
    });
    this.pushSceneToServer();
  }

  private pushSceneToServer() {
    if (typeof window === "undefined") return;
    void fetch(SCENE_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [BUILDER_SOURCE_HEADER]: "browser",
      },
      body: JSON.stringify({ mapData: this.state.mapData }),
    })
      .then((r) => r.ok ? r.json() as Promise<{ version?: number }> : null)
      .then((payload) => {
        if (payload && typeof payload.version === "number") {
          this.serverVersion = payload.version;
        }
      })
      .catch(() => undefined);
  }

  private isAgentIsolatedAssetStage(mapData: MapData): boolean {
    const floor = mapData.environment.floor;
    return floor.width === 50
      && floor.depth === 50
      && floor.centerX === 0
      && floor.centerZ === 0
      && mapData.walls.length === 0;
  }

  private async pullSceneFromServer() {
    if (typeof window === "undefined") return;
    try {
      const response = await fetch(SCENE_ENDPOINT);
      if (!response.ok) return;
      const payload = await response.json() as {
        mapData?: unknown;
        version?: number;
        updatedBy?: "agent" | "browser";
      } | null;
      if (!payload || !payload.mapData || typeof payload.version !== "number") return;
      if (payload.version <= this.serverVersion) return;
      this.serverVersion = payload.version;
      const serverMapData = payload.mapData as MapData;
      const agentIsolatedAsset = payload.updatedBy === "agent" && this.isAgentIsolatedAssetStage(serverMapData);
      const editingScope = agentIsolatedAsset ? "isolated" : this.state.editingScope;
      const mapData = refreshMapData(serverMapData);
      const primaryDecor = mapData.decor.find((item) => item.id !== undefined) ?? null;
      this.setState({
        editingScope,
        mapData,
        ...(agentIsolatedAsset && primaryDecor?.id
          ? {
              selectedRefs: [{ kind: "decor", id: primaryDecor.id }],
              editingPlacedDecorId: primaryDecor.id,
              editingLibraryEntryId: primaryDecor.id,
              groupDraft: {
                ...this.state.groupDraft,
                slug: primaryDecor.id,
                label: this.state.library.find((entry) => entry.id === primaryDecor.id)?.label ?? primaryDecor.id,
              },
              tool: "select" as const,
            }
          : {}),
      });
    } catch {
      // ignore
    }
  }

  private sendBuilderHeartbeat() {
    if (typeof window === "undefined") return;
    void fetch(BUILDER_HEARTBEAT_ENDPOINT, { method: "POST" }).catch(() => undefined);
  }

  startSceneSync() {
    if (typeof window === "undefined" || this.syncInterval) return;
    void this.pullSceneFromServer();
    this.sendBuilderHeartbeat();
    this.syncInterval = setInterval(() => {
      void this.pullSceneFromServer();
      this.sendBuilderHeartbeat();
    }, 2000);
  }

  stopSceneSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private selectionBounds(): BuilderBounds3d | null {
    return selectionBounds(BUILDER_ASSETS, this.state.mapData, this.state.selectedRefs);
  }

  private captureUndoSnapshot(): BuilderUndoSnapshot {
    return {
      mapData: cloneSpec(this.state.mapData),
      selectedRefs: [...this.state.selectedRefs],
    };
  }

  private pushUndo() {
    const nextStack = [...this.state.undoStack, JSON.stringify(this.captureUndoSnapshot())];
    this.setState({
      undoStack: nextStack.length > MAX_UNDO_STACK ? nextStack.slice(-MAX_UNDO_STACK) : nextStack,
    });
  }

  beginUndoableEdit() {
    this.pushUndo();
  }

  undo() {
    if (this.state.undoStack.length === 0) return;
    const previous = this.state.undoStack[this.state.undoStack.length - 1];
    const snapshot = JSON.parse(previous) as BuilderUndoSnapshot;
    this.setState({
      mapData: refreshMapData(snapshot.mapData),
      selectedRefs: snapshot.selectedRefs,
      undoStack: this.state.undoStack.slice(0, -1),
      wallStart: null,
    });
  }

  private clearUndoStack() {
    if (this.state.undoStack.length === 0) return;
    this.setState({ undoStack: [] });
  }

  private groupDraftForPlaceable(placeable: BuilderPlaceableItem): BuilderGroupDraft {
    return {
      slug: placeable.id,
      label: placeable.label,
      tags: placeable.category,
      prompt: this.state.groupDraft.prompt,
    };
  }

  private loadPlaceableForEdit(placeable: BuilderPlaceableItem) {
    this.clearUndoStack();
    const groupDraft = this.groupDraftForPlaceable(placeable);
    const { mapData, decorId } = createIsolatedAssetMapFromPlaceable(placeable);
    this.setState({
      itemType: placeable.category,
      selectedPlaceableId: placeable.id,
      editingScope: "isolated",
      mapData: refreshMapData(mapData),
      selectedRefs: decorId ? [{ kind: "decor", id: decorId }] : [],
      activePlacement: null,
      tool: "select",
      groupDraft,
      editingLibraryEntryId: null,
      editingPlacedDecorId: decorId,
      assetSaveStatus: "idle",
      assetSaveError: null,
      wallStart: null,
    });
  }

  private loadDecorForEdit(decor: DecorItemSpec, id: string, label: string, tags: string) {
    this.clearUndoStack();
    const { mapData, decorId } = createIsolatedAssetMapFromDecor(decor, id);
    this.setState({
      itemType: "asset",
      editingScope: "isolated",
      mapData: refreshMapData(mapData),
      selectedRefs: [{ kind: "decor", id: decorId }],
      activePlacement: null,
      tool: "select",
      groupDraft: {
        slug: id,
        label,
        tags,
        prompt: this.state.groupDraft.prompt,
      },
      editingLibraryEntryId: null,
      editingPlacedDecorId: decorId,
      assetSaveStatus: "idle",
      assetSaveError: null,
      wallStart: null,
    });
  }

  hydrateBrowserLibrary() {
    if (typeof window === "undefined") return;
    this.startSceneSync();
    void fetchRecentAssets().then((recentGeneratedAssets) => {
      this.setState({ recentGeneratedAssets });
    });
    const localEntries = loadLocalLibraryEntries();
    if (localEntries) {
      this.setState({ library: mergeLibraryEntries([...DEV_BUILDER_ASSET_LIBRARY, ...localEntries]) });
    }
    void fetchRepoLibraryEntries().then((repoEntries) => {
      this.setState({ library: mergeLibraryEntries([...this.state.library, ...repoEntries]) });
    });
  }

  private persistBrowserLibrary(entries: readonly BuilderAssetLibraryEntry[]) {
    const localEntries = entries.filter((entry) => !DEV_BUILDER_ASSET_LIBRARY.some((seed) => seed.id === entry.id));
    persistLocalLibraryEntries(localEntries);
  }

  setMaterialRegistry(materialRegistry: MaterialRegistry) {
    this.setState({ materialRegistry });
  }

  setPropertiesTab(propertiesTab: BuilderPropertiesTab) {
    this.setState({ propertiesTab });
  }

  setTool(tool: BuilderTool) {
    const next: Partial<BuilderState> = { tool, wallStart: null };
    if (tool === "select") next.activePlacement = null;
    this.setState(next);
  }

  setItemType(itemType: BuilderItemType) {
    const placeable = defaultPlaceableForCategory(itemType);
    this.loadPlaceableForEdit(placeable);
  }

  setSelectedPlaceable(placeableId: string) {
    const placeable = findPlaceableItem(placeableId);
    if (!placeable) return;
    this.loadPlaceableForEdit(placeable);
  }

  armPlaceableForStamp(placeable: BuilderPlaceableItem) {
    if (placeable.source.kind === "catalog") {
      const asset = getWorldModelAsset(placeable.source.modelKey);
      if (!asset) return;
      this.setState({
        activePlacement: {
          kind: "catalog",
          modelKey: placeable.source.modelKey,
          label: placeable.label,
        },
        tool: "stamp",
      });
      return;
    }
    if (placeable.source.kind === "decor") {
      this.setState({
        activePlacement: {
          kind: "decor",
          template: decorToStampTemplate(placeable.source.template),
          label: placeable.label,
          idBase: placeable.id,
        },
        tool: "stamp",
      });
    }
  }

  armRecentAsset(recentId: string) {
    const recent = this.state.recentGeneratedAssets.find((entry) => entry.id === recentId);
    if (!recent?.decor || recentAssetStatus(recent) !== "ready") return;
    this.setState({
      activePlacement: { kind: "recent", recentId, label: recent.label },
      tool: "stamp",
    });
  }

  armCatalogModel(modelKey: string) {
    const asset = getWorldModelAsset(modelKey);
    if (!asset) return;
    const placeable = findPlaceableByCatalogModel(modelKey);
    if (placeable) {
      this.loadPlaceableForEdit(placeable);
      return;
    }
    this.loadDecorForEdit(
      {
        type: "model",
        assetType: "model",
        modelKey,
        footprint: asset.footprint ?? { width: 1, depth: 1 },
        position: [0, 0, 0],
        castShadow: true,
        receiveShadow: true,
      },
      modelKey,
      asset.label,
      "asset",
    );
  }

  armLibraryEntry(entryId: string) {
    const entry = this.state.library.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    if (entry.kind === "place" && entry.place) {
      this.selectLibraryEntry(entryId);
      return;
    }
    if (!entry.decor) return;
    this.setState({ editingLibraryEntryId: entry.id });
    this.loadDecorForEdit(decorToStampTemplate(entry.decor), entry.id, entry.label, entry.tags.join(", "));
  }

  clearActivePlacement() {
    if (!this.state.activePlacement) return;
    this.setState({ activePlacement: null, tool: "select" });
  }

  private replaceRecentAsset(recentId: string, next: BuilderRecentAsset) {
    const recentGeneratedAssets = this.state.recentGeneratedAssets.map((entry) =>
      entry.id === recentId ? next : entry,
    );
    this.setState({ recentGeneratedAssets });
    persistRecentAssets(recentGeneratedAssets);
  }

  setPlacementSource(placementSource: BuilderPlacementSource) {
    this.setState({ placementSource });
  }

  setPrimitiveKind(kind: BuilderPrimitiveKind) {
    this.setState({ primitive: { ...this.state.primitive, kind } });
  }

  setPrimitiveNumber(key: keyof Omit<BuilderPrimitiveDraft, "kind">, value: number) {
    this.setState({
      primitive: {
        ...this.state.primitive,
        [key]: Math.max(key === "segments" ? 8 : 0.05, value),
      },
    });
  }

  setSelectedCatalogModelKey(selectedCatalogModelKey: string) {
    this.setState({ selectedCatalogModelKey });
  }

  setActiveMaterialKey(activeMaterialKey: string) {
    this.setState({ activeMaterialKey });
  }

  updateRoomDraft(next: Partial<BuilderRoomDraft>) {
    this.setState({ roomDraft: { ...this.state.roomDraft, ...next } });
  }

  startNewRoom() {
    this.clearUndoStack();
    this.setState({ editingScope: "room" });
    this.replaceMapData(createBuilderRoom(this.state.roomDraft), []);
    this.setState({ editingLibraryEntryId: null, editingPlacedDecorId: null, assetSaveStatus: "idle", assetSaveError: null });
  }

  setAiPrompt(prompt: string) {
    this.setState({ aiDraft: { ...this.state.aiDraft, prompt } });
  }

  /**
   * Ask the local agent CLI (via the dev-server endpoint) to compose the
   * prompted object from primitives. Returns immediately with a pending card
   * in the asset viewer while generation runs in the background.
   */
  generateAiAsset() {
    if (!isCatalogBuilderCategory(this.state.itemType) || this.state.itemType !== "asset") return;
    const prompt = this.state.aiDraft.prompt.trim();
    if (!prompt) return;

    const recentId = `recent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const label = prompt.slice(0, 48) || "Generated asset";
    const pending: BuilderRecentAsset = {
      id: recentId,
      label,
      prompt,
      createdAt: Date.now(),
      status: "pending",
    };

    this.setState({
      aiDraft: { prompt: "", status: "idle", error: null },
      recentGeneratedAssets: [pending, ...this.state.recentGeneratedAssets].slice(0, MAX_RECENT_GENERATED_ASSETS),
    });

    void this.runAiAssetGeneration(recentId, prompt);
  }

  private async runAiAssetGeneration(recentId: string, prompt: string) {
    try {
      const item = await requestGeneratedAsset(prompt);
      this.replaceRecentAsset(recentId, {
        id: recentId,
        label: prompt.trim().slice(0, 48) || "Generated asset",
        prompt: prompt.trim(),
        createdAt: Date.now(),
        decor: decorToStampTemplate(item),
        status: "ready",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      const failed = this.getState().recentGeneratedAssets.find((entry) => entry.id === recentId);
      if (!failed) return;
      this.replaceRecentAsset(recentId, {
        ...failed,
        status: "error",
        error: message,
      });
    }
  }

  updateGroupDraft(next: Partial<BuilderGroupDraft>) {
    this.setState({ groupDraft: { ...this.state.groupDraft, ...next } });
  }

  loadMapData(mapData: MapData, selectedRefs: readonly BuilderSelectionRef[] = []) {
    this.replaceMapData(mapData, selectedRefs);
  }

  handleFloorClick(x: number, z: number, additive: boolean) {
    if (this.state.tool === "stamp" && this.state.activePlacement) {
      this.placeActiveStampAt(x, z);
      return;
    }
    const { tool } = this.state;
    if (tool === "select") {
      this.selectAtPoint(x, z, additive);
      return;
    }
    if (tool === "delete") {
      const hit = findHitRef(this.state.mapData, x, z);
      if (hit) this.deleteRefs([hit]);
      return;
    }
    if (tool === "material") {
      this.paintAt(x, z);
      return;
    }
    if (tool === "wall") {
      this.handleWallClick(x, z);
      return;
    }
    this.addPlacementAt(x, z);
  }

  hitTest(x: number, z: number): BuilderSelectionRef | null {
    return findHitRef(this.state.mapData, x, z);
  }

  setHoverRef(hoverRef: BuilderSelectionRef | null) {
    if (isSameSelectionRef(this.state.hoverRef, hoverRef)) return;
    this.setState({ hoverRef });
  }

  selectRef(ref: BuilderSelectionRef, additive: boolean) {
    if (!isSelectionRefPresent(this.state.mapData, ref)) return;
    if (!additive) {
      this.setState({ selectedRefs: [ref] });
      return;
    }
    this.setState({
      selectedRefs: hasSelectionRef(this.state.selectedRefs, ref)
        ? selectionWithoutRef(this.state.selectedRefs, ref)
        : [...this.state.selectedRefs, ref],
    });
  }

  selectAtPoint(x: number, z: number, additive: boolean) {
    const hit = findHitRef(this.state.mapData, x, z);
    if (!hit) {
      if (!additive) this.setState({ selectedRefs: [] });
      return;
    }
    this.selectRef(hit, additive);
  }

  deleteRef(ref: BuilderSelectionRef) {
    this.deleteRefs([ref]);
  }

  private handleWallClick(x: number, z: number) {
    const mapData = cloneSpec(this.state.mapData);
    const grid = getMapGrid(mapData);
    const snapped = snapWorldToGrid(grid, x, z);
    if (!this.state.wallStart) {
      this.setState({ wallStart: [snapped.worldX, snapped.worldZ] });
      return;
    }
    const wall = computeWallSegment(
      mapData.environment.wallHeight,
      mapData.environment.wallThickness,
      grid,
      this.state.wallStart,
      [snapped.worldX, snapped.worldZ],
    );
    mapData.walls.push(wall);
    this.replaceMapData(mapData, [{ kind: "wall", index: mapData.walls.length - 1 }]);
  }

  placeActiveStampAt(x: number, z: number) {
    const placement = this.state.activePlacement;
    if (!placement) return;
    this.pushUndo();
    const mapData = cloneSpec(this.state.mapData);
    const grid = getMapGrid(mapData);
    const idBase = placement.kind === "recent"
      ? `recent_${placement.recentId}`
      : placement.kind === "catalog"
        ? placement.modelKey
        : placement.idBase;
    const template = resolveStampTemplate(this.state, placement);
    if (!template) return;
    const id = nextUniqueDecorId(mapData, idBase);
    const placed = stampDecorAt(BUILDER_ASSETS, template, grid, x, z, id);
    mapData.decor.push(placed);
    this.replaceMapData(mapData, []);
  }

  private addPlacementAt(x: number, z: number) {
    this.pushUndo();
    const mapData = cloneSpec(this.state.mapData);
    const grid = getMapGrid(mapData);
    const id = nextUniqueDecorId(mapData, this.state.placementSource === "catalog" ? this.state.selectedCatalogModelKey : this.state.primitive.kind);
    const item = this.state.placementSource === "catalog"
      ? catalogModelToDecor(BUILDER_ASSETS, this.state.selectedCatalogModelKey, grid, x, z, id)
      : primitiveToDecor(
        this.state.primitive,
        grid,
        x,
        z,
        id,
        resolveMaterial(this.state.activeMaterialKey, this.state.materialRegistry),
      );
    mapData.decor.push(item);
    this.replaceMapData(mapData, [{ kind: "decor", id: item.id ?? id }]);
  }

  selectLibraryEntry(entryId: string) {
    const entry = this.state.library.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    const groupDraft = {
      slug: entry.id,
      label: entry.label,
      tags: entry.tags.join(", "),
      prompt: entry.prompt ?? this.state.groupDraft.prompt,
    };
    if (entry.kind === "place" && entry.place) {
      this.setState({ editingScope: "room" });
      this.replaceMapData(cloneSpec(entry.place), []);
      this.setState({
        groupDraft,
        editingLibraryEntryId: entry.id,
        editingPlacedDecorId: null,
        assetSaveStatus: "idle",
        assetSaveError: null,
      });
      return;
    }
    if (!entry.decor) return;
    this.setState({ editingLibraryEntryId: entry.id });
    this.loadDecorForEdit(decorToStampTemplate(entry.decor), entry.id, entry.label, entry.tags.join(", "));
  }

  private paintAt(x: number, z: number) {
    const hit = findHitRef(this.state.mapData, x, z);
    if (!hit) {
      this.applyMaterialToFloor();
      return;
    }
    if (hit.kind === "wall") {
      this.applyMaterialToWalls();
      return;
    }
    this.applyMaterialToRefs([hit]);
  }

  applyMaterialToSelection() {
    this.applyMaterialToRefs(this.state.selectedRefs);
  }

  applyMaterialToRef(ref: BuilderSelectionRef) {
    if (ref.kind === "wall") {
      this.applyMaterialToWalls();
      return;
    }
    this.applyMaterialToRefs([ref]);
  }

  private applyMaterialToRefs(refs: readonly BuilderSelectionRef[]) {
    const material = resolveMaterial(this.state.activeMaterialKey, this.state.materialRegistry);
    const next = applyMaterialToRefs(this.state.mapData, refs, material);
    if (next === this.state.mapData) return;
    this.replaceMapData(next);
  }

  applyMaterialToFloor() {
    const material = resolveMaterial(this.state.activeMaterialKey, this.state.materialRegistry);
    const tileSize = this.state.materialRegistry[material.key]?.tileSize ?? 1;
    this.replaceMapData(applyFloorMaterial(this.state.mapData, material.key, tileSize));
  }

  applyMaterialToWalls() {
    const material = resolveMaterial(this.state.activeMaterialKey, this.state.materialRegistry);
    this.replaceMapData(applyWallMaterial(this.state.mapData, material.key, material.color));
  }

  moveSelection(dx: number, dy: number, dz: number, snapToGrid: boolean, recordUndo = false) {
    if (this.state.selectedRefs.length === 0) return;
    if (recordUndo) this.pushUndo();
    this.replaceMapData(moveSelectionInMap(this.state.mapData, this.state.selectedRefs, { dx, dy, dz }, snapToGrid));
  }

  rotateSelection90() {
    if (this.state.selectedRefs.length === 0) return;
    this.replaceMapData(rotateSelection90InMap(this.state.mapData, this.state.selectedRefs));
  }

  /** Resize the selection to an absolute world-space bounding box (panel inputs / fit-to-floor). */
  resizeSelectionBounds(targetBounds: BuilderBounds3d, context?: BuilderResizeContext) {
    const refs = context?.refs ?? this.state.selectedRefs;
    if (refs.length === 0) return;
    const fromBounds = context?.fromBounds ?? selectionBounds(BUILDER_ASSETS, this.state.mapData, refs);
    if (!fromBounds) return;
    const target = clampSelectionBounds(targetBounds);
    const snapshot = context?.snapshot ?? createResizeSnapshot(this.state.mapData, refs);
    const edgeDrag = context?.axis !== undefined && context.edge !== undefined
      ? { axis: context.axis, edge: context.edge }
      : undefined;
    const patched = patchMapDataForResize(this.state.mapData, snapshot, fromBounds, target, refs, edgeDrag);
    this.replaceMapData(patched);
  }

  setSelectionSize(width?: number, height?: number, depth?: number) {
    const current = this.selectionBounds();
    if (!current) return;
    this.resizeSelectionBounds({
      minX: current.minX,
      maxX: width !== undefined ? current.minX + Math.max(MIN_SELECTION_AXIS_SIZE, width) : current.maxX,
      minY: current.minY,
      maxY: height !== undefined ? current.minY + Math.max(MIN_SELECTION_AXIS_SIZE, height) : current.maxY,
      minZ: current.minZ,
      maxZ: depth !== undefined ? current.minZ + Math.max(MIN_SELECTION_AXIS_SIZE, depth) : current.maxZ,
    });
  }

  nudgeSelectionSize(axis: "width" | "height" | "depth", delta: number) {
    const current = this.selectionBounds();
    if (!current) return;
    const width = current.maxX - current.minX;
    const height = current.maxY - current.minY;
    const depth = current.maxZ - current.minZ;
    this.setSelectionSize(
      axis === "width" ? Math.max(MIN_SELECTION_AXIS_SIZE, width + delta) : undefined,
      axis === "height" ? Math.max(MIN_SELECTION_AXIS_SIZE, height + delta) : undefined,
      axis === "depth" ? Math.max(MIN_SELECTION_AXIS_SIZE, depth + delta) : undefined,
    );
  }

  /** Uniformly scale selection to fit inside the room floor with a small margin. */
  fitSelectionToFloor(margin = 0.5) {
    const current = this.selectionBounds();
    if (!current) return;
    const floor = this.state.mapData.environment.floor;
    const maxWidth = Math.max(MIN_SELECTION_AXIS_SIZE, floor.width - margin * 2);
    const maxDepth = Math.max(MIN_SELECTION_AXIS_SIZE, floor.depth - margin * 2);
    const width = current.maxX - current.minX;
    const depth = current.maxZ - current.minZ;
    const scale = Math.min(maxWidth / width, maxDepth / depth, 1);
    if (!Number.isFinite(scale) || scale >= 0.999) {
      const centerX = (current.minX + current.maxX) / 2;
      const centerZ = (current.minZ + current.maxZ) / 2;
      const dx = floor.centerX - centerX;
      const dz = floor.centerZ - centerZ;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        this.moveSelection(dx, 0, dz, false);
      }
      return;
    }
    const newWidth = width * scale;
    const newDepth = depth * scale;
    this.resizeSelectionBounds({
      minX: floor.centerX - newWidth / 2,
      maxX: floor.centerX + newWidth / 2,
      minY: current.minY,
      maxY: current.maxY,
      minZ: floor.centerZ - newDepth / 2,
      maxZ: floor.centerZ + newDepth / 2,
    });
  }

  deleteSelected() {
    this.deleteRefs(this.state.selectedRefs);
  }

  duplicateSelection(offset: [number, number, number] = [0.5, 0, 0.5]) {
    if (this.state.selectedRefs.length === 0) return;
    const { mapData, selectedRefs } = duplicateSelectionInMap(this.state.mapData, this.state.selectedRefs, offset);
    this.replaceMapData(mapData, selectedRefs);
  }

  private deleteRefs(refs: readonly BuilderSelectionRef[]) {
    if (refs.length === 0) return;
    this.replaceMapData(deleteRefsFromMap(this.state.mapData, refs), []);
  }

  glueSelection() {
    const slug = slugify(this.state.groupDraft.slug);
    if (!slug || this.state.selectedRefs.length === 0) return;
    const materialColor = resolveMaterial(this.state.mapData.environment.wallMaterial).color;
    const result = glueSelectionInMap(BUILDER_ASSETS, this.state.mapData, this.state.selectedRefs, slug, materialColor);
    if (!result) return;
    this.replaceMapData(result.mapData, [{ kind: "decor", id: result.group.id ?? slug }]);
  }

  ungroupSelection() {
    if (this.state.selectedRefs.length !== 1) return;
    const [ref] = this.state.selectedRefs;
    if (ref.kind !== "decor") return;
    const result = ungroupDecor(this.state.mapData, ref.id);
    if (!result) return;
    this.replaceMapData(
      result.mapData,
      result.children
        .map((child): BuilderSelectionRef => ({ kind: "decor", id: child.id ?? "" }))
        .filter((ref) => ref.kind === "decor" && ref.id.length > 0),
    );
  }

  /** Selected group verbatim, or a group composed from the whole selection. */
  private buildGroupForSave(slug: string): DecorItemSpec | null {
    const selectedGroup = this.state.selectedRefs.length === 1 && this.state.selectedRefs[0].kind === "decor"
      ? this.state.mapData.decor[findDecorIndexById(this.state.mapData, this.state.selectedRefs[0].id)]
      : null;
    if (selectedGroup?.type === "group") return cloneSpec(selectedGroup);
    const materialColor = resolveMaterial(this.state.mapData.environment.wallMaterial).color;
    return buildGroupFromSelection(BUILDER_ASSETS, this.state.mapData, this.state.selectedRefs, slug, materialColor);
  }

  saveToLibrary(scope: BuilderLibrarySaveScope) {
    const slug = slugify(this.state.groupDraft.slug);
    if (!slug) return;
    const tags = parseTags(this.state.groupDraft.tags);
    let entry: BuilderAssetLibraryEntry | null = null;
    if (scope === "scene") {
      entry = {
        id: slug,
        label: this.state.groupDraft.label || slug,
        tags: tags.length ? tags : ["place"],
        kind: "place",
        place: refreshMapData(this.state.mapData),
      };
    } else {
      const decor = this.buildGroupForSave(slug);
      if (!decor) return;
      entry = {
        id: slug,
        label: this.state.groupDraft.label || slug,
        tags: tags.length ? tags : ["prop"],
        kind: "group",
        decor,
        footprint: decor.footprint,
        prompt: this.state.groupDraft.prompt,
        suggestedPath: `/models/dev/${slug.replaceAll("_", "-")}.glb`,
      };
    }
    const library = mergeLibraryEntries([...this.state.library, entry]);
    this.setState({
      library,
      lastExport: `// llmville/src/dev/builder/assetLibrary.ts\n${JSON.stringify(entry, null, 2)}`,
      assetSaveStatus: "saved",
      assetSaveError: null,
    });
    this.persistBrowserLibrary(library);
  }

  private buildReplacementForActiveLibraryEntry(entry: BuilderAssetLibraryEntry): BuilderAssetLibraryEntry | null {
    const tags = parseTags(this.state.groupDraft.tags);
    if (entry.kind === "place" && entry.place) {
      return {
        ...entry,
        label: this.state.groupDraft.label || entry.label,
        tags: tags.length ? tags : entry.tags,
        place: refreshMapData(this.state.mapData),
      };
    }

    if (entry.kind !== "group") return null;
    if (!this.state.editingPlacedDecorId || this.state.selectedRefs.length !== 1) return null;
    const selected = this.state.selectedRefs[0];
    if (selected.kind !== "decor" || selected.id !== this.state.editingPlacedDecorId) return null;
    const source = this.state.mapData.decor[findDecorIndexById(this.state.mapData, selected.id)];
    if (!source) return null;

    const decor = cloneSpec(source);
    decor.id = entry.id;
    const grid = getMapGrid(this.state.mapData);
    const bounds = getDecorItemBounds(decor, grid);
    if (bounds && decor.type !== "model") {
      decor.footprint = computeFootprintFromBounds(bounds, grid);
    }

    return {
      ...entry,
      label: this.state.groupDraft.label || entry.label,
      tags: tags.length ? tags : entry.tags,
      decor,
      footprint: decor.footprint,
      prompt: this.state.groupDraft.prompt,
    };
  }

  private updateLibraryEntry(replacement: BuilderAssetLibraryEntry): readonly BuilderAssetLibraryEntry[] {
    const replaced = this.state.library.some((entry) => entry.id === replacement.id);
    return replaced
      ? this.state.library.map((entry) => (entry.id === replacement.id ? replacement : entry))
      : [...this.state.library, replacement];
  }

  async saveCurrentAsset() {
    const activeEntry = this.state.editingLibraryEntryId
      ? this.state.library.find((entry) => entry.id === this.state.editingLibraryEntryId)
      : null;
    const replacement = activeEntry ? this.buildReplacementForActiveLibraryEntry(activeEntry) : null;
    if (!replacement) {
      this.saveToLibrary("selection");
      return;
    }

    const isSourceEntry = DEV_BUILDER_ASSET_LIBRARY.some((entry) => entry.id === replacement.id);
    if (!isSourceEntry) {
      const library = this.updateLibraryEntry(replacement);
      this.setState({
        library,
        assetSaveStatus: "saved",
        assetSaveError: null,
        lastExport: `Saved ${replacement.id} to llmville/public/dev-assets/builder-library.json`,
      });
      this.persistBrowserLibrary(library);
      return;
    }

    this.setState({ assetSaveStatus: "saving", assetSaveError: null });
    try {
      const sourceEntries = DEV_BUILDER_ASSET_LIBRARY.map((entry) => (
        entry.id === replacement.id ? replacement : entry
      ));
      await saveSourceLibraryEntries(sourceEntries);
      this.setState({
        library: this.updateLibraryEntry(replacement),
        assetSaveStatus: "saved",
        assetSaveError: null,
        lastExport: `Saved ${replacement.id} to llmville/src/dev/builder/assetLibrary.ts`,
      });
    } catch (error) {
      this.setState({
        assetSaveStatus: "error",
        assetSaveError: error instanceof Error ? error.message : "Failed to save asset.",
      });
    }
  }

  promoteSelectionToCatalog() {
    const slug = slugify(this.state.groupDraft.slug);
    if (!slug) return;
    const group = this.buildGroupForSave(slug);
    if (!group) return;
    group.id = slug;
    const grid = getMapGrid(this.state.mapData);
    group.footprint = group.footprint
      ?? computeFootprintFromBounds(getDecorItemBounds(group, grid) ?? { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, grid);
    const snippet = buildCatalogSnippet(group, this.state.groupDraft.label || slug, this.state.groupDraft.prompt);
    this.setState({
      lastPromotedModelKey: slug,
      lastCatalogSnippet: snippet,
      lastExport: snippet,
    });
  }

  copySelectionJson() {
    const payload = buildSelectionPayload(this.state.mapData, this.state.selectedRefs);
    this.setState({ lastExport: JSON.stringify(payload, null, 2) });
  }

  copyMapJson() {
    this.setState({ lastExport: exportBuilderMapJson(refreshMapData(this.state.mapData)) });
  }

  copyWorldBuilderSnippet() {
    this.setState({ lastExport: buildWorldBuilderSnippet(this.state.mapData) });
  }
}

export const BuilderStore = new BuilderStoreImpl();

export function useBuilderState() {
  return useSyncExternalStore(
    (listener) => BuilderStore.subscribe(listener),
    () => BuilderStore.getState(),
  );
}
