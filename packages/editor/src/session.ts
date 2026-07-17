import {
  createDocumentLiveSync,
  createEditorSession,
  createRuntimePlayControl,
  editorChildren,
  editorDocumentBounds,
  editorParentOf,
  editorRoots,
  findEditorCatalog,
  findEditorCatalogEntry,
  findEditorCollection,
  findEditorPrefab,
  getRuntimeInspectorValue,
  installDocumentLiveSync,
  listEditorKinds,
  normalizeEditorLayers,
  planRuntimeInspectorSet,
  runtimeEntityMetaWriteBackCommand,
  runtimeEntityWriteBackCommand,
  seedEditorCatalogs,
  summarizeEditorSession,
  summarizeRuntimeInspector,
  createGridLayer,
  eyedropGridCell,
  gridCellCount,
  importAsciiGrid,
  importCsvGrid,
  type DocumentLiveSync,
  type DocumentPatch,
  type EditorCatalogDefinition,
  type EditorCommand,
  type EditorDocument,
  type EditorGridLayer,
  type EditorGridPaletteEntry,
  type EditorKindVisibility,
  type EditorLayersInput,
  type EditorSession,
  type EditorSessionState,
  type RuntimeEntityState,
  type RuntimePlayControl,
} from "@jgengine/core/editor/index";
import {
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
  type TerraformEdit,
  type TerraformMode,
  type TerrainMaterialLayer,
  type TerrainSurfaceRule,
} from "@jgengine/core/world/terraform";
import { resolvePlaceAsset, toEditorMarker } from "@jgengine/core/world/placeAsset";

import {
  resolveScatter,
  resolveScatterRegion,
  scatterRegionEstimate,
  scatterRegionFromPath,
  SCATTER_PATH_KIND,
  type ScatterTerrain,
} from "@jgengine/core/world/scatterRegion";
import type { EditorMarker } from "@jgengine/core/editor/index";

import { registerBuiltinSceneKinds } from "@jgengine/core/scene/builtinSceneKinds";
import { getSceneKind, validateParams } from "@jgengine/core/scene/sceneKinds";

import { TERRAIN_MATERIALS } from "./uiStore";

registerBuiltinSceneKinds();

/** Which document collection an object lives in, plus its current kind + meta ΓÇö for generic `set_meta`. */
function findMetaTarget(
  doc: EditorDocument,
  id: string,
): { target: "marker" | "volume" | "path" | "note"; kind: string; meta: Record<string, unknown> | undefined } | null {
  const marker = doc.markers.find((m) => m.id === id);
  if (marker !== undefined) return { target: "marker", kind: marker.kind, meta: marker.meta };
  const volume = doc.volumes.find((v) => v.id === id);
  if (volume !== undefined) return { target: "volume", kind: volume.kind, meta: volume.meta };
  const path = doc.paths.find((p) => p.id === id);
  if (path !== undefined) return { target: "path", kind: path.kind, meta: path.meta };
  const note = doc.annotations.find((n) => n.id === id);
  if (note !== undefined) return { target: "note", kind: "note", meta: note.meta };
  return null;
}

/** Compact grid-layer summary returned by the grid RPC verbs — never the full sparse cell map. */
function gridLayerSummary(layer: EditorGridLayer): {
  id: string;
  kind: string;
  label?: string;
  cols: number;
  rows: number;
  cellSize: number;
  cellCount: number;
  visible: boolean;
  paletteIds: string[];
} {
  return {
    id: layer.id,
    kind: layer.kind,
    ...(layer.label === undefined ? {} : { label: layer.label }),
    cols: layer.cols,
    rows: layer.rows,
    cellSize: layer.cellSize,
    cellCount: gridCellCount(layer),
    visible: layer.visible ?? true,
    paletteIds: (layer.palette ?? []).map((entry) => entry.id),
  };
}

/** Validates a merged meta bag against a registered kind's schema; returns an error string or null. */
function validateMetaForKind(kind: string, meta: Record<string, unknown> | undefined): string | null {
  const definition = getSceneKind(kind);
  if (definition === undefined || meta === undefined) return null;
  const issues = validateParams(definition.schema, meta);
  if (issues.length === 0) return null;
  return `invalid ${kind} params: ${issues.map((issue) => `${issue.key} (${issue.message})`).join(", ")}`;
}

/** How the editor hosts the game: frozen placement view, roamable world, or the real game. */
export type EditorRunMode = "edit" | "walk" | "play";

const EDITOR_RUN_MODES: readonly EditorRunMode[] = ["edit", "walk", "play"];

