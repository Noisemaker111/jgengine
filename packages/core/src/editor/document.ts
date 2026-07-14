import type {
  EditorCollection,
  EditorDocument,
  EditorFragmentContent,
  EditorLayersInput,
  EditorMarker,
  EditorNote,
  EditorPath,
  EditorPrefab,
  EditorVolume,
} from "./types";

/** Builds a fresh, empty editor document to start authoring a scene from scratch. */
export function createEmptyEditorDocument(): EditorDocument {
  return {
    version: 1,
    markers: [],
    volumes: [],
    paths: [],
    annotations: [],
    prefabs: [],
    collections: [],
  };
}

/**
 * Deep-copies an editor document so edits never mutate the source. The terrain snapshot is
 * shared by reference: sculpt commands replace it wholesale (copy-on-write), never mutate it in
 * place, so history snapshots stay cheap even on large heightfields.
 */
export function cloneEditorDocument(doc: EditorDocument): EditorDocument {
  return {
    version: 1,
    markers: doc.markers.map((marker) => ({
      ...marker,
      position: { ...marker.position },
      ...(marker.meta === undefined ? {} : { meta: { ...marker.meta } }),
    })),
    volumes: doc.volumes.map((volume) => ({
      ...volume,
      center: { ...volume.center },
      ...(volume.halfExtents === undefined ? {} : { halfExtents: { ...volume.halfExtents } }),
      ...(volume.meta === undefined ? {} : { meta: { ...volume.meta } }),
    })),
    paths: doc.paths.map((path) => ({
      ...path,
      points: path.points.map((point) => ({ ...point })),
      ...(path.meta === undefined ? {} : { meta: { ...path.meta } }),
    })),
    annotations: doc.annotations.map((note) => ({
      ...note,
      position: { ...note.position },
      ...(note.meta === undefined ? {} : { meta: { ...note.meta } }),
    })),
    prefabs: doc.prefabs.map((prefab) => ({
      ...prefab,
      fragment: {
        markers: prefab.fragment.markers.map((marker) => ({ ...marker, position: { ...marker.position } })),
        volumes: prefab.fragment.volumes.map((volume) => ({ ...volume, center: { ...volume.center } })),
        paths: prefab.fragment.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })) })),
        annotations: prefab.fragment.annotations.map((note) => ({ ...note, position: { ...note.position } })),
      },
    })),
    collections: doc.collections.map((collection) => ({ ...collection, memberIds: [...collection.memberIds] })),
    ...(doc.terrain === undefined ? {} : { terrain: doc.terrain }),
  };
}

function asArray<T>(value: readonly T[] | undefined): T[] {
  return value === undefined ? [] : [...value];
}

/** Resolves a game's `editorLayers` export — document, partial data, or factory — into a full document. */
export function normalizeEditorLayers(input: EditorLayersInput | undefined | null): EditorDocument {
  if (input === undefined || input === null) return createEmptyEditorDocument();
  const resolved = typeof input === "function" ? input() : input;
  return {
    version: 1,
    markers: asArray(resolved.markers),
    volumes: asArray(resolved.volumes),
    paths: asArray(resolved.paths),
    annotations: asArray(resolved.annotations),
    prefabs: asArray(resolved.prefabs),
    collections: asArray(resolved.collections),
    ...(resolved.terrain === undefined ? {} : { terrain: resolved.terrain }),
  };
}

/** Combines multiple editor documents' markers, volumes, paths, notes, prefabs, and collections into one. */
export function mergeEditorDocuments(...docs: readonly EditorDocument[]): EditorDocument {
  const out = createEmptyEditorDocument();
  for (const doc of docs) {
    out.markers.push(...doc.markers);
    out.volumes.push(...doc.volumes);
    out.paths.push(...doc.paths);
    out.annotations.push(...doc.annotations);
    out.prefabs.push(...doc.prefabs);
    out.collections.push(...doc.collections);
    if (doc.terrain !== undefined) out.terrain = doc.terrain;
  }
  return out;
}

