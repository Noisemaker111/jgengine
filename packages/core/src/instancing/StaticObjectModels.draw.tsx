// @skill jgengine-world
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector } from "@jgengine/core/lod/modelLod";
import { devtools } from "@jgengine/core/devtools/devtools";
import { sceneProbeReading } from "@jgengine/core/devtools/discover";
import { useGameContext } from "@jgengine/react/provider";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { useOverrideMapSets } from "@jgengine/core/material/materialAsset.draw";
import { IsolatedModelPart } from "@jgengine/core/model/SceneModels.draw";
import { variantLevelModel } from "@jgengine/core/lod/singleVariantLod.draw";
import { assignVariantLevels, createLevelPassGate, levelPassProbe, noteLevelPass, noteLevelPassFrame, variantSwitchOf } from "@jgengine/core/lod/levelPass.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { measureLocalBounds, reportMeasuredBounds } from "@jgengine/core/model/measureBounds.draw";
import { recordRenderBounds } from "@jgengine/core/visibility/measuredBounds";
import { measureLocalCollisionTriangles, reportMeasuredCollisionMesh } from "@jgengine/core/model/measureCollisionMesh.draw";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";
import { useRenderVisibility } from "@jgengine/core/visibility/CullingProvider.draw";
import { acquireImpostor, createImpostorMaterials, IMPOSTOR_MIN_RADIUS, impostorCard, impostorDistance, impostorSettingsForQuality, impostorSwitch, releaseImpostor, sourceRadius, type ImpostorAtlas, type ImpostorEntry } from "@jgengine/core/lod/impostor.draw";
import { acquireImpostorCardPool, ImpostorCardPool, releaseImpostorCardPool, type ImpostorCardSlice } from "@jgengine/core/lod/impostorCardPool.draw";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { useSharedFrame } from "@jgengine/core/render/useSharedFrame.draw";
import { staticDrawPoolFor, type ProxyRole, type StaticDrawSlot } from "./staticDrawPool.draw";
import { builtLevelSource, reskinBuiltLevel, useBakedImpostor, WithBuiltLods } from "@jgengine/core/lod/builtLods.draw";
import { IMPOSTOR_LEVEL_URL, type BuiltLodMeta } from "@jgengine/core/lod/builtLods";
import type { HlodConfig } from "@jgengine/core/visibility/config";
import { blendsSource, canInstanceStaticScene, countStaticBatchDraws, staticBatchCell, gatherStaticMembers, harvestStaticPieces, incompatibleStaticObjectIds, isCompatibleStaticObject, sortFarToNear, STATIC_BATCH_MESH_KEY, staticModelPieces, syncStaticObjectSource, type StaticObjectBatch } from "./staticObjectBatches.draw";

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
  useEffect(() => {
    const drawCounts = sceneProbeReading(() => countStaticBatchDraws(scene));
    return devtools.probes.registerSystem("render/staticBatches", {
      counters: () => ({ ...ref.current, ...drawCounts() }),
      state: () => {
        const { draws, drawn } = drawCounts();
        return `${ref.current.batches} batches · ${draws} draws · ${drawn}/${ref.current.instances} instances drawn`;
      },
    });
  }, [scene]);
  useEffect(() => devtools.probes.registerSystem("render/levelPass", levelPassProbe()), []);
}

/**
 * Which detail level each placement draws at. `revision` moves on every change, so a level's members
 * are gathered again only after the switch moved one of them.
 * @internal
 */
export class LevelAssignment extends Map<string, number> {
  revision = 0;

  override set(id: string, level: number): this {
    if (super.get(id) !== level) this.revision += 1;
    return super.set(id, level);
  }

  override delete(id: string): boolean {
    const had = super.delete(id);
    if (had) this.revision += 1;
    return had;
  }

  override clear(): void {
    if (this.size > 0) this.revision += 1;
    super.clear();
  }
}

/** A batch's members this frame, and how many times they have been gathered. */
interface StaticMembers {
  current: SceneObject[];
  version: number;
}

/**
 * Whether any placed object changed since this hook's owner last asked: `take()` answers and resets.
 * True on the first frame. Static batches check their members only then, not every frame, so a still
 * world costs them nothing however many props it holds.
 */
