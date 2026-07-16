import { migrateTerrainSnapshot } from "../world/terraform";
import type {
  EditorCollection,
  EditorDocument,
  EditorFragmentContent,
  EditorLayersInput,
  EditorMarker,
  EditorNote,
  EditorPath,
  EditorPrefab,
  EditorTerrain,
  EditorVec3,
  EditorVolume,
  EditorVolumeShape,
} from "./types";

/** Builds a fresh, empty editor document to start authoring a scene from scratch.
 * @internal
 */
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
  * @internal
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

/** Resolves a game's `editorLayers` export — document, partial data, or factory — into a full document.
 * @internal
 */
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
    ...(resolved.terrain === undefined ? {} : { terrain: migrateTerrainSnapshot(resolved.terrain) }),
  };
}

/**
 * Reserves `id` in `taken` and returns it unchanged when free; otherwise mints the next free
 * `<id>_copy`/`<id>_copyN` suffix and reserves that instead. The one place object ids are made
 * unique across a document's markers/volumes/paths/annotations as a single global namespace, so a
 * merged-in or imported object can never silently shadow an existing object in another collection.
 * @internal
 */
export function ensureUniqueEditorId(id: string, taken: Set<string>): string {
  if (!taken.has(id)) {
    taken.add(id);
    return id;
  }
  let candidate = `${id}_copy`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${id}_copy${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** Combines multiple editor documents' markers, volumes, paths, notes, prefabs, and collections
 * into one, re-idding any placeable object whose id collides with one already merged in — across
 * all four collections, since selection/parenting/removal treat those ids as one document-global
 * namespace.
 * @internal
 */
export function mergeEditorDocuments(...docs: readonly EditorDocument[]): EditorDocument {
  const out = createEmptyEditorDocument();
  const taken = new Set<string>();
  const remap = <T extends { id: string }>(item: T): T => {
    const id = ensureUniqueEditorId(item.id, taken);
    return id === item.id ? item : { ...item, id };
  };
  for (const doc of docs) {
    out.markers.push(...doc.markers.map(remap));
    out.volumes.push(...doc.volumes.map(remap));
    out.paths.push(...doc.paths.map(remap));
    out.annotations.push(...doc.annotations.map(remap));
    out.prefabs.push(...doc.prefabs);
    out.collections.push(...doc.collections);
    if (doc.terrain !== undefined) out.terrain = doc.terrain;
  }
  return out;
}

/** Extracts the subset of a document matching the given ids — the clipboard fragment for copy/paste.
 * @internal
 */
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

/** Counts every object in a document across markers, volumes, paths, and notes.
 * @internal
 */
export function editorDocumentSize(doc: EditorDocument): number {
  return doc.markers.length + doc.volumes.length + doc.paths.length + doc.annotations.length;
}

/** Looks up a prefab by id in an editor document.
 * @internal
 */
export function findEditorPrefab(doc: EditorDocument, id: string): EditorPrefab | undefined {
  return doc.prefabs.find((prefab) => prefab.id === id);
}

/** Looks up a named collection / selection set by id in an editor document.
 * @internal
 */
export function findEditorCollection(doc: EditorDocument, id: string): EditorCollection | undefined {
  return doc.collections.find((collection) => collection.id === id);
}

/** True when an object id is a member of any locked collection — blocks move/delete on it.
 * @internal
 */
export function isEditorObjectLocked(doc: EditorDocument, id: string): boolean {
  return doc.collections.some((collection) => collection.locked === true && collection.memberIds.includes(id));
}

/**
 * Extracts the selected ids into a prefab fragment centered on their own bounds centroid, so the
 * same prefab reinserts consistently regardless of where in the scene (or which game) it lands.
  * @internal
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

/** Looks up a marker by id in an editor document.
 * @internal
 */
export function findEditorMarker(doc: EditorDocument, id: string): EditorMarker | undefined {
  return doc.markers.find((marker) => marker.id === id);
}

/** Looks up a volume by id in an editor document.
 * @internal
 */
export function findEditorVolume(doc: EditorDocument, id: string): EditorVolume | undefined {
  return doc.volumes.find((volume) => volume.id === id);
}

/** Looks up a path by id in an editor document.
 * @internal
 */
export function findEditorPath(doc: EditorDocument, id: string): EditorPath | undefined {
  return doc.paths.find((path) => path.id === id);
}

/** Looks up an annotation note by id in an editor document.
 * @internal
 */
export function findEditorNote(doc: EditorDocument, id: string): EditorNote | undefined {
  return doc.annotations.find((note) => note.id === id);
}

/** Lists the distinct marker, volume, and path kinds authored in a document.
 * @internal
 */
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

/** The id of an object's parent, or undefined when it is a root (or unknown).
 * @internal
 */
export function editorParentOf(doc: EditorDocument, id: string): string | undefined {
  return editorNodes(doc).find((node) => node.id === id)?.parentId;
}

/** The direct child ids of an object (empty when it has none).
 * @internal
 */
export function editorChildren(doc: EditorDocument, parentId: string): string[] {
  return editorNodes(doc)
    .filter((node) => node.parentId === parentId)
    .map((node) => node.id);
}

/** Object ids with no parent (or whose parent no longer exists) — the roots of the hierarchy.
 * @internal
 */
export function editorRoots(doc: EditorDocument): string[] {
  const ids = new Set(editorNodes(doc).map((node) => node.id));
  return editorNodes(doc)
    .filter((node) => node.parentId === undefined || !ids.has(node.parentId))
    .map((node) => node.id);
}

/** Every descendant id of the given ids (children, grandchildren, …), excluding the inputs.
 * @internal
 */
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

/** True when parenting `id` under `parentId` would form a cycle (or parent itself to itself).
 * @internal
 */
export function wouldCreateCycle(doc: EditorDocument, id: string, parentId: string | null): boolean {
  if (parentId === null) return false;
  if (parentId === id) return true;
  return collectDescendants(doc, [id]).has(parentId);
}

/** Serializes an editor document to JSON text for saving or export.
 * @internal
 */
export function exportEditorDocumentJson(doc: EditorDocument, pretty = true): string {
  return JSON.stringify(doc, null, pretty ? 2 : undefined);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One field-level failure surfaced while decoding an untrusted editor document, `path` pointing
 * at the exact field that failed (e.g. `$.markers[2].position`).
 * @internal
 */
export interface EditorDocumentDiagnostic {
  path: string;
  message: string;
}

/** Result of {@link decodeEditorDocument}: a typed document, or every diagnostic collected while
 * decoding it.
 * @internal
 */
export type DecodeEditorDocumentResult =
  | { ok: true; document: EditorDocument }
  | { ok: false; errors: EditorDocumentDiagnostic[] };

type ItemDecoder<T> = (item: unknown, path: string, errors: EditorDocumentDiagnostic[]) => T | null;

function decodeArray<T>(
  value: unknown,
  path: string,
  decodeItem: ItemDecoder<T>,
  errors: EditorDocumentDiagnostic[],
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path, message: "expected an array" });
    return [];
  }
  const out: T[] = [];
  value.forEach((item, index) => {
    const decoded = decodeItem(item, `${path}[${index}]`, errors);
    if (decoded !== null) out.push(decoded);
  });
  return out;
}