/** Extracts the subset of a document matching the given ids — the clipboard fragment for copy/paste. */
export function extractEditorFragment(doc: EditorDocument, ids: readonly string[]): EditorDocument {
  const wanted = new Set(ids);
  return cloneEditorDocument({
    version: 1,
    markers: doc.markers.filter((marker) => wanted.has(marker.id)),
    volumes: doc.volumes.filter((volume) => wanted.has(volume.id)),
    paths: doc.paths.filter((path) => wanted.has(path.id)),
    annotations: doc.annotations.filter((note) => wanted.has(note.id)),
    prefabs: [],
    collections: [],
  });
}

/** Counts every object in a document across markers, volumes, paths, and notes. */
export function editorDocumentSize(doc: EditorDocument): number {
  return doc.markers.length + doc.volumes.length + doc.paths.length + doc.annotations.length;
}

/** Looks up a prefab by id in an editor document. */
export function findEditorPrefab(doc: EditorDocument, id: string): EditorPrefab | undefined {
  return doc.prefabs.find((prefab) => prefab.id === id);
}

/** Looks up a named collection / selection set by id in an editor document. */
export function findEditorCollection(doc: EditorDocument, id: string): EditorCollection | undefined {
  return doc.collections.find((collection) => collection.id === id);
}

/** True when an object id is a member of any locked collection — blocks move/delete on it. */
export function isEditorObjectLocked(doc: EditorDocument, id: string): boolean {
  return doc.collections.some((collection) => collection.locked === true && collection.memberIds.includes(id));
}

/**
 * Extracts the selected ids into a prefab fragment centered on their own bounds centroid, so the
 * same prefab reinserts consistently regardless of where in the scene (or which game) it lands.
 */
export function createPrefabFragment(doc: EditorDocument, ids: readonly string[]): EditorFragmentContent {
  const extracted = extractEditorFragment(doc, ids);
  const bounds = editorDocumentBounds(extracted);
  const origin = bounds === null
    ? { x: 0, y: 0, z: 0 }
    : {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: (bounds.min.y + bounds.max.y) / 2,
        z: (bounds.min.z + bounds.max.z) / 2,
      };
  const shift = (point: { x: number; y: number; z: number }) => ({
    x: point.x - origin.x,
    y: point.y - origin.y,
    z: point.z - origin.z,
  });
  return {
    markers: extracted.markers.map((marker) => ({ ...marker, position: shift(marker.position) })),
    volumes: extracted.volumes.map((volume) => ({ ...volume, center: shift(volume.center) })),
    paths: extracted.paths.map((path) => ({ ...path, points: path.points.map(shift) })),
    annotations: extracted.annotations.map((note) => ({ ...note, position: shift(note.position) })),
  };
}

/** Looks up a marker by id in an editor document. */
export function findEditorMarker(doc: EditorDocument, id: string): EditorMarker | undefined {
  return doc.markers.find((marker) => marker.id === id);
}

/** Looks up a volume by id in an editor document. */
export function findEditorVolume(doc: EditorDocument, id: string): EditorVolume | undefined {
  return doc.volumes.find((volume) => volume.id === id);
}

/** Looks up a path by id in an editor document. */
export function findEditorPath(doc: EditorDocument, id: string): EditorPath | undefined {
  return doc.paths.find((path) => path.id === id);
}

/** Looks up an annotation note by id in an editor document. */
export function findEditorNote(doc: EditorDocument, id: string): EditorNote | undefined {
  return doc.annotations.find((note) => note.id === id);
}

/** Lists the distinct marker, volume, and path kinds authored in a document. */
export function listEditorKinds(doc: EditorDocument): {
  markers: string[];
  volumes: string[];
  paths: string[];
} {
  const markers = new Set<string>();
  const volumes = new Set<string>();
  const paths = new Set<string>();
  for (const marker of doc.markers) markers.add(marker.kind);
  for (const volume of doc.volumes) volumes.add(volume.kind);
  for (const path of doc.paths) paths.add(path.kind);
  return {
    markers: [...markers].sort(),
    volumes: [...volumes].sort(),
    paths: [...paths].sort(),
  };
}

/** Every object in a document that carries an id and optional parent, across all four collections. */
interface EditorNode {
  id: string;
  parentId?: string;
}