function useObjectChanges(): { take(): boolean; mark(): void } {
  const ctx = useGameContext();
  const flag = useMemo(() => {
    let dirty = true;
    return { mark: () => { dirty = true; }, take: () => { const was = dirty; dirty = false; return was; } };
  }, []);
  useEffect(() => {
    flag.mark();
    return ctx.scene.object.subscribe(flag.mark);
  }, [ctx, flag]);
  return flag;
}

/** Live members of one batch after the per-frame compatibility gate removed any that changed at runtime. */
function useBatchMembers(batch: StaticObjectBatch): { objects: readonly SceneObject[]; excluded: readonly string[] } {
  const ctx = useGameContext();
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const fallbackObjects = useRef(new Map<string, SceneObject>());
  const changed = useObjectChanges();
  useEffect(() => changed.mark(), [batch, changed]);
  useSharedFrame(() => {
    if (!changed.take()) return;
    const next = incompatibleStaticObjectIds(batch, ctx.scene.object.get, ctx.scene.object.catalog, excluded, fallbackObjects.current);
    if (next !== excluded) setExcluded(next);
  });
  const objects = useMemo(() => batch.objects.filter((object) => !excluded.includes(object.instanceId)), [batch, excluded]);
  return { objects, excluded };
}

/**
 * The members one batch (or one detail level of it) draws this frame, gathered once before its
 * sources write their instances. `level` narrows them to the placements `assignment` put on it.
 * Gathered again only when an object, the visible set or these inputs changed; `version` counts the
 * gathers, so a source rewrites its instances only after one.
 */
function useStaticMembers(batch: StaticObjectBatch, objects: readonly SceneObject[], assignment?: LevelAssignment, level?: number, drawn = true): StaticMembers {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const members = useMemo((): StaticMembers => ({ current: [], version: 0 }), []);
  const changed = useObjectChanges();
  const gathered = useRef<{ visible: unknown; objects: unknown; assignment: unknown; revision: number; level: unknown }>({ visible: null, objects: null, assignment: null, revision: -1, level: null });
  useSharedFrame(() => {
    const last = gathered.current;
    const objectsChanged = changed.take();
    const revision = assignment?.revision ?? 0;
    if (!objectsChanged && last.visible === visibility.current && last.objects === objects && last.assignment === assignment && last.revision === revision && last.level === level) return;
    gathered.current = { visible: visibility.current, objects, assignment, revision, level };
    members.version += 1;
    const accept = assignment !== undefined && level !== undefined
      ? (live: SceneObject) => assignment.get(live.instanceId) === level
      : undefined;
    gatherStaticMembers(objects, (id) => {
      const object = ctx.scene.object.get(id);
      return object !== null && object.catalogId === batch.objects[0]!.catalogId &&
        isCompatibleStaticObject(object, batch.model, ctx.scene.object.catalog(id)) ? object : null;
    }, visibility.current, accept, members.current);
  }, CAMERA_POST_FRAME_PRIORITY + 0.15, drawn);
  return members;
}

function ObjectSource({ source, members, objects, proxy = "part" }: {
  source: ScatterModelSource;
  members: StaticMembers;
  objects: readonly SceneObject[];
  proxy?: ProxyRole;
}) {
  const scene = useThree((state) => state.scene);
  const [slot, setSlot] = useState<StaticDrawSlot | null | undefined>(undefined);
  const cell = staticBatchCell(objects);
  const capacity = objects.length;
  useLayoutEffect(() => {
    const acquired = staticDrawPoolFor(scene).acquire(source, cell, capacity, proxy);
    setSlot(acquired);
    return () => acquired?.release();
  }, [scene, source, cell, capacity, proxy]);
  if (slot === undefined) return null;
  return slot === null
    ? <InstancedObjectSource source={source} members={members} capacity={capacity} />
    : <PooledObjectSource slot={slot} source={source} members={members} objects={objects} />;
}

/** What a pooled source last placed: its slot, its objects, and each one's record as it was. @internal */
export interface SourcePlacement<Slot> {
  slot: Slot;
  objects: readonly SceneObject[];
  records: readonly (SceneObject | null)[];
}

