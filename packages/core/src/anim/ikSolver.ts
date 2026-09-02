/** A three-dimensional point or direction represented without a renderer dependency. */
export type Vec3 = readonly [number, number, number];
/** A mutable three-dimensional tuple used by allocation-aware solver outputs. */
export type MutableVec3 = [number, number, number];
/** A quaternion in `(x, y, z, w)` order. */
export type Quat = readonly [number, number, number, number];

/** Inputs for {@link solveTwoBone}. */
export interface TwoBoneInput {
  root: Vec3;
  mid: Vec3;
  tip: Vec3;
  target: Vec3;
  pole: Vec3;
}

/** Reused output buffers filled by {@link solveTwoBone}. */
export interface TwoBoneOutput {
  mid: MutableVec3;
  tip: MutableVec3;
}

/** Iteration budget and convergence threshold for {@link solveFabrik}. */
export interface FabrikOptions {
  iterations?: number;
  tolerance?: number;
}

/** Inputs for {@link lookAt}. Angles are in radians. */
export interface LookAtInput {
  from: Vec3;
  target: Vec3;
  up: Vec3;
  maxYaw?: number;
  maxPitch?: number;
}

const EPSILON = 1e-8;

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function normalize(x: number, y: number, z: number): MutableVec3 {
  const length = Math.hypot(x, y, z);
  return length > EPSILON ? [x / length, y / length, z / length] : [0, 0, 0];
}

function cross(a: Vec3, b: Vec3): MutableVec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function addScaled(origin: Vec3, direction: Vec3, amount: number): MutableVec3 {
  return [origin[0] + direction[0] * amount, origin[1] + direction[1] * amount, origin[2] + direction[2] * amount];
}

/**
 * Solves a two-segment chain analytically, placing the middle and tip joints toward `target` and `pole`.
 * The root remains fixed, and unreachable targets are clamped to the chain's maximum reach.
 *
 * @capability animation inverse kinematics solve a two-bone chain from a target and bend pole
 */
export function solveTwoBone(input: TwoBoneInput, out: TwoBoneOutput): TwoBoneOutput {
  const firstLength = distance(input.root, input.mid);
  const secondLength = distance(input.mid, input.tip);
  const toTarget = [input.target[0] - input.root[0], input.target[1] - input.root[1], input.target[2] - input.root[2]] as MutableVec3;
  const targetDistance = Math.hypot(...toTarget);
  const direction = targetDistance > EPSILON ? normalize(...toTarget) : normalize(input.mid[0] - input.root[0], input.mid[1] - input.root[1], input.mid[2] - input.root[2]);
  const minReach = Math.abs(firstLength - secondLength);
  const reach = Math.min(Math.max(targetDistance, minReach), firstLength + secondLength);
  const clampedTarget = addScaled(input.root, direction, reach);

  let bendNormal = normalize(...cross(direction, [input.pole[0] - input.root[0], input.pole[1] - input.root[1], input.pole[2] - input.root[2]]));
  if (Math.hypot(...bendNormal) <= EPSILON) {
    const fallback = Math.abs(direction[1]) < 0.9 ? ([0, 1, 0] as const) : ([1, 0, 0] as const);
    bendNormal = normalize(...cross(direction, fallback));
  }
  const bendDirection = normalize(...cross(bendNormal, direction));
  const along = (firstLength * firstLength - secondLength * secondLength + reach * reach) / (2 * reach || 1);
  const height = Math.sqrt(Math.max(0, firstLength * firstLength - along * along));
  const solvedMid = addScaled(addScaled(input.root, direction, along), bendDirection, height);
  out.mid[0] = solvedMid[0];
  out.mid[1] = solvedMid[1];
  out.mid[2] = solvedMid[2];
  out.tip[0] = clampedTarget[0];
  out.tip[1] = clampedTarget[1];
  out.tip[2] = clampedTarget[2];
  return out;
}

/**
 * Solves a chain with the FABRIK forward-and-backward reaching algorithm.
 * Returned tuples are new values; the input chain is not modified.
 *
 * @capability animation inverse kinematics solve an arbitrary tuple chain toward a target
 */
