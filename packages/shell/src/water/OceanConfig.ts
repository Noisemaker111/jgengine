import * as THREE from "three";

export const MAX_OCEAN_WAVES = 6;

export type OceanQualityPreset = "low" | "medium" | "high" | "ultra";

export interface OceanDirectionVector {
  x: number;
  z: number;
}

export type OceanWaveDirection = number | OceanDirectionVector;

export interface OceanWaveConfig {
  amplitude?: number;
  wavelength?: number;
  speed?: number;
  direction?: OceanWaveDirection;
  steepness?: number;
}

export interface OceanColorConfig {
  shallow?: THREE.ColorRepresentation;
  deep?: THREE.ColorRepresentation;
  crest?: THREE.ColorRepresentation;
  foam?: THREE.ColorRepresentation;
  opacity?: number;
  fresnelStrength?: number;
  horizonBlend?: number;
}

export interface OceanFoamConfig {
  crestThreshold?: number;
  softness?: number;
  intensity?: number;
  coverage?: number;
}

export interface OceanConfig {
  quality?: OceanQualityPreset;
  /** Ocean plane width in world units (X). When `depth` is omitted, also used for depth (square). */
  size?: number;
  /** Ocean plane depth in world units (Z). Defaults to `size` for a square sheet. */
  depth?: number;
  resolution?: number;
  amplitude?: number;
  speed?: number;
  direction?: OceanWaveDirection;
  choppiness?: number;
  steepness?: number;
  timeScale?: number;
  /**
   * Primary Gerstner wavelength in world units — same unit as `@jgengine/core/world/water` `waveScale`
   * (default 18). Scales the default wave set so the longest wave matches this value; explicit `waves`
   * wavelengths are multiplied by `waveScale / 18`.
   */
  waveScale?: number;
  color?: OceanColorConfig;
  foam?: OceanFoamConfig;
  waves?: readonly OceanWaveConfig[];
}

export interface ResolvedOceanColorConfig {
  shallow: THREE.ColorRepresentation;
  deep: THREE.ColorRepresentation;
  crest: THREE.ColorRepresentation;
  foam: THREE.ColorRepresentation;
  opacity: number;
  fresnelStrength: number;
  horizonBlend: number;
}

export interface ResolvedOceanFoamConfig {
  crestThreshold: number;
  softness: number;
  intensity: number;
  coverage: number;
}

export interface ResolvedOceanWaveConfig {
  amplitude: number;
  wavelength: number;
  speed: number;
  direction: OceanDirectionVector;
  steepness: number;
}

export interface ResolvedOceanConfig {
  quality: OceanQualityPreset;
  size: number;
  depth: number;
  resolution: number;
  amplitude: number;
  speed: number;
  direction: OceanDirectionVector;
  choppiness: number;
  steepness: number;
  timeScale: number;
  waveScale: number;
  color: ResolvedOceanColorConfig;
  foam: ResolvedOceanFoamConfig;
  waves: readonly ResolvedOceanWaveConfig[];
}

/** Shared with `@jgengine/core/world/water` — primary wavelength in world units. */
export const DEFAULT_OCEAN_WAVE_SCALE = 18;

export const OCEAN_QUALITY_PRESETS: Record<OceanQualityPreset, { size: number; resolution: number }> = {
  low: { size: 220, resolution: 80 },
  medium: { size: 360, resolution: 128 },
  high: { size: 520, resolution: 192 },
  ultra: { size: 720, resolution: 256 },
};

export const DEFAULT_OCEAN_CONFIG: ResolvedOceanConfig = {
  quality: "medium",
  size: OCEAN_QUALITY_PRESETS.medium.size,
  depth: OCEAN_QUALITY_PRESETS.medium.size,
  resolution: OCEAN_QUALITY_PRESETS.medium.resolution,
  amplitude: 1,
  speed: 1,
  direction: { x: 0.78, z: 0.62 },
  choppiness: 1,
  steepness: 0.72,
  timeScale: 1,
  waveScale: DEFAULT_OCEAN_WAVE_SCALE,
  color: {
    shallow: "#2dc5d3",
    deep: "#064468",
    crest: "#8be9ff",
    foam: "#f4fbff",
    opacity: 0.88,
    fresnelStrength: 0.7,
    horizonBlend: 0.38,
  },
  foam: {
    crestThreshold: 0.64,
    softness: 0.22,
    intensity: 0.8,
    coverage: 0.45,
  },
  waves: [],
};

const WAVE_WAVELENGTH_FALLOFF = 0.65;
const WAVE_AMPLITUDE_SHAPE = [1.15, 0.72, 0.44, 0.28, 0.18, 0.11] as const;
const WAVE_SPEED_SHAPE = [1, 1.08, 1.18, 1.34, 1.52, 1.75] as const;
const WAVE_STEEPNESS_SHAPE = [0.68, 0.58, 0.48, 0.38, 0.28, 0.18] as const;

const DEFAULT_DIRECTION_OFFSETS = [-8, 7, 21, -31, 46, -58] as const;

function finiteOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function directionFromAngle(degrees: number): OceanDirectionVector {
  const radians = THREE.MathUtils.degToRad(degrees);
  return { x: Math.cos(radians), z: Math.sin(radians) };
}

function directionAngle(direction: OceanDirectionVector): number {
  return THREE.MathUtils.radToDeg(Math.atan2(direction.z, direction.x));
}

function normalizeDirection(direction: OceanWaveDirection | undefined, fallback: OceanDirectionVector): OceanDirectionVector {
  if (direction === undefined) return fallback;
  if (typeof direction === "number") return directionFromAngle(direction);
  const length = Math.hypot(direction.x, direction.z);
  if (length <= 0.0001 || !Number.isFinite(length)) return fallback;
  return { x: direction.x / length, z: direction.z / length };
}

