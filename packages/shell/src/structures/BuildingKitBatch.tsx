import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { useModelMaterialTextures } from "../render/materialAsset";
import { sharedGltfLoader } from "../render/modelLoad";
import {
  buildScatterModelSources,
  disposeScatterModelSources,
  type ScatterModelSource,
} from "../scatter/scatterModels";
import {
  measureBuildingKitModel,
  type BuildingKitInstance,
} from "./buildingKitFit";
import { useBuildingSurfaceTextures } from "./buildingSurface";
import { groupBuildingKitInstances, buildBuildingKitSources, validateBuildingKitSource, type BuildingKitStyleGroup } from "./buildingKitMaterials";
import { useBuildingChunkBudget } from "./BuildingRenderBudget";
import { applyBuildingChunk, partitionBuildingMatrices, type BuildingSpatialChunk } from "./buildingSpatialBatch";

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
    () => partitionBuildingMatrices(source.geometry, matrices, source.localMatrix),
    [source, matrices],
  );
  return <>{chunks.map((chunk) => <KitSourceChunk key={chunk.key} source={source} material={material} chunk={chunk} />)}</>;
}

function KitSourceChunk({ source, material, chunk }: {
  source: ScatterModelSource;
  material: THREE.Material | THREE.Material[];
  chunk: BuildingSpatialChunk;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useBuildingChunkBudget(meshRef, chunk.bounds);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    return applyBuildingChunk(mesh, chunk);
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
  materialAssets?: readonly MaterialAsset[];
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

function StyledKitSources({ scene, materialAssets, group }: { scene: THREE.Object3D; materialAssets?: readonly MaterialAsset[]; group: BuildingKitStyleGroup }) {
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
