import {
  createEditorSession,
  editorDocumentBounds,
  listEditorKinds,
  normalizeEditorLayers,
  summarizeEditorSession,
  type EditorCommand,
  type EditorDocument,
  type EditorKindVisibility,
  type EditorLayersInput,
  type EditorSession,
  type EditorSessionState,
} from "@jgengine/core/editor/index";

/** How the editor hosts the game: frozen placement view, roamable world, or the real game. */
export type EditorRunMode = "edit" | "walk" | "play";

const EDITOR_RUN_MODES: readonly EditorRunMode[] = ["edit", "walk", "play"];

/** RPC request shapes the editor host understands, used by the MCP bridge and UI. */
export type EditorBridgeRequest =
  | { method: "editor_status" }
  | { method: "set_mode"; mode: EditorRunMode }
  | { method: "perf_report" }
  | { method: "list_layers" }
  | { method: "list_selection" }
  | { method: "get_marker"; id: string }
  | { method: "get_volume"; id: string }
  | { method: "set_transform"; id: string; x?: number; y?: number; z?: number; rotationY?: number }
  | { method: "set_volume"; id: string; radius?: number; height?: number; x?: number; y?: number; z?: number }
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
  | { method: "place_asset"; id: string; kind?: string; x?: number; y?: number; z?: number };

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
}

/** The live editor's global control surface — session, visibility, camera focus, assets, mode, RPC. */
export interface EditorHostApi {
  gameId: string;
  getSession(): EditorSession;
  getVisibility(): EditorKindVisibility;
  setVisibility(next: EditorKindVisibility): void;
  subscribeVisibility(listener: () => void): () => void;
  getFocusTarget(): { x: number; y: number; z: number } | null;
  setFocusTarget(target: { x: number; y: number; z: number } | null): void;
  subscribeFocus(listener: (target: { x: number; y: number; z: number } | null) => void): () => void;
  getAssets(): readonly EditorAssetInfo[];
  setAssets(assets: readonly EditorAssetInfo[]): void;
  getPerf(): EditorPerfSample | null;
  setPerf(sample: EditorPerfSample): void;
  getMode(): EditorRunMode;
  setMode(mode: EditorRunMode): void;
  subscribeMode(listener: (mode: EditorRunMode) => void): () => void;
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

/** Retrieves the globally installed editor host, or null if none is mounted. */
export function getEditorHost(): EditorHostApi | null {
  const root = globalThis as typeof globalThis & { [GLOBAL_KEY]?: EditorHostApi };
  return root[GLOBAL_KEY] ?? null;
}

/** Builds and installs an editor host for a game: session, visibility, assets, and RPC handling. */
export function createEditorHost(options: {
  gameId: string;
  layers: EditorLayersInput | undefined;
  assets?: readonly EditorAssetInfo[];
  onFocus?: (target: { x: number; y: number; z: number } | null) => void;
}): {
  session: EditorSession;
  api: EditorHostApi;
  dispose: () => void;
} {
  const document = normalizeEditorLayers(options.layers);
  const session = createEditorSession(document);
  let visibility: EditorKindVisibility = {};
  let focusTarget: { x: number; y: number; z: number } | null = null;
  let assets: EditorAssetInfo[] = [...(options.assets ?? [])];
  let perf: EditorPerfSample | null = null;
  let mode: EditorRunMode = "edit";
  const visibilityListeners = new Set<() => void>();
  const focusListeners = new Set<(target: { x: number; y: number; z: number } | null) => void>();
  const modeListeners = new Set<(mode: EditorRunMode) => void>();

  const kinds = listEditorKinds(document);
  // Heavy / dense kinds off by default — turn on from the Layers panel when needed.
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
    getPerf: () => perf,
    setPerf(sample) {
      perf = sample;
    },
    getMode: () => mode,
    setMode(next) {
      if (next === mode) return;
      mode = next;
      for (const listener of modeListeners) listener(mode);
    },
    subscribeMode(listener) {
      modeListeners.add(listener);
      return () => {
        modeListeners.delete(listener);
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
                error: "engine devtools not mounted — open the browser editor (F2+D panel) first",
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
            session.dispatch({
              type: "setTransform",
              id: request.id,
              position: {
                x: request.x ?? base.x,
                y: request.y ?? base.y,
                z: request.z ?? base.z,
              },
              ...(request.rotationY === undefined ? {} : { rotationY: request.rotationY }),
            });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
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
          case "dispatch":
            session.dispatch(request.command);
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          case "undo":
            session.dispatch({ type: "undo" });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          case "redo":
            session.dispatch({ type: "redo" });
            return { ok: true, result: summarizeEditorSession(session.getState()) };
          case "list_assets":
            return { ok: true, result: { assets } };
          case "place_asset": {
            const focus = focusTarget ?? { x: 0, y: 0, z: 0 };
            const position = {
              x: request.x ?? focus.x,
              y: request.y ?? focus.y,
              z: request.z ?? focus.z,
            };
            const asset = assets.find((entry) => entry.id === request.id);
            const id = `placed_${request.id}_${Date.now().toString(36)}`;
            session.dispatch({
              type: "addMarker",
              marker: {
                id,
                kind: request.kind ?? asset?.kind ?? "prop",
                position,
                label: asset?.label ?? request.id,
                color: "#e2e8f0",
                meta: {
                  assetId: request.id,
                  ...(asset?.url === undefined ? {} : { url: asset.url }),
                },
              },
            });
            return {
              ok: true,
              result: {
                id,
                position,
                marker: session.getState().document.markers.find((marker) => marker.id === id),
              },
            };
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

  const dispose = installEditorHost(api);
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
