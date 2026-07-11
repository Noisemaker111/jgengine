export const DEFAULT_RAIN_COUNT = 2000;
export const DEFAULT_SNOW_COUNT = 1500;
export const DEFAULT_RAIN_DENSITY = 0.45;
export const DEFAULT_SNOW_DENSITY = 0.5;

export function clampWeatherRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function resolveWeatherInstanceCount(maxCount: number, density: number, budget?: number): number {
  const safeMax = Math.max(0, Math.floor(maxCount));
  const capped = budget === undefined ? safeMax : Math.min(safeMax, Math.max(0, Math.floor(budget)));
  return Math.floor(capped * clampWeatherRatio(density));
}

export interface WeatherSeedAttributes {
  spawn: Float32Array;
  drift: Float32Array;
}

export function createWeatherSeedAttributes(maxCount: number, seed: number): WeatherSeedAttributes {
  const count = Math.max(0, Math.floor(maxCount));
  const spawn = new Float32Array(count * 3);
  const drift = new Float32Array(count);
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = 0; index < count; index += 1) {
    spawn[index * 3] = next();
    spawn[index * 3 + 1] = next();
    spawn[index * 3 + 2] = next();
    drift[index] = next();
  }
  return { spawn, drift };
}
