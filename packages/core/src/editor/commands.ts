import {
  applyDeltaToSnapshot,
  applySurfaceDeltaToSnapshot,
  applyWeightDeltaToSnapshot,
  revertDeltaFromSnapshot,
  revertSurfaceDeltaFromSnapshot,
  revertWeightDeltaFromSnapshot,
  type SurfaceDelta,
  type TerraformDelta,
  type TerrainMaterialLayer,
  type WeightDelta,
} from "../world/terraform";
import type { EditorUiDocument, EditorUiPanelLayout } from "../ui/hudDocument";
import {
  cloneEditorDocument,
  findEditorMarker,
  findEditorVolume,
} from "./document";
import type { EditorGridCellEdit, EditorGridLayer } from "./grid";
import type { ParamSchema } from "../scene/sceneKinds";
import type {
  EditorCatalogEntry,
  EditorDocument,
  EditorEnvironment,
  EditorMarker,
  EditorMinimapBake,
  EditorNote,
  EditorPath,
  EditorTerrain,
  EditorVec3,
  EditorVolume,
} from "./types";
import { applyMutating, isStructural } from "./commandApply";

/** A single editor mutation — select, move, add, remove, undo/redo — dispatched to a session. */
export type EditorCommand =
  | { type: "select"; ids: readonly string[] }
  | { type: "clearSelection" }
  | { type: "setTransform"; id: string; position?: EditorVec3; rotationY?: number }
  | { type: "translate"; ids: readonly string[]; delta: EditorVec3 }
  | { type: "setParent"; ids: readonly string[]; parentId: string | null }
  | { type: "addMarker"; marker: EditorMarker }
  | { type: "addVolume"; volume: EditorVolume }
  | { type: "addPath"; path: EditorPath }
  | { type: "addNote"; note: EditorNote }
  | { type: "setMarker"; id: string; patch: Partial<Omit<EditorMarker, "id">> }
  | { type: "setVolume"; id: string; patch: Partial<Omit<EditorVolume, "id">> }
  | { type: "setPath"; id: string; patch: Partial<Omit<EditorPath, "id">> }
  | { type: "setNote"; id: string; patch: Partial<Omit<EditorNote, "id">> }
  | {
      type: "setCatalogEntry";
      catalogId: string;
      entryId: string;
      patch: { label?: string; meta?: Record<string, unknown> };
    }
  | { type: "addCatalogEntry"; catalogId: string; entry: EditorCatalogEntry }
  | { type: "removeCatalogEntry"; catalogId: string; entryId: string }
  | { type: "addCatalog"; id: string; label?: string; schema?: ParamSchema }
  | { type: "removeCatalog"; id: string }
  | { type: "setCatalogSchema"; id: string; schema: ParamSchema; label?: string }
  | { type: "remove"; id: string }
  | { type: "removeMany"; ids: readonly string[] }
  | { type: "duplicate"; ids: readonly string[]; offset?: EditorVec3 }
  | { type: "addFragment"; fragment: EditorDocument; offset?: EditorVec3 }
  | { type: "importDocument"; document: EditorDocument }
  | { type: "importJson"; json: string }
  | { type: "replaceDocument"; document: EditorDocument }
  | { type: "setTerrain"; terrain: EditorTerrain }
  | { type: "sculptTerrain"; delta: TerraformDelta }
  | { type: "paintTerrain"; delta: SurfaceDelta }
  | { type: "setTerrainLayers"; layers: readonly TerrainMaterialLayer[] }
  | { type: "blendTerrain"; delta: WeightDelta }
  | { type: "clearTerrain" }
  | { type: "setMinimapBake"; minimap: EditorMinimapBake }
  /**
   * Replace the scene-document environment/lighting bag. Pass `undefined` to clear authored sky/fog
   * so world.ts fallbacks apply again. The lighting workspace writes the full merged bag so
   * undo restores the previous snapshot as one step (use `coalesce` while scrubbing sliders).
   */
  | { type: "setEnvironment"; environment: EditorEnvironment | undefined }
  | { type: "convertScatterToObjects"; pathId: string; markers: readonly EditorMarker[] }
  | { type: "createPrefab"; id: string; name: string; ids: readonly string[] }
  | { type: "insertPrefab"; prefabId: string; at: EditorVec3; instanceId?: string }
  | { type: "detachPrefabInstance"; instanceId: string }
  | { type: "deletePrefab"; prefabId: string }
  | { type: "createCollection"; id: string; name: string; memberIds?: readonly string[] }
  | { type: "renameCollection"; id: string; name: string }
  | { type: "deleteCollection"; id: string }
  | { type: "setCollectionMembers"; id: string; memberIds: readonly string[] }
  | { type: "addToCollection"; id: string; ids: readonly string[] }
  | { type: "removeFromCollection"; id: string; ids: readonly string[] }
  | {
      type: "setCollectionFlags";
      id: string;
      patch: { color?: string; locked?: boolean; visible?: boolean };
    }
  | {
      /**
       * Per-object lock/visibility flags on placeables. `locked: false` / `hidden: false` clear the
       * field so the document stays compact; collection locks are unchanged.
       */
      type: "setObjectFlags";
      ids: readonly string[];
      patch: { locked?: boolean; hidden?: boolean };
    }
  | { type: "selectCollection"; id: string }
  | {
      type: "batchSetProperties";
      ids: readonly string[];
      patch: { color?: string; label?: string; meta?: Record<string, unknown> };
    }
  | { type: "assignMaterial"; ids: readonly string[]; materialId: string }
  | { type: "addGridLayer"; layer: EditorGridLayer }
  | { type: "removeGridLayer"; id: string }
  | { type: "setGridLayer"; id: string; patch: Partial<Omit<EditorGridLayer, "id" | "cells">> }
  | { type: "paintGridCells"; id: string; cells: readonly EditorGridCellEdit[] }
  | { type: "fillGridRect"; id: string; col0: number; row0: number; col1: number; row1: number; value: string }
  | { type: "floodFillGrid"; id: string; col: number; row: number; value: string }
  | { type: "resizeGridLayer"; id: string; cols: number; rows: number }
  | { type: "setUiPanel"; id: string; patch: Partial<EditorUiPanelLayout> }
  | { type: "removeUiPanel"; id: string }
  | { type: "setUi"; ui: EditorUiDocument | undefined }
  | { type: "undo" }
  | { type: "redo" };

