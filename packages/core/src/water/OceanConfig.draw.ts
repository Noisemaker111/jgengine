import * as THREE from "three";

import { synthesizeWaves, type GerstnerWave, type WaterSurfaceConfig } from "@jgengine/core/water/waterSurface";

/** Waves the ocean shader draws; a longer {@link synthesizeWaves} set keeps its first six. */
export const MAX_OCEAN_WAVES = 6;

/** Ocean mesh quality tier; picks the sheet size and vertex resolution from {@link OCEAN_QUALITY_PRESETS}. */
export type OceanQualityPreset = "low" | "medium" | "high" | "ultra";

/** Ocean body colours: shallow and deep tones, crest and foam colour, opacity, fresnel and sun sparkle. */
export interface OceanColorConfig {
  shallow?: THREE.ColorRepresentation;
  deep?: THREE.ColorRepresentation;
  crest?: THREE.ColorRepresentation;
  foam?: THREE.ColorRepresentation;
  opacity?: number;
  fresnelStrength?: number;
  horizonBlend?: number;
  /** Water depth (m) at which the body color reaches the full `deep` tone. Default 2.6. */
  depthRange?: number;
  /** Sun-glint sparkle intensity, 0 disables. Default 0.35. */
  sparkle?: number;
  /**
   * How far you see into the water, in metres of depth: shallower than this the bed shows through,
   * deeper it takes the water's colour. Clear tropical shallows want 3 or more; murky water under 1. Default 1.2.
   */
  clarity?: number;
}

/** Where foam shows on the ocean: wave-crest threshold, softness, intensity, coverage and shoreline width. */
export interface OceanFoamConfig {
  crestThreshold?: number;
  softness?: number;
  intensity?: number;
  coverage?: number;
  /** Shoreline foam lick width (m of water depth it covers). Default 0.5. */
  shoreWidth?: number;
  /** Strength of the foam lines that roll in over the shallows toward the shore, 0 for none. Default 0.6. */
  shoreWaves?: number;
}

/** Authored ocean settings; every field is optional and {@link createOceanConfig} fills the rest. */
export interface OceanConfig {
  quality?: OceanQualityPreset;
  /** Ocean plane width in world units (X). When `depth` is omitted, also used for depth (square). */
  size?: number;
  /** Ocean plane depth in world units (Z). Defaults to `size` for a square sheet. */
  depth?: number;
  resolution?: number;
  /**
   * The sheet follows the camera and packs its vertices close to it, so near waves are smooth and
   * the sea runs to the far plane in every direction. `size` is then the sheet's full width around
   * the camera; the waves and the bed stay fixed to the world. Default false: a fixed sheet.
   */
  follow?: boolean;
  /**
   * Texels per side of the bed-height map the shader reads for depth colour, shore foam and wave
   * damping. Default about one per two metres of the bed's span, at most 256.
   */
  bedResolution?: number;
  timeScale?: number;
  /**
   * The wave model: the same {@link WaterSurfaceConfig} `waterSurface` reads, so a body floating on the
   * CPU surface rides the swell the shader draws. `level`/`levelAt` are ignored here; the mesh position
   * owns the height.
   */
  waves?: WaterSurfaceConfig;
  color?: OceanColorConfig;
  foam?: OceanFoamConfig;
}

/** {@link OceanColorConfig} with every field filled in. */
export interface ResolvedOceanColorConfig {
  shallow: THREE.ColorRepresentation;
  deep: THREE.ColorRepresentation;
  crest: THREE.ColorRepresentation;
  foam: THREE.ColorRepresentation;
  opacity: number;
  fresnelStrength: number;
  horizonBlend: number;
  depthRange: number;
  sparkle: number;
  clarity: number;
}

/** {@link OceanFoamConfig} with every field filled in. */
export interface ResolvedOceanFoamConfig {
  crestThreshold: number;
  softness: number;
  intensity: number;
  coverage: number;
  shoreWidth: number;
  shoreWaves: number;
}

/** {@link OceanConfig} with every field filled in, as the ocean material reads it. */
export interface ResolvedOceanConfig {
  quality: OceanQualityPreset;
  size: number;
  depth: number;
  resolution: number;
  follow: boolean;
  /** Bed-map texels per side; 0 lets the ocean pick from the bed's span. */
  bedResolution: number;
  choppiness: number;
  timeScale: number;
  color: ResolvedOceanColorConfig;
  foam: ResolvedOceanFoamConfig;
  waves: readonly GerstnerWave[];
}

/** Sheet size (world units) and vertex resolution for each {@link OceanQualityPreset}. */
export const OCEAN_QUALITY_PRESETS: Record<OceanQualityPreset, { size: number; resolution: number }> = {
  low: { size: 220, resolution: 80 },
  medium: { size: 360, resolution: 128 },
  high: { size: 520, resolution: 192 },
  ultra: { size: 720, resolution: 256 },
};

