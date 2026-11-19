import { seededRng } from "../random/rng";

export const DEFAULT_RAIN_COUNT = 2000;
export const DEFAULT_SNOW_COUNT = 1500;
export const DEFAULT_RAIN_DENSITY = 0.45;
export const DEFAULT_SNOW_DENSITY = 0.5;
export const DEFAULT_DUST_COUNT = 1800;
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