export function solveFabrik(chain: readonly Vec3[], target: Vec3, options: FabrikOptions = {}): MutableVec3[] {
  if (chain.length === 0) return [];
  if (chain.length === 1) return [[chain[0]![0], chain[0]![1], chain[0]![2]]];
  const points = chain.map((point) => [point[0], point[1], point[2]] as MutableVec3);
  const lengths = chain.slice(1).map((point, index) => distance(chain[index]!, point));
  const root = points[0]!;
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const rootDistance = distance(root, target);
  const iterations = Math.max(0, Math.floor(options.iterations ?? 10));
  const tolerance = Math.max(0, options.tolerance ?? 1e-3);
  if (rootDistance >= totalLength) {
    const direction = normalize(target[0] - root[0], target[1] - root[1], target[2] - root[2]);
    for (let i = 1; i < points.length; i += 1) points[i] = addScaled(points[i - 1]!, direction, lengths[i - 1]!);
    return points;
  }
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    points[points.length - 1] = [target[0], target[1], target[2]];
    for (let i = points.length - 2; i >= 0; i -= 1) {
      const direction = normalize(points[i]![0] - points[i + 1]![0], points[i]![1] - points[i + 1]![1], points[i]![2] - points[i + 1]![2]);
      points[i] = addScaled(points[i + 1]!, direction, lengths[i]!);
    }
    points[0] = [root[0], root[1], root[2]];
    for (let i = 1; i < points.length; i += 1) {
      const direction = normalize(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1], points[i]![2] - points[i - 1]![2]);
      points[i] = addScaled(points[i - 1]!, direction, lengths[i - 1]!);
    }
    if (distance(points[points.length - 1]!, target) <= tolerance) break;
  }
  return points;
}

function quaternionFromBasis(right: Vec3, up: Vec3, forward: Vec3): Quat {
  const trace = right[0] + up[1] + forward[2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(up[2] - forward[1]) / s, (forward[0] - right[2]) / s, (right[1] - up[0]) / s, 0.25 * s];
  }
  if (right[0] > up[1] && right[0] > forward[2]) {
    const s = Math.sqrt(1 + right[0] - up[1] - forward[2]) * 2;
    return [0.25 * s, (right[1] + up[0]) / s, (right[2] + forward[0]) / s, (up[2] - forward[1]) / s];
  }
  if (up[1] > forward[2]) {
    const s = Math.sqrt(1 + up[1] - right[0] - forward[2]) * 2;
    return [(right[1] + up[0]) / s, 0.25 * s, (up[2] + forward[1]) / s, (forward[0] - right[2]) / s];
  }
  const s = Math.sqrt(1 + forward[2] - right[0] - up[1]) * 2;
  return [(right[2] + forward[0]) / s, (up[2] + forward[1]) / s, 0.25 * s, (right[1] - up[0]) / s];
}

/** Returns a quaternion that points a +Z bone from `from` toward `target`, with optional yaw and pitch limits.
 *
 * @capability animation inverse kinematics orient a bone toward a target with constrained yaw and pitch
 */
export function lookAt(input: LookAtInput): Quat {
  let direction = normalize(input.target[0] - input.from[0], input.target[1] - input.from[1], input.target[2] - input.from[2]);
  if (Math.hypot(...direction) <= EPSILON) return [0, 0, 0, 1];
  let yaw = Math.atan2(direction[0], direction[2]);
  let pitch = Math.atan2(direction[1], Math.hypot(direction[0], direction[2]));
  if (input.maxYaw !== undefined) yaw = Math.max(-Math.abs(input.maxYaw), Math.min(Math.abs(input.maxYaw), yaw));
  if (input.maxPitch !== undefined) pitch = Math.max(-Math.abs(input.maxPitch), Math.min(Math.abs(input.maxPitch), pitch));
  direction = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  let right = normalize(...cross(input.up, direction));
  if (Math.hypot(...right) <= EPSILON) right = normalize(...cross([0, 1, 0], direction));
  const up = cross(direction, right);
  return quaternionFromBasis(right, up, direction);
}
