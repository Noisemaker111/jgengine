import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { staticDrawPoolFor, type PooledPlacement, type StaticDrawSlot } from "@jgengine/core/instancing/staticDrawPool.draw";
import { STATIC_POOL_CELL } from "@jgengine/core/instancing/staticObjectBatches.draw";
import { culledByDistance } from "@jgengine/core/visibility/distance";

import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { useModelMaterialTextures } from "@jgengine/core/material/materialAsset.draw";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import {
  buildScatterModelSources,
  disposeScatterModelSources,
  type ScatterModelSource,
} from "@jgengine/core/scatter/scatterModels.draw";
import {
  measureBuildingKitModel,
  type BuildingKitInstance,
} from "./buildingKitFit.draw";
import { useBuildingSurfaceTextures } from "./buildingSurface.draw";
import { groupBuildingKitInstances, buildBuildingKitSources, validateBuildingKitSource, type BuildingKitStyleGroup } from "./buildingKitMaterials.draw";
import { useBuildingChunkBudget, useBuildingRenderPolicy } from "./BuildingRenderBudget.draw";
import { partitionInstances, type InstanceChunk } from "@jgengine/core/instancing/instanceChunks.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";

function KitSourceInstances({
  source,
  material,
  matrices,
}: {
  source: ScatterModelSource;
  material: THREE.Material | THREE.Material[];
  matrices: readonly THREE.Matrix4[];
}) {
  const chunks = useMemo(
    () => partitionInstances(source.geometry, matrices, { localMatrix: source.localMatrix }),
    [source, matrices],
  );
  return <>{chunks.map((chunk) => <KitSourceChunk key={chunk.key} source={source} material={material} chunk={chunk} />)}</>;
}

/** One kit part instance as a shared-batch placement, with its world matrix. @internal */
export interface KitPlacement extends PooledPlacement {
  readonly index: number;
  readonly matrix: THREE.Matrix4;
}

/**
 * A chunk's instances in world space, for the shared static batches: `anchor` is the world matrix of
 * the group the chunk's matrices are relative to. `cell` is the batch cell its bounds centre falls in;
 * `sphere` is its world bounds, for the distance budget. @internal
 */
export function kitChunkPlacements(anchor: THREE.Matrix4, chunk: InstanceChunk): { members: KitPlacement[]; cell: string; sphere: THREE.Sphere } {
  const members = chunk.matrices.map((matrix, index) => ({ instanceId: "", index, matrix: new THREE.Matrix4().multiplyMatrices(anchor, matrix) }));
  const sphere = chunk.bounds.clone().applyMatrix4(anchor).getBoundingSphere(new THREE.Sphere());
  const cell = `${Math.floor(sphere.center.x / STATIC_POOL_CELL)},${Math.floor(sphere.center.z / STATIC_POOL_CELL)}`;
  return { members, cell, sphere };
}

const NO_PLACEMENTS: readonly KitPlacement[] = [];
const kitSlotOf = (member: KitPlacement): number => member.index;
const kitMatrixOf = (member: KitPlacement, out: THREE.Matrix4): THREE.Matrix4 => out.copy(member.matrix);

/**
 * A chunk joins the shared static batch for its material and cell, so every kit model and prop that
 * shares a material draws once per cell instead of once per model and chunk. A material the batches
 * cannot share (several on one mesh, see-through) keeps its own instanced draw.
 */
function KitSourceChunk({ source, material, chunk }: {
  source: ScatterModelSource;
  material: THREE.Material | THREE.Material[];
  chunk: InstanceChunk;
}) {
  const scene = useThree((state) => state.scene);
  const anchorRef = useRef<THREE.Group>(null);
  const [pooled, setPooled] = useState<{ slot: StaticDrawSlot; members: KitPlacement[]; sphere: THREE.Sphere } | null | undefined>(undefined);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return;
    anchor.updateWorldMatrix(true, false);
    const { members, cell, sphere } = kitChunkPlacements(anchor.matrixWorld, chunk);
    const slot = staticDrawPoolFor(scene).acquire({ geometry: source.geometry, material, castShadow: true, receiveShadow: true }, cell, members.length);
    slot?.place(members, kitSlotOf, kitMatrixOf);
    setPooled(slot === null ? null : { slot, members, sphere });
    return () => slot?.release();
  }, [scene, chunk, source, material]);
  return (
    <group ref={anchorRef}>
      {pooled === undefined ? null : pooled === null
        ? <InstancedKitChunk source={source} material={material} chunk={chunk} />
        : <PooledKitChunk slot={pooled.slot} members={pooled.members} sphere={pooled.sphere} />}
    </group>
  );
}

