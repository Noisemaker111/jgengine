import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector } from "@jgengine/core/lod/modelLod";
import { devtools } from "@jgengine/core/devtools/devtools";
import { useGameContext } from "@jgengine/react/provider";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { IsolatedModelPart } from "@jgengine/core/model/SceneModels.draw";
import { variantLevelModel } from "@jgengine/core/lod/singleVariantLod.draw";
import { assignVariantLevels, createLevelPassGate, levelPassProbe, noteLevelPass, noteLevelPassFrame, variantSwitchOf } from "@jgengine/core/lod/levelPass.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { measureLocalBounds, reportMeasuredBounds } from "@jgengine/core/model/measureBounds.draw";
import { recordRenderBounds } from "@jgengine/core/visibility/measuredBounds";
import { measureLocalCollisionTriangles, reportMeasuredCollisionMesh } from "@jgengine/core/model/measureCollisionMesh.draw";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";
import { useRenderVisibility } from "@jgengine/core/visibility/CullingProvider.draw";
import { acquireImpostor, IMPOSTOR_MIN_RADIUS, impostorCard, impostorDistance, impostorSettingsForQuality, impostorSwitch, releaseImpostor, sourceRadius, type ImpostorEntry } from "@jgengine/core/lod/impostor.draw";
import { acquireImpostorCardPool, ImpostorCardPool, releaseImpostorCardPool, type ImpostorCardSlice } from "@jgengine/core/lod/impostorCardPool.draw";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { canInstanceStaticScene, countStaticBatchDraws, gatherStaticMembers, harvestStaticPieces, incompatibleStaticObjectIds, isCompatibleStaticObject, STATIC_BATCH_MESH_KEY, staticModelPieces, syncStaticObjectSource, type StaticObjectBatch } from "./staticObjectBatches.draw";

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
  useEffect(() => devtools.probes.registerSystem("render/levelPass", levelPassProbe()), []);
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

/**
 * The members one batch (or one detail level of it) draws this frame, gathered once before its
 * sources write their instances. `level` narrows them to the placements `assignment` put on it.
 */
function useStaticMembers(batch: StaticObjectBatch, objects: readonly SceneObject[], assignment?: ReadonlyMap<string, number>, level?: number, drawn = true): { current: SceneObject[] } {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const members = useMemo(() => ({ current: [] as SceneObject[] }), []);
  useFrame(() => {
    if (!drawn) return;
    const accept = assignment !== undefined && level !== undefined
      ? (live: SceneObject) => assignment.get(live.instanceId) === level
      : undefined;
    gatherStaticMembers(objects, (id) => {
      const object = ctx.scene.object.get(id);
      return object !== null && object.catalogId === batch.objects[0]!.catalogId &&
        isCompatibleStaticObject(object, batch.model, ctx.scene.object.catalog(id)) ? object : null;
    }, visibility.current, accept, members.current);
  }, CAMERA_POST_FRAME_PRIORITY + 0.15);
  return members;
}

