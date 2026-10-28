import { plantCos, plantSin } from "./plantMath";

/**
 * Normalise the 3-vector in `v` in place; leaves straight up when it is degenerate.
 * @internal
 */
export function normalize3(v: Float64Array): void {
  const x = v[0] ?? 0;
  const y = v[1] ?? 0;
  const z = v[2] ?? 0;
  const length = Math.sqrt(x * x + y * y + z * z);
  if (length < 1e-12) {
    v[0] = 0;
    v[1] = 1;
    v[2] = 0;
    return;
  }
  v[0] = x / length;
  v[1] = y / length;
  v[2] = z / length;
}

/**
 * Direction of a lateral bud: the parent axis `axis` tilted by `angle` radians towards the azimuth
 * `azimuth` measured in a frame fixed to the axis. Written into `out`.
 * @internal
 */
export function lateralDirection(axis: Float64Array, angle: number, azimuth: number, out: Float64Array): void {
  const ax = axis[0] ?? 0;
  const ay = axis[1] ?? 1;
  const az = axis[2] ?? 0;
  // Reference: world up, or world X when the axis is nearly vertical.
  const useX = ay > 0.99 || ay < -0.99;
  let ux = useX ? 0 : -az;
  let uy = useX ? az : 0;
  let uz = useX ? -ay : ax;
  const uLength = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= uLength;
  uy /= uLength;
  uz /= uLength;
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;
  const c = plantCos(angle);
  const s = plantSin(angle);
  const ca = plantCos(azimuth);
  const sa = plantSin(azimuth);
  out[0] = c * ax + s * (ca * ux + sa * vx);
  out[1] = c * ay + s * (ca * uy + sa * vy);
  out[2] = c * az + s * (ca * uz + sa * vz);
  normalize3(out);
}

/** The weights Palubicki et al. 2009 combine into a new metamer's direction. */
export interface TropismWeights {
  /** Pull towards the least-shaded neighbour. */
  optimal: number;
  /** Gravitropic pull for this branch order. */
  gravity: number;
  /** Cosine and sine of this order's set-point angle from vertical. */
  setpointCos: number;
  setpointSin: number;
  /** Pull along the wind. */
  wind: number;
  windX: number;
  windZ: number;
  jitter: number;
}

/**
 * Next metamer direction: the previous direction plus the weighted optimal-growth direction, the
 * gravitropic pull towards the set-point angle and the wind, plus a random tilt drawn from the bud's own stream. Written into `dir`.
 * @internal
 */
export function bendTowardsTropisms(dir: Float64Array, optimal: Float64Array, weights: TropismWeights, randomA: number, randomB: number, randomC: number): void {
  // Gravitropism pulls towards the set-point direction: same azimuth, set-point angle from vertical.
  const x = dir[0] ?? 0;
  const y = dir[1] ?? 1;
  const z = dir[2] ?? 0;
  const flat = Math.sqrt(x * x + z * z);
  const targetX = flat > 1e-9 ? (x / flat) * weights.setpointSin : 0;
  const targetZ = flat > 1e-9 ? (z / flat) * weights.setpointSin : 0;
  const targetY = flat > 1e-9 ? weights.setpointCos : 1;
  dir[0] = x + weights.gravity * (targetX - x) + weights.optimal * (optimal[0] ?? 0) + weights.wind * weights.windX + weights.jitter * (randomA - 0.5);
  dir[1] = y + weights.gravity * (targetY - y) + weights.optimal * (optimal[1] ?? 0) + weights.jitter * (randomB - 0.5);
  dir[2] = z + weights.gravity * (targetZ - z) + weights.optimal * (optimal[2] ?? 0) + weights.wind * weights.windZ + weights.jitter * (randomC - 0.5);
  normalize3(dir);
  // A shoot never grows into the ground.
  if ((dir[1] ?? 0) < -0.2) {
    dir[1] = -0.2;
    normalize3(dir);
  }
}
