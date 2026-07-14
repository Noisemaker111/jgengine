import {
  applyDeltaToSnapshot,
  applySurfaceDeltaToSnapshot,
  revertDeltaFromSnapshot,
  revertSurfaceDeltaFromSnapshot,
  type SurfaceDelta,
  type TerraformDelta,
} from "../world/terraform";
import {
  cloneEditorDocument,
  extractEditorFragment,
  findEditorMarker,
  findEditorVolume,
  importEditorDocumentJson,
} from "./document";
import type {
  EditorDocument,
  EditorMarker,
  EditorNote,
  EditorPath,
  EditorTerrain,
  EditorVec3,
  EditorVolume,
} from "./types";

/** A single editor mutation — select, move, add, remove, undo/redo — dispatched to a session. */
export type EditorCommand =
  | { type: "select"; ids: readonly string[] }
  | { type: "clearSelection" }
  | { type: "setTransform"; id: string; position?: EditorVec3; rotationY?: number }
  | { type: "translate"; ids: readonly string[]; delta: EditorVec3 }
  | { type: "addMarker"; marker: EditorMarker }
  | { type: "addVolume"; volume: EditorVolume }
  | { type: "addPath"; path: EditorPath }
  | { type: "addNote"; note: EditorNote }
  | { type: "setMarker"; id: string; patch: Partial<Omit<EditorMarker, "id">> }
  | { type: "setVolume"; id: string; patch: Partial<Omit<EditorVolume, "id">> }
  | { type: "setPath"; id: string; patch: Partial<Omit<EditorPath, "id">> }
  | { type: "setNote"; id: string; patch: Partial<Omit<EditorNote, "id">> }
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
  | { type: "clearTerrain" }
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

function removeByIds(doc: EditorDocument, ids: ReadonlySet<string>): EditorDocument {
  return {
    version: 1,
    markers: doc.markers.filter((marker) => !ids.has(marker.id)),
    volumes: doc.volumes.filter((volume) => !ids.has(volume.id)),
    paths: doc.paths.filter((path) => !ids.has(path.id)),
    annotations: doc.annotations.filter((note) => !ids.has(note.id)),
    ...(doc.terrain === undefined ? {} : { terrain: doc.terrain }),
  };
}

function shifted(point: EditorVec3, delta: EditorVec3): EditorVec3 {
  return { x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z };
}

function translateByIds(
  doc: EditorDocument,
  ids: ReadonlySet<string>,
  delta: EditorVec3,
): EditorDocument {
  return {
    version: 1,
    markers: doc.markers.map((marker) =>
      ids.has(marker.id) ? { ...marker, position: shifted(marker.position, delta) } : marker,
    ),
    volumes: doc.volumes.map((volume) =>
      ids.has(volume.id) ? { ...volume, center: shifted(volume.center, delta) } : volume,
    ),
    paths: doc.paths.map((path) =>
      ids.has(path.id) ? { ...path, points: path.points.map((point) => shifted(point, delta)) } : path,
    ),
    annotations: doc.annotations.map((note) =>
      ids.has(note.id) ? { ...note, position: shifted(note.position, delta) } : note,
    ),
    ...(doc.terrain === undefined ? {} : { terrain: doc.terrain }),
  };
}

function collectIds(doc: EditorDocument): Set<string> {
  const all = new Set<string>();
  for (const marker of doc.markers) all.add(marker.id);
  for (const volume of doc.volumes) all.add(volume.id);
  for (const path of doc.paths) all.add(path.id);
  for (const note of doc.annotations) all.add(note.id);
  return all;
}