/** Per-dispatch options; `coalesce` merges consecutive same-key edits into one undo step. */
export interface EditorDispatchOptions {
  coalesce?: string;
}

/** The document plus current selection at a point in editor history. */
export interface EditorSessionState {
  document: EditorDocument;
  selection: string[];
}

/** Stateful, undoable handle for driving scene edits from UI or an MCP agent. */
export interface EditorSession {
  getState(): EditorSessionState;
  subscribe(listener: (state: EditorSessionState) => void): () => void;
  dispatch(command: EditorCommand, options?: EditorDispatchOptions): EditorSessionState;
  exportJson(pretty?: boolean): string;
  canUndo(): boolean;
  canRedo(): boolean;
}

function snapshotState(state: EditorSessionState): EditorSessionState {
  return {
    document: cloneEditorDocument(state.document),
    selection: [...state.selection],
  };
}

/**
 * A terrain-brush stroke in history: a compact vertex delta plus the selection to restore, tagged
 * by which brush produced it. History stores only the delta, so terrain undo never copies the
 * heightfield.
 */
type TerrainStroke =
  | { kind: "sculpt"; delta: TerraformDelta; selection: string[] }
  | { kind: "paint"; delta: SurfaceDelta; selection: string[] }
  | { kind: "blend"; delta: WeightDelta; selection: string[] };

type TerrainStrokeKind = TerrainStroke["kind"];

/**
 * Per-brush apply/revert pair over the heightfield snapshot. One registry drives every terrain
 * command, push, and undo/redo path, so the three brushes never fork into parallel code.
 */
const terrainStrokes: {
  [K in TerrainStrokeKind]: {
    apply(terrain: EditorTerrain, delta: Extract<TerrainStroke, { kind: K }>["delta"]): EditorTerrain;
    revert(terrain: EditorTerrain, delta: Extract<TerrainStroke, { kind: K }>["delta"]): EditorTerrain;
  };
} = {
  sculpt: { apply: applyDeltaToSnapshot, revert: revertDeltaFromSnapshot },
  paint: { apply: applySurfaceDeltaToSnapshot, revert: revertSurfaceDeltaFromSnapshot },
  blend: { apply: applyWeightDeltaToSnapshot, revert: revertWeightDeltaFromSnapshot },
};

