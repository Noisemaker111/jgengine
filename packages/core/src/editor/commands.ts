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
import {
  patchUiPanel,
  removeUiPanel,
  type EditorUiDocument,
  type EditorUiPanelLayout,
} from "../ui/hudDocument";
import {
  cloneEditorDocument,
  collectDescendants,
  createPrefabFragment,
  editorDocumentExtras,
  ensureUniqueEditorId,
  extractEditorFragment,
  findEditorCollection,
  findEditorMarker,
  findEditorPrefab,
  findEditorVolume,
  importEditorDocumentJson,
  isEditorObjectLocked,
  wouldCreateCycle,
} from "./document";
import {
  fillGridRect,
  floodFillGrid,
  migrateGridLayer,
  paintGridCells,
  resizeGridLayer,
  type EditorGridCellEdit,
  type EditorGridLayer,
} from "./grid";
import type {
  EditorCatalogEntry,
  EditorCollection,
  EditorDocument,
  EditorFragmentContent,
  EditorMarker,
  EditorNote,
  EditorPath,
  EditorPrefab,
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

function removeByIds(doc: EditorDocument, ids: ReadonlySet<string>): EditorDocument {
  return {
    version: 1,
    markers: doc.markers.filter((marker) => !ids.has(marker.id)),
    volumes: doc.volumes.filter((volume) => !ids.has(volume.id)),
    paths: doc.paths.filter((path) => !ids.has(path.id)),
    annotations: doc.annotations.filter((note) => !ids.has(note.id)),
    ...editorDocumentExtras(doc),
    collections: doc.collections.map((collection) => ({
      ...collection,
      memberIds: collection.memberIds.filter((id) => !ids.has(id)),
    })),
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
    ...editorDocumentExtras(doc),
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

/**
 * Adding to a collection replaces a same-id member in that same collection (the existing
 * upsert behavior); anything else collides with the document-global id space shared by markers,
 * volumes, paths, and annotations, so it gets re-idded instead of shadowing whatever already
 * holds that id in a different collection.
 */
function ownIdOrGloballyUnique<T extends { id: string }>(
  doc: EditorDocument,
  item: T,
  ownCollection: readonly { id: string }[],
): T {
  if (ownCollection.some((entry) => entry.id === item.id)) return item;
  const id = ensureUniqueEditorId(item.id, collectIds(doc));
  return id === item.id ? item : { ...item, id };
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
      ...editorDocumentExtras(doc),
    },
    selection: newIds,
  };
}

function fragmentAsDocument(fragment: EditorFragmentContent): EditorDocument {
  return {
    version: 1,
    markers: [...fragment.markers],
    volumes: [...fragment.volumes],
    paths: [...fragment.paths],
    annotations: [...fragment.annotations],
    prefabs: [],
    collections: [],
    catalogs: [],
  };
}

function tagWithInstance<T extends { meta?: Record<string, unknown> }>(
  item: T,
  prefabId: string,
  instanceId: string,
): T {
  return { ...item, meta: { ...item.meta, prefabId, prefabInstanceId: instanceId } };
}

/**
 * Replaces one grid layer in place via `transform`, returning `null` when the layer is missing and
 * the same state when the transform is a no-op (so history skips it).
 */
function updateGridLayer(
  state: EditorSessionState,
  id: string,
  transform: (layer: EditorGridLayer) => EditorGridLayer,
): EditorSessionState | null {
  const grids = state.document.grids;
  if (grids === undefined) return null;
  const index = grids.findIndex((layer) => layer.id === id);
  if (index < 0) return null;
  const next = transform(grids[index]!);
  if (next === grids[index]) return state;
  const updated = grids.map((layer, i) => (i === index ? next : layer));
  return { ...state, document: { ...state.document, grids: updated } };
}

function applyMutating(state: EditorSessionState, command: EditorCommand): EditorSessionState | null {
  switch (command.type) {
    case "select":
      return { ...state, selection: [...command.ids] };
    case "clearSelection":
      return { ...state, selection: [] };
    case "setTransform": {
      if (isEditorObjectLocked(state.document, command.id)) return null;
      const marker = findEditorMarker(state.document, command.id);
      const volume = findEditorVolume(state.document, command.id);
      const note = state.document.annotations.find((n) => n.id === command.id);
      const previous = marker?.position ?? volume?.center ?? note?.position;
      // Moving a parent to a new position carries its whole subtree by the same delta.
      const childDelta =
        command.position === undefined || previous === undefined
          ? null
          : {
              x: command.position.x - previous.x,
              y: command.position.y - previous.y,
              z: command.position.z - previous.z,
            };
      const descendants =
        childDelta === null ? new Set<string>() : collectDescendants(state.document, [command.id]);
      const shift = (point: EditorVec3): EditorVec3 =>
        childDelta === null ? point : shifted(point, childDelta);
      const markers = state.document.markers.map((entry) => {
        if (entry.id === command.id) {
          return {
            ...entry,
            position: command.position === undefined ? entry.position : { ...command.position },
            ...(command.rotationY === undefined ? {} : { rotationY: command.rotationY }),
          };
        }
        return descendants.has(entry.id) ? { ...entry, position: shift(entry.position) } : entry;
      });
      const volumes = state.document.volumes.map((entry) => {
        if (entry.id === command.id) return command.position === undefined ? entry : { ...entry, center: { ...command.position } };
        return descendants.has(entry.id) ? { ...entry, center: shift(entry.center) } : entry;
      });
      const paths = state.document.paths.map((entry) =>
        descendants.has(entry.id) ? { ...entry, points: entry.points.map(shift) } : entry,
      );
      const annotations = state.document.annotations.map((entry) => {
        if (entry.id === command.id) return command.position === undefined ? entry : { ...entry, position: { ...command.position } };
        return descendants.has(entry.id) ? { ...entry, position: shift(entry.position) } : entry;
      });
      return {
        ...state,
        document: { ...state.document, markers, volumes, paths, annotations },
      };
    }
    case "translate": {
      const movable = command.ids.filter((id) => !isEditorObjectLocked(state.document, id));
      if (movable.length === 0) return null;
      const ids = new Set(movable);
      for (const descendant of collectDescendants(state.document, movable)) ids.add(descendant);
      return {
        ...state,
        document: translateByIds(state.document, ids, command.delta),
      };
    }
    case "setParent": {
      const targets = command.ids.filter((id) => !wouldCreateCycle(state.document, id, command.parentId));
      if (targets.length === 0) return state;
      const wanted = new Set(targets);
      const reparent = <T extends { id: string; parentId?: string }>(entry: T): T => {
        if (!wanted.has(entry.id)) return entry;
        if (command.parentId === null) {
          if (entry.parentId === undefined) return entry;
          const next = { ...entry };
          delete next.parentId;
          return next;
        }
        return { ...entry, parentId: command.parentId };
      };
      return {
        ...state,
        document: {
          ...state.document,
          markers: state.document.markers.map(reparent),
          volumes: state.document.volumes.map(reparent),
          paths: state.document.paths.map(reparent),
          annotations: state.document.annotations.map(reparent),
        },
      };
    }
    case "addMarker": {
      const marker = ownIdOrGloballyUnique(state.document, command.marker, state.document.markers);
      return {
        ...state,
        document: {
          ...state.document,
          markers: [...state.document.markers.filter((m) => m.id !== marker.id), marker],
        },
        selection: [marker.id],
      };
    }
    case "addVolume": {
      const volume = ownIdOrGloballyUnique(state.document, command.volume, state.document.volumes);
      return {
        ...state,
        document: {
          ...state.document,
          volumes: [...state.document.volumes.filter((v) => v.id !== volume.id), volume],
        },
        selection: [volume.id],
      };
    }
    case "addPath": {
      const path = ownIdOrGloballyUnique(state.document, command.path, state.document.paths);
      return {
        ...state,
        document: {
          ...state.document,
          paths: [...state.document.paths.filter((p) => p.id !== path.id), path],
        },
        selection: [path.id],
      };
    }
    case "addNote": {
      const note = ownIdOrGloballyUnique(state.document, command.note, state.document.annotations);
      return {
        ...state,
        document: {
          ...state.document,
          annotations: [...state.document.annotations.filter((n) => n.id !== note.id), note],
        },
        selection: [note.id],
      };
    }
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
    case "setCatalogEntry": {
      const catalog = state.document.catalogs.find((entry) => entry.id === command.catalogId);
      if (catalog === undefined) return null;
      if (!catalog.entries.some((entry) => entry.id === command.entryId)) return null;
      const catalogs = state.document.catalogs.map((row) => {
        if (row.id !== command.catalogId) return row;
        return {
          ...row,
          entries: row.entries.map((entry) => {
            if (entry.id !== command.entryId) return entry;
            const next: EditorCatalogEntry = { id: entry.id };
            const label = command.patch.label ?? entry.label;
            if (label !== undefined) next.label = label;
            if (command.patch.meta !== undefined) next.meta = { ...entry.meta, ...command.patch.meta };
            else if (entry.meta !== undefined) next.meta = { ...entry.meta };
            return next;
          }),
        };
      });
      return { ...state, document: { ...state.document, catalogs } };
    }
    case "remove":
      if (isEditorObjectLocked(state.document, command.id)) return null;
      return {
        document: removeByIds(state.document, new Set([command.id])),
        selection: state.selection.filter((id) => id !== command.id),
      };
    case "removeMany": {
      const gone = new Set(command.ids.filter((id) => !isEditorObjectLocked(state.document, id)));
      if (gone.size === 0) return null;
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
        prefabs: state.document.prefabs,
        collections: state.document.collections,
        catalogs: state.document.catalogs,
        ...(state.document.grids === undefined ? {} : { grids: state.document.grids }),
        ...(state.document.ui === undefined ? {} : { ui: state.document.ui }),
      };
      return { ...state, document: nextDoc };
    }
    case "setUiPanel": {
      const ui = patchUiPanel(state.document.ui, command.id, command.patch);
      return { ...state, document: { ...state.document, ui } };
    }
    case "removeUiPanel": {
      const ui = removeUiPanel(state.document.ui, command.id);
      if (ui === undefined) {
        const { ui: _removed, ...rest } = state.document;
        void _removed;
        return { ...state, document: rest };
      }
      return { ...state, document: { ...state.document, ui } };
    }
    case "setUi": {
      if (command.ui === undefined) {
        const { ui: _removed, ...rest } = state.document;
        void _removed;
        return { ...state, document: rest };
      }
      return { ...state, document: { ...state.document, ui: command.ui } };
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
    case "blendTerrain": {
      if (state.document.terrain === undefined) return state;
      return {
        ...state,
        document: { ...state.document, terrain: applyWeightDeltaToSnapshot(state.document.terrain, command.delta) },
      };
    }
    case "setTerrainLayers": {
      if (state.document.terrain === undefined) return state;
      const terrain = state.document.terrain;
      const layers = command.layers.map((layer) => ({ ...layer }));
      const before = terrain.layers ?? [];
      // Keep hand-painted weights only when the layer id sequence is unchanged (a params-only edit).
      const sameSequence =
        before.length === layers.length && before.every((layer, i) => layer.id === layers[i]!.id);
      const next: EditorTerrain =
        sameSequence
          ? { ...terrain, layers }
          : (() => {
              const copy = { ...terrain, layers };
              delete copy.weights;
              return copy;
            })();
      return { ...state, document: { ...state.document, terrain: next } };
    }
    case "convertScatterToObjects": {
      const path = state.document.paths.find((entry) => entry.id === command.pathId);
      if (path === undefined) return state;
      const taken = collectIds(state.document);
      const markers = command.markers.map((marker) => {
        let id = marker.id;
        while (taken.has(id)) id = copyId(marker.id, taken);
        taken.add(id);
        return { ...marker, id };
      });
      return {
        document: {
          ...state.document,
          markers: [...state.document.markers, ...markers],
          paths: state.document.paths.filter((entry) => entry.id !== command.pathId),
        },
        selection: markers.map((marker) => marker.id),
      };
    }
    case "createPrefab": {
      if (command.ids.length === 0) return state;
      const fragment = createPrefabFragment(state.document, command.ids);
      const prefab: EditorPrefab = { id: command.id, name: command.name, fragment };
      return {
        ...state,
        document: {
          ...state.document,
          prefabs: [...state.document.prefabs.filter((entry) => entry.id !== command.id), prefab],
        },
      };
    }
    case "deletePrefab":
      return {
        ...state,
        document: {
          ...state.document,
          prefabs: state.document.prefabs.filter((entry) => entry.id !== command.prefabId),
        },
      };
    case "insertPrefab": {
      const prefab = findEditorPrefab(state.document, command.prefabId);
      if (prefab === undefined) return state;
      const instanceId =
        command.instanceId ??
        `${prefab.id}_inst_${Date.now().toString(36)}_${Math.floor(Math.random() * 1_296_000).toString(36)}`;
      const tagged = fragmentAsDocument({
        markers: prefab.fragment.markers.map((marker) => tagWithInstance(marker, prefab.id, instanceId)),
        volumes: prefab.fragment.volumes.map((volume) => tagWithInstance(volume, prefab.id, instanceId)),
        paths: prefab.fragment.paths.map((path) => tagWithInstance(path, prefab.id, instanceId)),
        annotations: prefab.fragment.annotations.map((note) => tagWithInstance(note, prefab.id, instanceId)),
      });
      return insertFragment(state, tagged, command.at, true);
    }
    case "detachPrefabInstance": {
      const strip = <T extends { meta?: Record<string, unknown> }>(item: T): T => {
        if (item.meta?.prefabInstanceId !== command.instanceId) return item;
        const meta = { ...item.meta };
        delete meta.prefabId;
        delete meta.prefabInstanceId;
        return { ...item, meta };
      };
      return {
        ...state,
        document: {
          ...state.document,
          markers: state.document.markers.map(strip),
          volumes: state.document.volumes.map(strip),
          paths: state.document.paths.map(strip),
          annotations: state.document.annotations.map(strip),
        },
      };
    }
    case "createCollection": {
      const collection: EditorCollection = {
        id: command.id,
        name: command.name,
        memberIds: [...(command.memberIds ?? [])],
      };
      return {
        ...state,
        document: {
          ...state.document,
          collections: [...state.document.collections.filter((entry) => entry.id !== command.id), collection],
        },
      };
    }
    case "renameCollection": {
      const collections = state.document.collections.map((collection) =>
        collection.id === command.id ? { ...collection, name: command.name } : collection,
      );
      return { ...state, document: { ...state.document, collections } };
    }
    case "deleteCollection":
      return {
        ...state,
        document: {
          ...state.document,
          collections: state.document.collections.filter((entry) => entry.id !== command.id),
        },
      };
    case "setCollectionMembers": {
      const collections = state.document.collections.map((collection) =>
        collection.id === command.id ? { ...collection, memberIds: [...command.memberIds] } : collection,
      );
      return { ...state, document: { ...state.document, collections } };
    }
    case "addToCollection": {
      const adding = new Set(command.ids);
      const collections = state.document.collections.map((collection) => {
        if (collection.id !== command.id) return collection;
        const merged = new Set(collection.memberIds);
        for (const id of adding) merged.add(id);
        return { ...collection, memberIds: [...merged] };
      });
      return { ...state, document: { ...state.document, collections } };
    }
    case "removeFromCollection": {
      const removing = new Set(command.ids);
      const collections = state.document.collections.map((collection) =>
        collection.id === command.id
          ? { ...collection, memberIds: collection.memberIds.filter((id) => !removing.has(id)) }
          : collection,
      );
      return { ...state, document: { ...state.document, collections } };
    }
    case "setCollectionFlags": {
      const collections = state.document.collections.map((collection) =>
        collection.id === command.id ? { ...collection, ...command.patch } : collection,
      );
      return { ...state, document: { ...state.document, collections } };
    }
    case "selectCollection": {
      const collection = findEditorCollection(state.document, command.id);
      if (collection === undefined) return null;
      return { ...state, selection: [...collection.memberIds] };
    }
    case "batchSetProperties": {
      const ids = new Set(command.ids);
      const patch = command.patch;
      const markers = state.document.markers.map((marker) =>
        ids.has(marker.id)
          ? {
              ...marker,
              ...(patch.color === undefined ? {} : { color: patch.color }),
              ...(patch.label === undefined ? {} : { label: patch.label }),
              ...(patch.meta === undefined ? {} : { meta: { ...marker.meta, ...patch.meta } }),
            }
          : marker,
      );
      const volumes = state.document.volumes.map((volume) =>
        ids.has(volume.id)
          ? {
              ...volume,
              ...(patch.color === undefined ? {} : { color: patch.color }),
              ...(patch.label === undefined ? {} : { label: patch.label }),
              ...(patch.meta === undefined ? {} : { meta: { ...volume.meta, ...patch.meta } }),
            }
          : volume,
      );
      const paths = state.document.paths.map((path) =>
        ids.has(path.id)
          ? {
              ...path,
              ...(patch.color === undefined ? {} : { color: patch.color }),
              ...(patch.label === undefined ? {} : { label: patch.label }),
              ...(patch.meta === undefined ? {} : { meta: { ...path.meta, ...patch.meta } }),
            }
          : path,
      );
      const annotations = state.document.annotations.map((note) =>
        ids.has(note.id)
          ? {
              ...note,
              ...(patch.color === undefined ? {} : { color: patch.color }),
              ...(patch.meta === undefined ? {} : { meta: { ...note.meta, ...patch.meta } }),
            }
          : note,
      );
      return { ...state, document: { ...state.document, markers, volumes, paths, annotations } };
    }
    case "addGridLayer": {
      const layer = migrateGridLayer(command.layer);
      const grids = state.document.grids ?? [];
      return {
        ...state,
        document: {
          ...state.document,
          grids: [...grids.filter((entry) => entry.id !== layer.id), layer],
        },
      };
    }
    case "removeGridLayer": {
      const grids = state.document.grids;
      if (grids === undefined) return null;
      const next = grids.filter((layer) => layer.id !== command.id);
      if (next.length === grids.length) return null;
      return { ...state, document: { ...state.document, grids: next } };
    }
    case "setGridLayer":
      return updateGridLayer(state, command.id, (layer) => migrateGridLayer({ ...layer, ...command.patch }));
    case "paintGridCells":
      return updateGridLayer(state, command.id, (layer) => paintGridCells(layer, command.cells));
    case "fillGridRect":
      return updateGridLayer(state, command.id, (layer) =>
        fillGridRect(layer, command.col0, command.row0, command.col1, command.row1, command.value),
      );
    case "floodFillGrid":
      return updateGridLayer(state, command.id, (layer) => floodFillGrid(layer, command.col, command.row, command.value));
    case "resizeGridLayer":
      return updateGridLayer(state, command.id, (layer) => resizeGridLayer(layer, command.cols, command.rows));
    case "assignMaterial": {
      const ids = new Set(command.ids);
      const stamp = (meta: Record<string, unknown> | undefined) => ({ ...meta, materialId: command.materialId });
      return {
        ...state,
        document: {
          ...state.document,
          markers: state.document.markers.map((marker) => (ids.has(marker.id) ? { ...marker, meta: stamp(marker.meta) } : marker)),
          volumes: state.document.volumes.map((volume) => (ids.has(volume.id) ? { ...volume, meta: stamp(volume.meta) } : volume)),
          paths: state.document.paths.map((path) => (ids.has(path.id) ? { ...path, meta: stamp(path.meta) } : path)),
          annotations: state.document.annotations.map((note) => (ids.has(note.id) ? { ...note, meta: stamp(note.meta) } : note)),
        },
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
    command.type !== "selectCollection" &&
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
  | { kind: "paint"; delta: SurfaceDelta; selection: string[] }
  | { kind: "blend"; delta: WeightDelta; selection: string[] };

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

  const blendWith = (
    delta: WeightDelta,
    direction: "apply" | "revert",
    selection: string[],
  ): EditorSessionState => {
    const terrain = state.document.terrain;
    if (terrain === undefined) return state;
    const next =
      direction === "apply"
        ? applyWeightDeltaToSnapshot(terrain, delta)
        : revertWeightDeltaFromSnapshot(terrain, delta);
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
        } else if (entry.kind === "blend") {
          future.push({ kind: "blend", delta: entry.delta, selection: state.selection });
          state = blendWith(entry.delta, "revert", entry.selection);
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
        } else if (entry.kind === "blend") {
          past.push({ kind: "blend", delta: entry.delta, selection: state.selection });
          state = blendWith(entry.delta, "apply", entry.selection);
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

      if (command.type === "blendTerrain") {
        if (state.document.terrain === undefined || command.delta.indices.length === 0) return state;
        past.push({ kind: "blend", delta: command.delta, selection: [...state.selection] });
        if (past.length > historyLimit) past.shift();
        future.length = 0;
        lastCoalesce = null;
        state = blendWith(command.delta, "apply", state.selection);
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
