import { useEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

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

function tintOne(material: THREE.Material, color: THREE.Color): THREE.Material {
  const clone = material.clone();
  const tintable = clone as THREE.Material & { color?: THREE.Color };
  if (tintable.color !== undefined) tintable.color.copy(color);
  return clone;
}

function tintMaterial(material: THREE.Material | THREE.Material[], tint: string): THREE.Material | THREE.Material[] {
  const color = new THREE.Color(tint);
  return Array.isArray(material) ? material.map((entry) => tintOne(entry, color)) : tintOne(material, color);
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
    const byTint = new Map<string, THREE.Matrix4[]>();
    for (const instance of instances) {
      const matrix = composeBuildingKitMatrix(instance, bounds, new THREE.Matrix4());
      const tint = instance.part.tint ?? "";
      const bucket = byTint.get(tint);
      if (bucket === undefined) byTint.set(tint, [matrix]);
      else bucket.push(matrix);
    }
    return [...byTint.entries()];
  }, [instances, bounds]);

  const tinted = useMemo(() => {
    const map = new Map<string, (THREE.Material | THREE.Material[])[]>();
    for (const [tint] of groups) {
      if (tint === "") continue;
      map.set(
        tint,
        sources.map((source) => tintMaterial(source.material, tint)),
      );
    }
    return map;
  }, [groups, sources]);
  useEffect(() => () => tinted.forEach((list) => list.forEach(disposeMaterial)), [tinted]);

  return (
    <>
      {groups.map(([tint, matrices]) =>
        sources.map((source, index) => (
          <KitSourceInstances
            key={`${tint}:${index}`}
            source={source}
            material={tinted.get(tint)?.[index] ?? source.material}
            matrices={matrices}
          />
        )),
      )}
    </>
  );
}
