import * as THREE from "three";

import type { ModelMaterialOverride, ModelRimLight } from "@jgengine/core/game/playableGame";

export interface MaterialOverrideOptions {
  clone?: boolean;
  /** Loaded PBR textures matching `ModelMaterialOverride.maps`' roles, applied onto each `MeshStandardMaterial` alongside the tint override. The caller (a React component, via `useTexture`) owns loading; this function never fetches a URL. */
  textures?: MaterialOverrideTextures;
}

/** Loaded PBR textures for `applyMaterialOverride`'s `textures` option — matches `ModelMaterialMaps`' roles. */
export interface MaterialOverrideTextures {
  color?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  ao?: THREE.Texture;
}

/** @internal */
export function applyMaterialOverride(
  root: THREE.Object3D,
  override: ModelMaterialOverride,
  options?: MaterialOverrideOptions,
): void {
  const clone = options?.clone !== false;
  const textures = options?.textures;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => overrideOne(material, override, clone, textures))
      : overrideOne(mesh.material, override, clone, textures);
  });
}

function overrideOne(
  material: THREE.Material,
  override: ModelMaterialOverride,
  clone: boolean,
  textures: MaterialOverrideTextures | undefined,
): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  const target = clone ? material.clone() : material;
  if (override.color !== undefined) target.color.set(override.color);
  if (override.metalness !== undefined) target.metalness = override.metalness;
  if (override.roughness !== undefined) target.roughness = override.roughness;
  if (override.emissive !== undefined) target.emissive.set(override.emissive);
  if (override.emissiveIntensity !== undefined) target.emissiveIntensity = override.emissiveIntensity;
  if (textures?.color !== undefined) target.map = textures.color;
  if (textures?.normal !== undefined) target.normalMap = textures.normal;
  if (textures?.roughness !== undefined) target.roughnessMap = textures.roughness;
  if (textures?.ao !== undefined) target.aoMap = textures.ao;
  if (textures !== undefined) target.needsUpdate = true;
  if (override.rim !== undefined) applyRimLight(target, override.rim);
  return target;
}

/**
 * Adds a fresnel rim term to a standard material's outgoing light. Patched through
 * `onBeforeCompile` rather than as a second pass so the rim shadows, fogs, and tonemaps with the
 * body it belongs to instead of floating in front of it.
 */
function applyRimLight(target: THREE.MeshStandardMaterial, rim: ModelRimLight): void {
  const color = new THREE.Color(rim.color ?? "#ffffff");
  const strength = rim.strength ?? 0.6;
  const power = rim.power ?? 2.5;
  if (strength <= 0) return;
  target.onBeforeCompile = (shader) => {
    shader.uniforms.uJgRimColor = { value: color };
    shader.uniforms.uJgRimStrength = { value: strength };
    shader.uniforms.uJgRimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uJgRimColor;
uniform float uJgRimStrength;
uniform float uJgRimPower;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float jgRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uJgRimPower);
outgoingLight += uJgRimColor * jgRim * uJgRimStrength;
#include <opaque_fragment>`,
      );
  };
  // Two materials differing only in rim tuning must not share a compiled program.
  target.customProgramCacheKey = () => `jgengine-rim-${rim.color ?? "#ffffff"}-${strength}-${power}`;
  target.needsUpdate = true;
}
