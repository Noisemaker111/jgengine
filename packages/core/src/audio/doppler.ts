/** Speed of sound in air at 20 °C, metres per second — the default for {@link dopplerRate}. */
export const SPEED_OF_SOUND = 343;

type Vec3Tuple = readonly [number, number, number];

/** Options for {@link dopplerRate}. */
export interface DopplerOptions {
  /** Scales both velocities; 1 is physical, 0 disables the shift. Default 1. */
  factor?: number;
  /** World units per second sound travels. Default {@link SPEED_OF_SOUND}. */
  speedOfSound?: number;
  /** Clamp window for the returned multiplier. Default `[0.5, 2]`. */
  range?: readonly [number, number];
}

/**
 * Doppler pitch multiplier for an emitter heard by a listener: `(c + vListener) / (c - vEmitter)`,
 * where each speed is the component along the line between them, positive when closing. Multiply a
 * loop's playback rate by it. Pure and allocation-free.
 *
 * @capability doppler-pitch pitch a moving sound up as it approaches and down as it passes, from listener and emitter velocity
 */
export function dopplerRate(
  listenerPosition: Vec3Tuple,
  listenerVelocity: Vec3Tuple,
  emitterPosition: Vec3Tuple,
  emitterVelocity: Vec3Tuple,
  options: DopplerOptions = {},
): number {
  const factor = options.factor ?? 1;
  const c = options.speedOfSound ?? SPEED_OF_SOUND;
  const min = options.range?.[0] ?? 0.5;
  const max = options.range?.[1] ?? 2;
  const dx = emitterPosition[0] - listenerPosition[0];
  const dy = emitterPosition[1] - listenerPosition[1];
  const dz = emitterPosition[2] - listenerPosition[2];
  const distance = Math.hypot(dx, dy, dz);
  if (factor === 0 || c <= 0 || distance < 1e-6) return 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const uz = dz / distance;
  const listenerClosing = factor * (listenerVelocity[0] * ux + listenerVelocity[1] * uy + listenerVelocity[2] * uz);
  const emitterClosing = -factor * (emitterVelocity[0] * ux + emitterVelocity[1] * uy + emitterVelocity[2] * uz);
  const numerator = c + Math.max(-c * 0.99, listenerClosing);
  const denominator = c - Math.min(c * 0.99, emitterClosing);
  const rate = numerator / denominator;
  if (!Number.isFinite(rate)) return 1;
  return rate < min ? min : rate > max ? max : rate;
}
