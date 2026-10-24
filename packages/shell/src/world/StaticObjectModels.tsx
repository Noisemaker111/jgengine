import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector, type ModelVariantSelector } from "@jgengine/core/world/modelLod";
import { devtools } from "@jgengine/core/devtools/devtools";
import { useGameContext } from "@jgengine/react/provider";
import { sharedGltfLoader } from "../render/modelLoad";
import { IsolatedModelPart } from "../render/SceneModels";
import { freezeStaticTransforms } from "../render/staticTransforms";
import { measureLocalBounds, reportMeasuredBounds } from "../render/measureBounds";
import { measureLocalCollisionTriangles, reportMeasuredCollisionMesh } from "../render/measureCollisionMesh";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "../scatter/scatterModels";
import { useRenderVisibility } from "../visibility/CullingProvider";
import { CAMERA_POST_FRAME_PRIORITY } from "../camera/cameraRigs";
import { canInstanceStaticScene, countStaticBatchDraws, incompatibleStaticObjectIds, isCompatibleStaticObject, STATIC_BATCH_MESH_KEY, syncStaticObjectSource, type StaticObjectBatch } from "./staticObjectBatches";

/**
 * Report what static object batching is doing to `debug_snapshot().systems`: the grouped batches, the
 * total instances behind them, and how many instances survived per-instance culling this frame. A
 * batch whose instances are all outside the view contributes a draw of zero, so `drawn` is the culling
 * evidence, not a claim.
 * @internal
 */
export function useStaticObjectBatchProbe(
  scene: THREE.Object3D,
  stats: { batches: number; instances: number; singles: number },
): void {
  const ref = useRef(stats);
  ref.current = stats;
  useEffect(
    () =>
      devtools.probes.registerSystem("render/staticBatches", {
        counters: () => ({ ...ref.current, ...countStaticBatchDraws(scene) }),
        state: () => {
          const { draws, drawn } = countStaticBatchDraws(scene);
          return `${ref.current.batches} batches · ${draws} draws · ${drawn}/${ref.current.instances} instances drawn`;
        },
      }),
    [scene],
  );
}

/** Live members of one batch after the per-frame compatibility gate removed any that changed at runtime. */
function useBatchMembers(batch: StaticObjectBatch): { objects: readonly SceneObject[]; excluded: readonly string[] } {
  const ctx = useGameContext();
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const fallbackObjects = useRef(new Map<string, SceneObject>());
  useFrame(() => {
    const next = incompatibleStaticObjectIds(batch, ctx.scene.object.get, ctx.scene.object.catalog, excluded, fallbackObjects.current);
    if (next !== excluded) setExcluded(next);
  });
  const objects = useMemo(() => batch.objects.filter((object) => !excluded.includes(object.instanceId)), [batch, excluded]);
  return { objects, excluded };
}