function decodeVec3(value: unknown, path: string, errors: EditorDocumentDiagnostic[]): EditorVec3 | null {
  if (!isPlainObject(value) || typeof value.x !== "number" || typeof value.y !== "number" || typeof value.z !== "number") {
    errors.push({ path, message: "expected {x,y,z} numbers" });
    return null;
  }
  return { x: value.x, y: value.y, z: value.z };
}

function decodeMeta(
  value: unknown,
  path: string,
  errors: EditorDocumentDiagnostic[],
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    errors.push({ path, message: "expected an object" });
    return undefined;
  }
  return value;
}

function decodeMarker(item: unknown, path: string, errors: EditorDocumentDiagnostic[]): EditorMarker | null {
  if (!isPlainObject(item)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  if (typeof item.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
  if (typeof item.kind !== "string") errors.push({ path: `${path}.kind`, message: "expected a string" });
  const position = decodeVec3(item.position, `${path}.position`, errors);
  if (typeof item.id !== "string" || typeof item.kind !== "string" || position === null) return null;
  const marker: EditorMarker = { id: item.id, kind: item.kind, position };
  if (typeof item.rotationY === "number") marker.rotationY = item.rotationY;
  if (typeof item.color === "string") marker.color = item.color;
  if (typeof item.label === "string") marker.label = item.label;
  if (typeof item.catalogId === "string") marker.catalogId = item.catalogId;
  if (typeof item.parentId === "string") marker.parentId = item.parentId;
  const meta = decodeMeta(item.meta, `${path}.meta`, errors);
  if (meta !== undefined) marker.meta = meta;
  return marker;
}

const VOLUME_SHAPES: ReadonlySet<string> = new Set(["sphere", "cylinder", "box"]);

function decodeVolume(item: unknown, path: string, errors: EditorDocumentDiagnostic[]): EditorVolume | null {
  if (!isPlainObject(item)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  if (typeof item.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
  if (typeof item.kind !== "string") errors.push({ path: `${path}.kind`, message: "expected a string" });
  const validShape = typeof item.shape === "string" && VOLUME_SHAPES.has(item.shape);
  if (!validShape) errors.push({ path: `${path}.shape`, message: "expected sphere | cylinder | box" });
  const center = decodeVec3(item.center, `${path}.center`, errors);
  if (typeof item.id !== "string" || typeof item.kind !== "string" || !validShape || center === null) return null;
  const volume: EditorVolume = { id: item.id, kind: item.kind, shape: item.shape as EditorVolumeShape, center };
  if (typeof item.radius === "number") volume.radius = item.radius;
  if (typeof item.height === "number") volume.height = item.height;
  if (item.halfExtents !== undefined) {
    const halfExtents = decodeVec3(item.halfExtents, `${path}.halfExtents`, errors);
    if (halfExtents !== null) volume.halfExtents = halfExtents;
  }
  if (typeof item.color === "string") volume.color = item.color;
  if (typeof item.label === "string") volume.label = item.label;
  if (typeof item.parentId === "string") volume.parentId = item.parentId;
  const meta = decodeMeta(item.meta, `${path}.meta`, errors);
  if (meta !== undefined) volume.meta = meta;
  return volume;
}

function decodePath(item: unknown, path: string, errors: EditorDocumentDiagnostic[]): EditorPath | null {
  if (!isPlainObject(item)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  if (typeof item.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
  if (typeof item.kind !== "string") errors.push({ path: `${path}.kind`, message: "expected a string" });
  const validPoints = Array.isArray(item.points);
  if (!validPoints) errors.push({ path: `${path}.points`, message: "expected an array" });
  const points = validPoints
    ? decodeArray(item.points, `${path}.points`, decodeVec3, errors)
    : [];
  if (typeof item.id !== "string" || typeof item.kind !== "string" || !validPoints) return null;
  const decodedPath: EditorPath = { id: item.id, kind: item.kind, points };
  if (typeof item.width === "number") decodedPath.width = item.width;
  if (typeof item.color === "string") decodedPath.color = item.color;
  if (typeof item.label === "string") decodedPath.label = item.label;
  if (typeof item.parentId === "string") decodedPath.parentId = item.parentId;
  const meta = decodeMeta(item.meta, `${path}.meta`, errors);
  if (meta !== undefined) decodedPath.meta = meta;
  return decodedPath;
}

function decodeNote(item: unknown, path: string, errors: EditorDocumentDiagnostic[]): EditorNote | null {
  if (!isPlainObject(item)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  if (typeof item.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
  if (typeof item.text !== "string") errors.push({ path: `${path}.text`, message: "expected a string" });
  const position = decodeVec3(item.position, `${path}.position`, errors);
  if (typeof item.id !== "string" || typeof item.text !== "string" || position === null) return null;
  const note: EditorNote = { id: item.id, text: item.text, position };
  if (typeof item.color === "string") note.color = item.color;
  if (typeof item.parentId === "string") note.parentId = item.parentId;
  const meta = decodeMeta(item.meta, `${path}.meta`, errors);
  if (meta !== undefined) note.meta = meta;
  return note;
}

function decodeFragmentContent(
  value: unknown,
  path: string,
  errors: EditorDocumentDiagnostic[],
): EditorFragmentContent | null {
  if (!isPlainObject(value)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  return {
    markers: decodeArray(value.markers, `${path}.markers`, decodeMarker, errors),
    volumes: decodeArray(value.volumes, `${path}.volumes`, decodeVolume, errors),
    paths: decodeArray(value.paths, `${path}.paths`, decodePath, errors),
    annotations: decodeArray(value.annotations, `${path}.annotations`, decodeNote, errors),
  };
}

function decodePrefab(item: unknown, path: string, errors: EditorDocumentDiagnostic[]): EditorPrefab | null {
  if (!isPlainObject(item)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  if (typeof item.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
  if (typeof item.name !== "string") errors.push({ path: `${path}.name`, message: "expected a string" });
  const fragment = decodeFragmentContent(item.fragment, `${path}.fragment`, errors);
  if (typeof item.id !== "string" || typeof item.name !== "string" || fragment === null) return null;
  return { id: item.id, name: item.name, fragment };
}

function decodeCollection(item: unknown, path: string, errors: EditorDocumentDiagnostic[]): EditorCollection | null {
  if (!isPlainObject(item)) {
    errors.push({ path, message: "expected an object" });
    return null;
  }
  if (typeof item.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
  if (typeof item.name !== "string") errors.push({ path: `${path}.name`, message: "expected a string" });
  const memberIds: string[] = [];
  if (!Array.isArray(item.memberIds)) {
    errors.push({ path: `${path}.memberIds`, message: "expected an array of strings" });
  } else {
    item.memberIds.forEach((member: unknown, index: number) => {
      if (typeof member === "string") memberIds.push(member);
      else errors.push({ path: `${path}.memberIds[${index}]`, message: "expected a string" });
    });
  }
  if (typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.memberIds)) return null;
  const collection: EditorCollection = { id: item.id, name: item.name, memberIds };
  if (typeof item.color === "string") collection.color = item.color;
  if (typeof item.locked === "boolean") collection.locked = item.locked;
  if (typeof item.visible === "boolean") collection.visible = item.visible;
  return collection;
}

/**
 * The authoritative decoder/migrator for an editor document arriving from outside this process
 * (disk, network, an agent's `import_document` RPC): validates every field with a path-specific
 * diagnostic on failure instead of trusting the shape, then migrates forward — routes any embedded
 * terrain through {@link migrateTerrainSnapshot} and normalizes `version` to the one this build
 * understands. Every other loader in this module funnels through here.
 * @internal
 */
export function decodeEditorDocument(raw: unknown): DecodeEditorDocumentResult {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: "$", message: "editor document must be an object" }] };
  }
  const errors: EditorDocumentDiagnostic[] = [];
  const markers = decodeArray(raw.markers, "$.markers", decodeMarker, errors);
  const volumes = decodeArray(raw.volumes, "$.volumes", decodeVolume, errors);
  const paths = decodeArray(raw.paths, "$.paths", decodePath, errors);
  const annotations = decodeArray(raw.annotations, "$.annotations", decodeNote, errors);
  const prefabs = decodeArray(raw.prefabs, "$.prefabs", decodePrefab, errors);
  const collections = decodeArray(raw.collections, "$.collections", decodeCollection, errors);
  if (raw.terrain !== undefined && !isPlainObject(raw.terrain)) {
    errors.push({ path: "$.terrain", message: "expected an object" });
  }
  if (errors.length > 0) return { ok: false, errors };
  const terrain = raw.terrain === undefined ? undefined : migrateTerrainSnapshot(raw.terrain as EditorTerrain);
  return {
    ok: true,
    document: {
      version: 1,
      markers,
      volumes,
      paths,
      annotations,
      prefabs,
      collections,
      ...(terrain === undefined ? {} : { terrain }),
    },
  };
}

/** Parses JSON text back into a normalized editor document, throwing a message that names every
 * field that failed to decode when the shape is malformed.
 * @internal
 */
export function importEditorDocumentJson(raw: string): EditorDocument {
  const parsed: unknown = JSON.parse(raw);
  const decoded = decodeEditorDocument(parsed);
  if (!decoded.ok) {
    throw new Error(`invalid editor document: ${decoded.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  }
  return decoded.document;
}

function upsertById<T extends { id: string }>(base: readonly T[], overlay: readonly T[]): T[] {
  const overlayIds = new Set(overlay.map((item) => item.id));
  return [...base.filter((item) => !overlayIds.has(item.id)), ...overlay];
}

/**
 * Applies a saved editor document on top of a game's derived layers: overlay objects replace
 * same-id base objects and new overlay objects are appended, so editor saves win over source
 * data until they are folded back in.
  * @internal
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

/** Computes the world-space min/max bounds spanning every object in a document, or null if empty.
 * @internal
 */
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
