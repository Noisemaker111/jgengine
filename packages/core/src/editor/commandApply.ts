import {
  applyDeltaToSnapshot,
  applySurfaceDeltaToSnapshot,
  applyWeightDeltaToSnapshot,
} from "../world/terraform";
import { patchUiPanel, removeUiPanel } from "../ui/hudDocument";
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
  type EditorGridLayer,
} from "./grid";
import { parseParams } from "../scene/sceneKinds";
import type {
  EditorCatalogData,
  EditorCatalogEntry,
  EditorCollection,
  EditorDocument,
  EditorFragmentContent,
  EditorNote,
  EditorPrefab,
  EditorTerrain,
  EditorVec3,
} from "./types";
import type { EditorCommand, EditorSessionState } from "./commands";

/** Pure document mutation helpers + exhaustive EditorCommand apply table. */
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

/**
 * Maps a single `fn` over all four placeable collections (markers/volumes/paths/annotations),
 * returning just those four fields for spreading back into a document. Notes lack a `label` field,
 * so callers that treat notes differently pass a dedicated `fnNote`; by default notes share `fn`.
 */
function mapPlaceables(
  doc: EditorDocument,
  fn: <T extends { id: string; meta?: Record<string, unknown>; parentId?: string }>(item: T) => T,
  fnNote: (note: EditorNote) => EditorNote = fn,
): Pick<EditorDocument, "markers" | "volumes" | "paths" | "annotations"> {
  return {
    markers: doc.markers.map(fn),
    volumes: doc.volumes.map(fn),
    paths: doc.paths.map(fn),
    annotations: doc.annotations.map(fnNote),
  };
}

/** A single mutation handler: narrows `command` to its variant and returns the next state or null. */
type MutationHandlers = {
  [K in EditorCommand["type"]]: (
    state: EditorSessionState,
    command: Extract<EditorCommand, { type: K }>,
  ) => EditorSessionState | null;
};