function ObjectSource({ source, objects, batch, selector, level }: {
  source: ScatterModelSource;
  objects: readonly SceneObject[];
  batch: StaticObjectBatch;
  selector?: ModelVariantSelector | undefined;
  level?: number | undefined;
}) {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const ref = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const cameraPosition = useRef(new THREE.Vector3());
  const probe = useMemo(() => new THREE.Vector3(), []);
  const attach = useCallback((mesh: THREE.InstancedMesh | null) => {
    ref.current = mesh;
    if (mesh !== null) freezeStaticTransforms(mesh);
  }, []);
  useEffect(() => {
    const mesh = ref.current;
    return () => { mesh?.dispose(); };
  }, [objects.length, source]);
  useFrame((state) => {
    if (ref.current === null) return;
    let accept: ((live: SceneObject) => boolean) | undefined;
    if (selector !== undefined && level !== undefined) {
      const camera = cameraPosition.current;
      state.camera.getWorldPosition(camera);
      accept = (live) => selector.level(live.instanceId, camera.distanceTo(
        probe.set(live.position[0], live.position[1], live.position[2]),
      )) === level;
    }
    syncStaticObjectSource(ref.current, source, objects, (id) => {
      const object = ctx.scene.object.get(id);
      return object !== null && object.catalogId === batch.objects[0]!.catalogId &&
        isCompatibleStaticObject(object, batch.model, ctx.scene.object.catalog(id)) ? object : null;
    }, visibility.current, scratch, accept);
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);
  return <instancedMesh ref={attach} args={[source.geometry, source.material, objects.length]} userData={{ [STATIC_BATCH_MESH_KEY]: true }} castShadow={source.castShadow} receiveShadow={source.receiveShadow} dispose={null} />;
}

function LoadedStaticObjects({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  const ctx = useGameContext();
  const { objects, excluded } = useBatchMembers(batch);
  const gltf = useLoader(sharedGltfLoader, batch.model.url);
  const supported = useMemo(() => canInstanceStaticScene(gltf.scene, gltf.animations), [gltf]);
  const harvested = useMemo(() => supported ? buildScatterModelSources(gltf.scene, batch.model) : null, [supported, gltf, batch.model]);
  useEffect(() => () => { if (harvested !== null) disposeScatterModelSources(harvested.root); }, [harvested]);
  useEffect(() => {
    if (harvested === null) return;
    const root = new THREE.Group();
    for (const source of harvested.sources) {
      const mesh = new THREE.Mesh(source.geometry, source.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.localMatrix);
      root.add(mesh);
    }
    const key = batch.objects[0]!.catalogId;
    if (batch.model.dims?.maxY === undefined) {
      const bounds = measureLocalBounds(root);
      if (bounds !== null) reportMeasuredBounds(ctx, "object", key, bounds);
    }
    const triangles = measureLocalCollisionTriangles(root);
    if (triangles !== null) reportMeasuredCollisionMesh(ctx, "object", key, triangles);
  }, [ctx, harvested, batch]);
  if (harvested === null) return <>{batch.objects.map(single)}</>;
  return <>
    {harvested.sources.map((source, index) => objects.length === 0 ? null : <ObjectSource key={index} source={source} objects={objects} batch={batch} />)}
    {excluded.map((id) => { const live = ctx.scene.object.get(id); return live === null ? null : single(live); })}
  </>;
}

/** One detail level's GLB, harvested into instanced draws that only claim the instances the selector put on this level. */
function VariantLevel({ url, model, batch, objects, level, selector, measure, single }: {
  url: string;
  model: ModelConfig;
  batch: StaticObjectBatch;
  objects: readonly SceneObject[];
  level: number;
  selector: ModelVariantSelector;
  measure: boolean;
  single: (object: SceneObject) => ReactNode;
}) {
  const ctx = useGameContext();
  const gltf = useLoader(sharedGltfLoader, url);
  const supported = useMemo(() => canInstanceStaticScene(gltf.scene, gltf.animations), [gltf]);
  const harvested = useMemo(() => supported ? buildScatterModelSources(gltf.scene, model) : null, [supported, gltf, model]);
  useEffect(() => () => { if (harvested !== null) disposeScatterModelSources(harvested.root); }, [harvested]);
  useEffect(() => {
    if (harvested === null || !measure) return;
    const root = new THREE.Group();
    for (const source of harvested.sources) {
      const mesh = new THREE.Mesh(source.geometry, source.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.localMatrix);
      root.add(mesh);
    }
    const key = batch.objects[0]!.catalogId;
    if (batch.model.dims?.maxY === undefined) {
      const bounds = measureLocalBounds(root);
      if (bounds !== null) reportMeasuredBounds(ctx, "object", key, bounds);
    }
    const triangles = measureLocalCollisionTriangles(root);
    if (triangles !== null) reportMeasuredCollisionMesh(ctx, "object", key, triangles);
  }, [ctx, harvested, batch, measure]);
  if (harvested === null) return <LevelSingles objects={objects} level={level} selector={selector} single={single} />;
  return <>{harvested.sources.map((source, index) => <ObjectSource key={index} source={source} objects={objects} batch={batch} selector={selector} level={level} />)}</>;
}

/** Members of one level drawn through the individual renderer, for a level whose asset cannot be instanced. @internal */
export function LevelSingles({ objects, level, selector, single }: {
  objects: readonly SceneObject[];
  level: number;
  selector: ModelVariantSelector;
  single: (object: SceneObject) => ReactNode;
}) {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const camera = useMemo(() => new THREE.Vector3(), []);
  const probe = useMemo(() => new THREE.Vector3(), []);
  const [members, setMembers] = useState<readonly SceneObject[]>(objects);
  useFrame((state) => {
    state.camera.getWorldPosition(camera);
    const next = objects.flatMap((object) => {
      const live = ctx.scene.object.get(object.instanceId);
      if (live === null || !visibility.current(live.instanceId)) return [];
      probe.set(live.position[0]!, live.position[1]!, live.position[2]!);
      return selector.level(live.instanceId, camera.distanceTo(probe)) === level ? [live] : [];
    });
    if (next.length !== members.length || next.some((member, index) => member !== members[index])) setMembers(next);
  });
  return <>{members.map(single)}</>;
}

/**
 * A batch whose model declares detail levels: every level draws its own instanced meshes and claims
 * only the instances the shared distance switch put on it, so near and far trees of one species keep
 * their own mesh inside one batch cell.
 * @internal
 */
export function VariantStaticObjects({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  const ctx = useGameContext();
  const { objects, excluded } = useBatchMembers(batch);
  const levels = batch.model.variants!.levels;
  const selector = useMemo(() => createModelVariantSelector(batch.model.variants!), [batch.model]);
  return <>
    {levels.map((level, index) => (
      <VariantLevel
        key={`${level.url}:${index}`}
        url={level.url}
        model={{ ...batch.model, url: level.url, variants: undefined }}
        batch={batch}
        objects={objects}
        level={index}
        selector={selector}
        measure={index === 0}
        single={single}
      />
    ))}
    {excluded.map((id) => { const live = ctx.scene.object.get(id); return live === null ? null : single(live); })}
  </>;
}

/** Render compatible authored or `scenery` props as shared model draws, preserving unsupported models. @internal */
export function StaticObjectModels({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  return (
    <IsolatedModelPart model={batch.model} seam="object">
      {batch.model.variants === undefined
        ? <LoadedStaticObjects batch={batch} single={single} />
        : <VariantStaticObjects batch={batch} single={single} />}
    </IsolatedModelPart>
  );
}