/** Shows a pooled chunk while the building distance budget keeps it, and hides it past that. */
function PooledKitChunk({ slot, members, sphere }: { slot: StaticDrawSlot; members: readonly KitPlacement[]; sphere: THREE.Sphere }) {
  const policy = useBuildingRenderPolicy();
  const state = useMemo(() => ({ eye: new THREE.Vector3(), shown: null as boolean | null }), [slot]);
  useFrame(({ camera }) => {
    camera.getWorldPosition(state.eye);
    const { center, radius } = sphere;
    const shown = !policy.enabled || !culledByDistance(state.eye.x, state.eye.y, state.eye.z, center.x, center.y, center.z,
      policy.minDistance, policy.maxDistance, radius, state.shown === true ? policy.hysteresis : 0);
    if (shown === state.shown) return;
    state.shown = shown;
    slot.sync(shown ? members : NO_PLACEMENTS, kitSlotOf, kitMatrixOf);
  }, CAMERA_POST_FRAME_PRIORITY);
  return null;
}

function InstancedKitChunk({ source, material, chunk }: {
  source: ScatterModelSource;
  material: THREE.Material | THREE.Material[];
  chunk: InstanceChunk;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useBuildingChunkBudget(meshRef, chunk.bounds);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    uploadInstances(mesh, chunk.matrices, { bounds: chunk.bounds });
    freezeStaticTransforms(mesh);
    // Release only this chunk's instance buffers; geometry and materials are shared.
    return () => {
      mesh.dispose();
    };
  }, [chunk, source, material]);
  return (
    <instancedMesh
      key={chunk.matrices.length}
      ref={meshRef}
      args={[source.geometry, material, chunk.matrices.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

/** Props for {@link BuildingKitBatch}: one resolved model URL and every kit instance bound to it. @internal */
export interface BuildingKitBatchProps {
  url: string;
  instances: readonly BuildingKitInstance[];
  materialAssets?: readonly MaterialAsset[] | undefined;
}

/**
 * GPU-instances one kit model across every building part bound to it: the GLB loads once, its meshes
 * are harvested into instanceable draw sources, and each part's slot box drives the fit scale. Suspends
 * while the GLB loads — mount it inside a `<Suspense>` so one slow model never blanks the rest.
 * @internal
 */
export function BuildingKitBatch({ url, instances, materialAssets }: BuildingKitBatchProps) {
  const gltf = useLoader(sharedGltfLoader, url);
  useMemo(() => {
    const checked = new Set<BuildingKitInstance["part"]>();
    for (const instance of instances) if (!checked.has(instance.part)) {
      validateBuildingKitSource(gltf.scene, instance.part, materialAssets);
      checked.add(instance.part);
    }
  }, [gltf, instances, materialAssets]);
  const { sources, root } = useMemo(() => buildScatterModelSources(gltf.scene, { url }), [gltf, url]);
  useEffect(() => () => disposeScatterModelSources(root), [root]);
  const bounds = useMemo(() => measureBuildingKitModel(root), [root]);

  const groups = useMemo(() => groupBuildingKitInstances(instances, bounds, materialAssets), [instances, bounds, materialAssets]);

  return (
    <>
      {groups.map((group) =>
        (group.part.tint ?? "") === "" && group.part.material === undefined && !group.part.materialAssignments?.length ? (
          sources.map((source, index) => (
            <KitSourceInstances key={`${group.key}:${index}`} source={source} material={source.material} matrices={group.matrices} />
          ))
        ) : (
          <StyledKitSources key={group.key} scene={gltf.scene} materialAssets={materialAssets} group={group} />
        ),
      )}
    </>
  );
}

function StyledKitSources({ scene, materialAssets, group }: { scene: THREE.Object3D; materialAssets?: readonly MaterialAsset[] | undefined; group: BuildingKitStyleGroup }) {
  useMemo(() => validateBuildingKitSource(scene, group.part, materialAssets), [scene, group.key]);
  const textures = useBuildingSurfaceTextures(group.part.material);
  const materialTextures = useModelMaterialTextures({ materialAssets, materialAssignments: group.part.materialAssignments });
  const { sources, root } = useMemo(
    () => buildBuildingKitSources(scene, group.part, materialAssets, textures, materialTextures.assets),
    [scene, group.key, textures, materialTextures],
  );
  useEffect(() => () => disposeScatterModelSources(root), [root]);
  return (
    <>
      {sources.map((source, index) => (
        <KitSourceInstances key={index} source={source} material={source.material} matrices={group.matrices} />
      ))}
    </>
  );
}
