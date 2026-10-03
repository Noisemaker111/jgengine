import * as THREE from "three";

/** A spatially bounded group of final, geometry-local instance matrices. @internal */
export interface BuildingSpatialChunk {
  key: string;
  matrices: THREE.Matrix4[];
  bounds: THREE.Box3;
}

/** Partition final geometry bounds without changing instance transforms or material groups. @internal */
export function partitionBuildingMatrices(
  geometry: THREE.BufferGeometry,
  matrices: readonly THREE.Matrix4[],
  sourceMatrix?: THREE.Matrix4,
  cellSize = 64,
): BuildingSpatialChunk[] {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("Building cell size must be positive and finite");
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const geometryBounds = geometry.boundingBox;
  if (geometryBounds === null || geometryBounds.isEmpty()) return [];
  const chunks = new Map<string, BuildingSpatialChunk>();
  const aggregateBounds = new THREE.Box3();
  const finalMatrices: THREE.Matrix4[] = [];
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  for (const matrix of matrices) {
    const finalMatrix = sourceMatrix === undefined ? matrix : new THREE.Matrix4().multiplyMatrices(matrix, sourceMatrix);
    bounds.copy(geometryBounds).applyMatrix4(finalMatrix);
    aggregateBounds.union(bounds);
    finalMatrices.push(finalMatrix);
    bounds.getCenter(center);
    const key = `${Math.floor(center.x / cellSize)}:${Math.floor(center.z / cellSize)}`;
    let chunk = chunks.get(key);
    if (chunk === undefined) {
      chunk = { key, matrices: [], bounds: new THREE.Box3() };
      chunks.set(key, chunk);
    }
    chunk.matrices.push(finalMatrix);
    chunk.bounds.union(bounds);
  }
  if (finalMatrices.length > 0 && aggregateBounds.max.x - aggregateBounds.min.x <= cellSize
    && aggregateBounds.max.z - aggregateBounds.min.z <= cellSize) {
    return [{ key: "compact", matrices: finalMatrices, bounds: aggregateBounds }];
  }
  return [...chunks.values()];
}

/** Install matrices and bounds; cleanup releases only the mesh's instance buffers, retaining shared assets. @internal */
export function applyBuildingChunk(mesh: THREE.InstancedMesh, chunk: BuildingSpatialChunk): () => void {
  chunk.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.count = chunk.matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.boundingBox = chunk.bounds.clone();
  mesh.boundingSphere = chunk.bounds.getBoundingSphere(new THREE.Sphere());
  return () => mesh.dispose();
}