function copyId(base: string, taken: Set<string>): string {
  let candidate = `${base}_copy`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_copy${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

function insertFragment(
  state: EditorSessionState,
  fragment: EditorDocument,
  offset: EditorVec3,
  renameAll: boolean,
): EditorSessionState {
  const doc = state.document;
  const taken = collectIds(doc);
  const clones = cloneEditorDocument(fragment);
  const newIds: string[] = [];
  const withId = <T extends { id: string }>(item: T): T => {
    const id = renameAll || taken.has(item.id) ? copyId(item.id, taken) : item.id;
    taken.add(id);
    newIds.push(id);
    return { ...item, id };
  };
  const markers = clones.markers.map((marker) =>
    withId({ ...marker, position: shifted(marker.position, offset) }),
  );
  const volumes = clones.volumes.map((volume) =>
    withId({ ...volume, center: shifted(volume.center, offset) }),
  );
  const paths = clones.paths.map((path) =>
    withId({ ...path, points: path.points.map((point) => shifted(point, offset)) }),
  );
  const annotations = clones.annotations.map((note) =>
    withId({ ...note, position: shifted(note.position, offset) }),
  );
  if (newIds.length === 0) return state;
  return {
    document: {
      version: 1,
      markers: [...doc.markers, ...markers],
      volumes: [...doc.volumes, ...volumes],
      paths: [...doc.paths, ...paths],
      annotations: [...doc.annotations, ...annotations],
      ...(doc.terrain === undefined ? {} : { terrain: doc.terrain }),
    },
    selection: newIds,
  };
}

function applyMutating(state: EditorSessionState, command: EditorCommand): EditorSessionState | null {
  switch (command.type) {
    case "select":
      return { ...state, selection: [...command.ids] };
    case "clearSelection":
      return { ...state, selection: [] };
    case "setTransform": {
      const markers = state.document.markers.map((marker) => {
        if (marker.id !== command.id) return marker;
        return {
          ...marker,
          position: command.position === undefined ? marker.position : { ...command.position },
          ...(command.rotationY === undefined ? {} : { rotationY: command.rotationY }),
        };
      });
      const volumes = state.document.volumes.map((volume) => {
        if (volume.id !== command.id) return volume;
        if (command.position === undefined) return volume;
        return { ...volume, center: { ...command.position } };
      });
      const annotations = state.document.annotations.map((note) => {
        if (note.id !== command.id) return note;
        if (command.position === undefined) return note;
        return { ...note, position: { ...command.position } };
      });
      return {
        ...state,
        document: { ...state.document, markers, volumes, annotations },
      };
    }
    case "translate":
      return {
        ...state,
        document: translateByIds(state.document, new Set(command.ids), command.delta),
      };
    case "addMarker":
      return {
        ...state,
        document: {
          ...state.document,
          markers: [...state.document.markers.filter((m) => m.id !== command.marker.id), command.marker],
        },
        selection: [command.marker.id],
      };
    case "addVolume":
      return {
        ...state,
        document: {
          ...state.document,
          volumes: [...state.document.volumes.filter((v) => v.id !== command.volume.id), command.volume],
        },
        selection: [command.volume.id],
      };
    case "addPath":
      return {
        ...state,
        document: {
          ...state.document,
          paths: [...state.document.paths.filter((p) => p.id !== command.path.id), command.path],
        },
        selection: [command.path.id],
      };
    case "addNote":
      return {
        ...state,
        document: {
          ...state.document,
          annotations: [
            ...state.document.annotations.filter((n) => n.id !== command.note.id),
            command.note,
          ],
        },
        selection: [command.note.id],
      };
    case "setMarker": {
      const markers = state.document.markers.map((marker) => {
        if (marker.id !== command.id) return marker;
        return {
          ...marker,
          ...command.patch,
          position: command.patch.position === undefined ? marker.position : { ...command.patch.position },
          meta: command.patch.meta === undefined ? marker.meta : { ...command.patch.meta },
        };
      });
      return { ...state, document: { ...state.document, markers } };
    }
    case "setVolume": {
      const volumes = state.document.volumes.map((volume) => {
        if (volume.id !== command.id) return volume;
        return {
          ...volume,
          ...command.patch,
          center: command.patch.center === undefined ? volume.center : { ...command.patch.center },
          halfExtents:
            command.patch.halfExtents === undefined
              ? volume.halfExtents
              : { ...command.patch.halfExtents },
          meta: command.patch.meta === undefined ? volume.meta : { ...command.patch.meta },
        };
      });
      return { ...state, document: { ...state.document, volumes } };
    }
    case "setPath": {
      const paths = state.document.paths.map((path) => {
        if (path.id !== command.id) return path;
        return {
          ...path,
          ...command.patch,
          points:
            command.patch.points === undefined
              ? path.points
              : command.patch.points.map((point) => ({ ...point })),
          meta: command.patch.meta === undefined ? path.meta : { ...command.patch.meta },
        };
      });
      return { ...state, document: { ...state.document, paths } };
    }
    case "setNote": {
      const annotations = state.document.annotations.map((note) => {
        if (note.id !== command.id) return note;
        return {
          ...note,
          ...command.patch,
          position: command.patch.position === undefined ? note.position : { ...command.patch.position },
          meta: command.patch.meta === undefined ? note.meta : { ...command.patch.meta },
        };
      });
      return { ...state, document: { ...state.document, annotations } };
    }
    case "remove":
      return {
        document: removeByIds(state.document, new Set([command.id])),
        selection: state.selection.filter((id) => id !== command.id),
      };
    case "removeMany": {
      const gone = new Set(command.ids);
      return {
        document: removeByIds(state.document, gone),
        selection: state.selection.filter((id) => !gone.has(id)),
      };
    }
    case "duplicate":
      return insertFragment(
        state,
        extractEditorFragment(state.document, command.ids),
        command.offset ?? { x: 2, y: 0, z: 2 },
        true,
      );
    case "addFragment":
      return insertFragment(state, command.fragment, command.offset ?? { x: 0, y: 0, z: 0 }, false);
    case "importDocument":
    case "replaceDocument":
      return {
        document: cloneEditorDocument(command.document),
        selection: [],
      };
    case "importJson":
      return {
        document: importEditorDocumentJson(command.json),
        selection: [],
      };
    case "setTerrain":
      return { ...state, document: { ...state.document, terrain: command.terrain } };
    case "clearTerrain": {
      const nextDoc: EditorDocument = {
        version: 1,
        markers: state.document.markers,
        volumes: state.document.volumes,
        paths: state.document.paths,
        annotations: state.document.annotations,
      };
      return { ...state, document: nextDoc };
    }
    case "sculptTerrain": {
      if (state.document.terrain === undefined) return state;
      return {
        ...state,
        document: { ...state.document, terrain: applyDeltaToSnapshot(state.document.terrain, command.delta) },
      };
    }
    case "paintTerrain": {
      if (state.document.terrain === undefined) return state;
      return {
        ...state,
        document: { ...state.document, terrain: applySurfaceDeltaToSnapshot(state.document.terrain, command.delta) },
      };
    }
    case "undo":
    case "redo":
      return null;
  }
}

function isStructural(command: EditorCommand): boolean {
  return (
    command.type !== "select" &&
    command.type !== "clearSelection" &&
    command.type !== "undo" &&
    command.type !== "redo"
  );
}

/**
 * A single reversible step. A `snapshot` entry restores a whole prior document; a `sculpt` entry
 * carries only the stroke's compact vertex delta, so terrain history never copies the heightfield.
 */
type HistoryEntry =
  | { kind: "snapshot"; state: EditorSessionState }
  | { kind: "sculpt"; delta: TerraformDelta; selection: string[] }
  | { kind: "paint"; delta: SurfaceDelta; selection: string[] };

/** Creates an editor session with undo/redo history seeded from an initial document. */
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

  const sculptWith = (
    delta: TerraformDelta,
    direction: "apply" | "revert",
    selection: string[],
  ): EditorSessionState => {
    const terrain = state.document.terrain;
    if (terrain === undefined) return state;
    const next = direction === "apply" ? applyDeltaToSnapshot(terrain, delta) : revertDeltaFromSnapshot(terrain, delta);
    return { document: { ...state.document, terrain: next }, selection };
  };

  const paintWith = (
    delta: SurfaceDelta,
    direction: "apply" | "revert",
    selection: string[],
  ): EditorSessionState => {
    const terrain = state.document.terrain;
    if (terrain === undefined) return state;
    const next =
      direction === "apply"
        ? applySurfaceDeltaToSnapshot(terrain, delta)
        : revertSurfaceDeltaFromSnapshot(terrain, delta);
    return { document: { ...state.document, terrain: next }, selection };
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
        if (entry.kind === "sculpt") {
          future.push({ kind: "sculpt", delta: entry.delta, selection: state.selection });
          state = sculptWith(entry.delta, "revert", entry.selection);
        } else if (entry.kind === "paint") {
          future.push({ kind: "paint", delta: entry.delta, selection: state.selection });
          state = paintWith(entry.delta, "revert", entry.selection);
        } else {
          future.push({ kind: "snapshot", state: snapshotState(state) });
          state = entry.state;
        }
        lastCoalesce = null;
        emit();
        return state;
      }
      if (command.type === "redo") {
        const entry = future.pop();
        if (entry === undefined) return state;
        if (entry.kind === "sculpt") {
          past.push({ kind: "sculpt", delta: entry.delta, selection: state.selection });
          state = sculptWith(entry.delta, "apply", entry.selection);
        } else if (entry.kind === "paint") {
          past.push({ kind: "paint", delta: entry.delta, selection: state.selection });
          state = paintWith(entry.delta, "apply", entry.selection);
        } else {
          past.push({ kind: "snapshot", state: snapshotState(state) });
          state = entry.state;
        }
        lastCoalesce = null;
        emit();
        return state;
      }

      if (command.type === "sculptTerrain") {
        if (state.document.terrain === undefined || command.delta.indices.length === 0) return state;
        past.push({ kind: "sculpt", delta: command.delta, selection: [...state.selection] });
        if (past.length > historyLimit) past.shift();
        future.length = 0;
        lastCoalesce = null;
        state = sculptWith(command.delta, "apply", state.selection);
        emit();
        return state;
      }

      if (command.type === "paintTerrain") {
        if (state.document.terrain === undefined || command.delta.indices.length === 0) return state;
        past.push({ kind: "paint", delta: command.delta, selection: [...state.selection] });
        if (past.length > historyLimit) past.shift();
        future.length = 0;
        lastCoalesce = null;
        state = paintWith(command.delta, "apply", state.selection);
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

/** Compact snapshot of a session state — counts, selection, and the selected object. */
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
