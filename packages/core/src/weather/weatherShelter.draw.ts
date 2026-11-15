import * as THREE from "three";
import { DEFAULT_WEATHER_BOUNDS_FADE } from "./weatherMath";
import type { EditorVolume } from "@jgengine/core/editor/types";

/** Cosmetic roof clipping is bounded independently of authoritative shelter queries. */
export const WEATHER_SHELTER_BUDGET = 32;

/** Reusable buffers for the nearest authored shelters submitted to weather shaders. */
export interface WeatherShelterUniforms {
  shelterCenters: THREE.IUniform<THREE.Vector4[]>;
  shelterShapes: THREE.IUniform<THREE.Vector4[]>;
  shelterCount: THREE.IUniform<number>;
  shelterIndices: Int32Array;
  shelterDistances: Float64Array;
}

/** @internal */
export function createWeatherShelterUniforms(): WeatherShelterUniforms {
  return {
    shelterCenters: { value: Array.from({ length: WEATHER_SHELTER_BUDGET }, () => new THREE.Vector4()) },
    shelterShapes: { value: Array.from({ length: WEATHER_SHELTER_BUDGET }, () => new THREE.Vector4()) },
    shelterCount: { value: 0 },
    shelterIndices: new Int32Array(WEATHER_SHELTER_BUDGET),
    shelterDistances: new Float64Array(WEATHER_SHELTER_BUDGET),
  };
}

/** @internal */
export function updateWeatherShelters(uniforms: WeatherShelterUniforms, shelters: readonly EditorVolume[], x: number, y: number, z: number): void {
  const indices = uniforms.shelterIndices;
  const distances = uniforms.shelterDistances;
  distances.fill(Infinity);
  indices.fill(-1);
  for (let index = 0; index < shelters.length; index += 1) {
    const shelter = shelters[index]!;
    if (shelter.kind !== "shelter") continue;
    const hx = shelter.shape === "box" ? shelter.halfExtents?.x ?? 0 : shelter.radius ?? 0;
    const hy = shelter.shape === "box" ? shelter.halfExtents?.y ?? 0 : shelter.shape === "sphere" ? shelter.radius ?? 0 : (shelter.height ?? 0) * 0.5;
    const hz = shelter.shape === "box" ? shelter.halfExtents?.z ?? 0 : shelter.radius ?? 0;
    const dx = Math.max(0, Math.abs(x - shelter.center.x) - hx);
    const dy = Math.max(0, Math.abs(y - shelter.center.y) - hy);
    const dz = Math.max(0, Math.abs(z - shelter.center.z) - hz);
    const distance = dx * dx + dy * dy + dz * dz;
    for (let slot = 0; slot < WEATHER_SHELTER_BUDGET; slot += 1) {
      if (distance >= distances[slot]!) continue;
      for (let move = WEATHER_SHELTER_BUDGET - 1; move > slot; move -= 1) { distances[move] = distances[move - 1]!; indices[move] = indices[move - 1]!; }
      distances[slot] = distance;
      indices[slot] = index;
      break;
    }
  }
  let count = 0;
  for (let slot = 0; slot < WEATHER_SHELTER_BUDGET; slot += 1) {
    const index = indices[slot]!;
    if (index < 0) break;
    const shelter = shelters[index]!;
    const center = shelter.center;
    uniforms.shelterCenters.value[slot]!.set(center.x, center.y, center.z, shelter.shape === "box" ? 0 : shelter.shape === "sphere" ? 1 : 2);
    const exposure = typeof shelter.meta?.["exposure"] === "number" ? Math.max(0, Math.min(1, shelter.meta["exposure"])) : 0;
    const extents = shelter.halfExtents;
    uniforms.shelterShapes.value[slot]!.set(shelter.shape === "box" ? extents?.x ?? 0 : shelter.radius ?? 0, shelter.shape === "box" ? extents?.y ?? 0 : (shelter.height ?? 0) * 0.5, shelter.shape === "box" ? extents?.z ?? 0 : 0, exposure);
    count += 1;
  }
  uniforms.shelterCount.value = count;
}

/** @internal */
export const WEATHER_SHELTER_SHADER = `
  uniform vec4 uShelterCenters[32];
  uniform vec4 uShelterShapes[32];
  uniform int uShelterCount;
  float weatherExposure(vec3 point) {
    float exposure = 1.0;
    for (int i = 0; i < 32; i++) {
      if (i >= uShelterCount) break;
      vec4 center = uShelterCenters[i];
      vec4 shape = uShelterShapes[i];
      vec3 delta = abs(point - center.xyz);
      bool inside = center.w < 0.5 ? all(lessThanEqual(delta, shape.xyz)) : center.w < 1.5 ? length(delta) <= shape.x : length(delta.xz) <= shape.x && delta.y <= shape.y;
      if (inside) exposure = min(exposure, shape.w);
    }
    return exposure;
  }
`;

/**
 * GLSL twin of `weatherBoundsCoverage`: `uBounds` is the field's world XZ rectangle
 * (minX, minZ, maxX, maxZ) and `uBoundsFade` its soft edge. An unbounded field passes a rectangle
 * far larger than any world.
 * @internal
 */
export const WEATHER_BOUNDS_SHADER = `
  uniform vec4 uBounds;
  uniform float uBoundsFade;
  float weatherBounds(vec3 point) {
    vec2 outside = max(max(uBounds.xy - point.xz, point.xz - uBounds.zw), vec2(0.0));
    float t = clamp(length(outside) / max(uBoundsFade, 0.001), 0.0, 1.0);
    return 1.0 - t * t * (3.0 - 2.0 * t);
  }
`;

/** The rectangle an unbounded field hands {@link WEATHER_BOUNDS_SHADER}. @internal */
export const WEATHER_UNBOUNDED = 1e7;

/** Writes a field's bounds (or the unbounded rectangle) into its shader uniforms. @internal */
export function writeWeatherBounds(
  rect: { value: THREE.Vector4 },
  fade: { value: number },
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number; fade?: number } | undefined,
): void {
  if (bounds === undefined) {
    rect.value.set(-WEATHER_UNBOUNDED, -WEATHER_UNBOUNDED, WEATHER_UNBOUNDED, WEATHER_UNBOUNDED);
    fade.value = 1;
    return;
  }
  rect.value.set(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
  fade.value = bounds.fade ?? DEFAULT_WEATHER_BOUNDS_FADE;
}
