import { parseStaticPrefabBake, type StaticPrefabBake } from "./staticPrefab";
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
  decodeEditorDocument,
  findEditorMarker,
  findEditorVolume,
  isEditorObjectLocked,
  wouldCreateCycle,
} from "./document";
import type { EditorGridCellEdit, EditorGridLayer } from "./grid";
import type { ParamSchema } from "../scene/sceneKinds";
import type {
  EditorCatalogEntry,
  EditorBake,
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
  | { type: "setBake"; bake: EditorBake }
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
  | { type: "setPrefabStaticBake"; prefabId: string; bake: StaticPrefabBake | null }
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
  /** Stage a command batch, then commit one undo step and notification; failures leave all state intact. */
  transaction(commands: readonly EditorCommand[]): EditorTransactionResult;
  exportJson(pretty?: boolean): string;
  canUndo(): boolean;
  canRedo(): boolean;
}

/** Atomic command-batch outcome; a failure identifies the zero-based command index. */
export type EditorTransactionResult =
  | { ok: true; state: EditorSessionState; changed: boolean }
  | { ok: false; error: string; commandIndex?: number };

function transactionCommandError(document: EditorDocument, command: EditorCommand): string | null {
  if (command.type === "undo" || command.type === "redo") return "history commands cannot run inside a transaction";
  const placeables = [...document.markers, ...document.volumes, ...document.paths, ...document.annotations];
  const requireObjects = (ids: readonly string[], allowLocked = false): string | null => {
    if (!Array.isArray(ids) || ids.length === 0) return "expected at least one object id";
    for (const id of ids) {
      if (typeof id !== "string" || !placeables.some((item) => item.id === id)) return `object not found: ${String(id)}`;
      if (!allowLocked && isEditorObjectLocked(document, id)) return `object is locked: ${id}`;
    }
    return null;
  };
  switch (command.type) {
    case "setMarker": case "setVolume": case "setPath": case "setNote": {
      const list = command.type === "setMarker" ? document.markers : command.type === "setVolume" ? document.volumes : command.type === "setPath" ? document.paths : document.annotations;
      if (!list.some((item) => item.id === command.id)) return `${command.type} target not found: ${command.id}`;
      return requireObjects([command.id]);
    }
    case "setTransform":
      return [...document.markers, ...document.volumes, ...document.annotations].some((item) => item.id === command.id) ? requireObjects([command.id]) : `transform target not found: ${command.id}`;
    case "remove": return requireObjects([command.id]);
    case "translate": case "removeMany": case "batchSetProperties": case "assignMaterial":
      return requireObjects(command.ids);
    case "duplicate": return requireObjects(command.ids, true);
    case "select": return command.ids.length === 0 ? null : requireObjects(command.ids, true);
    case "setObjectFlags": return requireObjects(command.ids, true);
    case "setParent": {
      const error = requireObjects(command.ids);
      if (error !== null) return error;
      if (command.parentId !== null && !placeables.some((item) => item.id === command.parentId)) return `parent not found: ${command.parentId}`;
      for (const id of command.ids) {
        if (wouldCreateCycle(document, id, command.parentId)) return `parent cycle: ${id}`;
      }
      return null;
    }
    case "addMarker": case "addVolume": case "addPath": case "addNote": {
      const item = command.type === "addMarker" ? command.marker : command.type === "addVolume" ? command.volume : command.type === "addPath" ? command.path : command.note;
      if (typeof item.id !== "string" || item.id.trim().length === 0) return "expected a nonempty object id";
      const own = command.type === "addMarker" ? document.markers : command.type === "addVolume" ? document.volumes : command.type === "addPath" ? document.paths : document.annotations;
      if (placeables.some((entry) => entry.id === item.id) && !own.some((entry) => entry.id === item.id)) return `object id collision: ${item.id}`;
      return own.some((entry) => entry.id === item.id) ? requireObjects([item.id]) : null;
    }
    case "createPrefab": return requireObjects(command.ids, true);
    case "setPrefabStaticBake":
      if (command.bake !== null) parseStaticPrefabBake(command.bake);
      return document.prefabs.some((item) => item.id === command.prefabId) ? null : `prefab not found: ${command.prefabId}`;
    case "insertPrefab": case "deletePrefab":
      return document.prefabs.some((item) => item.id === command.prefabId) ? null : `prefab not found: ${command.prefabId}`;
    case "detachPrefabInstance":
      return placeables.some((item) => item.meta?.prefabInstanceId === command.instanceId) ? null : `prefab instance not found: ${command.instanceId}`;
    case "createCollection":
      return command.memberIds === undefined || command.memberIds.length === 0 ? null : requireObjects(command.memberIds, true);
    case "renameCollection": case "deleteCollection": case "setCollectionFlags": case "selectCollection":
      return document.collections.some((item) => item.id === command.id) ? null : `collection not found: ${command.id}`;
    case "setCollectionMembers": case "addToCollection": case "removeFromCollection": {
      if (!document.collections.some((item) => item.id === command.id)) return `collection not found: ${command.id}`;
      const ids = command.type === "setCollectionMembers" ? command.memberIds : command.ids;
      return ids.length === 0 ? null : requireObjects(ids, true);
    }
    case "setCatalogEntry": case "removeCatalogEntry": {
      const catalog = document.catalogs.find((item) => item.id === command.catalogId);
      return catalog?.entries.some((item) => item.id === command.entryId) ? null : `catalog entry not found: ${command.catalogId}/${command.entryId}`;
    }
    case "addCatalogEntry":
      return document.catalogs.find((item) => item.id === command.catalogId)?.entries.some((item) => item.id === command.entry.id) ? `catalog entry id collision: ${command.entry.id}` : null;
    case "removeCatalog": case "setCatalogSchema":
      return document.catalogs.some((item) => item.id === command.id) ? null : `catalog not found: ${command.id}`;
    case "removeGridLayer": case "setGridLayer": case "paintGridCells": case "fillGridRect": case "floodFillGrid": case "resizeGridLayer":
      return document.grids?.some((item) => item.id === command.id) ? null : `grid not found: ${command.id}`;
    case "convertScatterToObjects":
      return document.paths.some((item) => item.id === command.pathId) ? requireObjects([command.pathId]) : `path not found: ${command.pathId}`;
    case "sculptTerrain": case "paintTerrain": case "blendTerrain": case "setTerrainLayers": case "clearTerrain":
      return document.terrain === undefined ? "terrain not found" : null;
    default: return null;
  }
}