/** The ocean an empty {@link OceanConfig} resolves to: medium quality, teal shallows over deep blue. */
export const DEFAULT_OCEAN_CONFIG: ResolvedOceanConfig = {
  quality: "medium",
  size: OCEAN_QUALITY_PRESETS.medium.size,
  depth: OCEAN_QUALITY_PRESETS.medium.size,
  resolution: OCEAN_QUALITY_PRESETS.medium.resolution,
  follow: false,
  bedResolution: 0,
  choppiness: 1,
  timeScale: 1,
  color: {
    shallow: "#2dc5d3",
    deep: "#064468",
    crest: "#8be9ff",
    foam: "#f4fbff",
    opacity: 0.88,
    fresnelStrength: 0.7,
    horizonBlend: 0.38,
    depthRange: 2.6,
    sparkle: 0.35,
    clarity: 1.2,
  },
  foam: {
    crestThreshold: 0.64,
    softness: 0.22,
    intensity: 0.8,
    coverage: 0.45,
    shoreWidth: 0.5,
    shoreWaves: 0.6,
  },
  waves: synthesizeWaves(),
};

function finiteOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** @internal */
export function createOceanConfig(patch: OceanConfig = {}): ResolvedOceanConfig {
  const quality = patch.quality ?? DEFAULT_OCEAN_CONFIG.quality;
  const preset = OCEAN_QUALITY_PRESETS[quality];
  const size = Math.max(1, finiteOr(patch.size, preset.size));
  const depth = Math.max(1, finiteOr(patch.depth, size));
  const resolved: ResolvedOceanConfig = {
    quality,
    size,
    depth,
    resolution: Math.max(1, Math.floor(finiteOr(patch.resolution, preset.resolution))),
    follow: patch.follow ?? false,
    bedResolution: Math.max(0, Math.min(2048, Math.floor(finiteOr(patch.bedResolution, 0)))),
    choppiness: Math.max(0, finiteOr(patch.waves?.choppiness, DEFAULT_OCEAN_CONFIG.choppiness)),
    timeScale: finiteOr(patch.timeScale, DEFAULT_OCEAN_CONFIG.timeScale),
    color: {
      ...DEFAULT_OCEAN_CONFIG.color,
      ...patch.color,
      opacity: clamp(finiteOr(patch.color?.opacity, DEFAULT_OCEAN_CONFIG.color.opacity), 0, 1),
      fresnelStrength: Math.max(
        0,
        finiteOr(patch.color?.fresnelStrength, DEFAULT_OCEAN_CONFIG.color.fresnelStrength),
      ),
      horizonBlend: clamp(finiteOr(patch.color?.horizonBlend, DEFAULT_OCEAN_CONFIG.color.horizonBlend), 0, 1),
      depthRange: Math.max(0.05, finiteOr(patch.color?.depthRange, DEFAULT_OCEAN_CONFIG.color.depthRange)),
      sparkle: Math.max(0, finiteOr(patch.color?.sparkle, DEFAULT_OCEAN_CONFIG.color.sparkle)),
      clarity: Math.max(0.05, finiteOr(patch.color?.clarity, DEFAULT_OCEAN_CONFIG.color.clarity)),
    },
    foam: {
      ...DEFAULT_OCEAN_CONFIG.foam,
      ...patch.foam,
      crestThreshold: clamp(finiteOr(patch.foam?.crestThreshold, DEFAULT_OCEAN_CONFIG.foam.crestThreshold), 0, 1),
      softness: clamp(finiteOr(patch.foam?.softness, DEFAULT_OCEAN_CONFIG.foam.softness), 0.001, 1),
      intensity: Math.max(0, finiteOr(patch.foam?.intensity, DEFAULT_OCEAN_CONFIG.foam.intensity)),
      coverage: clamp(finiteOr(patch.foam?.coverage, DEFAULT_OCEAN_CONFIG.foam.coverage), 0, 1),
      shoreWidth: Math.max(0, finiteOr(patch.foam?.shoreWidth, DEFAULT_OCEAN_CONFIG.foam.shoreWidth)),
      shoreWaves: Math.max(0, finiteOr(patch.foam?.shoreWaves, DEFAULT_OCEAN_CONFIG.foam.shoreWaves)),
    },
    waves: synthesizeWaves(patch.waves).slice(0, MAX_OCEAN_WAVES),
  };

  return resolved;
}

/** @internal Shader uniforms for the resolved waves, padded to {@link MAX_OCEAN_WAVES} with still ones. */
export function buildOceanWaveUniforms(config: ResolvedOceanConfig): {
  directions: THREE.Vector2[];
  params: THREE.Vector4[];
} {
  const directions: THREE.Vector2[] = [];
  const params: THREE.Vector4[] = [];
  for (let index = 0; index < MAX_OCEAN_WAVES; index += 1) {
    const wave = config.waves[index];
    if (wave === undefined) {
      directions.push(new THREE.Vector2(1, 0));
      params.push(new THREE.Vector4(1, 0, 0, 0));
      continue;
    }
    const waveNumber = (Math.PI * 2) / wave.wavelength;
    directions.push(new THREE.Vector2(wave.direction[0], wave.direction[1]));
    params.push(new THREE.Vector4(waveNumber, wave.amplitude, wave.steepness, wave.speed * waveNumber));
  }
  return { directions, params };
}

/** Bed-map texels per side for a bed spanning `span` metres: the authored count, else about one per two metres, 16..256. @internal */
export function oceanBedResolution(config: Pick<ResolvedOceanConfig, "bedResolution">, span: number): number {
  if (config.bedResolution > 0) return config.bedResolution;
  return Math.max(16, Math.min(256, Math.round(span / 2)));
}
