import { fractalNoise, seedFrom, valueNoise } from "../terrain/terrain";
import { prepareWindEffects, type WindEffects } from "./windEffects";

export type WindVector = readonly [number, number];

export interface WindFieldConfig {
  direction?: WindVector;
  speed?: number;
  gust?: number;
  gustFrequency?: number;
  turbulence?: number;
  seed?: string | number;
  /** Physical terms (log-law height profile, spectral gusts), each with its own strength; omit for the plain field. */
  effects?: WindEffects;
}

export interface WindField {
  readonly direction: WindVector;
  readonly speed: number;
  at(time: number): WindVector;
  atPoint(x: number, z: number, time: number): WindVector;
  strengthAt(x: number, z: number, time: number): number;
  /** Wind at a point `heightM` above the ground; equals {@link WindField.atPoint} without a `profile` or `gusts` effect. */
  atHeight(x: number, z: number, heightM: number, time: number): WindVector;
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

  const effects = config.effects === undefined ? null : prepareWindEffects(config.effects, String(config.seed ?? WIND_SEED_FALLBACK));
  const referenceHeight = effects?.referenceHeightM ?? 10;

  const noiseGust = (time: number): number =>
    gust === 0
      ? 0
      : gust *
        fractalNoise(time * gustFrequency, 0, {
          seed,
          frequency: 1,
          octaves: 3,
          lacunarity: 2,
          persistence: 0.5,
          ridged: false,
        });

  const along = (x: number, z: number): number => x * direction[0] + z * direction[1];

  const alongWind = (x: number, z: number, heightM: number, time: number): number => {
    if (effects === null) return speed + noiseGust(time);
    const mean = effects.meanAt(speed, heightM);
    return mean + noiseGust(time) + effects.gustAt(mean, heightM, time, along(x, z));
  };

  const at = (time: number): WindVector => {
    const magnitude = alongWind(0, 0, referenceHeight, time);
    return [direction[0] * magnitude, direction[1] * magnitude];
  };

  const atHeight = (x: number, z: number, heightM: number, time: number): WindVector => {
    const magnitude = alongWind(x, z, heightM, time);
    if (turbulence === 0) return [direction[0] * magnitude, direction[1] * magnitude];
    const tx = valueNoise(x * 0.05 + time * 0.1, z * 0.05, seed);
    const tz = valueNoise(z * 0.05, x * 0.05 - time * 0.1, seed + 101);
    return [direction[0] * magnitude + turbulence * tx, direction[1] * magnitude + turbulence * tz];
  };

  const atPoint = (x: number, z: number, time: number): WindVector => atHeight(x, z, referenceHeight, time);

  const strengthAt = (x: number, z: number, time: number): number => {
    const [wx, wz] = atPoint(x, z, time);
    return Math.hypot(wx, wz);
  };

  return { direction, speed, at, atPoint, strengthAt, atHeight };
}
