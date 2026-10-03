import * as THREE from "three";
import { resolveMaterialAppearance, type MaterialAppearanceBaseline, type MaterialAppearancePolicy, type MaterialAppearanceResponse } from "@jgengine/core/material/appearanceSignals";
import type { EnvironmentSample } from "@jgengine/core/world/envField";
import { setHairCardLightExposure } from "./materialAsset";

/** Immutable resolved baseline for one caller-owned assigned material, including its original card exposure. */
export interface RenderMaterialAppearanceBaseline extends MaterialAppearanceBaseline {
  cardBacklightExposure: number;
}

/**
 * Capture once after assignment; recapture after an authored change. Never capture an already wet material.
 * @capability material-appearance-signals capture immutable resolved dry values from one owned assigned material
 */
export function captureMaterialAppearanceBaseline(material: THREE.MeshStandardMaterial): RenderMaterialAppearanceBaseline {
  const physical = material as THREE.MeshPhysicalMaterial;
  return Object.freeze({
    roughness: material.roughness,
    colorLinear: Object.freeze([material.color.r, material.color.g, material.color.b]) as readonly [number, number, number],
    ...(physical.isMeshPhysicalMaterial ? { sheen: physical.sheen, clearcoat: physical.clearcoat, clearcoatRoughness: physical.clearcoatRoughness } : {}),
    cardBacklightExposure: (material.userData.jgHairLightExposure as number | undefined) ?? 1,
  });
}

/**
 * Apply one sample to an already owned material. Imported/cache materials must be cloned before use.
 * Allocates no textures or materials; clearcoat/sheen require an existing physical material and opt-in policy.
 * @capability material-appearance-signals update one owned material from wetness and local card exposure without global lighting edits
 */
export function applyMaterialAppearanceSignals(material: THREE.MeshStandardMaterial, baseline: MaterialAppearanceBaseline, sample: EnvironmentSample, policy: MaterialAppearancePolicy = {}): MaterialAppearanceResponse {
  if ((policy.wetness?.sheen !== undefined || policy.wetness?.clearcoat !== undefined) && !(material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) throw new TypeError("Wet sheen or clearcoat requires an owned MeshPhysicalMaterial; declare the capability when assigning it.");
  const response = resolveMaterialAppearance(sample, baseline, policy);
  const physical = material as THREE.MeshPhysicalMaterial;
  if (response.surface.roughness !== undefined) material.roughness = response.surface.roughness;
  if (response.colorLinear !== undefined) material.color.setRGB(...response.colorLinear, THREE.LinearSRGBColorSpace);
  if (response.surface.sheen !== undefined) physical.sheen = response.surface.sheen;
  if (response.surface.clearcoat !== undefined) physical.clearcoat = response.surface.clearcoat;
  if (response.surface.clearcoatRoughness !== undefined) physical.clearcoatRoughness = response.surface.clearcoatRoughness;
  if (response.backlightExposure !== undefined) setHairCardLightExposure(material, response.backlightExposure);
  return response;
}

/**
 * Restore the dry baseline when removing an appearance binding; maps and unrelated imported features remain borrowed.
 * @capability material-appearance-signals restore dry material response when removing an environment appearance binding
 */
export function restoreMaterialAppearanceBaseline(material: THREE.MeshStandardMaterial, baseline: RenderMaterialAppearanceBaseline): void {
  if ((baseline.sheen !== undefined || baseline.clearcoat !== undefined) && !(material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) throw new TypeError("The appearance baseline belongs to a physical material.");
  material.roughness = baseline.roughness;
  material.color.setRGB(...baseline.colorLinear, THREE.LinearSRGBColorSpace);
  const physical = material as THREE.MeshPhysicalMaterial;
  if (baseline.sheen !== undefined) physical.sheen = baseline.sheen;
  if (baseline.clearcoat !== undefined) physical.clearcoat = baseline.clearcoat;
  if (baseline.clearcoatRoughness !== undefined) physical.clearcoatRoughness = baseline.clearcoatRoughness;
  setHairCardLightExposure(material, baseline.cardBacklightExposure);
}