/**
 * Whether a pooled source must place its instances again: a new slot or object list, or a record of
 * one of its own objects replaced. The store replaces a record when its object moves, turns or leaves,
 * so a world change that touched none of this source's objects costs it a compare, not a re-place.
 * @internal
 */
export function placementStale<Slot>(last: SourcePlacement<Slot> | null, slot: Slot, objects: readonly SceneObject[], get: (instanceId: string) => SceneObject | null): boolean {
  return last === null || last.slot !== slot || last.objects !== objects || objects.some((object, index) => get(object.instanceId) !== last.records[index]);
}

/** A source whose material a pool batch shares: its placements are instances of that batch. */
function PooledObjectSource({ slot, source, members, objects }: {
  slot: StaticDrawSlot;
  source: ScatterModelSource;
  members: StaticMembers;
  objects: readonly SceneObject[];
}) {
  const indexOf = useMemo(() => new Map(objects.map((object, index) => [object.instanceId, index])), [objects]);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const slotOf = useCallback((live: SceneObject) => indexOf.get(live.instanceId), [indexOf]);
  const matrixOf = useCallback((live: SceneObject, out: THREE.Matrix4) => {
    scratch.position.fromArray(live.position);
    scratch.rotation.set(0, live.rotationY, 0);
    scratch.scale.fromArray(objectVisualScale(live.visual));
    scratch.updateMatrix();
    return out.multiplyMatrices(scratch.matrix, source.localMatrix);
  }, [scratch, source]);
  const ctx = useGameContext();
  const placed = useRef<SourcePlacement<StaticDrawSlot> | null>(null);
  const checkedVersion = useRef(-1);
  const syncedAt = useRef<{ slot: StaticDrawSlot; members: number; placed: unknown; slotOf: unknown } | null>(null);
  const live = useMemo((): SceneObject[] => [], []);
  useSharedFrame(() => {
    const version = ctx.scene.object.version();
    const last = placed.current;
    if (last === null || last.slot !== slot || last.objects !== objects || checkedVersion.current !== version) {
      checkedVersion.current = version;
      if (placementStale(last, slot, objects, ctx.scene.object.get)) {
        const records = objects.map((object) => ctx.scene.object.get(object.instanceId));
        live.length = 0;
        for (const record of records) if (record !== null) live.push(record);
        placed.current = { slot, objects, records };
        slot.place(live, slotOf, matrixOf);
      }
    }
    // The shown instances follow the members alone: written again only after they were gathered again.
    const synced = syncedAt.current;
    if (synced?.slot === slot && synced.members === members.version && synced.placed === placed.current && synced.slotOf === slotOf) return;
    syncedAt.current = { slot, members: members.version, placed: placed.current, slotOf };
    slot.sync(members.current, slotOf, matrixOf);
  }, CAMERA_POST_FRAME_PRIORITY + 0.2);
  return null;
}

