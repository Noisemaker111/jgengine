import type { Checkpoint } from "@jgengine/core/game/race";

export interface Vec2 {
  x: number;
  z: number;
}

export interface StadiumConfig {
  straightLength: number;
  turnRadius: number;
  segmentsPerTurn: number;
}

function circlePoint(cx: number, radius: number, angle: number): Vec2 {
  return { x: cx + radius * Math.cos(angle), z: radius * Math.sin(angle) };
}

export function stadiumCenterline(config: StadiumConfig): readonly Vec2[] {
  const half = config.straightLength / 2;
  const { turnRadius, segmentsPerTurn } = config;
  const points: Vec2[] = [{ x: -half, z: -turnRadius }];
  for (let i = 0; i < segmentsPerTurn; i += 1) {
    points.push(circlePoint(half, turnRadius, -Math.PI / 2 + (Math.PI * i) / segmentsPerTurn));
  }
  points.push({ x: half, z: turnRadius });
  for (let i = 0; i < segmentsPerTurn; i += 1) {
    points.push(circlePoint(-half, turnRadius, Math.PI / 2 + (Math.PI * i) / segmentsPerTurn));
  }
  return points;
}

export function cumulativeLengths(points: readonly Vec2[]): readonly number[] {
  const n = points.length;
  const cum = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    cum[i + 1] = cum[i]! + Math.hypot(b.x - a.x, b.z - a.z);
  }
  return cum;
}

export function pointAtDistance(points: readonly Vec2[], cum: readonly number[], distance: number): Vec2 {
  const total = cum[cum.length - 1]!;
  const n = points.length;
  if (total <= 0 || n === 0) return { x: 0, z: 0 };
  const d = ((distance % total) + total) % total;
  let i = 0;
  while (i < n && cum[i + 1]! < d) i += 1;
  const a = points[i]!;
  const b = points[(i + 1) % n]!;
  const segLen = cum[i + 1]! - cum[i]!;
  const t = segLen <= 0 ? 0 : (d - cum[i]!) / segLen;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

export function tangentAt(points: readonly Vec2[], cum: readonly number[], distance: number): Vec2 {
  const ahead = pointAtDistance(points, cum, distance + 0.5);
  const behind = pointAtDistance(points, cum, distance - 0.5);
  const dx = ahead.x - behind.x;
  const dz = ahead.z - behind.z;
  const mag = Math.hypot(dx, dz) || 1;
  return { x: dx / mag, z: dz / mag };
}

export function sampleCheckpoints(
  points: readonly Vec2[],
  cum: readonly number[],
  count: number,
  trackWidth: number,
): readonly Checkpoint[] {
  const total = cum[cum.length - 1]!;
  const half: readonly [number, number, number] = [trackWidth / 2 + 2, 4, trackWidth / 2 + 2];
  const checkpoints: Checkpoint[] = [];
  for (let k = 0; k < count; k += 1) {
    const p = pointAtDistance(points, cum, (k / count) * total);
    checkpoints.push({ id: k === count - 1 ? "finish" : `cp-${k}`, center: [p.x, 0, p.z], half });
  }
  return checkpoints;
}

export function lateralOffset(point: readonly [number, number], points: readonly Vec2[]): number {
  let min = Number.POSITIVE_INFINITY;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = point[0] - a.x;
    const apz = point[1] - a.z;
    const abLen2 = abx * abx + abz * abz;
    const t = abLen2 <= 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLen2));
    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    const dist = Math.hypot(point[0] - cx, point[1] - cz);
    if (dist < min) min = dist;
  }
  return min;
}

export interface RibbonMesh {
  positions: Float32Array;
  indices: Uint32Array;
  colors?: Float32Array;
}

export type RibbonColorAt = (index: number) => readonly [number, number, number];

function normalAt(points: readonly Vec2[], i: number): Vec2 {
  const n = points.length;
  const prev = points[(i - 1 + n) % n]!;
  const next = points[(i + 1) % n]!;
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const mag = Math.hypot(dx, dz) || 1;
  return { x: -dz / mag, z: dx / mag };
}

export function offsetPolyline(points: readonly Vec2[], offset: number): readonly Vec2[] {
  return points.map((p, i) => {
    const normal = normalAt(points, i);
    return { x: p.x + normal.x * offset, z: p.z + normal.z * offset };
  });
}

export function buildRibbonGeometry(
  points: readonly Vec2[],
  width: number,
  y: number,
  colorAt?: RibbonColorAt,
): RibbonMesh {
  const n = points.length;
  const positions = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i += 1) {
    const normal = normalAt(points, i);
    const p = points[i]!;
    const o = i * 6;
    positions[o] = p.x + (normal.x * width) / 2;
    positions[o + 1] = y;
    positions[o + 2] = p.z + (normal.z * width) / 2;
    positions[o + 3] = p.x - (normal.x * width) / 2;
    positions[o + 4] = y;
    positions[o + 5] = p.z - (normal.z * width) / 2;
  }
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i += 1) {
    const i0 = i * 2;
    const i1 = i * 2 + 1;
    const i2 = ((i + 1) % n) * 2;
    const i3 = ((i + 1) % n) * 2 + 1;
    const o = i * 6;
    indices[o] = i0;
    indices[o + 1] = i2;
    indices[o + 2] = i1;
    indices[o + 3] = i1;
    indices[o + 4] = i2;
    indices[o + 5] = i3;
  }
  if (colorAt === undefined) return { positions, indices };
  const colors = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i += 1) {
    const [r, g, b] = colorAt(i);
    const o = i * 6;
    colors[o] = r;
    colors[o + 1] = g;
    colors[o + 2] = b;
    colors[o + 3] = r;
    colors[o + 4] = g;
    colors[o + 5] = b;
  }
  return { positions, indices, colors };
}

export function cornerMask(points: readonly Vec2[], threshold = 0.01): readonly boolean[] {
  const n = points.length;
  return points.map((_, i) => {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    const inX = curr.x - prev.x;
    const inZ = curr.z - prev.z;
    const outX = next.x - curr.x;
    const outZ = next.z - curr.z;
    const inLen = Math.hypot(inX, inZ) || 1;
    const outLen = Math.hypot(outX, outZ) || 1;
    const cross = (inX / inLen) * (outZ / outLen) - (inZ / inLen) * (outX / outLen);
    return Math.abs(cross) > threshold;
  });
}
