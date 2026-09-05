import { useEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

import type { BuildingSurfaceMaterial } from "@jgengine/core/world/buildings";

import type { MaterialOverrideTextures } from "../materialOverride";
import { sharedGltfLoader } from "../render/modelLoad";
import {
  buildScatterModelSources,
  disposeScatterModelSources,
  type ScatterModelSource,
} from "../scatter/scatterModels";
import {
  composeBuildingKitMatrix,
  measureBuildingKitModel,
  type BuildingKitInstance,
} from "./buildingKitFit";
import { applyBuildingSurface, surfaceKey, useBuildingSurfaceTextures } from "./buildingSurface";

function KitSourceInstances({
  source,
  material,
  matrices,
}: {
  source: ScatterModelSource;
  material: THREE.Material | THREE.Material[];
  matrices: readonly THREE.Matrix4[];
}) {
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
  return (
    <instancedMesh
      key={matrices.length}
      ref={meshRef}
      args={[source.geometry, material, matrices.length]}
      castShadow
      receiveShadow
    />
  );
}

function styleOne(
  material: THREE.Material,
  tint: THREE.Color | undefined,
  surface: BuildingSurfaceMaterial | undefined,
  textures: MaterialOverrideTextures | undefined,
): THREE.Material {
  const clone = material.clone();
  const tintable = clone as THREE.Material & { color?: THREE.Color };
  if (tint !== undefined && tintable.color !== undefined) tintable.color.copy(tint);
  if (surface !== undefined && (clone as THREE.MeshStandardMaterial).isMeshStandardMaterial === true) {
    applyBuildingSurface(clone as THREE.MeshStandardMaterial, surface, textures);
  }
  return clone;
}

function styleMaterial(
  material: THREE.Material | THREE.Material[],
  tint: string,
  surface: BuildingSurfaceMaterial | undefined,
  textures: MaterialOverrideTextures | undefined,
): THREE.Material | THREE.Material[] {
  const color = tint === "" ? undefined : new THREE.Color(tint);
  return Array.isArray(material)
    ? material.map((entry) => styleOne(entry, color, surface, textures))
    : styleOne(material, color, surface, textures);
}

/** Every instance of one model that shares a tint and surface, so they can share one styled material. */
interface KitStyleGroup {
  key: string;
  tint: string;
  surface: BuildingSurfaceMaterial | undefined;
  matrices: THREE.Matrix4[];
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) for (const entry of material) entry.dispose();
  else material.dispose();
}

/** Props for {@link BuildingKitBatch}: one resolved model URL and every kit instance bound to it. @internal */
export interface BuildingKitBatchProps {
  url: string;
  instances: readonly BuildingKitInstance[];
}

/**
 * GPU-instances one kit model across every building part bound to it: the GLB loads once, its meshes
 * are harvested into instanceable draw sources, and each part's slot box drives the fit scale. Suspends
 * while the GLB loads — mount it inside a `<Suspense>` so one slow model never blanks the rest.
 * @internal
 */
export function BuildingKitBatch({ url, instances }: BuildingKitBatchProps) {
  const gltf = useLoader(sharedGltfLoader, url);
  const { sources, root } = useMemo(() => buildScatterModelSources(gltf.scene, { url }), [gltf, url]);
  useEffect(() => () => disposeScatterModelSources(root), [root]);
  const bounds = useMemo(() => measureBuildingKitModel(root), [root]);

  const groups = useMemo(() => {
    const byKey = new Map<string, KitStyleGroup>();
    for (const instance of instances) {
      const matrix = composeBuildingKitMatrix(instance, bounds, new THREE.Matrix4());
      const tint = instance.part.tint ?? "";
      const surface = instance.part.material;
      const key = `${tint}|${surfaceKey(surface)}`;
      const bucket = byKey.get(key);
      if (bucket === undefined) byKey.set(key, { key, tint, surface, matrices: [matrix] });
      else bucket.matrices.push(matrix);
    }
    return [...byKey.values()];
  }, [instances, bounds]);

  return (
    <>
      {groups.map((group) =>
        group.tint === "" && group.surface === undefined ? (
          sources.map((source, index) => (
            <KitSourceInstances key={`${group.key}:${index}`} source={source} material={source.material} matrices={group.matrices} />
          ))
        ) : (
          <StyledKitSources key={group.key} sources={sources} group={group} />
        ),
      )}
    </>
  );
}

function StyledKitSources({ sources, group }: { sources: readonly ScatterModelSource[]; group: KitStyleGroup }) {
  const textures = useBuildingSurfaceTextures(group.surface);
  const styled = useMemo(
    () => sources.map((source) => styleMaterial(source.material, group.tint, group.surface, textures)),
    [sources, group.tint, group.surface, textures],
  );
  useEffect(() => () => styled.forEach(disposeMaterial), [styled]);
  return (
    <>
      {sources.map((source, index) => (
        <KitSourceInstances key={index} source={source} material={styled[index]!} matrices={group.matrices} />
      ))}
    </>
  );
}
