import type {
  EditorDocument,
  EditorLayersInput,
  EditorMarker,
  EditorNote,
  EditorPath,
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
  };
}

/** Deep-copies an editor document so edits never mutate the source. */
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
  };
}

/** Combines multiple editor documents' markers, volumes, paths, and notes into one. */
export function mergeEditorDocuments(...docs: readonly EditorDocument[]): EditorDocument {
  const out = createEmptyEditorDocument();
  for (const doc of docs) {
    out.markers.push(...doc.markers);
    out.volumes.push(...doc.volumes);
    out.paths.push(...doc.paths);
    out.annotations.push(...doc.annotations);
  }
  return out;
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