function assertTransactionValue(value: unknown, path = "$", ancestors = new Set<object>()): void {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw new Error(`${path}: expected serializable finite values`);
  if (ancestors.has(value)) throw new Error(`${path}: cyclic value`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error(`${path}: expected a plain object`);
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) assertTransactionValue(child, `${path}.${key}`, ancestors);
  ancestors.delete(value);
}

function assertObjectFields(value: unknown, nullableParent = false): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected an object payload");
  const fields = value as Record<string, unknown>;
  for (const key of ["id", "kind", "color", "label", "catalogId", "parentId", "text", "name", "materialId"]) {
    if (key === "parentId" && nullableParent && fields[key] === null) continue;
    if (fields[key] !== undefined && typeof fields[key] !== "string") throw new Error(`${key}: expected a string`);
  }
  for (const key of ["rotationY", "radius", "height", "width", "cellSize", "cols", "rows"]) {
    if (fields[key] !== undefined && typeof fields[key] !== "number") throw new Error(`${key}: expected a number`);
  }
  for (const key of ["locked", "hidden", "visible"]) {
    if (fields[key] !== undefined && typeof fields[key] !== "boolean") throw new Error(`${key}: expected a boolean`);
  }
  for (const key of ["position", "center", "halfExtents", "offset", "at"]) {
    const vector = fields[key];
    if (vector !== undefined && (vector === null || typeof vector !== "object" || !["x", "y", "z"].every((axis) => typeof (vector as Record<string, unknown>)[axis] === "number"))) throw new Error(`${key}: expected {x,y,z} numbers`);
  }
  for (const key of ["ids", "memberIds"]) {
    if (fields[key] !== undefined && (!Array.isArray(fields[key]) || fields[key].some((id: unknown) => typeof id !== "string"))) throw new Error(`${key}: expected string ids`);
  }
}

const transactionFields: Record<EditorCommand["type"], string> = {
  select: "ids", clearSelection: "", setTransform: "id ?position ?rotationY", translate: "ids delta", setParent: "ids parentId",
  addMarker: "marker", addVolume: "volume", addPath: "path", addNote: "note",
  setMarker: "id patch", setVolume: "id patch", setPath: "id patch", setNote: "id patch",
  setCatalogEntry: "catalogId entryId patch", addCatalogEntry: "catalogId entry", removeCatalogEntry: "catalogId entryId",
  addCatalog: "id ?label ?schema", removeCatalog: "id", setCatalogSchema: "id schema ?label",
  remove: "id", removeMany: "ids", duplicate: "ids ?offset", addFragment: "fragment ?offset",
  importDocument: "document", importJson: "json", replaceDocument: "document", setTerrain: "terrain",
  sculptTerrain: "delta", paintTerrain: "delta", blendTerrain: "delta", setTerrainLayers: "layers", clearTerrain: "",
  setMinimapBake: "minimap", setBake: "bake", setEnvironment: "?environment", convertScatterToObjects: "pathId markers",
  setPrefabStaticBake: "prefabId bake", createPrefab: "id name ids", insertPrefab: "prefabId at ?instanceId", detachPrefabInstance: "instanceId", deletePrefab: "prefabId",
  createCollection: "id name ?memberIds", renameCollection: "id name", deleteCollection: "id",
  setCollectionMembers: "id memberIds", addToCollection: "id ids", removeFromCollection: "id ids", setCollectionFlags: "id patch",
  setObjectFlags: "ids patch", selectCollection: "id", batchSetProperties: "ids patch", assignMaterial: "ids materialId",
  addGridLayer: "layer", removeGridLayer: "id", setGridLayer: "id patch", paintGridCells: "id cells",
  fillGridRect: "id col0 row0 col1 row1 value", floodFillGrid: "id col row value", resizeGridLayer: "id cols rows",
  setUiPanel: "id patch", removeUiPanel: "id", setUi: "?ui", undo: "", redo: "",
};