const mutationHandlers: MutationHandlers = {
  select: (state, command) => ({ ...state, selection: [...command.ids] }),
  clearSelection: (state) => ({ ...state, selection: [] }),
  setTransform: (state, command) => {
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
  },
  translate: (state, command) => {
    const movable = command.ids.filter((id) => !isEditorObjectLocked(state.document, id));
    if (movable.length === 0) return null;
    const ids = new Set(movable);
    for (const descendant of collectDescendants(state.document, movable)) ids.add(descendant);
    return {
      ...state,
      document: translateByIds(state.document, ids, command.delta),
    };
  },
  setParent: (state, command) => {
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
    return { ...state, document: { ...state.document, ...mapPlaceables(state.document, reparent) } };
  },
  addMarker: (state, command) => {
    const marker = ownIdOrGloballyUnique(state.document, command.marker, state.document.markers);
    return {
      ...state,
      document: {
        ...state.document,
        markers: [...state.document.markers.filter((m) => m.id !== marker.id), marker],
      },
      selection: [marker.id],
    };
  },
  addVolume: (state, command) => {
    const volume = ownIdOrGloballyUnique(state.document, command.volume, state.document.volumes);
    return {
      ...state,
      document: {
        ...state.document,
        volumes: [...state.document.volumes.filter((v) => v.id !== volume.id), volume],
      },
      selection: [volume.id],
    };
  },
  addPath: (state, command) => {
    const path = ownIdOrGloballyUnique(state.document, command.path, state.document.paths);
    return {
      ...state,
      document: {
        ...state.document,
        paths: [...state.document.paths.filter((p) => p.id !== path.id), path],
      },
      selection: [path.id],
    };
  },
  addNote: (state, command) => {
    const note = ownIdOrGloballyUnique(state.document, command.note, state.document.annotations);
    return {
      ...state,
      document: {
        ...state.document,
        annotations: [...state.document.annotations.filter((n) => n.id !== note.id), note],
      },
      selection: [note.id],
    };
  },
  setMarker: (state, command) => {
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
  },
  setVolume: (state, command) => {
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
  },
  setPath: (state, command) => {
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
  },
  setNote: (state, command) => {
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
  },
  setCatalogEntry: (state, command) => {
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
  },
  addCatalogEntry: (state, command) => {
    const trimmedId = command.entry.id.trim();
    if (trimmedId.length === 0) return null;
    const existing = state.document.catalogs.find((catalog) => catalog.id === command.catalogId);
    const taken = new Set((existing?.entries ?? []).map((entry) => entry.id));
    let id = trimmedId;
    let n = 2;
    while (taken.has(id)) {
      id = `${trimmedId}_${n}`;
      n += 1;
    }
    const entry: EditorCatalogEntry = {
      id,
      ...(command.entry.label === undefined ? {} : { label: command.entry.label }),
      ...(command.entry.meta === undefined ? {} : { meta: { ...command.entry.meta } }),
    };
    const catalogs =
      existing === undefined
        ? [...state.document.catalogs, { id: command.catalogId, entries: [entry] }]
        : state.document.catalogs.map((catalog) =>
            catalog.id === command.catalogId ? { ...catalog, entries: [...catalog.entries, entry] } : catalog,
          );
    return { ...state, document: { ...state.document, catalogs } };
  },
  removeCatalogEntry: (state, command) => {
    const catalog = state.document.catalogs.find((entry) => entry.id === command.catalogId);
    if (catalog === undefined || !catalog.entries.some((entry) => entry.id === command.entryId)) return null;
    const catalogs = state.document.catalogs.map((row) =>
      row.id === command.catalogId
        ? { ...row, entries: row.entries.filter((entry) => entry.id !== command.entryId) }
        : row,
    );
    return { ...state, document: { ...state.document, catalogs } };
  },
  addCatalog: (state, command) => {
    const id = command.id.trim();
    if (id.length === 0) return null;
    if (state.document.catalogs.some((catalog) => catalog.id === id)) return null;
    const catalog: EditorCatalogData = {
      id,
      ...(command.label === undefined ? {} : { label: command.label }),
      ...(command.schema === undefined ? {} : { schema: command.schema }),
      entries: [],
    };
    return { ...state, document: { ...state.document, catalogs: [...state.document.catalogs, catalog] } };
  },
  removeCatalog: (state, command) => {
    const next = state.document.catalogs.filter((catalog) => catalog.id !== command.id);
    if (next.length === state.document.catalogs.length) return null;
    return { ...state, document: { ...state.document, catalogs: next } };
  },
  setCatalogSchema: (state, command) => {
    if (!state.document.catalogs.some((catalog) => catalog.id === command.id)) return null;
    // Re-parse every row's meta against the NEW schema so removed keys drop, added keys default in,
    // and range/number values clamp â€” the whole clamp contract for a schema edit in one step.
    const catalogs = state.document.catalogs.map((catalog) =>
      catalog.id === command.id
        ? {
            ...catalog,
            schema: command.schema,
            ...(command.label === undefined ? {} : { label: command.label }),
            entries: catalog.entries.map((entry) => ({
              ...entry,
              meta: parseParams(command.schema, entry.meta) as Record<string, unknown>,
            })),
          }
        : catalog,
    );
    return { ...state, document: { ...state.document, catalogs } };
  },
  remove: (state, command) => {
    if (isEditorObjectLocked(state.document, command.id)) return null;
    return {
      document: removeByIds(state.document, new Set([command.id])),
      selection: state.selection.filter((id) => id !== command.id),
    };
  },
  removeMany: (state, command) => {
    const gone = new Set(command.ids.filter((id) => !isEditorObjectLocked(state.document, id)));
    if (gone.size === 0) return null;
    return {
      document: removeByIds(state.document, gone),
      selection: state.selection.filter((id) => !gone.has(id)),
    };
  },
  duplicate: (state, command) =>
    insertFragment(
      state,
      extractEditorFragment(state.document, command.ids),
      command.offset ?? { x: 2, y: 0, z: 2 },
      true,
    ),
  addFragment: (state, command) =>
    insertFragment(state, command.fragment, command.offset ?? { x: 0, y: 0, z: 0 }, false),
  importDocument: (_state, command) => ({
    document: cloneEditorDocument(command.document),
    selection: [],
  }),
  replaceDocument: (_state, command) => ({
    document: cloneEditorDocument(command.document),
    selection: [],
  }),
  importJson: (_state, command) => ({
    document: importEditorDocumentJson(command.json),
    selection: [],
  }),
  setTerrain: (state, command) => ({ ...state, document: { ...state.document, terrain: command.terrain } }),
  setMinimapBake: (state, command) => ({ ...state, document: { ...state.document, minimap: command.minimap } }),
  clearTerrain: (state) => {
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
  },
  setUiPanel: (state, command) => {
    const ui = patchUiPanel(state.document.ui, command.id, command.patch);
    return { ...state, document: { ...state.document, ui } };
  },
  removeUiPanel: (state, command) => {
    const ui = removeUiPanel(state.document.ui, command.id);
    if (ui === undefined) {
      const { ui: _removed, ...rest } = state.document;
      void _removed;
      return { ...state, document: rest };
    }
    return { ...state, document: { ...state.document, ui } };
  },
  setUi: (state, command) => {
    if (command.ui === undefined) {
      const { ui: _removed, ...rest } = state.document;
      void _removed;
      return { ...state, document: rest };
    }
    return { ...state, document: { ...state.document, ui: command.ui } };
  },
  sculptTerrain: (state, command) => {
    if (state.document.terrain === undefined) return state;
    return {
      ...state,
      document: { ...state.document, terrain: applyDeltaToSnapshot(state.document.terrain, command.delta) },
    };
  },
  paintTerrain: (state, command) => {
    if (state.document.terrain === undefined) return state;
    return {
      ...state,
      document: { ...state.document, terrain: applySurfaceDeltaToSnapshot(state.document.terrain, command.delta) },
    };
  },
  blendTerrain: (state, command) => {
    if (state.document.terrain === undefined) return state;
    return {
      ...state,
      document: { ...state.document, terrain: applyWeightDeltaToSnapshot(state.document.terrain, command.delta) },
    };
  },
  setTerrainLayers: (state, command) => {
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
  },
  convertScatterToObjects: (state, command) => {
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
  },
  createPrefab: (state, command) => {
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
  },
  deletePrefab: (state, command) => ({
    ...state,
    document: {
      ...state.document,
      prefabs: state.document.prefabs.filter((entry) => entry.id !== command.prefabId),
    },
  }),
  insertPrefab: (state, command) => {
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
  },
  detachPrefabInstance: (state, command) => {
    const strip = <T extends { meta?: Record<string, unknown> }>(item: T): T => {
      if (item.meta?.prefabInstanceId !== command.instanceId) return item;
      const meta = { ...item.meta };
      delete meta.prefabId;
      delete meta.prefabInstanceId;
      return { ...item, meta };
    };
    return { ...state, document: { ...state.document, ...mapPlaceables(state.document, strip) } };
  },
  createCollection: (state, command) => {
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
  },
  renameCollection: (state, command) => {
    const collections = state.document.collections.map((collection) =>
      collection.id === command.id ? { ...collection, name: command.name } : collection,
    );
    return { ...state, document: { ...state.document, collections } };
  },
  deleteCollection: (state, command) => ({
    ...state,
    document: {
      ...state.document,
      collections: state.document.collections.filter((entry) => entry.id !== command.id),
    },
  }),
  setCollectionMembers: (state, command) => {
    const collections = state.document.collections.map((collection) =>
      collection.id === command.id ? { ...collection, memberIds: [...command.memberIds] } : collection,
    );
    return { ...state, document: { ...state.document, collections } };
  },
  addToCollection: (state, command) => {
    const adding = new Set(command.ids);
    const collections = state.document.collections.map((collection) => {
      if (collection.id !== command.id) return collection;
      const merged = new Set(collection.memberIds);
      for (const id of adding) merged.add(id);
      return { ...collection, memberIds: [...merged] };
    });
    return { ...state, document: { ...state.document, collections } };
  },
  removeFromCollection: (state, command) => {
    const removing = new Set(command.ids);
    const collections = state.document.collections.map((collection) =>
      collection.id === command.id
        ? { ...collection, memberIds: collection.memberIds.filter((id) => !removing.has(id)) }
        : collection,
    );
    return { ...state, document: { ...state.document, collections } };
  },
  setCollectionFlags: (state, command) => {
    const collections = state.document.collections.map((collection) =>
      collection.id === command.id ? { ...collection, ...command.patch } : collection,
    );
    return { ...state, document: { ...state.document, collections } };
  },
  selectCollection: (state, command) => {
    const collection = findEditorCollection(state.document, command.id);
    if (collection === undefined) return null;
    return { ...state, selection: [...collection.memberIds] };
  },
  batchSetProperties: (state, command) => {
    const ids = new Set(command.ids);
    const patch = command.patch;
    // Notes carry no `label`, so they take color/meta only via a dedicated mapper.
    const apply = <T extends { id: string; color?: string; label?: string; meta?: Record<string, unknown> }>(
      item: T,
    ): T =>
      ids.has(item.id)
        ? {
            ...item,
            ...(patch.color === undefined ? {} : { color: patch.color }),
            ...(patch.label === undefined ? {} : { label: patch.label }),
            ...(patch.meta === undefined ? {} : { meta: { ...item.meta, ...patch.meta } }),
          }
        : item;
    const applyNote = (note: EditorNote): EditorNote =>
      ids.has(note.id)
        ? {
            ...note,
            ...(patch.color === undefined ? {} : { color: patch.color }),
            ...(patch.meta === undefined ? {} : { meta: { ...note.meta, ...patch.meta } }),
          }
        : note;
    return { ...state, document: { ...state.document, ...mapPlaceables(state.document, apply, applyNote) } };
  },
  addGridLayer: (state, command) => {
    const layer = migrateGridLayer(command.layer);
    const grids = state.document.grids ?? [];
    return {
      ...state,
      document: {
        ...state.document,
        grids: [...grids.filter((entry) => entry.id !== layer.id), layer],
      },
    };
  },
  removeGridLayer: (state, command) => {
    const grids = state.document.grids;
    if (grids === undefined) return null;
    const next = grids.filter((layer) => layer.id !== command.id);
    if (next.length === grids.length) return null;
    return { ...state, document: { ...state.document, grids: next } };
  },
  setGridLayer: (state, command) =>
    updateGridLayer(state, command.id, (layer) => migrateGridLayer({ ...layer, ...command.patch })),
  paintGridCells: (state, command) =>
    updateGridLayer(state, command.id, (layer) => paintGridCells(layer, command.cells)),
  fillGridRect: (state, command) =>
    updateGridLayer(state, command.id, (layer) =>
      fillGridRect(layer, command.col0, command.row0, command.col1, command.row1, command.value),
    ),
  floodFillGrid: (state, command) =>
    updateGridLayer(state, command.id, (layer) => floodFillGrid(layer, command.col, command.row, command.value)),
  resizeGridLayer: (state, command) =>
    updateGridLayer(state, command.id, (layer) => resizeGridLayer(layer, command.cols, command.rows)),
  assignMaterial: (state, command) => {
    const ids = new Set(command.ids);
    const stamp = <T extends { id: string; meta?: Record<string, unknown> }>(item: T): T =>
      ids.has(item.id) ? { ...item, meta: { ...item.meta, materialId: command.materialId } } : item;
    return { ...state, document: { ...state.document, ...mapPlaceables(state.document, stamp) } };
  },
  undo: () => null,
  redo: () => null,
};

export function applyMutating(state: EditorSessionState, command: EditorCommand): EditorSessionState | null {
  const handler = mutationHandlers[command.type] as (
    state: EditorSessionState,
    command: EditorCommand,
  ) => EditorSessionState | null;
  return handler(state, command);
}

export function isStructural(command: EditorCommand): boolean {
  return (
    command.type !== "select" &&
    command.type !== "clearSelection" &&
    command.type !== "selectCollection" &&
    command.type !== "undo" &&
    command.type !== "redo"
  );
}
