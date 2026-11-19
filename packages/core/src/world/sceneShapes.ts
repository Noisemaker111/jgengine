/** A world-space point — structurally compatible with the editor's `EditorVec3`. */
export interface ScenePoint3 {
  x: number;
  y: number;
  z: number;
}

export interface ScenePathLike {
  id: string;
  kind: string;
  points: readonly ScenePoint3[];
  width?: number;
  meta?: Record<string, unknown>;
}

export interface SceneMarkerLike {
  id: string;
  kind: string;
  position: ScenePoint3;
  meta?: Record<string, unknown>;
}

export interface SceneVolumeLike {
  id: string;
  kind: string;
  shape: "sphere" | "cylinder" | "box";
  center: ScenePoint3;
  radius?: number;
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

export function volumeCenterOnGround(
  volume: Pick<SceneVolumeLike, "shape" | "radius" | "height" | "halfExtents">,
  ground: ScenePoint3,
): ScenePoint3 {
  if (volume.shape === "sphere") return { ...ground };
  return { x: ground.x, y: ground.y + volumeHalfSize(volume).y, z: ground.z };
}