const placeableFields = {
  marker: "id kind position rotationY color label catalogId parentId locked hidden meta",
  volume: "id kind shape center radius height halfExtents color label parentId locked hidden meta",
  path: "id kind points width color label parentId locked hidden meta",
  note: "id text position color parentId locked hidden meta",
};

function assertPlacementFields(command: EditorCommand, key: string, payload: object): void {
  const kind = command.type === "addMarker" || command.type === "setMarker" ? "marker"
    : command.type === "addVolume" || command.type === "setVolume" ? "volume"
      : command.type === "addPath" || command.type === "setPath" ? "path"
        : command.type === "addNote" || command.type === "setNote" ? "note" : null;
  if (kind === null || (key !== kind && key !== "patch")) return;
  const allowed = new Set(placeableFields[kind].split(" "));
  if (key === "patch") allowed.delete("id");
  for (const field of Object.keys(payload)) {
    if (!allowed.has(field)) throw new Error(`unknown ${key} field: ${field}`);
  }
}

function assertCommandFields(command: EditorCommand): void {
  const spec = transactionFields[command.type];
  if (spec === undefined) throw new Error(`unknown command: ${String(command.type)}`);
  const fields = spec.split(" ").filter(Boolean);
  const allowed = new Set(["type", ...fields.map((field) => field.replace(/^\?/, ""))]);
  const record = command as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`unknown command field: ${key}`);
  }
  for (const field of fields) {
    if (!field.startsWith("?") && record[field] === undefined) throw new Error(`missing command field: ${field}`);
  }
}

function sameTransactionValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameTransactionValue(value, right[index]));
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  return keys.length === Object.keys(b).filter((key) => b[key] !== undefined).length && keys.every((key) => sameTransactionValue(a[key], b[key]));
}

function isUnchangedPlacement(document: EditorDocument, command: EditorCommand): boolean {
  switch (command.type) {
    case "addMarker": return sameTransactionValue(document.markers.find((item) => item.id === command.marker.id), command.marker);
    case "addVolume": return sameTransactionValue(document.volumes.find((item) => item.id === command.volume.id), command.volume);
    case "addPath": return sameTransactionValue(document.paths.find((item) => item.id === command.path.id), command.path);
    case "addNote": return sameTransactionValue(document.annotations.find((item) => item.id === command.note.id), command.note);
    default: return false;
  }
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
    transaction(commands) {
      if (!Array.isArray(commands) || commands.length === 0) return { ok: false, error: "commands transaction is empty" };
      let staged = snapshotState(state);
      for (let commandIndex = 0; commandIndex < commands.length; commandIndex += 1) {
        try {
          const input = commands[commandIndex]!;
          assertTransactionValue(input);
          assertObjectFields(input, input.type === "setParent");
          assertCommandFields(input);
          if (input.type === "translate") assertObjectFields({ position: input.delta });
          const command: EditorCommand = JSON.parse(JSON.stringify(input));
          for (const key of ["marker", "volume", "path", "note", "patch", "entry", "layer"] as const) {
            const payload = (command as unknown as Record<string, unknown>)[key];
            if (payload !== undefined) {
              assertObjectFields(payload);
              assertPlacementFields(command, key, payload as object);
              if (key === "patch" && ["setMarker", "setVolume", "setPath", "setNote", "setGridLayer"].includes(command.type) && "id" in (payload as object)) throw new Error("patch cannot change a stable id");
            }
          }
          const error = transactionCommandError(staged.document, command);
          if (error !== null) throw new Error(error);
          if (isUnchangedPlacement(staged.document, command)) continue;
          const next = applyMutating(staged, command);
          if (next === null) throw new Error(`${command.type} rejected`);
          const decoded = decodeEditorDocument(next.document);
          if (!decoded.ok) throw new Error(decoded.errors.map((diagnostic) => `${diagnostic.path} ${diagnostic.message}`).join("; "));
          for (const item of [...next.document.markers, ...next.document.volumes, ...next.document.paths, ...next.document.annotations]) {
            if (item.parentId !== undefined && wouldCreateCycle(next.document, item.id, item.parentId)) throw new Error(`parent cycle: ${item.id}`);
          }
          staged = next;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, commandIndex, error: `commands[${commandIndex}]: ${message}` };
        }
      }
      const documentChanged = !sameTransactionValue(staged.document, state.document);
      const selectionChanged = !sameTransactionValue(staged.selection, state.selection);
      if (!documentChanged && !selectionChanged) return { ok: true, state, changed: false };
      if (documentChanged) {
        past.push({ kind: "snapshot", state: snapshotState(state) });
        if (past.length > historyLimit) past.shift();
        future.length = 0;
        lastCoalesce = null;
      } else {
        staged.document = state.document;
      }
      state = staged;
      emit();
      return { ok: true, state, changed: true };
    },
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
