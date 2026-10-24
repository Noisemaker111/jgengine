import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { chunkScatterInstances, type ScatterInstance } from "@jgengine/core/world/scatterRegion";
import { beginFallbackSeam, reportFallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { createModelVariantSelector, type ModelVariantSelector } from "@jgengine/core/world/modelLod";

import { CAMERA_POST_FRAME_PRIORITY } from "../camera/cameraRigs";
import { submitInstanceCount } from "../render/submittedDraws";
import { variantLevelModel } from "../render/singleVariantLod";
import { buildScatterProxy } from "./scatterProxies";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "./scatterModels";
import { writeScatterVariantLevel } from "./scatterVariants";

/** Chunk edge (m): dense fields split into this-sized buckets, each frustum-culled independently. */
const DEFAULT_CHUNK_SIZE = 24;
const DEFAULT_MAX_INSTANCES = 20000;

/** One instanced draw unit - a single species within a single spatial chunk. @internal */
export interface ScatterBatch {
  key: string;
  item: string;
  /** Per-instance transforms, parallel to `instances`. */
  matrices: THREE.Matrix4[];
  /** The placements themselves, so the level pass can read a stable id and a world position. */
  instances: ScatterInstance[];
}

/** Groups resolved instances by spatial chunk then species so each batch is one cullable draw. @internal */
export function scatterBatchInstances(instances: readonly ScatterInstance[], chunkSize: number): ScatterBatch[] {
  const batches: ScatterBatch[] = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (const chunk of chunkScatterInstances(instances, chunkSize)) {
    const byItem = new Map<string, { matrices: THREE.Matrix4[]; instances: ScatterInstance[] }>();
    for (const instance of chunk.instances) {
      position.set(instance.x, instance.y, instance.z);
      euler.set(0, instance.rotationY, 0);
      quaternion.setFromEuler(euler);
      scale.set(instance.scale, instance.scale, instance.scale);
      matrix.compose(position, quaternion, scale);
      const bucket = byItem.get(instance.item);
      if (bucket === undefined) byItem.set(instance.item, { matrices: [matrix.clone()], instances: [instance] });
      else {
        bucket.matrices.push(matrix.clone());
        bucket.instances.push(instance);
      }
    }
    for (const [item, bucket] of byItem) {
      batches.push({ key: `${chunk.key}:${item}`, item, matrices: bucket.matrices, instances: bucket.instances });
    }
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
    submitInstanceCount(mesh, batch.matrices.length);
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
    submitInstanceCount(mesh, matrices.length);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, source]);
  return <instancedMesh ref={meshRef} args={[source.geometry, source.material, matrices.length]} castShadow receiveShadow />;
}

/**
 * One detail level's draw source, instanced across every chunk of one species. Each frame it asks the
 * shared variant selector for each placement's level and draws only the ones it owns, composing into
 * a reserved matrix slot so the far level's instances cost a second instanced draw, not per-frame
 * allocation. A cell that holds near and far placements feeds both levels from the same batch.
 */
function ScatterVariantSourceInstances({ source, batch, level, selector }: {
  source: ScatterModelSource;
  batch: ScatterBatch;
  level: number;
  selector: ModelVariantSelector;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((state) => state.camera);
  const slots = useMemo(() => batch.matrices.map(() => new THREE.Matrix4()), [batch]);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  const lastCamera = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0));
  const writeLevel = useCallback((from: THREE.Vector3) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const count = writeScatterVariantLevel(
      level,
      selector,
      from,
      batch.instances,
      batch.matrices,
      source.localMatrix,
      slots,
    );
    submitInstanceCount(mesh, count);
    mesh.instanceMatrix.needsUpdate = true;
    if (count > 0) mesh.computeBoundingSphere();
  }, [level, selector, batch, source, slots]);
  useLayoutEffect(() => {
    camera.getWorldPosition(cameraPosition);
    lastCamera.current.copy(cameraPosition);
    writeLevel(cameraPosition);
  }, [camera, writeLevel, cameraPosition]);
  useFrame((state) => {
    state.camera.getWorldPosition(cameraPosition);
    if (cameraPosition.distanceToSquared(lastCamera.current) < 0.25) return;
    lastCamera.current.copy(cameraPosition);
    writeLevel(cameraPosition);
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);
  return (
    <instancedMesh
      ref={meshRef}
      args={[source.geometry, source.material, batch.matrices.length]}
      castShadow={source.castShadow ?? true}
      receiveShadow={source.receiveShadow ?? true}
    />
  );
}

/** Renders one level of a variant model: the level's own GLB harvested into instanced draws. */
function ScatterVariantLevel({ model, url, level, selector, batches }: {
  model: ModelConfig;
  url: string;
  level: number;
  selector: ModelVariantSelector;
  batches: ScatterBatch[];
}) {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const { sources, root } = useMemo(() => {
    return buildScatterModelSources(gltf.scene, variantLevelModel(model, level));
  }, [gltf, model, level]);
  useEffect(() => () => disposeScatterModelSources(root), [root]);
  return (
    <>
      {sources.map((source, sourceIndex) =>
        batches.map((batch) => (
          <ScatterVariantSourceInstances
            key={`${batch.key}:${sourceIndex}`}
            source={source}
            batch={batch}
            level={level}
            selector={selector}
          />
        )),
      )}
    </>
  );
}

/**
 * A species whose model declares detail levels: one GLB per level, each level's instanced draws
 * claiming only the placements the one shared selector put on it. The selector lives here so a
 * placement keeps its hysteresis across every level component instead of each level deciding alone.
 */
function ScatterVariantSpecies({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }) {
  const variants = model.variants!;
  const selector = useMemo(() => createModelVariantSelector(variants), [variants]);
  useEffect(() => () => selector.clear(), [selector]);
  return (
    <>
      {variants.levels.map((level, index) => (
        <Suspense key={`${level.url}:${index}`} fallback={null}>
          <ScatterVariantLevel model={model} url={level.url} level={index} selector={selector} batches={batches} />
        </Suspense>
      ))}
    </>
  );
}

/** Loads one species' real catalog GLB once, harvests its instanceable draw sources, then GPU-instances them across every chunk that species appears in. */
function ScatterSingleSpecies({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }) {
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

/** One species draw: the level switch for a model with `variants`, the single GLB otherwise. */
function ScatterModelSpecies({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }) {
  return model.variants === undefined
    ? <ScatterSingleSpecies model={model} batches={batches} />
    : <ScatterVariantSpecies model={model} batches={batches} />;
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
    () => scatterBatchInstances(instances.length > maxInstances ? instances.slice(0, maxInstances) : instances, chunkSize),
    [instances, chunkSize, maxInstances],
  );

  const { proxyBatches, modelSpecies } = useMemo(() => {
    // Dev diagnostic (no-op unless armed): re-zero the scatter seam before re-tallying which species
    // fall to a stylized proxy (no resolveItem mapping / a null result). Reported once per species.
    beginFallbackSeam("scatter");
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
        reportFallbackSeam("scatter", "omittedMapping");
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
