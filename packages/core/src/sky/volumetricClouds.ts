/**
 * Volumetric cloud layer config for `sky()` — a raymarched cloud slab mounted from the environment
 * `sky` seam. Pure config + defaulting here; the raymarch shader lives in the `shell` renderer
 * (`environment/VolumetricClouds.tsx`), mounted alongside `SkyDome` whenever a sky descriptor carries
 * this field. Off by default — omit `volumetricClouds` on `sky({...})` and no layer mounts.
 *
 * @capability volumetric-clouds raymarched cloud layer sky option
 */

/** Volumetric cloud layer params, as authored on `sky({ volumetricClouds })`. All fields optional. */
export interface VolumetricCloudsConfig {
  /** Fraction of the sky covered by cloud mass, 0..1. Higher = more overcast. Default 0.42. */
  coverage?: number;
  /** Raymarch density multiplier — thicker, more opaque cloud bodies at higher values. Default 1.5. */
  density?: number;
  /** Cloud layer base altitude in world units. Default 90. */
  height?: number;
  /** Cloud layer vertical thickness in world units. Default 55. */
  thickness?: number;
  /** Horizontal drift speed, world units/second. Default 1.1. */
  speed?: number;
  /** Noise feature scale — world units per cloud puff; larger = bigger, fewer puffs. Default 140. */
  scale?: number;
  /** Cloud body base color (shadowed side). Default "#c9d3de". */
  color?: string;
  /** Sun-facing lit edge color (silver-lining / forward scatter). Default "#fff6e0". */
  sunColor?: string;
  /** Forward sun-scatter strength, 0..1 — brighter, more luminous edges toward the sun. Default 0.9. */
  sunScatter?: number;
  /** Seed string; same seed reproduces the same cloud layout. */
  seed?: string;
}

/** Fully-defaulted volumetric cloud params, resolved from a `VolumetricCloudsConfig`. */
export interface VolumetricCloudsRules {
  coverage: number;
  density: number;
  height: number;
  thickness: number;
  speed: number;
  scale: number;
  color: string;
  sunColor: string;
  sunScatter: number;
  seed: string;
}

/** Volumetric cloud defaults: a moderate, drifting cumulus layer. */
export const VOLUMETRIC_CLOUDS_DEFAULTS: VolumetricCloudsRules = {
  coverage: 0.42,
  density: 1.5,
  height: 90,
  thickness: 55,
  speed: 1.1,
  scale: 140,
  color: "#c9d3de",
  sunColor: "#fff6e0",
  sunScatter: 0.9,
  seed: "",
};

/**
 * Resolve a `VolumetricCloudsConfig` into fully-defaulted, clamped rules — pure, no shader/DOM
 * involved, so the defaulting logic is unit-testable without a renderer.
 * @internal
 */
export function resolveVolumetricClouds(config: VolumetricCloudsConfig = {}): VolumetricCloudsRules {
  return {
    coverage: clamp01(config.coverage ?? VOLUMETRIC_CLOUDS_DEFAULTS.coverage),
    density: Math.max(0, config.density ?? VOLUMETRIC_CLOUDS_DEFAULTS.density),
    height: config.height ?? VOLUMETRIC_CLOUDS_DEFAULTS.height,
    thickness: Math.max(1, config.thickness ?? VOLUMETRIC_CLOUDS_DEFAULTS.thickness),
    speed: config.speed ?? VOLUMETRIC_CLOUDS_DEFAULTS.speed,
    scale: Math.max(1, config.scale ?? VOLUMETRIC_CLOUDS_DEFAULTS.scale),
    color: config.color ?? VOLUMETRIC_CLOUDS_DEFAULTS.color,
    sunColor: config.sunColor ?? VOLUMETRIC_CLOUDS_DEFAULTS.sunColor,
    sunScatter: clamp01(config.sunScatter ?? VOLUMETRIC_CLOUDS_DEFAULTS.sunScatter),
    seed: config.seed ?? VOLUMETRIC_CLOUDS_DEFAULTS.seed,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
