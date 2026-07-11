import * as THREE from "three";

import type { ModelMaterialOverride } from "@jgengine/core/game/playableGame";

export interface MaterialOverrideOptions {
  clone?: boolean;
}

export function applyMaterialOverride(
  root: THREE.Object3D,
  override: ModelMaterialOverride,
  options?: MaterialOverrideOptions,
): void {
  const clone = options?.clone !== false;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => overrideOne(material, override, clone))
      : overrideOne(mesh.material, override, clone);
  });
}

function overrideOne(
  material: THREE.Material,
  override: ModelMaterialOverride,
  clone: boolean,
): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  const target = clone ? material.clone() : material;
  if (override.color !== undefined) target.color.set(override.color);
  if (override.metalness !== undefined) target.metalness = override.metalness;
  if (override.roughness !== undefined) target.roughness = override.roughness;
  if (override.emissive !== undefined) target.emissive.set(override.emissive);
  if (override.emissiveIntensity !== undefined) target.emissiveIntensity = override.emissiveIntensity;
  return target;
}