/** A source drawn on its own: one instanced draw holding this batch's placements. */
function InstancedObjectSource({ source, members, capacity }: {
  source: ScatterModelSource;
  members: StaticMembers;
  capacity: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const blends = useMemo(() => blendsSource(source), [source]);
  const eye = useMemo(() => new THREE.Vector3(), []);
  const ordered = useMemo((): SceneObject[] => [], []);
  const attach = useCallback((mesh: THREE.InstancedMesh | null) => {
    ref.current = mesh;
    if (mesh !== null) freezeStaticTransforms(mesh);
  }, []);
  useEffect(() => {
    const mesh = ref.current;
    return () => { mesh?.dispose(); };
  }, [capacity, source]);
  const syncedAt = useRef<{ mesh: THREE.InstancedMesh | null; members: number }>({ mesh: null, members: -1 });
  useSharedFrame((state) => {
    const mesh = ref.current;
    if (mesh === null) return;
    // An opaque source's instances follow the members alone; a see-through one re-sorts as the camera moves.
    const synced = syncedAt.current;
    if (!blends && synced.mesh === mesh && synced.members === members.version) return;
    synced.mesh = mesh;
    synced.members = members.version;
    const drawn = blends ? sortFarToNear(members.current, state.camera.getWorldPosition(eye), ordered) : members.current;
    syncStaticObjectSource(mesh, source, drawn, scratch);
  }, CAMERA_POST_FRAME_PRIORITY + 0.2);
  return <instancedMesh ref={attach} args={[source.geometry, source.material, capacity]} userData={{ [STATIC_BATCH_MESH_KEY]: true }} castShadow={source.castShadow ?? false} receiveShadow={source.receiveShadow ?? false} dispose={null} />;
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
  const maps = useOverrideMapSets(useMemo(() => pieces.map((piece) => piece.model), [pieces]));
  const harvested = useMemo(() => harvestStaticPieces(pieces, gltfs, maps), [pieces, gltfs, maps]);
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
    {harvested.sources.map((source, index) => objects.length === 0 ? null : <ObjectSource key={index} source={source} members={members} objects={objects} />)}
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
    return () => releaseImpostor(key, gl, settings);
  }, [key, gl, sources, settings]);
  const assignment = useMemo(() => new LevelAssignment(), []);
  const camera = useMemo(() => new THREE.Vector3(), []);
  const ready = entry?.atlas != null && entry.materials !== null;
  const last = useRef<{ at: THREE.Vector3; version: number; ready: boolean; objects: readonly SceneObject[] } | null>(null);
  useSharedFrame((state) => {
    state.camera.getWorldPosition(camera);
    const version = ctx.scene.object.version();
    const previous = last.current;
    if (previous !== null && previous.ready === ready && previous.objects === objects && previous.version === version &&
      previous.at.distanceToSquared(camera) < IMPOSTOR_SPLIT_MOVE * IMPOSTOR_SPLIT_MOVE) return;
    for (const object of objects) {
      const live = ctx.scene.object.get(object.instanceId);
      if (live === null) continue;
      const scale = Math.max(...objectVisualScale(live.visual));
      const distance = camera.distanceTo(probe.fromArray(live.position));
      const far = ready && impostorSwitch(distance, impostorDistance(radius * scale, quality), assignment.get(live.instanceId) === 1);
      assignment.set(live.instanceId, far ? 1 : 0);
    }
    last.current = { at: (previous?.at ?? new THREE.Vector3()).copy(camera), version, ready, objects };
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);
  const members = useStaticMembers(batch, objects, assignment, 0);
  return <>
    {sources.map((source, index) => <ObjectSource key={index} source={source} members={members} objects={objects} proxy="own" />)}
    {entry?.atlas != null && entry.materials !== null && (
      <ImpostorCards poolKey={`${key}:${settings.frames}x${settings.cell}`} atlas={entry.atlas} materials={entry.materials} objects={objects} assignment={assignment} level={1} />
    )}
  </>;
}

/**
 * One instanced draw of impostor cards for the placements `assignment` put on `level`, sharing its
 * card pool with every batch of the same atlas. Placements in the visibility pass's culled set draw none.
 */
