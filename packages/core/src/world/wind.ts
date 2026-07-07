import { fractalNoise, seedFrom, valueNoise } from "./terrain";

export type WindVector = readonly [number, number];

export interface WindFieldConfig {
  direction?: WindVector;
  speed?: number;
  gust?: number;
  gustFrequency?: number;
  turbulence?: number;
  seed?: string | number;
}

export interface WindField {
  readonly direction: WindVector;
  readonly speed: number;
  at(time: number): WindVector;
  atPoint(x: number, z: number, time: number): WindVector;
  strengthAt(x: number, z: number, time: number): number;
}

const WIND_SEED_FALLBACK = 0x77696e64;

function normalizeDirection(direction: WindVector): WindVector {
  const length = Math.hypot(direction[0], direction[1]);
  if (length === 0) return [1, 0];
  return [direction[0] / length, direction[1] / length];
}

export function windField(config: WindFieldConfig = {}): WindField {
  const direction = normalizeDirection(config.direction ?? [1, 0]);
  const speed = config.speed ?? 1;
  const gust = config.gust ?? 0;
  const gustFrequency = config.gustFrequency ?? 0.15;
  const turbulence = config.turbulence ?? 0;
  const seed = seedFrom(config.seed, WIND_SEED_FALLBACK);

  const at = (time: number): WindVector => {
    const gustAmt =
      gust *
      fractalNoise(time * gustFrequency, 0, {
        seed,
        frequency: 1,
        octaves: 3,
        lacunarity: 2,
        persistence: 0.5,
        ridged: false,
      });
    const magnitude = speed + gustAmt;
    return [direction[0] * magnitude, direction[1] * magnitude];
  };

  const atPoint = (x: number, z: number, time: number): WindVector => {
    const base = at(time);
    const tx = valueNoise(x * 0.05 + time * 0.1, z * 0.05, seed);
    const tz = valueNoise(z * 0.05, x * 0.05 - time * 0.1, seed + 101);
    return [base[0] + turbulence * tx, base[1] + turbulence * tz];
  };

  const strengthAt = (x: number, z: number, time: number): number => {
    const [wx, wz] = atPoint(x, z, time);
    return Math.hypot(wx, wz);
  };

  return { direction, speed, at, atPoint, strengthAt };
}
