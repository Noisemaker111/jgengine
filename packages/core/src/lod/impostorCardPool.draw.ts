import * as THREE from "three";

import { POINTER_OBJECT_INSTANCES_KEY } from "@jgengine/core/input/pointerService.draw";
import { submitInstanceCount } from "@jgengine/core/render/submittedDraws.draw";
import { Lingering } from "@jgengine/core/run/lingering";

/** One user's share of a pooled card draw: its far placements this frame. @internal */
export interface ImpostorCardSlice {
  /** Instance matrices, 16 floats each; only the first `count` are drawn. */
  matrices: Float32Array;
  /** Object ids in the same order, so a click on a far card still picks its object. */
  ids: string[];
  count: number;
  /** Moved by the writer after each rewrite, so the pool packs again only when a slice changed. */
  version: number;
}

/**
 * Every far placement of one model, wherever its batch is, drawn as one instanced card draw. Batches
 * write their slices, and the first user to reach the pack step in a frame copies them all into the
 * shared mesh, so a model scattered over twenty batch cells still costs one card draw per pass.
 * @internal
 */
export class ImpostorCardPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly slices = new Set<ImpostorCardSlice>();
  private packedAt = Number.NaN;
  /** Every slice's version summed at the last pack, or NaN after a slice joined or left. */
  private packedVersions = Number.NaN;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, depth: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geometry, material, 16);
    this.mesh.customDepthMaterial = depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    this.mesh.userData[POINTER_OBJECT_INSTANCES_KEY] = [];
    submitInstanceCount(this.mesh, 0);
  }

  /** A new empty slice that draws in this pool until {@link drop}. */
  slice(capacity: number): ImpostorCardSlice {
    const slice: ImpostorCardSlice = { matrices: new Float32Array(Math.max(1, capacity) * 16), ids: [], count: 0, version: 0 };
    this.slices.add(slice);
    this.packedVersions = Number.NaN;
    return slice;
  }

  drop(slice: ImpostorCardSlice): void {
    this.slices.delete(slice);
    this.packedAt = Number.NaN;
    this.packedVersions = Number.NaN;
  }

  /**
   * Copies every slice into the shared mesh, once per `frame` however many users call it, and only
   * after a slice was rewritten, joined or left: an unchanged pool keeps last frame's instances.
   */
  pack(frame: number): void {
    if (frame === this.packedAt) return;
    this.packedAt = frame;
    let versions = 0;
    for (const slice of this.slices) versions += slice.version;
    if (versions === this.packedVersions) return;
    this.packedVersions = versions;
    let total = 0;
    for (const slice of this.slices) total += slice.count;
    if (total * 16 > this.mesh.instanceMatrix.array.length) {
      const capacity = Math.max(total, (this.mesh.instanceMatrix.array.length / 16) * 2);
      this.mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16);
    }
    const array = this.mesh.instanceMatrix.array as Float32Array;
    const ids = this.mesh.userData[POINTER_OBJECT_INSTANCES_KEY] as string[];
    let offset = 0;
    for (const slice of this.slices) {
      if (slice.count === 0) continue;
      array.set(slice.matrices.subarray(0, slice.count * 16), offset * 16);
      for (let index = 0; index < slice.count; index += 1) ids[offset + index] = slice.ids[index]!;
      offset += slice.count;
    }
    ids.length = total;
    submitInstanceCount(this.mesh, total);
    if (total > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.computeBoundingSphere();
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

interface SharedCardPool {
  pool: ImpostorCardPool;
  users: number;
  parent: THREE.Object3D;
}

const pools = new Map<string, SharedCardPool>();
const unusedPools = new Lingering<string, SharedCardPool>(({ pool }) => pool.dispose());

/**
 * The shared card pool for `key`, created on first use and added under `parent`. Release it with
 * {@link releaseImpostorCardPool}; the last release takes it out of the scene, and it is disposed a
 * moment later unless taken again first under the same parent drawing the same `material`.
 * @internal
 */
export function acquireImpostorCardPool(
  key: string,
  parent: THREE.Object3D,
  material: THREE.Material,
  create: () => ImpostorCardPool,
): ImpostorCardPool {
  const found = pools.get(key);
  if (found !== undefined) {
    found.users += 1;
    return found.pool;
  }
  const unused = unusedPools.take(key);
  const reusable = unused !== undefined && unused.parent === parent && unused.pool.mesh.material === material;
  if (unused !== undefined && !reusable) unused.pool.dispose();
  const shared = unused !== undefined && reusable ? unused : { pool: create(), users: 0, parent };
  shared.users = 1;
  parent.add(shared.pool.mesh);
  pools.set(key, shared);
  return shared.pool;
}

/** Drops one user of the pool for `key`. @internal */
export function releaseImpostorCardPool(key: string, pool: ImpostorCardPool): void {
  const found = pools.get(key);
  if (found === undefined || found.pool !== pool) return;
  found.users -= 1;
  if (found.users > 0) return;
  found.parent.remove(pool.mesh);
  pools.delete(key);
  unusedPools.park(key, found);
}
