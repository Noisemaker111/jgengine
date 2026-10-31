import { clamp01, lerp } from "../math/scalar";

/**
 * Volumetric cloud layer config for `sky()`: a raymarched cloud slab the sky mounts beside its dome
 * (`VolumetricClouds.draw.tsx`). The sky's light colours and shades it through the day, and the
 * weather's cloud cover thickens and greys it. Off by default: omit `volumetricClouds` on `sky({...})`
 * and no layer mounts.
 *
 * @capability volumetric-clouds raymarched cloud layer, lit by the day and thickened by the weather
 */

/** Volumetric cloud layer params, as authored on `sky({ volumetricClouds })`. All fields optional. */
export interface VolumetricCloudsConfig {
  /** Fraction of a clear sky covered by cloud, 0..1; the weather's cloud cover raises it. Default 0.42. */
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
  /** Distance in world units over which far cloud sinks into the horizon colour. Default 8 × `height`. */
  fade?: number;
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
  fade: number;
  color: string;
  sunColor: string;
  sunScatter: number;
  seed: string;
}

/** Volumetric cloud defaults: a moderate, drifting cumulus layer. */
export const VOLUMETRIC_CLOUDS_DEFAULTS: Omit<VolumetricCloudsRules, "fade"> = {
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
  const height = config.height ?? VOLUMETRIC_CLOUDS_DEFAULTS.height;
  return {
    coverage: clamp01(config.coverage ?? VOLUMETRIC_CLOUDS_DEFAULTS.coverage),
    density: Math.max(0, config.density ?? VOLUMETRIC_CLOUDS_DEFAULTS.density),
    height,
    thickness: Math.max(1, config.thickness ?? VOLUMETRIC_CLOUDS_DEFAULTS.thickness),
    speed: config.speed ?? VOLUMETRIC_CLOUDS_DEFAULTS.speed,
    scale: Math.max(1, config.scale ?? VOLUMETRIC_CLOUDS_DEFAULTS.scale),
    fade: Math.max(1, config.fade ?? Math.abs(height) * 8),
    color: config.color ?? VOLUMETRIC_CLOUDS_DEFAULTS.color,
    sunColor: config.sunColor ?? VOLUMETRIC_CLOUDS_DEFAULTS.sunColor,
    sunScatter: clamp01(config.sunScatter ?? VOLUMETRIC_CLOUDS_DEFAULTS.sunScatter),
    seed: config.seed ?? VOLUMETRIC_CLOUDS_DEFAULTS.seed,
  };
}

/** Edge length of the tileable cloud noise volume, in voxels. */
export const CLOUD_NOISE_SIZE = 32;

function latticeHash(x: number, y: number, z: number, period: number): number {
  const xi = ((x % period) + period) % period;
  const yi = ((y % period) + period) % period;
  const zi = ((z % period) + period) % period;
  let h = Math.imul(xi, 374761393) ^ Math.imul(yi, 668265263) ^ Math.imul(zi, 2147483647) ^ Math.imul(period, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function tiledValueNoise(x: number, y: number, z: number, period: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const fz = smooth(z - z0);
  const c = (dx: number, dy: number, dz: number) => latticeHash(x0 + dx, y0 + dy, z0 + dz, period);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

/**
 * A {@link CLOUD_NOISE_SIZE}³ volume of four-octave value noise that tiles on every axis, as bytes
 * (0..255), for the cloud shader to sample instead of hashing noise per step. Deterministic.
 * @internal
 */
export function cloudNoiseVolume(): Uint8Array {
  const size = CLOUD_NOISE_SIZE;
  const out = new Uint8Array(size * size * size);
  const octaves = [
    { period: 4, weight: 0.5 },
    { period: 8, weight: 0.27 },
    { period: 16, weight: 0.15 },
    { period: 32, weight: 0.08 },
  ];
  let index = 0;
  for (let z = 0; z < size; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let value = 0;
        for (const octave of octaves) {
          const scale = octave.period / size;
          value += octave.weight * tiledValueNoise(x * scale, y * scale, z * scale, octave.period);
        }
        out[index] = Math.round(Math.min(1, Math.max(0, value)) * 255);
        index += 1;
      }
    }
  }
  return out;
}
