import {
  createDocumentLiveSync,
  createEditorSession,
  createRuntimePlayControl,
  installDocumentLiveSync,
  listEditorKinds,
  normalizeEditorLayers,
  seedEditorCatalogs,
  type DocumentLiveSync,
  type DocumentPatch,
  type EditorCatalogDefinition,
  type EditorCommand,
  type EditorDocument,
  type EditorGridPaletteEntry,
  type EditorKindVisibility,
  type EditorLayersInput,
  type EditorSession,
  type EditorSessionState,
  type RuntimeEntityState,
  type RuntimePlayControl,
} from "@jgengine/core/editor/index";
import type { TerraformMode, TerrainMaterialLayer } from "@jgengine/core/world/terraform";
import type { TerrainField } from "@jgengine/core/world/terrain";

import { registerBuiltinSceneKinds } from "@jgengine/core/scene/builtinSceneKinds";

import { EDITOR_RPC_HANDLERS, type HandlerContext } from "./handlers";

registerBuiltinSceneKinds();

/** How the editor hosts the game: frozen placement view, roamable world, the real game, or HUD-layout authoring. */
export type EditorRunMode = "edit" | "walk" | "play" | "hud";

/** The accepted run modes, in canonical order — the runtime guard behind {@link EditorRunMode}. @internal */
export const EDITOR_RUN_MODES: readonly EditorRunMode[] = ["edit", "walk", "play", "hud"];

/** RPC request shapes the editor host understands, used by the MCP bridge and UI. */
export type EditorBridgeRequest =
  | { method: "editor_status" }
  | { method: "set_mode"; mode: EditorRunMode }
  | { method: "perf_report" }
  | { method: "list_layers" }
  | { method: "list_catalogs" }
  | { method: "get_catalog_entry"; catalogId: string; entryId: string }
  | { method: "set_catalog_entry"; catalogId: string; entryId: string; patch: Record<string, unknown>; label?: string }
  | { method: "add_catalog_entry"; catalogId: string; entryId: string; meta?: Record<string, unknown>; label?: string }
  | { method: "remove_catalog_entry"; catalogId: string; entryId: string }
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
  | { method: "bake_minimap"; padding?: number; resolution?: number; waterLevel?: number }
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
  /**
   * Whether the sampled window saw camera or edit activity. `false` means the render-on-demand /
   * browser-throttled loop is idle, so a low `fps` is expected pacing rather than lag — the pill
   * shows a neutral "idle" instead of the red danger cue.
   */
  active: boolean;
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
  /**
   * The live composed ground field (base procedural terrain + document sculpt) from the mounted
   * viewport, or null when no viewport is mounted. `bake_minimap` reads it to rasterize authored
   * terrain; it exists only while the editor world is mounted, so headless CLIs get a null here.
   */
  getTerrainSampler(): TerrainField | null;
  setTerrainSampler(field: TerrainField | null): void;
  getMode(): EditorRunMode;
  setMode(mode: EditorRunMode): void;
  subscribeMode(listener: (mode: EditorRunMode) => void): () => void;
  /** Play-mode pause/step gate consumed by the runtime publisher. */
  getPlayControl(): RuntimePlayControl;
  /** Normalizes and stores the play control, notifies listeners, and returns the applied value. */
  setPlayControl(next: RuntimePlayControl): RuntimePlayControl;
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
  let terrainSampler: TerrainField | null = null;
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
    getTerrainSampler: () => terrainSampler,
    setTerrainSampler(field) {
      terrainSampler = field;
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
      // Return the normalized control so callers thread the applied value instead of re-reading a
      // binding that may have been reassigned meanwhile (keeps a published delta in step with it).
      return playControl;
    },
    subscribePlayControl(listener) {
      playControlListeners.add(listener);
      return () => {
        playControlListeners.delete(listener);
      };
    },
    handle(request) {
      // One shared context + one try/catch envelope; each verb lives in its per-domain handler module,
      // dispatched through the method → handler table so a missing verb is a compile error, not a fall-through.
      const ctx: HandlerContext = {
        api,
        session,
        liveSync,
        gameId: options.gameId,
        catalogDefinitions,
        catalogById,
        dispatchGuarded,
        getTerrainSampler: api.getTerrainSampler,
      };
      try {
        return EDITOR_RPC_HANDLERS[request.method](ctx, request as never);
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
