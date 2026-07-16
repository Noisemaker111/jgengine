/** A world-space point — structurally compatible with the editor's `EditorVec3`. */
export interface ScenePoint3 {
  x: number;
  y: number;
  z: number;
}

/** The minimal polyline shape {@link resolveScatterRegion} et al. read; any `EditorPath` satisfies it. */
export interface ScenePathLike {
  id: string;
  kind: string;
  points: readonly ScenePoint3[];
  width?: number;
  meta?: Record<string, unknown>;
}

/** The minimal point-object shape clearance reads from a document's markers; any `EditorMarker` satisfies it. */
export interface SceneMarkerLike {
  id: string;
  kind: string;
  position: ScenePoint3;
  meta?: Record<string, unknown>;
}

/** The minimal volume shape vegetation/clearance read; any `EditorVolume` satisfies it. */
export interface SceneVolumeLike {
  id: string;
  kind: string;
  shape: "sphere" | "cylinder" | "box";
  center: ScenePoint3;
  radius?: number;
  halfExtents?: ScenePoint3;
  meta?: Record<string, unknown>;
}

/**
 * The minimal document shape scatter/vegetation resolve against — markers, volumes, and paths only.
 * Any `EditorDocument` satisfies it structurally; this module never imports the editor domain, so
 * world stays the one-directional dependency editor already builds on.
 */
export interface SceneDocumentLike {
  markers: readonly SceneMarkerLike[];
  volumes: readonly SceneVolumeLike[];
  paths: readonly ScenePathLike[];
}