function ObjectSource({ source, members, capacity }: {
  source: ScatterModelSource;
  members: { current: readonly SceneObject[] };
  capacity: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const attach = useCallback((mesh: THREE.InstancedMesh | null) => {
    ref.current = mesh;
    if (mesh !== null) freezeStaticTransforms(mesh);
  }, []);
  useEffect(() => {
    const mesh = ref.current;
    return () => { mesh?.dispose(); };
  }, [capacity, source]);
  useFrame(() => {
    if (ref.current !== null) syncStaticObjectSource(ref.current, source, members.current, scratch);
  }, CAMERA_POST_FRAME_PRIORITY + 0.2);
  return <instancedMesh ref={attach} args={[source.geometry, source.material, capacity]} userData={{ [STATIC_BATCH_MESH_KEY]: true }} castShadow={source.castShadow} receiveShadow={source.receiveShadow} dispose={null} />;
}

/** Bounds and collision triangles of one harvested model, measured once however often its batch re-renders. */
const sourceMeasures = new WeakMap<object, { bounds: ReturnType<typeof measureLocalBounds>; triangles: ReturnType<typeof measureLocalCollisionTriangles> }>();

function reportSourceMeasures(ctx: ReturnType<typeof useGameContext>, harvested: { sources: readonly ScatterModelSource[] }, batch: StaticObjectBatch): void {
  let measured = sourceMeasures.get(harvested);
  if (measured === undefined) {
    const root = new THREE.Group();
    for (const source of harvested.sources) {
      const mesh = new THREE.Mesh(source.geometry, source.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.localMatrix);
      root.add(mesh);
    }
    measured = { bounds: measureLocalBounds(root), triangles: measureLocalCollisionTriangles(root) };
    sourceMeasures.set(harvested, measured);
  }
  const key = batch.objects[0]!.catalogId;
  if (measured.bounds !== null) {
    recordRenderBounds(ctx, "object", key, measured.bounds);
    // Index dims keep priority for colliders; culling always uses what was really mounted.
    if (batch.model.dims?.maxY === undefined) reportMeasuredBounds(ctx, "object", key, measured.bounds);
  }
  if (measured.triangles !== null) reportMeasuredCollisionMesh(ctx, "object", key, measured.triangles);
}

function LoadedStaticObjects({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  const ctx = useGameContext();
  const { objects, excluded } = useBatchMembers(batch);
  const pieces = useMemo(() => staticModelPieces(batch.model), [batch.model]);
  const gltfs = useLoader(sharedGltfLoader, pieces.map((piece) => piece.model.url));
  const harvested = useMemo(() => harvestStaticPieces(pieces, gltfs), [pieces, gltfs]);
  useEffect(() => () => { if (harvested !== null) for (const root of harvested.roots) disposeScatterModelSources(root); }, [harvested]);
  useEffect(() => {
    if (harvested === null) return;
    reportSourceMeasures(ctx, harvested, batch);
  }, [ctx, harvested, batch]);
  const radius = useMemo(() => harvested === null ? 0 : sourceRadius(harvested.sources), [harvested]);
  const members = useStaticMembers(batch, objects, undefined, undefined, harvested !== null && radius < IMPOSTOR_MIN_RADIUS);
  if (harvested === null) return <>{batch.objects.map(single)}</>;
  if (radius >= IMPOSTOR_MIN_RADIUS && objects.length > 0) {
    return <>
      <ImpostorStaticObjects batch={batch} objects={objects} sources={harvested.sources} radius={radius} />
      {excluded.map((id) => { const live = ctx.scene.object.get(id); return live === null ? null : single(live); })}
    </>;
  }
  return <>
    {harvested.sources.map((source, index) => objects.length === 0 ? null : <ObjectSource key={index} source={source} members={members} capacity={objects.length} />)}
    {excluded.map((id) => { const live = ctx.scene.object.get(id); return live === null ? null : single(live); })}
  </>;
}

const IMPOSTOR_SPLIT_MOVE = 1;

/**
 * A batch of a model big enough to read from afar: near placements draw the real model, far ones
 * one impostor card each in a single instanced draw. The split reruns when the camera moves or a
 * placement does.
 */
function ImpostorStaticObjects({ batch, objects, sources, radius }: {
  batch: StaticObjectBatch;
  objects: readonly SceneObject[];
  sources: readonly ScatterModelSource[];
  radius: number;
}) {
  const ctx = useGameContext();
  const gl = useThree((state) => state.gl);
  const quality = useTerrainQuality();
  const settings = useMemo(() => impostorSettingsForQuality(quality), [quality]);
  const key = useMemo(() => `object:${batch.model.url}:${JSON.stringify(batch.model)}`, [batch.model]);
  const [entry, setEntry] = useState<ImpostorEntry | null>(null);
  useEffect(() => {
    setEntry(acquireImpostor(key, gl, sources, settings));
    return () => releaseImpostor(key, settings);
  }, [key, gl, sources, settings]);
  const scene = useThree((state) => state.scene);
  const visibility = useRenderVisibility();
  const [card, setCard] = useState<{ pool: ImpostorCardPool; slice: ImpostorCardSlice } | null>(null);
  useEffect(() => {
    if (entry?.atlas == null || entry.materials === null) return;
    const atlas = entry.atlas;
    const materials = entry.materials;
    const poolKey = `${key}:${settings.frames}x${settings.cell}`;
    const pool = acquireImpostorCardPool(poolKey, scene, () => new ImpostorCardPool(impostorCard(atlas), materials.material, materials.depth));
    const slice = pool.slice(objects.length);
    setCard({ pool, slice });
    return () => {
      pool.drop(slice);
      releaseImpostorCardPool(poolKey, pool);
      setCard(null);
    };
  }, [entry, key, settings, scene, objects.length]);
  const assignment = useMemo(() => new Map<string, number>(), []);
  const camera = useMemo(() => new THREE.Vector3(), []);
  const last = useRef<{ at: THREE.Vector3; version: number; card: unknown; objects: readonly SceneObject[] } | null>(null);
  useFrame((state) => {
    state.camera.getWorldPosition(camera);
    const version = ctx.scene.object.version();
    const previous = last.current;
    if (previous !== null && previous.card === card && previous.objects === objects && previous.version === version &&
      previous.at.distanceToSquared(camera) < IMPOSTOR_SPLIT_MOVE * IMPOSTOR_SPLIT_MOVE) return;
    for (const object of objects) {
      const live = ctx.scene.object.get(object.instanceId);
      if (live === null) continue;
      const scale = Math.max(...objectVisualScale(live.visual));
      const distance = camera.distanceTo(probe.fromArray(live.position));
      const far = card !== null && impostorSwitch(distance, impostorDistance(radius * scale, quality), assignment.get(live.instanceId) === 1);
      assignment.set(live.instanceId, far ? 1 : 0);
    }
    last.current = { at: (previous?.at ?? new THREE.Vector3()).copy(camera), version, card, objects };
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);
  useFrame(() => {
    if (card === null) return;
    const { slice } = card;
    let count = 0;
    for (const object of objects) {
      if (assignment.get(object.instanceId) !== 1) continue;
      const live = ctx.scene.object.get(object.instanceId);
      if (live === null || !visibility.current(live.instanceId)) continue;
      cardPose.position.fromArray(live.position);
      cardPose.rotation.set(0, live.rotationY, 0);
      cardPose.scale.fromArray(objectVisualScale(live.visual));
      cardPose.updateMatrix();
      slice.matrices.set(cardPose.matrix.elements, count * 16);
      slice.ids[count++] = live.instanceId;
    }
    slice.count = count;
    slice.ids.length = count;
  }, CAMERA_POST_FRAME_PRIORITY + 0.2);
  useFrame((state) => card?.pool.pack(state.clock.elapsedTime), CAMERA_POST_FRAME_PRIORITY + 0.3);
  const members = useStaticMembers(batch, objects, assignment, 0);
  return <>
    {sources.map((source, index) => <ObjectSource key={index} source={source} members={members} capacity={objects.length} />)}
  </>;
}

const probe = new THREE.Vector3();
const cardPose = new THREE.Object3D();

/** One detail level's GLB, harvested into instanced draws that only claim the instances the selector put on this level. */
function VariantLevel({ url, model, batch, objects, level, assignment, measure, single }: {
  url: string;
  model: ModelConfig;
  batch: StaticObjectBatch;
  objects: readonly SceneObject[];
  level: number;
  assignment: ReadonlyMap<string, number>;
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
    reportSourceMeasures(ctx, harvested, batch);
  }, [ctx, harvested, batch, measure]);
  const members = useStaticMembers(batch, objects, assignment, level);
  if (harvested === null) return <LevelSingles objects={objects} level={level} assignment={assignment} single={single} />;
  return <>{harvested.sources.map((source, index) => <ObjectSource key={index} source={source} members={members} capacity={objects.length} />)}</>;
}

/** Members of one level drawn through the individual renderer, for a level whose asset cannot be instanced. @internal */
export function LevelSingles({ objects, level, assignment, single }: {
  objects: readonly SceneObject[];
  level: number;
  assignment: ReadonlyMap<string, number>;
  single: (object: SceneObject) => ReactNode;
}) {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const [members, setMembers] = useState<readonly SceneObject[]>(objects);
  useFrame(() => {
    const next = objects.flatMap((object) => {
      const live = ctx.scene.object.get(object.instanceId);
      if (live === null || !visibility.current(live.instanceId)) return [];
      return assignment.get(live.instanceId) === level ? [live] : [];
    });
    if (next.length !== members.length || next.some((member, index) => member !== members[index])) setMembers(next);
  }, CAMERA_POST_FRAME_PRIORITY + 0.2);
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
  const variantSwitch = useMemo(() => variantSwitchOf(batch.model.variants!), [batch.model]);
  const gate = useMemo(() => createLevelPassGate(), []);
  const assignment = useMemo(() => new Map<string, number>(), []);
  const camera = useMemo(() => new THREE.Vector3(), []);
  const probe = useMemo(() => new THREE.Vector3(), []);
  // One model per level for the batch's life: a fresh object each render rebuilt every level's
  // instanced sources and re-measured its collision triangles on every membership change.
  const levelModels = useMemo(() => levels.map((_, index) => variantLevelModel(batch.model, index)), [batch.model, levels]);
  const members = useRef<readonly SceneObject[]>(objects);
  const revision = useRef(-1);
  const activeSelector = useRef(selector);
  useFrame((state) => {
    noteLevelPassFrame();
    state.camera.getWorldPosition(camera);
    const membership = members.current !== objects;
    const model = activeSelector.current !== selector;
    const moved = revision.current !== ctx.scene.object.version();
    if (!membership && !model && !moved && !gate.needsPass(camera)) {
      noteLevelPass(false);
      return;
    }
    if (membership || model) assignment.clear();
    const margin = assignVariantLevels(selector, variantSwitch, objects, ctx.scene.object.get, camera, assignment, probe);
    gate.record(camera, margin);
    members.current = objects;
    activeSelector.current = selector;
    revision.current = ctx.scene.object.version();
    noteLevelPass(true);
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);
  return <>
    {levels.map((level, index) => (
      <VariantLevel
        key={`${level.url}:${index}`}
        url={level.url}
        model={levelModels[index]!}
        batch={batch}
        objects={objects}
        level={index}
        assignment={assignment}
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
