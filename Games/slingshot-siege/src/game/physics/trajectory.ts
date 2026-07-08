export type Vec3 = readonly [number, number, number];

export interface LaunchParams {
  anchor: Vec3;
  pulledPoint: Vec3;
  maxPull: number;
  powerScale: number;
  maxSpeed: number;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function clampPull(anchor: Vec3, pulledPoint: Vec3, maxPull: number): Vec3 {
  const offset = subtract(pulledPoint, anchor);
  const len = length(offset);
  if (len <= maxPull || len === 0) return pulledPoint;
  const scale = maxPull / len;
  return [anchor[0] + offset[0] * scale, anchor[1] + offset[1] * scale, anchor[2] + offset[2] * scale];
}

export function pullFraction(anchor: Vec3, pulledPoint: Vec3, maxPull: number): number {
  if (maxPull <= 0) return 0;
  const clamped = clampPull(anchor, pulledPoint, maxPull);
  return length(subtract(clamped, anchor)) / maxPull;
}

export function launchVelocity(params: LaunchParams): Vec3 {
  const pulled = clampPull(params.anchor, params.pulledPoint, params.maxPull);
  const pull = subtract(params.anchor, pulled);
  const pullLength = length(pull);
  if (pullLength === 0) return [0, 0, 0];
  const speed = Math.min(pullLength * params.powerScale, params.maxSpeed);
  return [(pull[0] / pullLength) * speed, (pull[1] / pullLength) * speed, (pull[2] / pullLength) * speed];
}

export function sampleTrajectory(
  origin: Vec3,
  velocity: Vec3,
  gravity: number,
  steps: number,
  dt: number,
  floorY = 0,
): Vec3[] {
  const points: Vec3[] = [origin];
  let px = origin[0];
  let py = origin[1];
  let pz = origin[2];
  let vx = velocity[0];
  let vy = velocity[1];
  let vz = velocity[2];
  for (let i = 0; i < steps; i += 1) {
    vy += gravity * dt;
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;
    points.push([px, py, pz]);
    if (py < floorY) break;
  }
  return points;
}