/** RPC request shapes the editor host understands, used by the MCP bridge and UI. */
export type EditorBridgeRequest =
  | { method: "editor_status" }
  | { method: "set_mode"; mode: EditorRunMode }
  | { method: "perf_report" }
  | { method: "list_layers" }
  | { method: "list_catalogs" }
  | { method: "get_catalog_entry"; catalogId: string; entryId: string }
  | { method: "set_catalog_entry"; catalogId: string; entryId: string; patch: Record<string, unknown>; label?: string }
  | { method: "list_selection" }
  | { method: "get_marker"; id: string }
  | { method: "get_volume"; id: string }
  | { method: "set_transform"; id: string; x?: number; y?: number; z?: number; rotationY?: number }
  | { method: "set_volume"; id: string; radius?: number; height?: number; x?: number; y?: number; z?: number }
  | { method: "set_path"; id: string; kind?: string; width?: number; color?: string; label?: string; meta?: Record<string, unknown> }
  | { method: "set_marker"; id: string; kind?: string; color?: string; label?: string; rotationY?: number; meta?: Record<string, unknown> }
  | { method: "set_note"; id: string; text?: string; meta?: Record<string, unknown> }
  | { method: "set_meta"; id: string; patch: Record<string, unknown> }
  | { method: "select"; ids: string[] }
  | { method: "clear_selection" }
  | { method: "camera_goto"; id?: string; x?: number; y?: number; z?: number }
  | { method: "camera_frame" }
  | { method: "scene_summary" }
  | { method: "export_document" }
  | { method: "import_document"; json: string }
  | { method: "dispatch"; command: EditorCommand }
  | { method: "undo" }
  | { method: "redo" }
  | { method: "list_assets" }
  | { method: "place_asset"; id: string; kind?: string; x?: number; y?: number; z?: number }
  | { method: "create_terrain"; width?: number; depth?: number; cellSize?: number; centerX?: number; centerZ?: number }
  | {
      method: "sculpt_terrain";
      mode: TerraformMode;
      x: number;
      z: number;
      radius?: number;
      strength?: number;
      target?: number;
      toX?: number;
      toZ?: number;
      seed?: number;
      shape?: "circle" | "square";
    }
  | { method: "terrain_summary" }
  | { method: "paint_terrain"; surface: string; x: number; z: number; radius?: number; shape?: "circle" | "square" }
  | { method: "fill_terrain"; surface: string | null }
  | {
      method: "auto_paint";
      surface: string;
      minSlope?: number;
      maxSlope?: number;
      minHeight?: number;
      maxHeight?: number;
    }
  | { method: "terrain_materials" }
  | { method: "terrain_layers" }
  | { method: "set_terrain_layers"; layers: TerrainMaterialLayer[] }
  | {
      method: "blend_terrain";
      surface: string;
      x: number;
      z: number;
      radius?: number;
      strength?: number;
      shape?: "circle" | "square";
    }
  | { method: "convert_scatter"; pathId: string }
  | {
      method: "add_foliage";
      points: { x: number; z: number }[];
      density?: number;
      item?: string;
      seed?: string;
      minSpacing?: number;
    }
  | { method: "scatter_summary" }
  | { method: "set_parent"; ids: string[]; parentId: string | null }
  | { method: "hierarchy" }
  | { method: "list_prefabs" }
  | { method: "create_prefab"; id: string; name: string; ids: string[] }
  | { method: "insert_prefab"; prefabId: string; x?: number; y?: number; z?: number }
  | { method: "detach_prefab_instance"; instanceId: string }
  | { method: "delete_prefab"; prefabId: string }
  | { method: "list_collections" }
  | { method: "create_collection"; id: string; name: string; memberIds?: string[] }
  | { method: "rename_collection"; id: string; name: string }
  | { method: "delete_collection"; id: string }
  | { method: "set_collection_members"; id: string; memberIds: string[] }
  | { method: "add_to_collection"; id: string; ids: string[] }
  | { method: "remove_from_collection"; id: string; ids: string[] }
  | { method: "set_collection_flags"; id: string; color?: string; locked?: boolean; visible?: boolean }
  | { method: "select_collection"; id: string }
  | { method: "batch_set_properties"; ids: string[]; color?: string; label?: string; meta?: Record<string, unknown> }
  | { method: "assign_material"; ids: string[]; materialId: string }
  | { method: "list_grids" }
  | { method: "get_grid_cell"; id: string; col: number; row: number }
  | {
      method: "add_grid_layer";
      id: string;
      kind: string;
      cols: number;
      rows: number;
      label?: string;
      cellSize?: number;
      origin?: { x: number; y: number; z: number };
      axes?: "xz" | "xy";
      empty?: string;
      palette?: EditorGridPaletteEntry[];
    }
  | { method: "remove_grid_layer"; id: string }
  | {
      method: "set_grid_layer";
      id: string;
      label?: string;
      kind?: string;
      visible?: boolean;
      empty?: string;
      cellSize?: number;
      origin?: { x: number; y: number; z: number };
      axes?: "xz" | "xy";
      palette?: EditorGridPaletteEntry[];
    }
  | { method: "paint_grid_cells"; id: string; cells: { col: number; row: number; value: string }[] }
  | { method: "fill_grid_rect"; id: string; col0: number; row0: number; col1: number; row1: number; value: string }
  | { method: "flood_fill_grid"; id: string; col: number; row: number; value: string }
  | { method: "resize_grid_layer"; id: string; cols: number; rows: number }
  | {
      method: "import_grid";
      id: string;
      kind: string;
      format: "ascii" | "csv";
      text: string;
      empty?: string;
      cellSize?: number;
      origin?: { x: number; y: number; z: number };
      glyphMap?: Record<string, string>;
      palette?: EditorGridPaletteEntry[];
    }
  | { method: "push_document_patch"; patch: DocumentPatch; force?: boolean }
  | { method: "pull_document_patches"; sinceRevision?: number }
  | { method: "document_revision"; includeDocument?: boolean }
  | {
      method: "push_runtime_delta";
      at?: number;
      entities?: RuntimeEntityState[];
      removeIds?: string[];
      tunables?: Record<string, unknown>;
    }
  | { method: "pull_runtime_deltas"; sinceSeq?: number; includeSnapshot?: boolean }
  | { method: "runtime_snapshot" }
  | { method: "runtime_summary" }
  | { method: "runtime_get"; id: string; path?: string }
  | {
      method: "runtime_set";
      id: string;
      path?: string;
      value?: unknown;
      position?: { x: number; y: number; z: number };
      rotationY?: number;
      values?: Record<string, unknown>;
      writeBack?: boolean;
    }
  | { method: "runtime_pause" }
  | { method: "runtime_resume" }
  | { method: "runtime_step"; frames?: number }
  | { method: "set_runtime_override"; entity: RuntimeEntityState }
  | { method: "clear_runtime_override"; id: string }
  | { method: "write_back_override"; id: string };

/** Result envelope returned by every editor host RPC call. */
export type EditorBridgeResponse = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

/** A placeable asset entry offered in the editor's asset browser. */
export interface EditorAssetInfo {
  id: string;
  label: string;
  kind: string;
  url?: string;
}

/** Rolling frame-rate sample published by the in-canvas PerfProbe. */
export interface EditorPerfSample {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  sampledAt: number;
  /** Avg viewport raycast (pick) time this window — editor-authoring cost, not sim cost. */
  raycastMs?: number;
  /** Avg preview-mesh rebuild (displace) time this window — editor-authoring cost, not sim cost. */
  rebuildMs?: number;
  /** raycastMs + rebuildMs — total authoring overhead separated from the frame/sim budget. */
  authoringMs?: number;
}

/** The live editor's global control surface — session, visibility, camera focus, assets, mode, RPC. */
export interface EditorHostApi {
  gameId: string;
  getSession(): EditorSession;
  /** Two-way document/runtime live-sync bus shared with AuthoredScene and the bridge. */
  getLiveSync(): DocumentLiveSync;
  getVisibility(): EditorKindVisibility;
  setVisibility(next: EditorKindVisibility): void;
  subscribeVisibility(listener: () => void): () => void;
  getFocusTarget(): { x: number; y: number; z: number } | null;
  setFocusTarget(target: { x: number; y: number; z: number } | null): void;
  subscribeFocus(listener: (target: { x: number; y: number; z: number } | null) => void): () => void;
  getAssets(): readonly EditorAssetInfo[];
  setAssets(assets: readonly EditorAssetInfo[]): void;
  getCatalogDefinitions(): readonly EditorCatalogDefinition[];
  getPerf(): EditorPerfSample | null;
  setPerf(sample: EditorPerfSample): void;
  getMode(): EditorRunMode;
  setMode(mode: EditorRunMode): void;
  subscribeMode(listener: (mode: EditorRunMode) => void): () => void;
  /** Play-mode pause/step gate consumed by the runtime publisher. */
  getPlayControl(): RuntimePlayControl;
  setPlayControl(next: RuntimePlayControl): void;
  subscribePlayControl(listener: (play: RuntimePlayControl) => void): () => void;
  handle(request: EditorBridgeRequest): EditorBridgeResponse;
}

const GLOBAL_KEY = "__jgengineEditorHost";

/** Publishes an editor host globally so devtools and MCP agents can reach it; returns a cleanup fn. */
export function installEditorHost(api: EditorHostApi): () => void {
  const root = globalThis as typeof globalThis & { [GLOBAL_KEY]?: EditorHostApi };
  root[GLOBAL_KEY] = api;
  return () => {
    if (root[GLOBAL_KEY] === api) delete root[GLOBAL_KEY];
  };
}

/** Retrieves the globally installed editor host, or null if none is mounted. @internal */
export function getEditorHost(): EditorHostApi | null {
  const root = globalThis as typeof globalThis & { [GLOBAL_KEY]?: EditorHostApi };
  return root[GLOBAL_KEY] ?? null;
}