function ImpostorCards({ poolKey, atlas, materials, objects, assignment, level }: {
  poolKey: string;
  atlas: ImpostorAtlas;
  materials: { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial };
  objects: readonly SceneObject[];
  assignment: LevelAssignment;
  level: number;
}) {
  const ctx = useGameContext();
  const scene = useThree((state) => state.scene);
  const visibility = useRenderVisibility();
  const changed = useObjectChanges();
  const written = useRef<{ card: unknown; visible: unknown; revision: number; objects: unknown; level: number } | null>(null);
  const [card, setCard] = useState<{ pool: ImpostorCardPool; slice: ImpostorCardSlice } | null>(null);
  useEffect(() => {
    const pool = acquireImpostorCardPool(poolKey, scene, materials.material, () => new ImpostorCardPool(impostorCard(atlas), materials.material, materials.depth));
    const slice = pool.slice(objects.length);
    setCard({ pool, slice });
    return () => {
      pool.drop(slice);
      releaseImpostorCardPool(poolKey, pool);
      setCard(null);
    };
  }, [poolKey, atlas, materials, scene, objects.length]);
  useSharedFrame(() => {
    if (card === null) return;
    // The cards follow their placements, the visible set and the level switch alone: rewritten only after one moved.
    const objectsChanged = changed.take();
    const last = written.current;
    if (!objectsChanged && last !== null && last.card === card && last.visible === visibility.current && last.revision === assignment.revision &&
      last.objects === objects && last.level === level) return;
    written.current = { card, visible: visibility.current, revision: assignment.revision, objects, level };
    const { slice } = card;
    let count = 0;
    for (const object of objects) {
      if (assignment.get(object.instanceId) !== level) continue;
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
    slice.version += 1;
  }, CAMERA_POST_FRAME_PRIORITY + 0.2);
  useSharedFrame((state) => card?.pool.pack(state.clock.elapsedTime), CAMERA_POST_FRAME_PRIORITY + 0.3);
  return null;
}

const probe = new THREE.Vector3();
const cardPose = new THREE.Object3D();

/** One detail level's GLB, harvested into instanced draws that only claim the instances the selector put on this level. */
function VariantLevel({ url, model, batch, objects, level, assignment, measure, single, proxy }: {
  url: string;
  model: ModelConfig;
  batch: StaticObjectBatch;
  objects: readonly SceneObject[];
  level: number;
  assignment: LevelAssignment;
  measure: boolean;
  single: (object: SceneObject) => ReactNode;
  proxy: ProxyRole;
}) {
  const ctx = useGameContext();
  const built = builtLevelSource(url);
  const loaded = useLoader(sharedGltfLoader, built === null ? [url] : [url, built.source]);
  const [gltf, source] = loaded;
  const supported = useMemo(() => gltf !== undefined && canInstanceStaticScene(gltf.scene, gltf.animations), [gltf]);
  const [maps] = useOverrideMapSets(useMemo(() => [model], [model]));
  const harvested = useMemo(() => {
    if (!supported || gltf === undefined) return null;
    if (source !== undefined) reskinBuiltLevel(gltf.scene, source);
    return buildScatterModelSources(gltf.scene, model, built?.bounds, maps);
  }, [supported, gltf, source, model, built, maps]);
  useEffect(() => () => { if (harvested !== null) disposeScatterModelSources(harvested.root); }, [harvested]);
  useEffect(() => {
    if (harvested === null || !measure) return;
    reportSourceMeasures(ctx, harvested, batch);
  }, [ctx, harvested, batch, measure]);
  const members = useStaticMembers(batch, objects, assignment, level);
  if (harvested === null) return <LevelSingles objects={objects} level={level} assignment={assignment} single={single} />;
  return <>{harvested.sources.map((part, index) => <ObjectSource key={index} source={part} members={members} objects={objects} proxy={proxy} />)}</>;
}

/** The impostor level of a built model: one card per placement the selector put past its impostor distance. */
function VariantImpostorLevel({ model, meta, objects, level, assignment }: {
  model: ModelConfig;
  meta: BuiltLodMeta;
  objects: readonly SceneObject[];
  level: number;
  assignment: LevelAssignment;
}) {
  const atlas = useBakedImpostor(model, meta);
  const materials = useMemo(() => atlas === null ? null : createImpostorMaterials(atlas), [atlas]);
  useEffect(() => () => {
    materials?.material.dispose();
    materials?.depth.dispose();
  }, [materials]);
  if (atlas === null || materials === null) return null;
  return <ImpostorCards poolKey={`built:${model.url}:${JSON.stringify(model.targetHeight ?? null)}:${model.scale ?? 1}`} atlas={atlas} materials={materials} objects={objects} assignment={assignment} level={level} />;
}

/** Members of one level drawn through the individual renderer, for a level whose asset cannot be instanced. @internal */
export function LevelSingles({ objects, level, assignment, single }: {
  objects: readonly SceneObject[];
  level: number;
  assignment: LevelAssignment;
  single: (object: SceneObject) => ReactNode;
}) {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const [members, setMembers] = useState<readonly SceneObject[]>(objects);
  const changed = useObjectChanges();
  const gathered = useRef<{ visible: unknown; revision: number; objects: unknown; level: number } | null>(null);
  useSharedFrame(() => {
    const objectsChanged = changed.take();
    const last = gathered.current;
    if (!objectsChanged && last !== null && last.visible === visibility.current && last.revision === assignment.revision &&
      last.objects === objects && last.level === level) return;
    gathered.current = { visible: visibility.current, revision: assignment.revision, objects, level };
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
export function VariantStaticObjects({ batch, single, meta = null }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode; meta?: BuiltLodMeta | null }) {
  const ctx = useGameContext();
  const { objects, excluded } = useBatchMembers(batch);
  const levels = batch.model.variants!.levels;
  const selector = useMemo(() => createModelVariantSelector(batch.model.variants!), [batch.model]);
  const variantSwitch = useMemo(() => variantSwitchOf(batch.model.variants!), [batch.model]);
  const gate = useMemo(() => createLevelPassGate(), []);
  const assignment = useMemo(() => new LevelAssignment(), []);
  const camera = useMemo(() => new THREE.Vector3(), []);
  const probe = useMemo(() => new THREE.Vector3(), []);
  // One model per level for the batch's life: a fresh object each render rebuilt every level's
  // instanced sources and re-measured its collision triangles on every membership change.
  const levelModels = useMemo(() => levels.map((_, index) => variantLevelModel(batch.model, index)), [batch.model, levels]);
  const members = useRef<readonly SceneObject[]>(objects);
  const revision = useRef(-1);
  const activeSelector = useRef(selector);
  useSharedFrame((state) => {
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
  const impostor = levels[levels.length - 1]?.url === IMPOSTOR_LEVEL_URL;
  const coarsest = levels.length - (impostor ? 2 : 1);
  return <>
    {levels.map((level, index) => level.url === IMPOSTOR_LEVEL_URL
      ? meta === null ? null : <VariantImpostorLevel key={`impostor:${index}`} model={batch.model} meta={meta} objects={objects} level={index} assignment={assignment} />
      : (
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
          proxy={impostor ? "own" : index === coarsest ? "part" : "hidden"}
        />
      ))}
    {excluded.map((id) => { const live = ctx.scene.object.get(id); return live === null ? null : single(live); })}
  </>;
}

/**
 * Keeps the scene's static draw pool on the game's far-cell proxy settings and switches each cell
 * between its batches and its proxy as the camera moves.
 * @internal
 */
export function StaticDrawPoolDriver({ hlod }: { hlod: HlodConfig | undefined }) {
  const scene = useThree((state) => state.scene);
  const pool = staticDrawPoolFor(scene);
  const distance = hlod?.distance;
  const hysteresis = hlod?.hysteresis;
  const cluster = hlod?.cluster;
  useEffect(() => {
    pool.configure(distance === undefined || hysteresis === undefined || cluster === undefined ? null : { distance, hysteresis, cluster });
    return () => pool.configure(null);
  }, [pool, distance, hysteresis, cluster]);
  const eye = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    if (distance !== undefined) pool.update(state.camera.getWorldPosition(eye));
  }, CAMERA_POST_FRAME_PRIORITY + 0.18);
  return null;
}

/** Render compatible authored or `scenery` props as shared model draws, preserving unsupported models. Re-renders only when its batch or renderer changes. @internal */
export const StaticObjectModels = memo(function StaticObjectModels({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  return (
    <IsolatedModelPart model={batch.model} seam="object">
      <WithBuiltLods model={batch.model} impostors>
        {({ model, meta }) => <ResolvedStaticObjects batch={batch} model={model} meta={meta} single={single} />}
      </WithBuiltLods>
    </IsolatedModelPart>
  );
});

/** A batch drawn with the model its built levels resolved to; the batch keeps one identity per model. */
function ResolvedStaticObjects({ batch, model, meta, single }: {
  batch: StaticObjectBatch;
  model: ModelConfig;
  meta: BuiltLodMeta | null;
  single: (object: SceneObject) => ReactNode;
}) {
  const drawn = useMemo(() => model === batch.model ? batch : { ...batch, model }, [batch, model]);
  return drawn.model.variants === undefined
    ? <LoadedStaticObjects batch={drawn} single={single} />
    : <VariantStaticObjects batch={drawn} single={single} meta={meta} />;
}
