import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { applyMaterialOverride } from "../materialOverride";
import { cloneModelScene, disposeClonedMaterials } from "../render/modelRender";

/** One instanceable draw source harvested from a resolved GLB — geometry stays shared with the loader cache, `localMatrix` bakes the model's own transform (from its scene root) plus scale/anchor normalization. */
export interface ScatterModelSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  localMatrix: THREE.Matrix4;
}

/** The scale + position offset a `ModelConfig` applies before any per-instance transform — same anchor/targetHeight rules as the single-instance entity renderer. */
function scatterModelBaseTransform(scene: THREE.Object3D, model: ModelConfig): THREE.Matrix4 {
  let scale = model.scale ?? 1;
  let minY = 0;
  let centerX = 0;
  let centerZ = 0;
  if (model.targetHeight !== undefined) {
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    if (Number.isFinite(height) && height > 0) {
      scale *= model.targetHeight / height;
      minY = box.min.y;
      centerX = (box.min.x + box.max.x) / 2;
      centerZ = (box.min.z + box.max.z) / 2;
    }
  } else if ((model.anchor ?? "center") === "center" && model.dims !== undefined) {
    minY = model.dims.minY;
    centerX = model.dims.center.x;
    centerZ = model.dims.center.z;
  }
  const baseY = model.y ?? 0;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(-scale * centerX, baseY - scale * minY, -scale * centerZ),
    new THREE.Quaternion(),
    new THREE.Vector3(scale, scale, scale),
  );
}

/**
 * Clones a loaded GLTF scene (so shared cache materials stay untouched), applies the model's material
 * override, then harvests every mesh as a {@link ScatterModelSource} — one `InstancedMesh` draw per
 * source, matrices composed per-instance at render time. Geometry is left unowned (still the loader
 * cache's), only the cloned materials need disposal via {@link disposeScatterModelSources}.
 * @internal — the GLB-harvesting behind `InstancedScatter`'s `resolveItem` override.
 */
export function buildScatterModelSources(
  gltfScene: THREE.Object3D,
  model: ModelConfig,
): { sources: ScatterModelSource[]; root: THREE.Object3D } {
  const root = cloneModelScene(gltfScene);
  if (model.material !== undefined) applyMaterialOverride(root, model.material, { clone: false });
  root.updateMatrixWorld(true);
  const base = scatterModelBaseTransform(root, model);
  const sources: ScatterModelSource[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    sources.push({
      geometry: mesh.geometry,
      material: mesh.material,
      localMatrix: base.clone().multiply(mesh.matrixWorld),
    });
  });
  return { sources, root };
}

/**
 * Disposes the cloned materials harvested by {@link buildScatterModelSources}; never disposes geometry
 * (still owned by the loader cache).
 * @internal
 */
export function disposeScatterModelSources(root: THREE.Object3D): void {
  disposeClonedMaterials(root);
}
