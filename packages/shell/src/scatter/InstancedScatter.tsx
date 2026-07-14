import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { chunkScatterInstances, type ScatterInstance } from "@jgengine/core/world/scatterRegion";

import { buildScatterProxy } from "./scatterProxies";

/** Chunk edge (m): dense fields split into this-sized buckets, each frustum-culled independently. */
const DEFAULT_CHUNK_SIZE = 24;
const DEFAULT_MAX_INSTANCES = 20000;

/** One instanced draw unit — a single species within a single spatial chunk. */
interface ScatterBatch {
  key: string;
  item: string;
  matrices: THREE.Matrix4[];
}

/** Groups resolved instances by spatial chunk then species so each batch is one cullable draw. */
function batchInstances(instances: readonly ScatterInstance[], chunkSize: number): ScatterBatch[] {
  const batches: ScatterBatch[] = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (const chunk of chunkScatterInstances(instances, chunkSize)) {
    const byItem = new Map<string, THREE.Matrix4[]>();
    for (const instance of chunk.instances) {
      position.set(instance.x, instance.y, instance.z);
      euler.set(0, instance.rotationY, 0);
      quaternion.setFromEuler(euler);
      scale.set(instance.scale, instance.scale, instance.scale);
      matrix.compose(position, quaternion, scale);
      const bucket = byItem.get(instance.item);
      if (bucket === undefined) byItem.set(instance.item, [matrix.clone()]);
      else bucket.push(matrix.clone());
    }
    for (const [item, matrices] of byItem) batches.push({ key: `${chunk.key}:${item}`, item, matrices });
  }
  return batches;
}

/** One species-in-a-chunk InstancedMesh; frustum-culled as a unit so offscreen chunks cost nothing. */
function ScatterBatchMesh({ batch, geometry }: { batch: ScatterBatch; geometry: THREE.BufferGeometry }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    for (let i = 0; i < batch.matrices.length; i += 1) mesh.setMatrixAt(i, batch.matrices[i]!);
    mesh.count = batch.matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch]);
  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, batch.matrices.length]} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0} />
    </instancedMesh>
  );
}

/** Props for {@link InstancedScatter}: the resolved instances plus chunking/instance-cap knobs. */
export interface InstancedScatterProps {
  instances: readonly ScatterInstance[];
  /** Chunk edge in meters; dense fields split into independently frustum-culled buckets. Default 24. */
  chunkSize?: number;
  /** Hard cap on rendered instances. Default 20000. */
  maxInstances?: number;
}

/**
 * Renders resolved {@link ScatterInstance}s as GPU-instanced per-species proxy models (trunked trees,
 * stacked pines, round bushes, faceted rocks, grass tufts), grouped into per-chunk draws that
 * frustum-cull independently. The one runtime foliage renderer shared by the editor's scatter preview
 * and games that consume `resolveScatter` — never one node per placement.
 */
export function InstancedScatter({ instances, chunkSize = DEFAULT_CHUNK_SIZE, maxInstances = DEFAULT_MAX_INSTANCES }: InstancedScatterProps) {
  const batches = useMemo(
    () => batchInstances(instances.length > maxInstances ? instances.slice(0, maxInstances) : instances, chunkSize),
    [instances, chunkSize, maxInstances],
  );

  const geometries = useMemo(() => {
    const items = new Set(batches.map((batch) => batch.item));
    const map = new Map<string, THREE.BufferGeometry>();
    for (const item of items) map.set(item, buildScatterProxy(item));
    return map;
  }, [batches]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  if (batches.length === 0) return null;
  return (
    <>
      {batches.map((batch) => {
        const geometry = geometries.get(batch.item);
        return geometry === undefined ? null : <ScatterBatchMesh key={batch.key} batch={batch} geometry={geometry} />;
      })}
    </>
  );
}