function editorNodes(doc: EditorDocument): EditorNode[] {
  return [...doc.markers, ...doc.volumes, ...doc.paths, ...doc.annotations];
}

/** The id of an object's parent, or undefined when it is a root (or unknown). */
export function editorParentOf(doc: EditorDocument, id: string): string | undefined {
  return editorNodes(doc).find((node) => node.id === id)?.parentId;
}

/** The direct child ids of an object (empty when it has none). */
export function editorChildren(doc: EditorDocument, parentId: string): string[] {
  return editorNodes(doc)
    .filter((node) => node.parentId === parentId)
    .map((node) => node.id);
}

/** Object ids with no parent (or whose parent no longer exists) — the roots of the hierarchy. */
export function editorRoots(doc: EditorDocument): string[] {
  const ids = new Set(editorNodes(doc).map((node) => node.id));
  return editorNodes(doc)
    .filter((node) => node.parentId === undefined || !ids.has(node.parentId))
    .map((node) => node.id);
}

/** Every descendant id of the given ids (children, grandchildren, …), excluding the inputs. */
export function collectDescendants(doc: EditorDocument, ids: Iterable<string>): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const node of editorNodes(doc)) {
    if (node.parentId === undefined) continue;
    const bucket = childrenByParent.get(node.parentId);
    if (bucket === undefined) childrenByParent.set(node.parentId, [node.id]);
    else bucket.push(node.id);
  }
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

/** True when parenting `id` under `parentId` would form a cycle (or parent itself to itself). */
export function wouldCreateCycle(doc: EditorDocument, id: string, parentId: string | null): boolean {
  if (parentId === null) return false;
  if (parentId === id) return true;
  return collectDescendants(doc, [id]).has(parentId);
}

/** Serializes an editor document to JSON text for saving or export. */
export function exportEditorDocumentJson(doc: EditorDocument, pretty = true): string {
  return JSON.stringify(doc, null, pretty ? 2 : undefined);
}

/** Parses JSON text back into a normalized editor document. */
export function importEditorDocumentJson(raw: string): EditorDocument {
  const parsed = JSON.parse(raw) as Partial<EditorDocument>;
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("editor document must be an object");
  }
  return normalizeEditorLayers(parsed);
}

function upsertById<T extends { id: string }>(base: readonly T[], overlay: readonly T[]): T[] {
  const overlayIds = new Set(overlay.map((item) => item.id));
  return [...base.filter((item) => !overlayIds.has(item.id)), ...overlay];
}

/**
 * Applies a saved editor document on top of a game's derived layers: overlay objects replace
 * same-id base objects and new overlay objects are appended, so editor saves win over source
 * data until they are folded back in.
 */
export function applyEditorDocumentOverlay(
  base: EditorDocument,
  overlay: EditorDocument,
): EditorDocument {
  return {
    version: 1,
    markers: upsertById(base.markers, overlay.markers),
    volumes: upsertById(base.volumes, overlay.volumes),
    paths: upsertById(base.paths, overlay.paths),
    annotations: upsertById(base.annotations, overlay.annotations),
    prefabs: upsertById(base.prefabs, overlay.prefabs),
    collections: upsertById(base.collections, overlay.collections),
    ...(overlay.terrain ?? base.terrain) === undefined
      ? {}
      : { terrain: overlay.terrain ?? base.terrain },
  };
}

/** Computes the world-space min/max bounds spanning every object in a document, or null if empty. */
export function editorDocumentBounds(doc: EditorDocument): {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let any = false;

  const include = (x: number, y: number, z: number) => {
    any = true;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  };

  for (const marker of doc.markers) {
    include(marker.position.x, marker.position.y, marker.position.z);
  }
  for (const volume of doc.volumes) {
    include(volume.center.x, volume.center.y, volume.center.z);
  }
  for (const path of doc.paths) {
    for (const point of path.points) include(point.x, point.y, point.z);
  }
  for (const note of doc.annotations) {
    include(note.position.x, note.position.y, note.position.z);
  }

  if (!any) return null;
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}
