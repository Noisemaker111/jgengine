import {
  cloneEditorDocument,
  findEditorMarker,
  findEditorVolume,
  importEditorDocumentJson,
} from "./document";
import type { EditorDocument, EditorMarker, EditorVec3, EditorVolume } from "./types";

/** A single editor mutation — select, move, add, remove, undo/redo — dispatched to a session. */
export type EditorCommand =
  | { type: "select"; ids: readonly string[] }
  | { type: "clearSelection" }
  | { type: "setTransform"; id: string; position?: EditorVec3; rotationY?: number }
  | { type: "addMarker"; marker: EditorMarker }
  | { type: "remove"; id: string }
  | { type: "setVolume"; id: string; patch: Partial<Omit<EditorVolume, "id">> }
  | { type: "addVolume"; volume: EditorVolume }
  | { type: "importDocument"; document: EditorDocument }
  | { type: "importJson"; json: string }
  | { type: "replaceDocument"; document: EditorDocument }
  | { type: "undo" }
  | { type: "redo" };

/** The document plus current selection at a point in editor history. */
export interface EditorSessionState {
  document: EditorDocument;
  selection: string[];
}

/** Stateful, undoable handle for driving scene edits from UI or an MCP agent. */
export interface EditorSession {
  getState(): EditorSessionState;
  subscribe(listener: (state: EditorSessionState) => void): () => void;
  dispatch(command: EditorCommand): EditorSessionState;
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

function removeById(doc: EditorDocument, id: string): EditorDocument {
  return {
    version: 1,
    markers: doc.markers.filter((marker) => marker.id !== id),
    volumes: doc.volumes.filter((volume) => volume.id !== id),
    paths: doc.paths.filter((path) => path.id !== id),
    annotations: doc.annotations.filter((note) => note.id !== id),
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
    case "remove":
      return {
        document: removeById(state.document, command.id),
        selection: state.selection.filter((id) => id !== command.id),
      };
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
    case "undo":
    case "redo":
      return null;
  }
}

function isStructural(command: EditorCommand): boolean {
  return (
    command.type === "setTransform" ||
    command.type === "addMarker" ||
    command.type === "addVolume" ||
    command.type === "setVolume" ||
    command.type === "remove" ||
    command.type === "importDocument" ||
    command.type === "importJson" ||
    command.type === "replaceDocument"
  );
}

/** Creates an editor session with undo/redo history seeded from an initial document. */
export function createEditorSession(initial: EditorDocument, historyLimit = 100): EditorSession {
  let state: EditorSessionState = {
    document: cloneEditorDocument(initial),
    selection: [],
  };
  const past: EditorSessionState[] = [];
  const future: EditorSessionState[] = [];
  const listeners = new Set<(state: EditorSessionState) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
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
    dispatch(command) {
      if (command.type === "undo") {
        const previous = past.pop();
        if (previous === undefined) return state;
        future.push(snapshotState(state));
        state = previous;
        emit();
        return state;
      }
      if (command.type === "redo") {
        const next = future.pop();
        if (next === undefined) return state;
        past.push(snapshotState(state));
        state = next;
        emit();
        return state;
      }

      const next = applyMutating(state, command);
      if (next === null) return state;
      if (isStructural(command)) {
        past.push(snapshotState(state));
        if (past.length > historyLimit) past.shift();
        future.length = 0;
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
