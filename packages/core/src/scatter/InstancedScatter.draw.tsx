import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import type { ScatterInstance } from "@jgengine/core/scatter/scatterRegion";
import { groupInstancesByCell } from "@jgengine/core/instancing/instanceCells";
import { beginFallbackSeam, reportFallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { createModelVariantSelector, type ModelVariantSelector } from "@jgengine/core/lod/modelLod";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { composeInstance, uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { LEVEL_PASS_MIN_CAMERA_MOVE, levelPassNeeded } from "@jgengine/core/lod/levelPass.draw";
import { variantLevelModel } from "@jgengine/core/lod/singleVariantLod.draw";
import { buildScatterProxy } from "./scatterProxies.draw";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "./scatterModels.draw";
import { writeScatterVariantLevel } from "./scatterVariants.draw";
import { detailDrawDistance, IMPOSTOR_MIN_RADIUS, sourceRadius } from "@jgengine/core/lod/impostor.draw";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { ScatterImpostorField } from "./ScatterImpostorField.draw";
import { bakeGeneratorVariants, getGenerator, type GeneratorDefinition } from "@jgengine/core/generator/generator";
import { getGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import {
  assignScatterVariants,
  isScatterGeneratorItem,
  parseScatterVariantItem,
  scatterGeneratorBase,
  scatterGeneratorVariantCount,
  type ScatterGeneratorItem,
} from "./scatterGenerator";

/** Chunk edge (m): dense fields split into this-sized buckets, each frustum-culled independently. */
const DEFAULT_CHUNK_SIZE = 24;
const DEFAULT_MAX_INSTANCES = 20000;
/** Most chunks one field splits into; past it chunks grow, so an island costs hundreds of objects, not tens of thousands. */
const DEFAULT_MAX_CHUNKS = 400;

/**
 * Chunk edge for a field: `chunkSize`, grown until the field's footprint fits in `maxChunks` chunks.
 * Every chunk is one scene object per species and draw source, walked every frame even when culled,
 * so a fixed 24 m grid over a 2 km island would be most of the frame before a triangle is drawn.
 * @internal
 */
export function scatterChunkSize(instances: readonly { x: number; z: number }[], chunkSize: number, maxChunks: number): number {
  if (instances.length === 0) return chunkSize;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const instance of instances) {
    minX = Math.min(minX, instance.x);
    maxX = Math.max(maxX, instance.x);
    minZ = Math.min(minZ, instance.z);
    maxZ = Math.max(maxZ, instance.z);
  }
  return Math.max(chunkSize, Math.ceil(Math.sqrt(((maxX - minX) * (maxZ - minZ)) / Math.max(1, maxChunks))));
}

/**
 * At most `max` instances. Over budget the field thins evenly (every region keeps the same share)
 * instead of being cut off in document order, which would leave whole regions bare. @internal
 */
export function capScatterInstances<T>(instances: readonly T[], max: number): readonly T[] {
  if (instances.length <= max) return instances;
  const kept: T[] = [];
  const stride = instances.length / Math.max(1, max);
  for (let i = 0; i < max; i += 1) kept.push(instances[Math.floor(i * stride)]!);
  return kept;
}

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
  for (const chunk of groupInstancesByCell(instances, chunkSize, (instance) => [instance.x, instance.z])) {
    const byItem = new Map<string, { matrices: THREE.Matrix4[]; instances: ScatterInstance[] }>();
    for (const instance of chunk.items) {
      const matrix = composeInstance(new THREE.Matrix4(), [instance.x, instance.y, instance.z], [0, instance.rotationY, 0], instance.scale);
      const bucket = byItem.get(instance.item);
      if (bucket === undefined) byItem.set(instance.item, { matrices: [matrix], instances: [instance] });
      else {
        bucket.matrices.push(matrix);
        bucket.instances.push(instance);
      }
    }
    for (const [item, bucket] of byItem) {
      batches.push({ key: `${chunk.key}:${item}`, item, matrices: bucket.matrices, instances: bucket.instances });
    }
  }
  return batches;
}

/**
 * Drops hidden placements from the batches that hold them. Every other batch comes back as the same
 * object, so felling one tree re-uploads one chunk instead of rebuilding the whole field.
 * @internal
 */
export function hideScatterPlacements(batches: readonly ScatterBatch[], hidden: ReadonlySet<string> | undefined): ScatterBatch[] {
  if (hidden === undefined || hidden.size === 0) return [...batches];
  const shown: ScatterBatch[] = [];
  for (const batch of batches) {
    if (!batch.instances.some((instance) => hidden.has(instance.id))) {
      shown.push(batch);
      continue;
    }
    const matrices: THREE.Matrix4[] = [];
    const instances: ScatterInstance[] = [];
    batch.instances.forEach((instance, index) => {
      if (hidden.has(instance.id)) return;
      instances.push(instance);
      matrices.push(batch.matrices[index]!);
    });
    if (instances.length > 0) shown.push({ key: batch.key, item: batch.item, matrices, instances });
  }
  return shown;
}

/** One species-in-a-chunk InstancedMesh; frustum-culled as a unit so offscreen chunks cost nothing. */
function ScatterBatchMesh({ batch, geometry }: { batch: ScatterBatch; geometry: THREE.BufferGeometry }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh !== null) uploadInstances(mesh, batch.matrices);
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
    if (mesh !== null) uploadInstances(mesh, matrices, { localMatrix: source.localMatrix });
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
    uploadInstances(mesh, { count, at: (index, out) => out.copy(slots[index]!) });
  }, [level, selector, batch, source, slots]);
  useLayoutEffect(() => {
    camera.getWorldPosition(cameraPosition);
    lastCamera.current.copy(cameraPosition);
    writeLevel(cameraPosition);
  }, [camera, writeLevel, cameraPosition]);
  useFrame((state) => {
    state.camera.getWorldPosition(cameraPosition);
    if (!levelPassNeeded(lastCamera.current, cameraPosition, LEVEL_PASS_MIN_CAMERA_MOVE)) return;
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
  const gltf = useLoader(sharedGltfLoader, url);
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

/** A batch's footprint on the ground: its centre and the radius that reaches its farthest placement. @internal */
export function scatterBatchFootprint(batch: ScatterBatch): { x: number; z: number; radius: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const instance of batch.instances) {
    minX = Math.min(minX, instance.x);
    maxX = Math.max(maxX, instance.x);
    minZ = Math.min(minZ, instance.z);
    maxZ = Math.max(maxZ, instance.z);
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 };
}

/**
 * Small-detail species (below impostor size): every chunk of the species is its own group, hidden
 * once the camera is farther than {@link detailDrawDistance} from the chunk's nearest edge. Without
 * it a field the size of an island draws every pebble on it every frame.
 */
function ScatterDetailInstances({ sources, batches, radius }: { sources: ScatterModelSource[]; batches: ScatterBatch[]; radius: number }) {
  const quality = useTerrainQuality();
  const reach = useMemo(() => detailDrawDistance(radius, quality), [radius, quality]);
  const footprints = useMemo(() => batches.map(scatterBatchFootprint), [batches]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    state.camera.getWorldPosition(cameraPosition);
    for (let index = 0; index < footprints.length; index += 1) {
      const group = groups.current[index];
      const footprint = footprints[index]!;
      if (group === null || group === undefined) continue;
      group.visible = Math.hypot(cameraPosition.x - footprint.x, cameraPosition.z - footprint.z) - footprint.radius <= reach;
    }
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);
  return (
    <>
      {batches.map((batch, batchIndex) => (
        <group key={batch.key} ref={(group) => { groups.current[batchIndex] = group; }}>
          {sources.map((source, sourceIndex) => (
            <ScatterModelSourceInstances key={sourceIndex} source={source} matrices={batch.matrices} />
          ))}
        </group>
      ))}
    </>
  );
}

/**
 * Loads one species' real catalog GLB once, harvests its instanceable draw sources, then GPU-instances
 * them across every chunk that species appears in. A species big enough to read from afar (trees,
 * rocks, huts) draws its distant placements as impostor cards in one draw for the whole field; a
 * smaller one stops drawing past its detail distance.
 */
function ScatterSingleSpecies({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }) {
  const gltf = useLoader(sharedGltfLoader, model.url);
  const { sources, root } = useMemo(() => buildScatterModelSources(gltf.scene, model), [gltf, model]);
  useEffect(() => () => disposeScatterModelSources(root), [root]);
  return <ScatterSourcesField cacheKey={`scatter:${model.url}:${JSON.stringify(model)}`} sources={sources} batches={batches} />;
}

/** A species draw: big ones get the impostor far field, small ones stop past their detail distance. */
function ScatterSourcesField({ cacheKey, sources, farSources, batches }: {
  cacheKey: string;
  sources: ScatterModelSource[];
  farSources?: ScatterModelSource[] | undefined;
  batches: ScatterBatch[];
}) {
  const radius = useMemo(() => sourceRadius(sources), [sources]);
  if (radius >= IMPOSTOR_MIN_RADIUS) return <ScatterImpostorField cacheKey={cacheKey} sources={sources} farSources={farSources} batches={batches} radius={radius} />;
  return <ScatterDetailInstances sources={sources} batches={batches} radius={radius} />;
}

const IDENTITY = new THREE.Matrix4();

/** One generator-grown species, resolved: the generator, the item, and its placements per variant. */
interface ScatterGeneratorSpeciesDraw {
  definition: GeneratorDefinition;
  spec: ScatterGeneratorItem;
  byVariant: Map<number, ScatterBatch[]>;
}

/**
 * A palette item grown by a generator: its variants are baked once, each turned into instanced draws
 * through the mesh builder registered for the generator's output, and every variant draws only the
 * placements assigned to it. Far away every variant draws one shared impostor baked from the first,
 * so more variants cost near draws, not atlas memory.
 */
function ScatterGeneratorSpecies({ item, species }: { item: string; species: ScatterGeneratorSpeciesDraw }) {
  const { definition, spec } = species;
  const variants = useMemo(() => {
    const build = getGeneratorMesh(definition.output);
    if (build === undefined) return [];
    const baked = bakeGeneratorVariants({ ...definition, lods: [spec.detail ?? 1] }, scatterGeneratorBase(spec, definition.schema), {
      count: scatterGeneratorVariantCount(spec),
      explore: spec.explore ?? 0.3,
      seed: item,
      ...(spec.keep === undefined ? {} : { keep: spec.keep }),
    });
    return baked.map((variant) => (build(variant.lods[0]?.output) ?? []).map((source): ScatterModelSource => ({ ...source, localMatrix: IDENTITY })));
  }, [definition, spec, item]);
  useEffect(() => () => variants.forEach((sources) => sources.forEach((source) => source.geometry.dispose())), [variants]);
  const key = useMemo(() => `generator:${item}:${JSON.stringify(spec)}`, [item, spec]);
  return (
    <>
      {[...species.byVariant.entries()].map(([variant, batches]) => {
        const sources = variants[variant];
        return sources === undefined || sources.length === 0 ? null : <ScatterSourcesField key={variant} cacheKey={key} sources={sources} farSources={variants[0]} batches={batches} />;
      })}
    </>
  );
}

/** The generator a palette item grows from: its mapping, else a registered generator whose id is the item and whose output draws as meshes. */
function generatorSpec(item: string, resolved: ModelConfig | ScatterGeneratorItem | null): ScatterGeneratorItem | null {
  if (resolved !== null) return isScatterGeneratorItem(resolved) ? resolved : null;
  const definition = getGenerator(item);
  return definition !== undefined && getGeneratorMesh(definition.output) !== undefined ? { generator: item } : null;
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
  /** Most instances drawn; past it the field thins evenly. Default 20000. */
  maxInstances?: number;
  /** Most chunks the field splits into; bigger fields get bigger chunks. Default 400. */
  maxChunks?: number;
  /**
   * Per-species override: return a real catalog `ModelConfig` for an item to GPU-instance the actual
   * GLB, or a {@link ScatterGeneratorItem} to grow it from a generator's baked variants. `null` (or
   * omitting the prop) grows an item named after a registered mesh generator (`"nature.palm"`) from
   * that generator, and draws anything else as the stylized `buildScatterProxy`.
   */
  resolveItem?: (item: string) => ModelConfig | ScatterGeneratorItem | null;
  /** Placement ids not drawn — felled trees, mined rocks ({@link ScatterClearing}). */
  hidden?: ReadonlySet<string>;
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
  maxChunks = DEFAULT_MAX_CHUNKS,
  resolveItem,
  hidden,
}: InstancedScatterProps) {
  const capped = useMemo(() => capScatterInstances(instances, maxInstances), [instances, maxInstances]);
  const resolved = useMemo(() => {
    const byItem = new Map<string, ModelConfig | ScatterGeneratorItem | null>();
    for (const instance of capped) if (!byItem.has(instance.item)) byItem.set(instance.item, resolveItem?.(instance.item) ?? null);
    const generators = new Map<string, { definition: GeneratorDefinition; spec: ScatterGeneratorItem }>();
    for (const [item, result] of byItem) {
      const spec = generatorSpec(item, result);
      const definition = spec === null ? undefined : getGenerator(spec.generator);
      if (spec !== null && definition !== undefined) generators.set(item, { definition, spec });
    }
    return { byItem, generators };
  }, [capped, resolveItem]);
  const assigned = useMemo(
    () => resolved.generators.size === 0 ? capped : assignScatterVariants(capped, (item) => {
      const generator = resolved.generators.get(item);
      return generator === undefined ? undefined : scatterGeneratorVariantCount(generator.spec);
    }),
    [capped, resolved],
  );
  // The grid is sized from every placement, not the shown ones, so clearing a tree never re-chunks the field.
  const edge = useMemo(() => scatterChunkSize(assigned, chunkSize, maxChunks), [assigned, chunkSize, maxChunks]);
  const allBatches = useMemo(() => scatterBatchInstances(assigned, edge), [assigned, edge]);
  const batches = useMemo(() => hideScatterPlacements(allBatches, hidden), [allBatches, hidden]);

  const { proxyBatches, modelSpecies, generatorSpecies } = useMemo(() => {
    // Dev diagnostic (no-op unless armed): re-zero the scatter seam before re-tallying which species
    // fall to a stylized proxy (no resolveItem mapping / a null result). Reported once per species.
    beginFallbackSeam("scatter");
    const proxy: ScatterBatch[] = [];
    const bySpecies = new Map<string, { model: ModelConfig; batches: ScatterBatch[] }>();
    const knownProxy = new Set<string>();
    const grown = new Map<string, ScatterGeneratorSpeciesDraw>();
    for (const batch of batches) {
      const tagged = parseScatterVariantItem(batch.item);
      const generator = tagged === null ? undefined : resolved.generators.get(tagged.item);
      if (tagged !== null && generator !== undefined) {
        const entry = grown.get(tagged.item) ?? { ...generator, byVariant: new Map<number, ScatterBatch[]>() };
        grown.set(tagged.item, entry);
        const list = entry.byVariant.get(tagged.variant);
        if (list === undefined) entry.byVariant.set(tagged.variant, [batch]);
        else list.push(batch);
        continue;
      }
      const species = bySpecies.get(batch.item);
      if (species !== undefined) {
        species.batches.push(batch);
        continue;
      }
      if (knownProxy.has(batch.item)) {
        proxy.push(batch);
        continue;
      }
      const model = resolved.byItem.get(batch.item) ?? null;
      if (model === null || isScatterGeneratorItem(model)) {
        knownProxy.add(batch.item);
        reportFallbackSeam("scatter", "omittedMapping");
        proxy.push(batch);
        continue;
      }
      bySpecies.set(batch.item, { model, batches: [batch] });
    }
    return { proxyBatches: proxy, modelSpecies: [...bySpecies.entries()], generatorSpecies: [...grown.entries()] };
  }, [batches, resolved]);

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
      {generatorSpecies.map(([item, species]) => (
        <ScatterGeneratorSpecies key={item} item={item} species={species} />
      ))}
    </>
  );
}