/** Maps a terrain-brush command type to its stroke kind. */
const terrainStrokeKind: Record<"sculptTerrain" | "paintTerrain" | "blendTerrain", TerrainStrokeKind> = {
  sculptTerrain: "sculpt",
  paintTerrain: "paint",
  blendTerrain: "blend",
};

/**
 * A single reversible step. A `snapshot` entry restores a whole prior document; a stroke entry
 * carries only the brush's compact vertex delta.
 */
type HistoryEntry = { kind: "snapshot"; state: EditorSessionState } | TerrainStroke;

/** Creates an editor session with undo/redo history seeded from an initial document.
 * @internal
 */
export function createEditorSession(initial: EditorDocument, historyLimit = 100): EditorSession {
  let state: EditorSessionState = {
    document: cloneEditorDocument(initial),
    selection: [],
  };
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  let lastCoalesce: string | null = null;
  const listeners = new Set<(state: EditorSessionState) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  const applyStroke = (
    entry: TerrainStroke,
    direction: "apply" | "revert",
    selection: string[],
  ): EditorSessionState => {
    const terrain = state.document.terrain;
    if (terrain === undefined) return state;
    const next = terrainStrokes[entry.kind][direction](terrain, entry.delta as never);
    return { document: { ...state.document, terrain: next }, selection };
  };

  const pushTerrainStroke = (entry: TerrainStroke): void => {
    past.push(entry);
    if (past.length > historyLimit) past.shift();
    future.length = 0;
    lastCoalesce = null;
    state = applyStroke(entry, "apply", entry.selection);
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    dispatch(command, options) {
      if (command.type === "undo") {
        const entry = past.pop();
        if (entry === undefined) return state;
        if (entry.kind === "snapshot") {
          future.push({ kind: "snapshot", state: snapshotState(state) });
          state = entry.state;
        } else {
          future.push({ ...entry, selection: [...state.selection] });
          state = applyStroke(entry, "revert", entry.selection);
        }
        lastCoalesce = null;
        emit();
        return state;
      }
      if (command.type === "redo") {
        const entry = future.pop();
        if (entry === undefined) return state;
        if (entry.kind === "snapshot") {
          past.push({ kind: "snapshot", state: snapshotState(state) });
          state = entry.state;
        } else {
          past.push({ ...entry, selection: [...state.selection] });
          state = applyStroke(entry, "apply", entry.selection);
        }
        lastCoalesce = null;
        emit();
        return state;
      }

      if (command.type === "sculptTerrain" || command.type === "paintTerrain" || command.type === "blendTerrain") {
        if (state.document.terrain === undefined || command.delta.indices.length === 0) return state;
        pushTerrainStroke({
          kind: terrainStrokeKind[command.type],
          delta: command.delta,
          selection: [...state.selection],
        } as TerrainStroke);
        emit();
        return state;
      }

      const next = applyMutating(state, command);
      if (next === null) return state;
      if (isStructural(command)) {
        const coalesce = options?.coalesce;
        const merge = coalesce !== undefined && coalesce === lastCoalesce && past.length > 0;
        if (!merge) {
          past.push({ kind: "snapshot", state: snapshotState(state) });
          if (past.length > historyLimit) past.shift();
        }
        future.length = 0;
        lastCoalesce = coalesce ?? null;
      }
      state = next;
      emit();
      return state;
    },
    exportJson(pretty = true) {
      return JSON.stringify(state.document, null, pretty ? 2 : undefined);
    },
  };
}

/** Compact snapshot of a session state — counts, selection, and the selected object.
 * @internal
 */
export function summarizeEditorSession(state: EditorSessionState): {
  markers: number;
  volumes: number;
  paths: number;
  annotations: number;
  selection: string[];
  selectedMarker?: EditorMarker;
  selectedVolume?: EditorVolume;
} {
  const selectedId = state.selection[0];
  return {
    markers: state.document.markers.length,
    volumes: state.document.volumes.length,
    paths: state.document.paths.length,
    annotations: state.document.annotations.length,
    selection: [...state.selection],
    ...(selectedId === undefined
      ? {}
      : {
          selectedMarker: findEditorMarker(state.document, selectedId),
          selectedVolume: findEditorVolume(state.document, selectedId),
        }),
  };
}
