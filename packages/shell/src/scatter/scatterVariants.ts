import type * as THREE from "three";
import type { ModelVariantSelector } from "@jgengine/core/world/modelLod";

/** A scatter placement as the level pass reads it: a stable id and a world position. */
export interface ScatterVariantMember {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A camera position the level pass measures from. */
export interface ScatterVariantCamera {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Writes the matrices of the members the shared variant selector put on `level` into `out`, in source
 * order, and returns how many were written. `out` is the level mesh's reserved capacity (one matrix
 * per member), so a frame writes matrices and `count` without allocating.
 *
 * Every member is asked for its level through the same {@link ModelVariantSelector} the static prop
 * path uses, so hysteresis and the `lodBandIndex` boundary are identical, and a chunk cell holding
 * near and far members of one species splits between this level's draw and the other levels'.
 *
 * `keep` lets an orthogonal instance cull (tier distance, occlusion) drop a member without changing
 * the level answer, so culling and level selection compose in one pass over the batch.
 */
export function writeScatterVariantLevel(
  level: number,
  selector: ModelVariantSelector,
  camera: ScatterVariantCamera,
  members: readonly ScatterVariantMember[],
  transforms: readonly THREE.Matrix4[],
  localMatrix: THREE.Matrix4,
  out: THREE.Matrix4[],
  keep?: (index: number) => boolean,
): number {
  let count = 0;
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!;
    const dx = member.x - camera.x;
    const dy = member.y - camera.y;
    const dz = member.z - camera.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (selector.level(member.id, distance) !== level) continue;
    if (keep !== undefined && !keep(index)) continue;
    out[count]!.multiplyMatrices(transforms[index]!, localMatrix);
    count += 1;
  }
  return count;
}

/** Triangle total for per-level instance counts, so a fixture reports real geometry, not instance counts. */
export function scatterVariantTriangles(
  counts: readonly number[],
  triangles: readonly number[],
): number {
  let total = 0;
  for (let index = 0; index < counts.length; index += 1) total += (counts[index] ?? 0) * (triangles[index] ?? 0);
  return total;
}
