import { Suspense, useEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { chunkScatterInstances, type ScatterInstance } from "@jgengine/core/world/scatterRegion";

import { buildScatterProxy } from "./scatterProxies";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "./scatterModels";

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

/** One GLB-backed draw source instanced across every chunk of one species. */
function ScatterModelSourceInstances({ source, matrices }: { source: ScatterModelSource; matrices: THREE.Matrix4[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const composed = new THREE.Matrix4();
    for (let i = 0; i < matrices.length; i += 1) {
      composed.multiplyMatrices(matrices[i]!, source.localMatrix);
      mesh.setMatrixAt(i, composed);
    }
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, source]);
  return <instancedMesh ref={meshRef} args={[source.geometry, source.material, matrices.length]} castShadow receiveShadow />;
}

/** Loads one species' real catalog GLB once, harvests its instanceable draw sources, then GPU-instances them across every chunk that species appears in. */
function ScatterModelSpecies({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }) {
  const gltf = useLoader(GLTFLoader, model.url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const { sources, root } = useMemo(() => buildScatterModelSources(gltf.scene, model), [gltf, model]);
  useEffect(() => () => disposeScatterModelSources(root), [root]);
  return (
    <>
      {sources.map((source, sourceIndex) =>
        batches.map((batch) => (
          <ScatterModelSourceInstances key={`${batch.key}:${sourceIndex}`} source={source} matrices={batch.matrices} />
        )),
      )}
    </>
  );
}

/** Props for {@link InstancedScatter}: the resolved instances plus chunking/instance-cap knobs. */
export interface InstancedScatterProps {
  instances: readonly ScatterInstance[];
  /** Chunk edge in meters; dense fields split into independently frustum-culled buckets. Default 24. */
  chunkSize?: number;
  /** Hard cap on rendered instances. Default 20000. */
  maxInstances?: number;
  /**
   * Per-species override: return a real catalog `ModelConfig` for an item to GPU-instance the actual
   * GLB instead of the stylized proxy; return `null` (or omit the prop) to keep `buildScatterProxy`.
   */
  resolveItem?: (item: string) => ModelConfig | null;
}

/**
 * Renders resolved {@link ScatterInstance}s grouped into per-chunk, per-species GPU-instanced draws
 * that frustum-cull independently. Species with no `resolveItem` mapping (or a `null` result) render
 * as stylized proxy models (trunked trees, stacked pines, round bushes, faceted rocks, grass tufts);
 * species `resolveItem` resolves to a `ModelConfig` GPU-instance the real catalog GLB instead. The one
 * runtime foliage renderer shared by the editor's scatter preview and games that consume
 * `resolveScatter` — never one node per placement.
 */
export function InstancedScatter({
  instances,
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxInstances = DEFAULT_MAX_INSTANCES,
  resolveItem,
}: InstancedScatterProps) {
  const batches = useMemo(
    () => batchInstances(instances.length > maxInstances ? instances.slice(0, maxInstances) : instances, chunkSize),
    [instances, chunkSize, maxInstances],
  );

  const { proxyBatches, modelSpecies } = useMemo(() => {
    const proxy: ScatterBatch[] = [];
    const bySpecies = new Map<string, { model: ModelConfig; batches: ScatterBatch[] }>();
    const knownProxy = new Set<string>();
    for (const batch of batches) {
      const species = bySpecies.get(batch.item);
      if (species !== undefined) {
        species.batches.push(batch);
        continue;
      }
      if (knownProxy.has(batch.item)) {
        proxy.push(batch);
        continue;
      }
      const resolved = resolveItem?.(batch.item) ?? null;
      if (resolved === null) {
        knownProxy.add(batch.item);
        proxy.push(batch);
        continue;
      }
      bySpecies.set(batch.item, { model: resolved, batches: [batch] });
    }
    return { proxyBatches: proxy, modelSpecies: [...bySpecies.entries()] };
  }, [batches, resolveItem]);

  const geometries = useMemo(() => {
    const items = new Set(proxyBatches.map((batch) => batch.item));
    const map = new Map<string, THREE.BufferGeometry>();
    for (const item of items) map.set(item, buildScatterProxy(item));
    return map;
  }, [proxyBatches]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  if (batches.length === 0) return null;
  return (
    <>
      {proxyBatches.map((batch) => {
        const geometry = geometries.get(batch.item);
        return geometry === undefined ? null : <ScatterBatchMesh key={batch.key} batch={batch} geometry={geometry} />;
      })}
      {modelSpecies.map(([item, species]) => (
        <Suspense key={item} fallback={null}>
          <ScatterModelSpecies model={species.model} batches={species.batches} />
        </Suspense>
      ))}
    </>
  );
}
