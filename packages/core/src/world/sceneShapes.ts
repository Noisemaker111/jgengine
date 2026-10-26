import type { Point3 } from "./geometry";
/** The minimal polyline shape {@link resolveScatterRegion} et al. read; any `EditorPath` satisfies it. */
export interface ScenePathLike {
  id: string;
  kind: string;
  points: readonly Point3[];
  width?: number;
  meta?: Record<string, unknown>;
}

/** The minimal point-object shape clearance reads from a document's markers; any `EditorMarker` satisfies it. */
export interface SceneMarkerLike {
  id: string;
  kind: string;
  position: Point3;
  meta?: Record<string, unknown>;
}

/** The minimal volume shape vegetation/clearance/triggers read; any `EditorVolume` satisfies it. */
export interface SceneVolumeLike {
  id: string;
  kind: string;
  shape: "sphere" | "cylinder" | "box";
  center: Point3;
  radius?: number;
  /** Cylinder height (m); containment and editors use this when shape is `cylinder`. */
  height?: number;
  halfExtents?: Point3;
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
