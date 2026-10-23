import type { SceneRaycastHit, SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";

import type { Vec3 } from "./audioEngine";

/** The narrow slice of the scene a line-of-hearing test needs. */
export interface BlockingRaycastSource {
  raycast(input: SceneRaycastInput): SceneRaycastHit | null;
}

/**
 * Whether blocking world geometry (objects and wall segments, never creatures or terrain) lies
 * between the listener and an emitter. One scene query per call; the engine owns how often it runs.
 */
export function sceneLineBlocked(source: BlockingRaycastSource, from: Vec3, to: Vec3): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 0.001)) return false;
  const hit = source.raycast({
    origin: [from.x, from.y, from.z],
    direction: [dx / length, dy / length, dz / length],
    maxDistance: length - 0.001,
    filter: { entities: false, terrain: false },
    accept: (candidate) => candidate.blocks,
  });
  return hit !== null;
}
