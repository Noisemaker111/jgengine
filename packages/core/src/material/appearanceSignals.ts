import type { EnvironmentField, EnvironmentSample } from "../world/envField";
import type { MaterialSurfaceParameters } from "./materialAsset";

/** Resolved dry values from one assigned surface, after imported and instance edits. RGB is linear. */
export interface MaterialAppearanceBaseline {
  roughness: number;
  colorLinear: readonly [number, number, number];
  sheen?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

/** Opt-in wet endpoints. Color retention multiplies linear albedo; it never replaces the authored hue. */
export interface MaterialWetnessPolicy {
  influence?: number;
  roughness?: number;
  colorRetention?: number;
  sheen?: number;
  /** Requires an already physical material; omitting this preserves imported coat without enabling a new one. */
  clearcoat?: { strength: number; roughness?: number };
}

/** Local appearance only. Wind is a separate geometry/simulation input, and no field creates motion. */
export interface MaterialAppearancePolicy {
  wetness?: MaterialWetnessPolicy;
  /** Sky-exposure attenuation of existing hair-card backlighting; this is not a shadow or scattering model. */
  cardBacklightExposure?: boolean;
}

/** Sparse edits for one sample. Unrequested imported parameters, textures, coverage and transmission stay intact. */
export interface MaterialAppearanceResponse {
  surface: MaterialSurfaceParameters;
  colorLinear?: [number, number, number];
  backlightExposure?: number;
  wetness: number;
}

function unit(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${path}: expected a finite value from 0 to 1.`);
  return value;
}

function target(baseline: number | undefined, endpoint: number, wetness: number, path: string): number {
  if (baseline === undefined) throw new TypeError(`${path}: resolve the original physical material value before adapting it.`);
  const start = unit(baseline, `baseline.${path}`);
  const end = unit(endpoint, `policy.${path}`);
  return wetness === 0 ? start : wetness === 1 ? end : start + (end - start) * wetness;
}

/**
 * Resolve one surface from an immutable dry baseline, avoiding cumulative drift. Wetness already includes
 * field shelter; neither exposure nor sheltered is multiplied into it again. No accumulation or drying simulation.
 * @capability material-appearance-signals adapt selected surface response to sampled wetness and local card exposure
 */
export function resolveMaterialAppearance(sample: EnvironmentSample, baseline: MaterialAppearanceBaseline, policy: MaterialAppearancePolicy = {}): MaterialAppearanceResponse {
  const wet = policy.wetness;
  const wetness = unit(sample.wetness, "sample.wetness") * unit(wet?.influence ?? 1, "policy.wetness.influence");
  const result: MaterialAppearanceResponse = { surface: {}, wetness };
  if (wet?.roughness !== undefined) result.surface.roughness = target(baseline.roughness, wet.roughness, wetness, "roughness");
  if (wet?.colorRetention !== undefined) {
    const retention = 1 + (unit(wet.colorRetention, "policy.wetness.colorRetention") - 1) * wetness;
    if (baseline.colorLinear.some(value => !Number.isFinite(value) || value < 0)) throw new TypeError("baseline.colorLinear: expected finite nonnegative linear RGB.");
    result.colorLinear = baseline.colorLinear.map(value => value * retention) as [number, number, number];
  }
  if (wet?.sheen !== undefined) result.surface.sheen = target(baseline.sheen, wet.sheen, wetness, "sheen");
  if (wet?.clearcoat !== undefined) {
    result.surface.clearcoat = target(baseline.clearcoat, wet.clearcoat.strength, wetness, "clearcoat");
    if (wet.clearcoat.roughness !== undefined) result.surface.clearcoatRoughness = target(baseline.clearcoatRoughness, wet.clearcoat.roughness, wetness, "clearcoatRoughness");
  }
  if (policy.cardBacklightExposure) result.backlightExposure = unit(sample.lightExposure, "sample.lightExposure");
  return result;
}

/** Explicit sample position; callers schedule a bounded set of visible or relevant targets. */
export interface MaterialAppearanceTarget {
  x: number;
  z: number;
  y?: number;
  time: number;
}

/**
 * Exactly one field sample per target; no traversal, subscription, hidden tick, or full-world scan.
 * @capability material-appearance-signals sample one explicitly scheduled appearance target from the shared environment field
 */
export function sampleMaterialAppearance(field: Pick<EnvironmentField, "sample">, target: MaterialAppearanceTarget, baseline: MaterialAppearanceBaseline, policy: MaterialAppearancePolicy = {}): MaterialAppearanceResponse {
  return resolveMaterialAppearance(field.sample(target.x, target.z, target.time, target.y), baseline, policy);
}
