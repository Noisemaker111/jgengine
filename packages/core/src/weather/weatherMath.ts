import { seededRng } from "../random/rng";

/** Drop budget a rain field allocates before `density` scales it down. */
export const DEFAULT_RAIN_COUNT = 2000;
/** Flake budget a snow field allocates before `density` scales it down. */
export const DEFAULT_SNOW_COUNT = 1500;
/** Share of {@link DEFAULT_RAIN_COUNT} drawn at intensity 1. */
export const DEFAULT_RAIN_DENSITY = 0.45;
/** Share of {@link DEFAULT_SNOW_COUNT} drawn at intensity 1. */
export const DEFAULT_SNOW_DENSITY = 0.5;
/** Mote budget a {@link DustField} allocates before `density` scales it down. */
export const DEFAULT_DUST_COUNT = 1800;
/** Share of {@link DEFAULT_DUST_COUNT} drawn at intensity 1 — dust reads thinner than rain or snow. */
export const DEFAULT_DUST_DENSITY = 0.4;

/** @internal */
export function clampWeatherRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** @internal */
export function resolveWeatherInstanceCount(maxCount: number, density: number, budget?: number): number {
  const safeMax = Math.max(0, Math.floor(maxCount));
  const capped = budget === undefined ? safeMax : Math.min(safeMax, Math.max(0, Math.floor(budget)));
  return Math.floor(capped * clampWeatherRatio(density));
}

/** Per-particle spawn positions and drift offsets a weather field uploads once. */
export interface WeatherSeedAttributes {
  spawn: Float32Array;
  drift: Float32Array;
}

/** @internal */
export function createWeatherSeedAttributes(maxCount: number, seed: number): WeatherSeedAttributes {
  const count = Math.max(0, Math.floor(maxCount));
  const spawn = new Float32Array(count * 3);
  const drift = new Float32Array(count);
  const next = seededRng(seed);
  for (let index = 0; index < count; index += 1) {
    spawn[index * 3] = next();
    spawn[index * 3 + 1] = next();
    spawn[index * 3 + 2] = next();
    drift[index] = next();
  }
  return { spawn, drift };
}

/** @internal */
export function lightningStrikeEnvelope(timeSeconds: number, startedAt: number, duration: number, seed: number): number {
  const elapsed = timeSeconds - startedAt;
  if (elapsed < 0 || duration <= 0 || elapsed >= duration) return 0;
  const flicker = 0.62 + (Math.sin(elapsed * 97 + seed) * 0.5 + 0.5) * 0.38;
  return (1 - elapsed / duration) * flicker;
}

/** Width of the soft edge a bounded precipitation field fades out across, in metres. */
export const DEFAULT_WEATHER_BOUNDS_FADE = 10;

/**
 * A world-space XZ rectangle a rain or snow field stays inside. Drops past an edge fade out across
 * `fade` metres, so a storm confined to one district or biome band ends in a soft wall of rain
 * instead of following the camera into the next one.
 */
export interface WeatherBoundsRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Soft-edge width outside the rectangle; default {@link DEFAULT_WEATHER_BOUNDS_FADE}. */
  fade?: number;
}

/** How far `(x, z)` lies outside the rectangle, 0 inside it. @internal */
export function weatherBoundsDistance(bounds: WeatherBoundsRect, x: number, z: number): number {
  const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
  const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * How much of a bounded field's precipitation reaches `(x, z)`, 0..1: 1 inside the rectangle,
 * easing to 0 across its `fade` edge. Unbounded (`undefined`) fields cover everywhere. The weather
 * shaders apply the same curve per drop.
 */
export function weatherBoundsCoverage(bounds: WeatherBoundsRect | undefined, x: number, z: number): number {
  if (bounds === undefined) return 1;
  const fade = Math.max(1e-3, bounds.fade ?? DEFAULT_WEATHER_BOUNDS_FADE);
  const t = clampWeatherRatio(weatherBoundsDistance(bounds, x, z) / fade);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Whether a camera-anchored wrap volume `halfW` x `halfD` around `(x, z)` can hold any drop inside
 * the bounds — false lets a field skip drawing while the camera is far from its storm.
 */
export function weatherBoundsReach(bounds: WeatherBoundsRect | undefined, x: number, z: number, halfW: number, halfD: number): boolean {
  if (bounds === undefined) return true;
  const fade = bounds.fade ?? DEFAULT_WEATHER_BOUNDS_FADE;
  return x + halfW >= bounds.minX - fade && x - halfW <= bounds.maxX + fade && z + halfD >= bounds.minZ - fade && z - halfD <= bounds.maxZ + fade;
}
