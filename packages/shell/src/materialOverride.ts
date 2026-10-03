import * as THREE from "three";

import type { ModelMaterialOverride, ModelRimLight } from "@jgengine/core/game/playableGame";

export interface MaterialOverrideOptions {
  clone?: boolean;
  /** Loaded PBR textures matching `ModelMaterialOverride.maps`' roles, applied onto each standard or physical material alongside the tint override. The caller (a React component, via `useTexture`) owns loading; this function never fetches a URL. */
  textures?: MaterialOverrideTextures;
  /** Records material replacements for the caller's resource owner. */
  ownMaterial?: (material: THREE.Material) => void;
}

/** Loaded PBR textures for `applyMaterialOverride`'s `textures` option — matches `ModelMaterialMaps`' roles. */
export interface MaterialOverrideTextures {
  color?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  ao?: THREE.Texture;
  metalness?: THREE.Texture;
  emissive?: THREE.Texture;
  height?: THREE.Texture;
  alpha?: THREE.Texture;
  sheenColor?: THREE.Texture;
  sheenRoughness?: THREE.Texture;
  anisotropy?: THREE.Texture;
  clearcoat?: THREE.Texture;
  clearcoatRoughness?: THREE.Texture;
  clearcoatNormal?: THREE.Texture;
  specularIntensity?: THREE.Texture;
  specularColor?: THREE.Texture;
  transmission?: THREE.Texture;
  thickness?: THREE.Texture;
  iridescence?: THREE.Texture;
  iridescenceThickness?: THREE.Texture;
}

/** Physical texture roles mapped to the pinned Three renderer's native properties. @internal */
export const MATERIAL_TEXTURE_PROPERTIES = {
  color: "map", normal: "normalMap", roughness: "roughnessMap", ao: "aoMap", metalness: "metalnessMap", emissive: "emissiveMap", height: "displacementMap", alpha: "alphaMap",
  sheenColor: "sheenColorMap", sheenRoughness: "sheenRoughnessMap", anisotropy: "anisotropyMap", clearcoat: "clearcoatMap", clearcoatRoughness: "clearcoatRoughnessMap", clearcoatNormal: "clearcoatNormalMap", specularIntensity: "specularIntensityMap", specularColor: "specularColorMap", transmission: "transmissionMap", thickness: "thicknessMap", iridescence: "iridescenceMap", iridescenceThickness: "iridescenceThicknessMap",
} as const;

const physicalNumbers = ["sheen", "sheenRoughness", "anisotropy", "anisotropyRotation", "clearcoat", "clearcoatRoughness", "ior", "specularIntensity", "transmission", "thickness", "attenuationDistance", "iridescence", "iridescenceIOR"] as const;
const physicalColors = ["sheenColor", "specularColor", "attenuationColor"] as const;

/** Whether authored settings require a physical shader; ordinary PBR stays standard. @internal */
export function requiresPhysicalMaterial(override: ModelMaterialOverride, textures?: MaterialOverrideTextures): boolean {
  return [...physicalNumbers, ...physicalColors, "iridescenceThicknessRange" as const].some(key => override[key] !== undefined) || Object.keys(textures ?? {}).some(key => ["sheenColor", "sheenRoughness", "anisotropy", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "specularIntensity", "specularColor", "transmission", "thickness", "iridescence", "iridescenceThickness"].includes(key));
}

/** @internal */
export function applyMaterialOverride(
  root: THREE.Object3D,
  override: ModelMaterialOverride,
  options?: MaterialOverrideOptions,
): void {
  const clone = options?.clone !== false;
  const textures = options?.textures;
  const applied = new Map<THREE.Material, THREE.Material>();
  const apply = (material: THREE.Material) => {
    const cached = applied.get(material);
    if (cached !== undefined) return cached;
    const target = applyMaterialOverrideToMaterial(material, override, clone, textures);
    applied.set(material, target);
    if (target !== material) options?.ownMaterial?.(target);
    return target;
  };
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
  });
}

/** Apply the shared override contract to one material. @internal */
export function applyMaterialOverrideToMaterial(
  material: THREE.Material,
  override: ModelMaterialOverride,
  clone: boolean,
  textures: MaterialOverrideTextures | undefined,
): THREE.Material {
  if (!isStandardOrPhysicalMaterial(material)) return material;
  const promote = requiresPhysicalMaterial(override, textures) && !(material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial;
  const target = promote ? new THREE.MeshPhysicalMaterial() : clone ? material.clone() : material;
  if (promote) THREE.MeshStandardMaterial.prototype.copy.call(target, material);
  if (clone || promote) {
    target.onBeforeCompile = material.onBeforeCompile;
    target.customProgramCacheKey = material.customProgramCacheKey;
  }
  if (override.color !== undefined) target.color.set(override.color);
  if (override.metalness !== undefined) target.metalness = override.metalness;
  if (override.roughness !== undefined) target.roughness = override.roughness;
  if (override.emissive !== undefined) target.emissive.set(override.emissive);
  if (override.emissiveIntensity !== undefined) target.emissiveIntensity = override.emissiveIntensity;
  if (override.normalScale !== undefined) target.normalScale.set(...override.normalScale);
  const physical = target as THREE.MeshPhysicalMaterial;
  for (const key of physicalNumbers) if (override[key] !== undefined) physical[key] = override[key]!;
  for (const key of physicalColors) if (override[key] !== undefined) physical[key].set(override[key]!);
  if (override.iridescenceThicknessRange !== undefined) physical.iridescenceThicknessRange = [...override.iridescenceThicknessRange];
  if (override.alphaMode !== undefined) {
    target.transparent = override.alphaMode === "blend";
    target.alphaTest = override.alphaMode === "mask" ? override.alphaCutoff ?? 0.5 : 0;
    target.depthWrite = override.alphaMode !== "blend";
  } else if (override.alphaCutoff !== undefined) target.alphaTest = override.alphaCutoff;
  if (override.opacity !== undefined) target.opacity = override.opacity;
  if (override.doubleSided !== undefined) target.side = override.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  for (const [role, texture] of Object.entries(textures ?? {})) {
    const property = MATERIAL_TEXTURE_PROPERTIES[role as keyof typeof MATERIAL_TEXTURE_PROPERTIES];
    if (property !== undefined) (target as unknown as Record<string, unknown>)[property] = texture;
  }
  if (textures !== undefined) target.needsUpdate = true;
  if (override.rim !== undefined) applyRimLight(target, override.rim);
  if (override.alphaMode !== undefined || override.doubleSided !== undefined) target.needsUpdate = true;
  return target;
}

function isStandardOrPhysicalMaterial(
  material: THREE.Material,
): material is THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
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
  const previousCompile = target.onBeforeCompile;
  const previousKey = target.customProgramCacheKey();
  target.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(target, shader, renderer);
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
  target.customProgramCacheKey = () => `${previousKey}|jgengine-rim-${rim.color ?? "#ffffff"}-${strength}-${power}`;
  target.needsUpdate = true;
}
