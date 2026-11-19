export interface SprintMechanics {
  /** Top speed on the straight, m/s. */
  topSpeed: number;
  contactTime: number;
  aerialTime: number;
  friction: number;
  /** Gravity, m/s². */
  gravity?: number;
}

/**
 * Recreational male sprinters: top speed 7.70 m/s on the straight (Y.-H. Chang and R. Kram, "Limitations to maximum
 * running speed on flat curves", *J. Exp. Biol.* 210, 2007), contact and aerial times at top speed of about 0.12 s
 * each (P. G. Weyand et al., *J. Appl. Physiol.* 89, 2000), friction of a rubber sole on a track surface 0.9.
 */
export const RECREATIONAL_SPRINTER: SprintMechanics = { topSpeed: 7.7, contactTime: 0.12, aerialTime: 0.12, friction: 0.9 };

/** @capability curve-running fastest speed a human runner holds on a flat curve from leg force and friction */
export function maxCurveSpeed(mechanics: SprintMechanics, radius: number): number {
  const g = mechanics.gravity ?? 9.81;
  const contactLength = mechanics.topSpeed * mechanics.contactTime;
  const peak = (mechanics.aerialTime + mechanics.contactTime) / mechanics.contactTime;
  const needed = (v: number) => Math.sqrt(1 + (v * v / radius / g) ** 2) * (1 + (mechanics.aerialTime * v) / contactLength);
  let lo = 0;
  let hi = mechanics.topSpeed;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (needed(mid) <= peak) lo = mid;
    else hi = mid;
  }
  return Math.min(lo, Math.sqrt(mechanics.friction * g * radius));
}

/**
 * Tightest turn radius (m) a runner holds at `speed` (m/s): the inverse of {@link maxCurveSpeed}. `Infinity` above top speed.
 * @capability human-turn-radius tightest turn a human runner holds at a speed, from leg force and friction
 */
export function minTurnRadius(mechanics: SprintMechanics, speed: number): number {
  if (speed >= mechanics.topSpeed) return Number.POSITIVE_INFINITY;
  if (speed <= 0) return 0;
  let lo = 1e-3;
  let hi = 1e4;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (maxCurveSpeed(mechanics, mid) >= speed) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Chang & Kram (2007) measured top speeds on flat curves by radius (m → m/s), and on the straight. */
export const CHANG_KRAM_CURVE_SPEEDS: readonly { radius: number; speed: number }[] = [
  { radius: 1, speed: 2.99 },
  { radius: 6, speed: 5.66 },
  { radius: Number.POSITIVE_INFINITY, speed: 7.7 },
];
