import * as THREE from "three";

import { groupInstancesByCell } from "@jgengine/core/instancing/instanceCells";

/** A spatially bounded group of final, geometry-local instance matrices: one cullable draw. */
export interface InstanceChunk {
  key: string;
  matrices: THREE.Matrix4[];
  /** Union of every instance's transformed geometry box. */
  bounds: THREE.Box3;
}

/** Knobs for {@link partitionInstances}. */
export interface PartitionInstancesOptions {
  /** Applied after each instance matrix: a model part's own transform inside its source scene. */
  localMatrix?: THREE.Matrix4;
  /** Cell edge in meters. Default 256. */
  cellSize?: number;
}

/**
 * Split instance matrices into XZ cells by where each instance's geometry actually lands, so far or
 * offscreen cells are culled as a unit. A batch that already fits one cell stays a single `compact`
 * chunk, even across the grid origin. Instance order is kept within each chunk.
 *
 * @capability instance-chunks split a big instanced batch into spatial cells that cull as units
 */
export function partitionInstances(
  geometry: THREE.BufferGeometry,
  matrices: readonly THREE.Matrix4[],
  options: PartitionInstancesOptions = {},
): InstanceChunk[] {
  const cellSize = options.cellSize ?? 256;
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("Instance cell size must be positive and finite");
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const geometryBounds = geometry.boundingBox;
  if (geometryBounds === null || geometryBounds.isEmpty() || matrices.length === 0) return [];
  const placed = matrices.map((matrix) => {
    const final = options.localMatrix === undefined ? matrix : new THREE.Matrix4().multiplyMatrices(matrix, options.localMatrix);
    const bounds = geometryBounds.clone().applyMatrix4(final);
    const center = bounds.getCenter(new THREE.Vector3());
    return { final, bounds, center: [center.x, center.z] as const };
  });
  const aggregate = placed.reduce((box, entry) => box.union(entry.bounds), new THREE.Box3());
  if (aggregate.max.x - aggregate.min.x <= cellSize && aggregate.max.z - aggregate.min.z <= cellSize) {
    return [{ key: "compact", matrices: placed.map((entry) => entry.final), bounds: aggregate }];
  }
  return groupInstancesByCell(placed, cellSize, (entry) => entry.center).map((cell) => ({
    key: cell.key,
    matrices: cell.items.map((entry) => entry.final),
    bounds: cell.items.reduce((box, entry) => box.union(entry.bounds), new THREE.Box3()),
  }));
}
