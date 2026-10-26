import * as THREE from "three";

import { POINTER_OBJECT_INSTANCES_KEY } from "../pointer/pointerService";
import { submitInstanceCount } from "../render/submittedDraws";

/** One user's share of a pooled card draw: its far placements this frame. @internal */
export interface ImpostorCardSlice {
  /** Instance matrices, 16 floats each; only the first `count` are drawn. */
  matrices: Float32Array;
  /** Object ids in the same order, so a click on a far card still picks its object. */
  ids: string[];
  count: number;
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
    const slice: ImpostorCardSlice = { matrices: new Float32Array(Math.max(1, capacity) * 16), ids: [], count: 0 };
    this.slices.add(slice);
    return slice;
  }

  drop(slice: ImpostorCardSlice): void {
    this.slices.delete(slice);
    this.packedAt = Number.NaN;
  }

  /** Copies every slice into the shared mesh, once per `frame` however many users call it. */
  pack(frame: number): void {
    if (frame === this.packedAt) return;
    this.packedAt = frame;
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

const pools = new Map<string, { pool: ImpostorCardPool; users: number; parent: THREE.Object3D }>();

/**
 * The shared card pool for `key`, created on first use and added under `parent`. Release it with
 * {@link releaseImpostorCardPool}; the last release removes and disposes it.
 * @internal
 */
export function acquireImpostorCardPool(
  key: string,
  parent: THREE.Object3D,
  create: () => ImpostorCardPool,
): ImpostorCardPool {
  const found = pools.get(key);
  if (found !== undefined) {
    found.users += 1;
    return found.pool;
  }
  const pool = create();
  parent.add(pool.mesh);
  pools.set(key, { pool, users: 1, parent });
  return pool;
}

/** Drops one user of the pool for `key`. @internal */
export function releaseImpostorCardPool(key: string, pool: ImpostorCardPool): void {
  const found = pools.get(key);
  if (found === undefined || found.pool !== pool) return;
  found.users -= 1;
  if (found.users > 0) return;
  found.parent.remove(pool.mesh);
  pool.dispose();
  pools.delete(key);
}
