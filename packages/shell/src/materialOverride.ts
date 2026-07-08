import * as THREE from "three";

import type { ModelMaterialOverride } from "@jgengine/core/game/playableGame";

/**
 * Clones each `MeshStandardMaterial` under `root` and applies `override`'s
 * color/finish onto the clone, so shared GLTF-cache scenes are never mutated
 * in place (#151.3).
 */
export function applyMaterialOverride(root: THREE.Object3D, override: ModelMaterialOverride): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => overrideOne(material, override))
      : overrideOne(mesh.material, override);
  });
}

function overrideOne(material: THREE.Material, override: ModelMaterialOverride): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  const clone = material.clone();
  if (override.color !== undefined) clone.color.set(override.color);
  if (override.metalness !== undefined) clone.metalness = override.metalness;
  if (override.roughness !== undefined) clone.roughness = override.roughness;
  if (override.emissive !== undefined) clone.emissive.set(override.emissive);
  if (override.emissiveIntensity !== undefined) clone.emissiveIntensity = override.emissiveIntensity;
  return clone;
}