/** Builds and installs an editor host for a game: session, visibility, assets, and RPC handling. @internal */
export function createEditorHost(options: {
  gameId: string;
  layers: EditorLayersInput | undefined;
  /** Game-exported gameplay catalog definitions (schemas + defaults); seeds document.catalogs. */
  catalogs?: readonly EditorCatalogDefinition[];
  assets?: readonly EditorAssetInfo[];
  onFocus?: (target: { x: number; y: number; z: number } | null) => void;
}): {
  session: EditorSession;
  api: EditorHostApi;
  dispose: () => void;
} {
  const catalogDefinitions = options.catalogs ?? [];
  const catalogById = new Map(catalogDefinitions.map((definition) => [definition.id, definition]));
  const document = seedEditorCatalogs(normalizeEditorLayers(options.layers), catalogDefinitions);
  const session = createEditorSession(document);
  const liveSync = createDocumentLiveSync(document);
  const uninstallLiveSync = installDocumentLiveSync(liveSync);
  let lastMirroredDocument = session.getState().document;
  const unsubscribeSessionMirror = session.subscribe((state) => {
    if (state.document === lastMirroredDocument) return;
    lastMirroredDocument = state.document;
    liveSync.replaceDocument(state.document);
  });
  let visibility: EditorKindVisibility = {};
  let focusTarget: { x: number; y: number; z: number } | null = null;
  let assets: EditorAssetInfo[] = [...(options.assets ?? [])];
  let perf: EditorPerfSample | null = null;
  let mode: EditorRunMode = "edit";
  let playControl: RuntimePlayControl = createRuntimePlayControl(false);
  const visibilityListeners = new Set<() => void>();
  const focusListeners = new Set<(target: { x: number; y: number; z: number } | null) => void>();
  const modeListeners = new Set<(mode: EditorRunMode) => void>();
  const playControlListeners = new Set<(play: RuntimePlayControl) => void>();

  /** Dispatches a command and reports whether it actually mutated the session ΓÇö a rejected
   * mutation (locked target, cyclic parent, nothing to undo/redo, ΓÇª) returns the session's prior
   * state object unchanged, so identity tells the RPC layer apart from a real edit landing. */
  const dispatchGuarded = (command: EditorCommand): { applied: boolean; state: EditorSessionState } => {
    const before = session.getState();
    const state = session.dispatch(command);
    return { applied: state !== before, state };
  };

  const kinds = listEditorKinds(document);
  // Heavy / dense kinds off by default ΓÇö turn on from the Layers panel when needed.
  const defaultOff = new Set([
    "aggro",
    "leash",
    "respawn_skip",
    "discover",
    "flatten",
    "cluster",
    "road",
  ]);
  for (const kind of [...kinds.markers, ...kinds.volumes, ...kinds.paths]) {
    visibility[kind] = !defaultOff.has(kind);
  }

  const api: EditorHostApi = {
    gameId: options.gameId,
    getSession: () => session,
    getLiveSync: () => liveSync,
    getVisibility: () => visibility,
    setVisibility(next) {
      visibility = { ...next };
      for (const listener of visibilityListeners) listener();
    },
    subscribeVisibility(listener) {
      visibilityListeners.add(listener);
      return () => {
        visibilityListeners.delete(listener);
      };
    },
    getFocusTarget: () => focusTarget,
    setFocusTarget(target) {
      focusTarget = target;
      options.onFocus?.(target);
      for (const listener of focusListeners) listener(target);
    },
    subscribeFocus(listener) {
      focusListeners.add(listener);
      return () => {
        focusListeners.delete(listener);
      };
    },
    getAssets: () => assets,
    setAssets(next) {
      assets = [...next];
    },
    getCatalogDefinitions: () => catalogDefinitions,
    getPerf: () => perf,
    setPerf(sample) {
      perf = sample;
    },
    getMode: () => mode,
    setMode(next) {
      if (next === mode) return;
      mode = next;
      if (next === "play") {
        playControl = createRuntimePlayControl(false);
        for (const listener of playControlListeners) listener(playControl);
      }
      for (const listener of modeListeners) listener(mode);
    },
    subscribeMode(listener) {
      modeListeners.add(listener);
      return () => {
        modeListeners.delete(listener);
      };
    },
    getPlayControl: () => playControl,
    setPlayControl(next) {
      playControl = {
        paused: next.paused,
        pendingSteps: Math.max(0, Math.floor(next.pendingSteps)),
      };
      for (const listener of playControlListeners) listener(playControl);
    },
    subscribePlayControl(listener) {
      playControlListeners.add(listener);
      return () => {
        playControlListeners.delete(listener);
      };
    },
    handle(request) {
      try {
        switch (request.method) {
          case "editor_status":
            return {
              ok: true,
              result: {
                gameId: options.gameId,
                connected: true,
                ...summarizeEditorSession(session.getState()),
                canUndo: session.canUndo(),
                canRedo: session.canRedo(),
                perf,
                mode,
              },
            };
          case "set_mode": {
            if (!EDITOR_RUN_MODES.includes(request.mode)) {
              return { ok: false, error: `unknown mode: ${String(request.mode)} (edit | walk | play)` };
            }
            api.setMode(request.mode);
            return { ok: true, result: { mode: request.mode } };
          }
          case "perf_report": {
            const devtoolsGlobal = (
              globalThis as { __JG_DEVTOOLS?: { snapshot?: () => unknown } }
            ).__JG_DEVTOOLS;
            if (devtoolsGlobal?.snapshot === undefined) {
              return {
                ok: false,
                error: "engine devtools not mounted ΓÇö open the browser editor (F2+D panel) first",
              };
            }
            return { ok: true, result: { perf, report: devtoolsGlobal.snapshot() } };
          }
          case "list_layers": {
            const state = session.getState();
            return {
              ok: true,
              result: {
                kinds: listEditorKinds(state.document),
                visibility,
                document: state.document,
              },
            };
          }
          case "list_catalogs": {
            const state = session.getState();
            const catalogs = catalogDefinitions.map((definition) => {
              const data = findEditorCatalog(state.document, definition.id);
              return {
                id: definition.id,
                label: definition.label,
                schema: definition.schema,
                entryCount: data?.entries.length ?? definition.entries.length,
                entries: (data?.entries ?? definition.entries).map((entry) => ({
                  id: entry.id,
                  label: entry.label,
                })),
              };
            });
            return { ok: true, result: { catalogs } };
          }
          case "get_catalog_entry": {
            const definition = catalogById.get(request.catalogId);
            if (definition === undefined) return { ok: false, error: `catalog not found: ${request.catalogId}` };
            const entry = findEditorCatalogEntry(session.getState().document, request.catalogId, request.entryId);
            if (entry === undefined) return { ok: false, error: `catalog entry not found: ${request.catalogId}/${request.entryId}` };
            return {
              ok: true,
              result: {
                catalogId: request.catalogId,
                label: definition.label,
                schema: definition.schema,
                entry,
              },
            };
          }
          case "set_catalog_entry": {
            const definition = catalogById.get(request.catalogId);
            if (definition === undefined) return { ok: false, error: `catalog not found: ${request.catalogId}` };
            const current = findEditorCatalogEntry(session.getState().document, request.catalogId, request.entryId);
            if (current === undefined) return { ok: false, error: `catalog entry not found: ${request.catalogId}/${request.entryId}` };
            const merged = { ...current.meta, ...request.patch };
            const invalid = validateParams(definition.schema, merged);
            if (invalid.length > 0) {
              return {
                ok: false,
                error: `invalid ${request.catalogId} params: ${invalid.map((issue) => `${issue.key} (${issue.message})`).join(", ")}`,
              };
            }
            const coalesceKey =
              Object.keys(request.patch).length === 1
                ? `catalog:${request.catalogId}:${request.entryId}:${Object.keys(request.patch)[0]}`
                : `catalog:${request.catalogId}:${request.entryId}`;
            const before = session.getState();
            const state = session.dispatch(
              {
                type: "setCatalogEntry",
                catalogId: request.catalogId,
                entryId: request.entryId,
                patch: {
                  meta: merged,
                  ...(request.label === undefined ? {} : { label: request.label }),
                },
              },
              { coalesce: coalesceKey },
            );
            if (state === before) {
              return { ok: false, error: `set_catalog_entry rejected: ${request.catalogId}/${request.entryId}` };
            }
            const entry = findEditorCatalogEntry(state.document, request.catalogId, request.entryId);
            return { ok: true, result: { catalogId: request.catalogId, entry } };
          }
          case "list_selection":
            return { ok: true, result: { selection: session.getState().selection } };
          case "get_marker": {
            const marker = session.getState().document.markers.find((m) => m.id === request.id);
            return marker === undefined
              ? { ok: false, error: `marker not found: ${request.id}` }
              : { ok: true, result: marker };
          }
          case "get_volume": {
            const volume = session.getState().document.volumes.find((v) => v.id === request.id);
            return volume === undefined
              ? { ok: false, error: `volume not found: ${request.id}` }
              : { ok: true, result: volume };
          }
          case "set_transform": {
            const marker = session.getState().document.markers.find((m) => m.id === request.id);
            const volume = session.getState().document.volumes.find((v) => v.id === request.id);
            const base = marker?.position ?? volume?.center;
            if (base === undefined) return { ok: false, error: `id not found: ${request.id}` };
            const { applied, state } = dispatchGuarded({
              type: "setTransform",
              id: request.id,
              position: {
                x: request.x ?? base.x,
                y: request.y ?? base.y,
                z: request.z ?? base.z,
              },
              ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
            });
            if (!applied) return { ok: false, error: `set_transform rejected: ${request.id} is locked` };
            return { ok: true, result: summarizeEditorSession(state) };
          }
          case "set_volume": {
            const volume = session.getState().document.volumes.find((v) => v.id === request.id);
            if (volume === undefined) return { ok: false, error: `volume not found: ${request.id}` };
            session.dispatch({
              type: "setVolume",
              id: request.id,
              patch: {
                ...(request.radius === undefined ? {} : { radius: request.radius }),
                ...(request.height === undefined ? {} : { height: request.height }),
                ...(request.x === undefined && request.y === undefined && request.z === undefined
                  ? {}
                  : {
                      center: {
                        x: request.x ?? volume.center.x,
                        y: request.y ?? volume.center.y,
                        z: request.z ?? volume.center.z,
                      },
                    }),
              },
            });
            return { ok: true, result: session.getState().document.volumes.find((v) => v.id === request.id) };
          }
          case "set_path": {
            const doc = session.getState().document;
            const path = doc.paths.find((p) => p.id === request.id);
            if (path === undefined) return { ok: false, error: `path not found: ${request.id}` };
            const merged = request.meta === undefined ? undefined : { ...path.meta, ...request.meta };
            const kind = request.kind ?? path.kind;
            const invalid = validateMetaForKind(kind, merged);
            if (invalid !== null) return { ok: false, error: invalid };
            session.dispatch({
              type: "setPath",
              id: request.id,
              patch: {
                ...(request.kind === undefined ? {} : { kind: request.kind }),
                ...(request.width === undefined ? {} : { width: request.width }),
                ...(request.color === undefined ? {} : { color: request.color }),
                ...(request.label === undefined ? {} : { label: request.label }),
                ...(merged === undefined ? {} : { meta: merged }),
              },
            });
            return { ok: true, result: session.getState().document.paths.find((p) => p.id === request.id) };
          }
          case "set_marker": {
            const doc = session.getState().document;
            const marker = doc.markers.find((m) => m.id === request.id);
            if (marker === undefined) return { ok: false, error: `marker not found: ${request.id}` };
            const merged = request.meta === undefined ? undefined : { ...marker.meta, ...request.meta };
            const kind = request.kind ?? marker.kind;
            const invalid = validateMetaForKind(kind, merged);
            if (invalid !== null) return { ok: false, error: invalid };
            session.dispatch({
              type: "setMarker",
              id: request.id,
              patch: {
                ...(request.kind === undefined ? {} : { kind: request.kind }),
                ...(request.color === undefined ? {} : { color: request.color }),
                ...(request.label === undefined ? {} : { label: request.label }),
                ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
                ...(merged === undefined ? {} : { meta: merged }),
              },
            });
            return { ok: true, result: session.getState().document.markers.find((m) => m.id === request.id) };
          }
          case "set_note": {
            const doc = session.getState().document;
            const note = doc.annotations.find((n) => n.id === request.id);
            if (note === undefined) return { ok: false, error: `note not found: ${request.id}` };
            const merged = request.meta === undefined ? undefined : { ...note.meta, ...request.meta };
            session.dispatch({
              type: "setNote",
              id: request.id,
              patch: {
                ...(request.text === undefined ? {} : { text: request.text }),
                ...(merged === undefined ? {} : { meta: merged }),
              },
            });
            return { ok: true, result: session.getState().document.annotations.find((n) => n.id === request.id) };
          }
          case "set_meta": {
            const target = findMetaTarget(session.getState().document, request.id);
            if (target === null) return { ok: false, error: `object not found: ${request.id}` };
            const merged = { ...target.meta, ...request.patch };
            const invalid = validateMetaForKind(target.kind, merged);
            if (invalid !== null) return { ok: false, error: invalid };
            session.dispatch(
              target.target === "marker"
                ? { type: "setMarker", id: request.id, patch: { meta: merged } }
                : target.target === "volume"
                  ? { type: "setVolume", id: request.id, patch: { meta: merged } }
                  : target.target === "path"
                    ? { type: "setPath", id: request.id, patch: { meta: merged } }
                    : { type: "setNote", id: request.id, patch: { meta: merged } },
            );
            return { ok: true, result: { id: request.id, kind: target.kind, meta: merged } };
          }
          case "select":
            session.dispatch({ type: "select", ids: request.ids });
            return { ok: true, result: { selection: session.getState().selection } };
          case "clear_selection":
            session.dispatch({ type: "clearSelection" });
            return { ok: true, result: { selection: [] } };
          case "camera_goto": {
            if (request.id !== undefined) {
              const state = session.getState();
              const marker = state.document.markers.find((m) => m.id === request.id);
              const volume = state.document.volumes.find((v) => v.id === request.id);
              const point = marker?.position ?? volume?.center;
              if (point === undefined) return { ok: false, error: `id not found: ${request.id}` };
              api.setFocusTarget({ ...point });
              session.dispatch({ type: "select", ids: [request.id] });
              return { ok: true, result: { target: point } };
            }
            if (request.x === undefined || request.z === undefined) {
              return { ok: false, error: "camera_goto requires id or x/z" };
            }
            const target = { x: request.x, y: request.y ?? 0, z: request.z };
            api.setFocusTarget(target);
            return { ok: true, result: { target } };
          }
          case "camera_frame": {
            const bounds = editorDocumentBounds(session.getState().document);
            if (bounds === null) return { ok: false, error: "document is empty" };
            const target = {
              x: (bounds.min.x + bounds.max.x) / 2,
              y: (bounds.min.y + bounds.max.y) / 2,
              z: (bounds.min.z + bounds.max.z) / 2,
            };
            api.setFocusTarget(target);
            return { ok: true, result: { target, bounds } };
          }
          case "scene_summary":
            return {
              ok: true,
              result: {
                gameId: options.gameId,
                kinds: listEditorKinds(session.getState().document),
                ...summarizeEditorSession(session.getState()),
                bounds: editorDocumentBounds(session.getState().document),
              },
            };
          case "export_document":
            return { ok: true, result: { json: session.exportJson(true) } };
          case "import_document":
            session.dispatch({ type: "importJson", json: request.json });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          case "push_document_patch": {
            const force = request.force === true;
            const patch = request.patch;
            if (!force && patch.baseRevision !== liveSync.getRevision()) {
              return {
                ok: false,
                error: `baseRevision mismatch: patch=${patch.baseRevision} current=${liveSync.getRevision()}`,
              };
            }
            if (patch.type === "snapshot") {
              session.dispatch({ type: "replaceDocument", document: patch.document });
              return {
                ok: true,
                result: {
                  revision: liveSync.getRevision(),
                  ...summarizeEditorSession(session.getState()),
                },
              };
            }
            if (patch.commands.length === 0) return { ok: false, error: "commands patch is empty" };
            for (const command of patch.commands) {
              const { applied } = dispatchGuarded(command);
              if (!applied && command.type !== "select" && command.type !== "clearSelection") {
                return { ok: false, error: `${command.type} rejected while applying patch` };
              }
            }
            return {
              ok: true,
              result: {
                revision: liveSync.getRevision(),
                ...summarizeEditorSession(session.getState()),
              },
            };
          }
          case "pull_document_patches":
            return {
              ok: true,
              result: {
                revision: liveSync.getRevision(),
                patches: liveSync.pullPatches(request.sinceRevision ?? 0),
              },
            };
          case "document_revision":
            return {
              ok: true,
              result: {
                revision: liveSync.getRevision(),
                ...(request.includeDocument === true ? { document: liveSync.getDocument() } : {}),
              },
            };
          case "push_runtime_delta": {
            const delta = liveSync.pushRuntimeDelta({
              at: request.at ?? Date.now(),
              ...(request.entities === undefined ? {} : { entities: request.entities }),
              ...(request.removeIds === undefined ? {} : { removeIds: request.removeIds }),
              ...(request.tunables === undefined ? {} : { tunables: request.tunables }),
            });
            return { ok: true, result: delta };
          }
          case "pull_runtime_deltas":
            return {
              ok: true,
              result: {
                seq: liveSync.getRuntimeState().seq,
                deltas: liveSync.pullRuntimeDeltas(request.sinceSeq ?? 0),
                ...(request.includeSnapshot === true ? { snapshot: liveSync.getRuntimeState() } : {}),
              },
            };
          case "runtime_snapshot":
            return { ok: true, result: liveSync.getRuntimeState() };
          case "runtime_summary":
            return {
              ok: true,
              result: summarizeRuntimeInspector(
                liveSync.getRuntimeState(),
                liveSync.getRuntimeOverrides(),
                playControl,
              ),
            };
          case "runtime_get": {
            if (request.id.length === 0) return { ok: false, error: "runtime_get requires id" };
            const got = getRuntimeInspectorValue(
              liveSync.getRuntimeState(),
              liveSync.getRuntimeOverrides(),
              request.id,
              request.path,
            );
            if (got.kind === "missing") {
              return { ok: false, error: `runtime entity/tunable not found: ${request.id}` };
            }
            return { ok: true, result: got };
          }
          case "runtime_set": {
            if (request.id.length === 0) return { ok: false, error: "runtime_set requires id" };
            const plan = planRuntimeInspectorSet(session.getState().document, {
              id: request.id,
              ...(request.path === undefined ? {} : { path: request.path }),
              ...(request.value === undefined ? {} : { value: request.value }),
              ...(request.position === undefined ? {} : { position: request.position }),
              ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
              ...(request.values === undefined ? {} : { values: request.values }),
              ...(request.writeBack === undefined ? {} : { writeBack: request.writeBack }),
            });
            if (plan.error !== undefined) return { ok: false, error: plan.error };
            if (plan.tunable !== undefined) {
              liveSync.pushRuntimeDelta({
                at: Date.now(),
                tunables: { [plan.tunable.key]: plan.tunable.value },
              });
              return {
                ok: true,
                result: {
                  kind: "tunable",
                  key: plan.tunable.key,
                  value: plan.tunable.value,
                  writeBack: false,
                  ...summarizeRuntimeInspector(
                    liveSync.getRuntimeState(),
                    liveSync.getRuntimeOverrides(),
                    playControl,
                  ),
                },
              };
            }
            if (plan.entity === undefined) return { ok: false, error: "runtime_set produced no entity" };
            liveSync.setRuntimeOverride(plan.entity);
            liveSync.pushRuntimeDelta({ at: Date.now(), entities: [plan.entity] });
            let wroteBack = false;
            let lastState = session.getState();
            for (const command of plan.writeBackCommands) {
              const { applied, state } = dispatchGuarded(command);
              if (!applied) {
                return { ok: false, error: `runtime_set write-back rejected: ${command.type}` };
              }
              lastState = state;
              wroteBack = true;
            }
            if (wroteBack) liveSync.clearRuntimeOverride(plan.entity.id);
            return {
              ok: true,
              result: {
                kind: "entity",
                entity: plan.entity,
                writeBack: wroteBack,
                revision: liveSync.getRevision(),
                ...summarizeEditorSession(lastState),
              },
            };
          }
          case "runtime_pause": {
            api.setPlayControl({ paused: true, pendingSteps: 0 });
            liveSync.pushRuntimeDelta({ at: Date.now(), tunables: { paused: true } });
            return { ok: true, result: { play: playControl } };
          }
          case "runtime_resume": {
            api.setPlayControl({ paused: false, pendingSteps: 0 });
            liveSync.pushRuntimeDelta({ at: Date.now(), tunables: { paused: false } });
            return { ok: true, result: { play: playControl } };
          }
          case "runtime_step": {
            const frames = request.frames === undefined ? 1 : Math.max(1, Math.floor(request.frames));
            api.setPlayControl({ paused: true, pendingSteps: playControl.pendingSteps + frames });
            liveSync.pushRuntimeDelta({ at: Date.now(), tunables: { paused: true, pendingSteps: playControl.pendingSteps } });
            return { ok: true, result: { play: playControl } };
          }
          case "set_runtime_override": {
            liveSync.setRuntimeOverride(request.entity);
            return { ok: true, result: { overrides: liveSync.getRuntimeOverrides() } };
          }
          case "clear_runtime_override": {
            liveSync.clearRuntimeOverride(request.id);
            return { ok: true, result: { overrides: liveSync.getRuntimeOverrides() } };
          }
          case "write_back_override": {
            const entity = liveSync.getRuntimeOverrides()[request.id];
            if (entity === undefined) {
              return { ok: false, error: `no runtime override for "${request.id}"` };
            }
            const transform = runtimeEntityWriteBackCommand(session.getState().document, entity);
            const meta = runtimeEntityMetaWriteBackCommand(session.getState().document, entity);
            if (transform === null && meta === null) {
              return {
                ok: false,
                error: `override "${request.id}" has nothing to write back into the document`,
              };
            }
            let lastState = session.getState();
            for (const command of [transform, meta]) {
              if (command === null) continue;
              const { applied, state } = dispatchGuarded(command);
              if (!applied) return { ok: false, error: `write_back_override rejected for "${request.id}"` };
              lastState = state;
            }
            liveSync.clearRuntimeOverride(request.id);
            return {
              ok: true,
              result: {
                revision: liveSync.getRevision(),
                ...summarizeEditorSession(lastState),
              },
            };
          }
          case "dispatch": {
            const { applied, state } = dispatchGuarded(request.command);
            if (!applied) return { ok: false, error: `${request.command.type} rejected: no effect` };
            return { ok: true, result: summarizeEditorSession(state) };
          }
          case "undo": {
            const { applied, state } = dispatchGuarded({ type: "undo" });
            if (!applied) return { ok: false, error: "nothing to undo" };
            return { ok: true, result: summarizeEditorSession(state) };
          }
          case "redo": {
            const { applied, state } = dispatchGuarded({ type: "redo" });
            if (!applied) return { ok: false, error: "nothing to redo" };
            return { ok: true, result: summarizeEditorSession(state) };
          }
          case "list_assets":
            return { ok: true, result: { assets } };
          case "place_asset": {
            const focus = focusTarget ?? { x: 0, y: 0, z: 0 };
            const asset = assets.find((entry) => entry.id === request.id);
            const placed = resolvePlaceAsset({
              assetId: request.id,
              position: {
                x: request.x ?? focus.x,
                y: request.y ?? focus.y,
                z: request.z ?? focus.z,
              },
              kind: request.kind,
              knownKind: asset?.kind,
              knownLabel: asset?.label,
              knownUrl: asset?.url,
            });
            const marker = toEditorMarker(placed);
            session.dispatch({ type: "addMarker", marker });
            return {
              ok: true,
              result: {
                id: marker.id,
                position: marker.position,
                marker: session.getState().document.markers.find((entry) => entry.id === marker.id),
              },
            };
          }
          case "create_terrain": {
            const width = request.width ?? 200;
            const depth = request.depth ?? 200;
            const cx = request.centerX ?? 0;
            const cz = request.centerZ ?? 0;
            const terrain = createTerrainSnapshot({
              bounds: { minX: cx - width / 2, minZ: cz - depth / 2, maxX: cx + width / 2, maxZ: cz + depth / 2 },
              cellSize: request.cellSize ?? 2,
            });
            session.dispatch({ type: "setTerrain", terrain });
            return { ok: true, result: { cols: terrain.cols, rows: terrain.rows, cellSize: terrain.cellSize } };
          }
          case "sculpt_terrain": {
            const terrain = session.getState().document.terrain;
            if (terrain === undefined) return { ok: false, error: "no terrain ΓÇö call create_terrain first" };
            const live = editableTerrainFromSnapshot(terrain);
            const edit: TerraformEdit = {
              mode: request.mode,
              center: [request.x, request.z],
              radius: request.radius ?? 8,
              strength: request.strength ?? 1,
              ...(request.target === undefined ? {} : { target: request.target }),
              ...(request.toX === undefined || request.toZ === undefined ? {} : { to: [request.toX, request.toZ] }),
              ...(request.seed === undefined ? {} : { seed: request.seed }),
              ...(request.shape === undefined ? {} : { shape: request.shape }),
            };
            const delta = live.editDelta(edit);
            if (delta.indices.length === 0) return { ok: false, error: "brush touched no vertices (check radius/position)" };
            session.dispatch({ type: "sculptTerrain", delta });
            return { ok: true, result: { changed: delta.indices.length, canUndo: session.canUndo() } };
          }
          case "terrain_summary": {
            const terrain = session.getState().document.terrain;
            if (terrain === undefined) return { ok: true, result: { terrain: null } };
            let min = Infinity;
            let max = -Infinity;
            let nonZero = 0;
            for (const value of terrain.offsets) {
              if (value < min) min = value;
              if (value > max) max = value;
              if (value !== 0) nonZero += 1;
            }
            return {
              ok: true,
              result: {
                cols: terrain.cols,
                rows: terrain.rows,
                cellSize: terrain.cellSize,
                bounds: terrain.bounds,
                minOffset: terrain.offsets.length === 0 ? 0 : min,
                maxOffset: terrain.offsets.length === 0 ? 0 : max,
                editedVertices: nonZero,
                paintedCells: terrain.surfaces.filter((surface) => surface !== null).length,
              },
            };
          }
          case "paint_terrain": {
            const terrain = session.getState().document.terrain;
            if (terrain === undefined) return { ok: false, error: "no terrain ΓÇö call create_terrain first" };
            const live = editableTerrainFromSnapshot(terrain);
            const delta = live.paintDelta({
              mode: "paint",
              center: [request.x, request.z],
              radius: request.radius ?? 8,
              surface: request.surface,
              ...(request.shape === undefined ? {} : { shape: request.shape }),
            });
            if (delta.indices.length === 0) return { ok: false, error: "paint touched no cells (check radius/position)" };
            session.dispatch({ type: "paintTerrain", delta });
            return { ok: true, result: { changed: delta.indices.length, canUndo: session.canUndo() } };
          }
          case "fill_terrain": {
            const terrain = session.getState().document.terrain;
            if (terrain === undefined) return { ok: false, error: "no terrain ΓÇö call create_terrain first" };
            const live = editableTerrainFromSnapshot(terrain);
            const delta = live.fillSurfaceDelta(request.surface);
            if (delta.indices.length === 0) return { ok: true, result: { changed: 0 } };
            session.dispatch({ type: "paintTerrain", delta });
            return { ok: true, result: { changed: delta.indices.length } };
          }
          case "auto_paint": {
            const terrain = session.getState().document.terrain;
            if (terrain === undefined) return { ok: false, error: "no terrain ΓÇö call create_terrain first" };
            const live = editableTerrainFromSnapshot(terrain);
            const rule: TerrainSurfaceRule = {
              surface: request.surface,
              ...(request.minSlope === undefined ? {} : { minSlope: request.minSlope }),
              ...(request.maxSlope === undefined ? {} : { maxSlope: request.maxSlope }),
              ...(request.minHeight === undefined ? {} : { minHeight: request.minHeight }),
              ...(request.maxHeight === undefined ? {} : { maxHeight: request.maxHeight }),
            };
            const delta = live.autoPaintDelta(rule);
            if (delta.indices.length === 0) return { ok: true, result: { changed: 0 } };
            session.dispatch({ type: "paintTerrain", delta });
            return { ok: true, result: { changed: delta.indices.length } };
          }
          case "terrain_materials":
            return { ok: true, result: { materials: TERRAIN_MATERIALS } };
          case "terrain_layers": {
            const terrain = session.getState().document.terrain;
            return { ok: true, result: { layers: terrain?.layers ?? [] } };
          }
          case "set_terrain_layers": {
            if (session.getState().document.terrain === undefined) {
              return { ok: false, error: "no terrain ΓÇö call create_terrain first" };
            }
            session.dispatch({ type: "setTerrainLayers", layers: request.layers });
            return { ok: true, result: { layers: session.getState().document.terrain?.layers ?? [] } };
          }
          case "blend_terrain": {
            const terrain = session.getState().document.terrain;
            if (terrain === undefined) return { ok: false, error: "no terrain ΓÇö call create_terrain first" };
            // Auto-add the surface as a layer if the stack does not carry it yet.
            const layers = terrain.layers ?? [];
            if (!layers.some((layer) => layer.surface === request.surface)) {
              const next: TerrainMaterialLayer[] = [...layers, { id: request.surface, surface: request.surface }];
              session.dispatch({ type: "setTerrainLayers", layers: next });
            }
            const live = editableTerrainFromSnapshot(session.getState().document.terrain!);
            const delta = live.blendPaintDelta({
              mode: "paint",
              center: [request.x, request.z],
              radius: request.radius ?? 8,
              surface: request.surface,
              strength: request.strength ?? 1,
              ...(request.shape === undefined ? {} : { shape: request.shape }),
            });
            if (delta.indices.length === 0) return { ok: false, error: "blend touched no cells (check radius/position)" };
            session.dispatch({ type: "blendTerrain", delta });
            return { ok: true, result: { changed: delta.indices.length, layers: session.getState().document.terrain?.layers ?? [] } };
          }
          case "convert_scatter": {
            const doc = session.getState().document;
            const path = doc.paths.find((entry) => entry.id === request.pathId);
            if (path === undefined) return { ok: false, error: `path not found: ${request.pathId}` };
            const region = scatterRegionFromPath(path);
            if (region === null) return { ok: false, error: `not a scatter region: ${request.pathId}` };
            const terrainSnapshot = doc.terrain;
            const terrain: ScatterTerrain | undefined =
              terrainSnapshot === undefined ? undefined : editableTerrainFromSnapshot(terrainSnapshot);
            const instances = resolveScatterRegion(region, terrain);
            const markers: EditorMarker[] = instances.map((instance) => ({
              id: instance.id.replace(/[^a-zA-Z0-9_]/g, "_"),
              kind: "prop",
              position: { x: instance.x, y: instance.y, z: instance.z },
              rotationY: instance.rotationY,
              meta: { item: instance.item, scale: instance.scale, fromScatter: request.pathId },
            }));
            session.dispatch({ type: "convertScatterToObjects", pathId: request.pathId, markers });
            return { ok: true, result: { created: markers.length, removedPath: request.pathId } };
          }
          case "add_foliage": {
            if (request.points.length < 3) return { ok: false, error: "add_foliage needs at least 3 polygon points" };
            const id = `foliage_${Date.now().toString(36)}`;
            session.dispatch({
              type: "addPath",
              path: {
                id,
                kind: SCATTER_PATH_KIND,
                points: request.points.map((point) => ({ x: point.x, y: 0, z: point.z })),
                label: "foliage",
                meta: {
                  density: request.density ?? 0.15,
                  ...(request.item === undefined ? {} : { item: request.item }),
                  ...(request.seed === undefined ? {} : { seed: request.seed }),
                  ...(request.minSpacing === undefined ? {} : { minSpacing: request.minSpacing }),
                },
              },
            });
            const path = session.getState().document.paths.find((p) => p.id === id)!;
            return { ok: true, result: { id, estimate: scatterRegionEstimate(path) } };
          }
          case "scatter_summary": {
            const doc = session.getState().document;
            const regions = doc.paths.filter((path) => path.kind === SCATTER_PATH_KIND).length;
            const instances = resolveScatter(doc).length;
            return { ok: true, result: { regions, instances } };
          }
          case "set_parent": {
            const { applied, state } = dispatchGuarded({
              type: "setParent",
              ids: request.ids,
              parentId: request.parentId,
            });
            if (!applied) return { ok: false, error: "set_parent rejected: cyclic parent or empty selection" };
            const doc = state.document;
            return {
              ok: true,
              result: { roots: editorRoots(doc), parents: request.ids.map((id) => ({ id, parentId: editorParentOf(doc, id) ?? null })) },
            };
          }
          case "hierarchy": {
            const doc = session.getState().document;
            const roots = editorRoots(doc);
            return {
              ok: true,
              result: { roots, tree: roots.map((id) => ({ id, children: editorChildren(doc, id) })) },
            };
          }
          case "list_prefabs":
            return { ok: true, result: { prefabs: session.getState().document.prefabs } };
          case "create_prefab": {
            if (request.ids.length === 0) return { ok: false, error: "create_prefab needs at least one id" };
            session.dispatch({ type: "createPrefab", id: request.id, name: request.name, ids: request.ids });
            const prefab = findEditorPrefab(session.getState().document, request.id);
            return prefab === undefined
              ? { ok: false, error: `prefab not created: ${request.id}` }
              : { ok: true, result: prefab };
          }
          case "insert_prefab": {
            const prefab = findEditorPrefab(session.getState().document, request.prefabId);
            if (prefab === undefined) return { ok: false, error: `prefab not found: ${request.prefabId}` };
            const at = focusTarget ?? { x: 0, y: 0, z: 0 };
            session.dispatch({
              type: "insertPrefab",
              prefabId: request.prefabId,
              at: { x: request.x ?? at.x, y: request.y ?? at.y, z: request.z ?? at.z },
            });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          }
          case "detach_prefab_instance":
            session.dispatch({ type: "detachPrefabInstance", instanceId: request.instanceId });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          case "delete_prefab":
            session.dispatch({ type: "deletePrefab", prefabId: request.prefabId });
            return { ok: true, result: { prefabs: session.getState().document.prefabs } };
          case "list_collections":
            return { ok: true, result: { collections: session.getState().document.collections } };
          case "create_collection":
            session.dispatch({
              type: "createCollection",
              id: request.id,
              name: request.name,
              ...(request.memberIds === undefined ? {} : { memberIds: request.memberIds }),
            });
            return { ok: true, result: findEditorCollection(session.getState().document, request.id) };
          case "rename_collection":
            session.dispatch({ type: "renameCollection", id: request.id, name: request.name });
            return { ok: true, result: findEditorCollection(session.getState().document, request.id) };
          case "delete_collection":
            session.dispatch({ type: "deleteCollection", id: request.id });
            return { ok: true, result: { collections: session.getState().document.collections } };
          case "set_collection_members":
            session.dispatch({ type: "setCollectionMembers", id: request.id, memberIds: request.memberIds });
            return { ok: true, result: findEditorCollection(session.getState().document, request.id) };
          case "add_to_collection":
            session.dispatch({ type: "addToCollection", id: request.id, ids: request.ids });
            return { ok: true, result: findEditorCollection(session.getState().document, request.id) };
          case "remove_from_collection":
            session.dispatch({ type: "removeFromCollection", id: request.id, ids: request.ids });
            return { ok: true, result: findEditorCollection(session.getState().document, request.id) };
          case "set_collection_flags":
            session.dispatch({
              type: "setCollectionFlags",
              id: request.id,
              patch: {
                ...(request.color === undefined ? {} : { color: request.color }),
                ...(request.locked === undefined ? {} : { locked: request.locked }),
                ...(request.visible === undefined ? {} : { visible: request.visible }),
              },
            });
            return { ok: true, result: findEditorCollection(session.getState().document, request.id) };
          case "select_collection": {
            const collection = findEditorCollection(session.getState().document, request.id);
            if (collection === undefined) return { ok: false, error: `collection not found: ${request.id}` };
            session.dispatch({ type: "selectCollection", id: request.id });
            return { ok: true, result: { selection: session.getState().selection } };
          }
          case "batch_set_properties":
            session.dispatch({
              type: "batchSetProperties",
              ids: request.ids,
              patch: {
                ...(request.color === undefined ? {} : { color: request.color }),
                ...(request.label === undefined ? {} : { label: request.label }),
                ...(request.meta === undefined ? {} : { meta: request.meta }),
              },
            });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          case "assign_material":
            session.dispatch({ type: "assignMaterial", ids: request.ids, materialId: request.materialId });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          case "list_grids": {
            const grids = session.getState().document.grids ?? [];
            return { ok: true, result: { grids: grids.map(gridLayerSummary) } };
          }
          case "get_grid_cell": {
            const layer = (session.getState().document.grids ?? []).find((entry) => entry.id === request.id);
            if (layer === undefined) return { ok: false, error: `grid layer not found: ${request.id}` };
            return { ok: true, result: { id: request.id, col: request.col, row: request.row, value: eyedropGridCell(layer, request.col, request.row) } };
          }
          case "add_grid_layer": {
            const layer = createGridLayer({
              id: request.id,
              kind: request.kind,
              cols: request.cols,
              rows: request.rows,
              ...(request.label === undefined ? {} : { label: request.label }),
              ...(request.cellSize === undefined ? {} : { cellSize: request.cellSize }),
              ...(request.origin === undefined ? {} : { origin: request.origin }),
              ...(request.axes === undefined ? {} : { axes: request.axes }),
              ...(request.empty === undefined ? {} : { empty: request.empty }),
              ...(request.palette === undefined ? {} : { palette: request.palette }),
            });
            const { applied } = dispatchGuarded({ type: "addGridLayer", layer });
            if (!applied) return { ok: false, error: "add_grid_layer rejected: no effect" };
            return { ok: true, result: gridLayerSummary(layer) };
          }
          case "remove_grid_layer": {
            const { applied } = dispatchGuarded({ type: "removeGridLayer", id: request.id });
            if (!applied) return { ok: false, error: `grid layer not found: ${request.id}` };
            return { ok: true, result: { removed: request.id } };
          }
          case "set_grid_layer": {
            const patch: Partial<Omit<EditorGridLayer, "id" | "cells">> = {};
            if (request.label !== undefined) patch.label = request.label;
            if (request.kind !== undefined) patch.kind = request.kind;
            if (request.visible !== undefined) patch.visible = request.visible;
            if (request.empty !== undefined) patch.empty = request.empty;
            if (request.cellSize !== undefined) patch.cellSize = request.cellSize;
            if (request.origin !== undefined) patch.origin = request.origin;
            if (request.axes !== undefined) patch.axes = request.axes;
            if (request.palette !== undefined) patch.palette = request.palette;
            const { applied, state } = dispatchGuarded({ type: "setGridLayer", id: request.id, patch });
            if (!applied) return { ok: false, error: `set_grid_layer rejected: no effect (${request.id})` };
            const layer = (state.document.grids ?? []).find((entry) => entry.id === request.id)!;
            return { ok: true, result: gridLayerSummary(layer) };
          }
          case "paint_grid_cells": {
            const { applied, state } = dispatchGuarded({ type: "paintGridCells", id: request.id, cells: request.cells });
            if (!applied) return { ok: false, error: `paint_grid_cells rejected: no effect (${request.id})` };
            const layer = (state.document.grids ?? []).find((entry) => entry.id === request.id)!;
            return { ok: true, result: gridLayerSummary(layer) };
          }
          case "fill_grid_rect": {
            const { applied, state } = dispatchGuarded({
              type: "fillGridRect",
              id: request.id,
              col0: request.col0,
              row0: request.row0,
              col1: request.col1,
              row1: request.row1,
              value: request.value,
            });
            if (!applied) return { ok: false, error: `fill_grid_rect rejected: no effect (${request.id})` };
            const layer = (state.document.grids ?? []).find((entry) => entry.id === request.id)!;
            return { ok: true, result: gridLayerSummary(layer) };
          }
          case "flood_fill_grid": {
            const { applied, state } = dispatchGuarded({
              type: "floodFillGrid",
              id: request.id,
              col: request.col,
              row: request.row,
              value: request.value,
            });
            if (!applied) return { ok: false, error: `flood_fill_grid rejected: no effect (${request.id})` };
            const layer = (state.document.grids ?? []).find((entry) => entry.id === request.id)!;
            return { ok: true, result: gridLayerSummary(layer) };
          }
          case "resize_grid_layer": {
            const { applied, state } = dispatchGuarded({ type: "resizeGridLayer", id: request.id, cols: request.cols, rows: request.rows });
            if (!applied) return { ok: false, error: `resize_grid_layer rejected: no effect (${request.id})` };
            const layer = (state.document.grids ?? []).find((entry) => entry.id === request.id)!;
            return { ok: true, result: gridLayerSummary(layer) };
          }
          case "import_grid": {
            const layer =
              request.format === "csv"
                ? importCsvGrid(request.text, {
                    id: request.id,
                    kind: request.kind,
                    ...(request.empty === undefined ? {} : { empty: request.empty }),
                    ...(request.cellSize === undefined ? {} : { cellSize: request.cellSize }),
                    ...(request.origin === undefined ? {} : { origin: request.origin }),
                    ...(request.palette === undefined ? {} : { palette: request.palette }),
                  })
                : importAsciiGrid(request.text, {
                    id: request.id,
                    kind: request.kind,
                    ...(request.empty === undefined ? {} : { empty: request.empty }),
                    ...(request.cellSize === undefined ? {} : { cellSize: request.cellSize }),
                    ...(request.origin === undefined ? {} : { origin: request.origin }),
                    ...(request.glyphMap === undefined ? {} : { glyphMap: request.glyphMap }),
                    ...(request.palette === undefined ? {} : { palette: request.palette }),
                  });
            const { applied } = dispatchGuarded({ type: "addGridLayer", layer });
            if (!applied) return { ok: false, error: "import_grid rejected: no effect" };
            return { ok: true, result: gridLayerSummary(layer) };
          }
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const uninstallHost = installEditorHost(api);
  const dispose = () => {
    unsubscribeSessionMirror();
    uninstallLiveSync();
    uninstallHost();
  };
  return { session, api, dispose };
}

/** The full authored scene: every marker, volume, path, and note for a game. */
export type { EditorDocument };
/** Per-kind show/hide flags for the editor's layer panel. */
export type { EditorKindVisibility };
/** Stateful, undoable handle for driving scene edits from UI or an MCP agent. */
export type { EditorSession };
/** The document plus current selection at a point in editor history. */
export type { EditorSessionState };