function createDefaultWaves(config: Omit<ResolvedOceanConfig, "waves">): readonly ResolvedOceanWaveConfig[] {
  const baseAngle = directionAngle(config.direction);
  return WAVE_AMPLITUDE_SHAPE.map((amplitude, index) => ({
    amplitude,
    wavelength: Math.max(0.1, config.waveScale * WAVE_WAVELENGTH_FALLOFF ** index),
    speed: WAVE_SPEED_SHAPE[index]!,
    direction: directionFromAngle(baseAngle + DEFAULT_DIRECTION_OFFSETS[index]!),
    steepness: WAVE_STEEPNESS_SHAPE[index]!,
  }));
}

function resolveWave(
  wave: OceanWaveConfig | undefined,
  fallback: ResolvedOceanWaveConfig,
  config: Omit<ResolvedOceanConfig, "waves">,
  customWaves: boolean,
): ResolvedOceanWaveConfig {
  const wavelength =
    customWaves && wave?.wavelength !== undefined
      ? wave.wavelength * (config.waveScale / DEFAULT_OCEAN_WAVE_SCALE)
      : finiteOr(wave?.wavelength, fallback.wavelength);
  return {
    amplitude: Math.max(0, finiteOr(wave?.amplitude, fallback.amplitude) * config.amplitude),
    wavelength: Math.max(0.1, wavelength),
    speed: finiteOr(wave?.speed, fallback.speed) * config.speed,
    direction: normalizeDirection(wave?.direction, fallback.direction),
    steepness: clamp(finiteOr(wave?.steepness, fallback.steepness) * config.steepness, 0, 1.2),
  };
}

/** @internal */
export function createOceanConfig(patch: OceanConfig = {}): ResolvedOceanConfig {
  const quality = patch.quality ?? DEFAULT_OCEAN_CONFIG.quality;
  const preset = OCEAN_QUALITY_PRESETS[quality];
  const size = Math.max(1, finiteOr(patch.size, preset.size));
  const depth = Math.max(1, finiteOr(patch.depth, size));
  const withoutWaves: Omit<ResolvedOceanConfig, "waves"> = {
    quality,
    size,
    depth,
    resolution: Math.max(1, Math.floor(finiteOr(patch.resolution, preset.resolution))),
    amplitude: Math.max(0, finiteOr(patch.amplitude, DEFAULT_OCEAN_CONFIG.amplitude)),
    speed: finiteOr(patch.speed, DEFAULT_OCEAN_CONFIG.speed),
    direction: normalizeDirection(patch.direction, DEFAULT_OCEAN_CONFIG.direction),
    choppiness: Math.max(0, finiteOr(patch.choppiness, DEFAULT_OCEAN_CONFIG.choppiness)),
    steepness: Math.max(0, finiteOr(patch.steepness, DEFAULT_OCEAN_CONFIG.steepness)),
    timeScale: finiteOr(patch.timeScale, DEFAULT_OCEAN_CONFIG.timeScale),
    waveScale: Math.max(0.1, finiteOr(patch.waveScale, DEFAULT_OCEAN_CONFIG.waveScale)),
    color: {
      ...DEFAULT_OCEAN_CONFIG.color,
      ...patch.color,
      opacity: clamp(finiteOr(patch.color?.opacity, DEFAULT_OCEAN_CONFIG.color.opacity), 0, 1),
      fresnelStrength: Math.max(
        0,
        finiteOr(patch.color?.fresnelStrength, DEFAULT_OCEAN_CONFIG.color.fresnelStrength),
      ),
      horizonBlend: clamp(finiteOr(patch.color?.horizonBlend, DEFAULT_OCEAN_CONFIG.color.horizonBlend), 0, 1),
    },
    foam: {
      ...DEFAULT_OCEAN_CONFIG.foam,
      ...patch.foam,
      crestThreshold: clamp(finiteOr(patch.foam?.crestThreshold, DEFAULT_OCEAN_CONFIG.foam.crestThreshold), 0, 1),
      softness: clamp(finiteOr(patch.foam?.softness, DEFAULT_OCEAN_CONFIG.foam.softness), 0.001, 1),
      intensity: Math.max(0, finiteOr(patch.foam?.intensity, DEFAULT_OCEAN_CONFIG.foam.intensity)),
      coverage: clamp(finiteOr(patch.foam?.coverage, DEFAULT_OCEAN_CONFIG.foam.coverage), 0, 1),
    },
  };

  const defaultWaves = createDefaultWaves(withoutWaves);
  const customWaves = patch.waves !== undefined;
  const inputWaves = patch.waves ?? defaultWaves;
  const waves = Array.from({ length: MAX_OCEAN_WAVES }, (_, index) =>
    resolveWave(inputWaves[index], defaultWaves[index]!, withoutWaves, customWaves),
  );
  return { ...withoutWaves, waves };
}

/** @internal */
export function buildOceanWaveUniforms(config: ResolvedOceanConfig): {
  directions: THREE.Vector2[];
  params: THREE.Vector4[];
} {
  const directions: THREE.Vector2[] = [];
  const params: THREE.Vector4[] = [];
  for (const wave of config.waves) {
    const waveNumber = (Math.PI * 2) / wave.wavelength;
    const omega = Math.sqrt(9.81 * waveNumber) * wave.speed;
    directions.push(new THREE.Vector2(wave.direction.x, wave.direction.z));
    params.push(new THREE.Vector4(waveNumber, wave.amplitude, wave.steepness, omega));
  }
  return { directions, params };
}
