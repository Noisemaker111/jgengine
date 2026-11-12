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

/** The minimal volume shape vegetation/clearance/triggers read; any `EditorVolume` satisfies it. */
export interface SceneVolumeLike {
  id: string;
  kind: string;
  shape: "sphere" | "cylinder" | "box";
  center: ScenePoint3;
  radius?: number;
  /** Cylinder height (m); containment and editors use this when shape is `cylinder`. */
  height?: number;
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

/** A box volume's half size per axis when it has no `halfExtents`; a sphere's or cylinder's radius likewise. */
export const DEFAULT_VOLUME_HALF_SIZE = 5;

/**
 * Half sizes of a volume's bounds, which are centred on `center` on every axis: a box spans
 * `center ± halfExtents`, a cylinder `center.y ± height / 2` (height defaults to its diameter), a
 * sphere `center ± radius`. Runtime containment and the editor's drawing both read this, so a volume
 * authored to stand on the floor has `center.y` at the floor plus its half height.
 */
export function volumeHalfSize(volume: Pick<SceneVolumeLike, "shape" | "radius" | "height" | "halfExtents">): ScenePoint3 {
  if (volume.shape === "box") {
    const half = volume.halfExtents;
    return { x: half?.x ?? DEFAULT_VOLUME_HALF_SIZE, y: half?.y ?? DEFAULT_VOLUME_HALF_SIZE, z: half?.z ?? DEFAULT_VOLUME_HALF_SIZE };
  }
  const radius = volume.radius ?? DEFAULT_VOLUME_HALF_SIZE;
  return { x: radius, y: volume.shape === "cylinder" ? (volume.height ?? radius * 2) / 2 : radius, z: radius };
}

/**
 * The `center` that stands a box or cylinder on `ground`: raised by its half height, so its bottom
 * face is at `ground.y`. A sphere is centred on the point itself.
 */
export function volumeCenterOnGround(
  volume: Pick<SceneVolumeLike, "shape" | "radius" | "height" | "halfExtents">,
  ground: ScenePoint3,
): ScenePoint3 {
  if (volume.shape === "sphere") return { ...ground };
  return { x: ground.x, y: ground.y + volumeHalfSize(volume).y, z: ground.z };
}
