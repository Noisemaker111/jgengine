import { type Aabb, type Vec2, expandAabb, pointInAabb } from "./geometry";
import { seededRng } from "../random/rng";

export interface ScatterArea {
  w: number;
  d: number;
  center?: Vec2;
}

export interface ScatterConfig {
  area: ScatterArea | Aabb;
  count?: number;
  density?: number;
  seed?: string | number;
  minDistance?: number;
  avoid?: readonly Aabb[];
  avoidMargin?: number;
  jitter?: number;
  maxAttempts?: number;
}

export interface ScatterPoint {
  x: number;
  z: number;
  index: number;
}

function isAabb(area: ScatterArea | Aabb): area is Aabb {
  return (
    typeof (area as Aabb).minX === "number" &&
    typeof (area as Aabb).minZ === "number" &&
    typeof (area as Aabb).maxX === "number" &&
    typeof (area as Aabb).maxZ === "number"
  );
}

export function scatterAabb(area: ScatterArea | Aabb): Aabb {
  if (isAabb(area)) {
    return { minX: area.minX, minZ: area.minZ, maxX: area.maxX, maxZ: area.maxZ };
  }
  const cx = area.center ? area.center[0] : 0;
  const cz = area.center ? area.center[1] : 0;
  const halfW = area.w / 2;
  const halfD = area.d / 2;
  return { minX: cx - halfW, minZ: cz - halfD, maxX: cx + halfW, maxZ: cz + halfD };
}

export function scatter(config: ScatterConfig): ScatterPoint[] {
  const aabb = scatterAabb(config.area);
  const width = aabb.maxX - aabb.minX;
  const depth = aabb.maxZ - aabb.minZ;
  const density = config.density ?? 0.01;
  const target = config.count ?? Math.max(0, Math.floor(width * depth * density));
  if (target <= 0 || width <= 0 || depth <= 0) return [];

  const minDistance = config.minDistance ?? 0;
  const avoidMargin = config.avoidMargin ?? 0;
  const jitter = config.jitter ?? 1;
  const maxAttempts = config.maxAttempts ?? target * 30;
  const avoid = (config.avoid ?? []).map((a) => (avoidMargin !== 0 ? expandAabb(a, avoidMargin) : a));
  const rng = seededRng(config.seed ?? "scatter");

  const useDistance = minDistance > 0;
  const buckets = new Map<string, Vec2[]>();
  const bucketKey = (x: number, z: number): string =>
    `${Math.floor(x / minDistance)}:${Math.floor(z / minDistance)}`;

  const rejectedByAvoid = (point: Vec2): boolean => {
    for (const a of avoid) if (pointInAabb(point, a)) return true;
    return false;
  };

  const rejectedByDistance = (point: Vec2): boolean => {
    if (!useDistance) return false;
    const cx = Math.floor(point[0] / minDistance);
    const cz = Math.floor(point[1] / minDistance);
    const minSq = minDistance * minDistance;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const nearby = buckets.get(`${cx + dx}:${cz + dz}`);
        if (!nearby) continue;
        for (const other of nearby) {
          const ex = other[0] - point[0];
          const ez = other[1] - point[1];
          if (ex * ex + ez * ez < minSq) return true;
        }
      }
    }
    return false;
  };

  const accepted: ScatterPoint[] = [];
  const commit = (point: Vec2): void => {
    accepted.push({ x: point[0], z: point[1], index: accepted.length });
    if (useDistance) {
      const key = bucketKey(point[0], point[1]);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(point);
      else buckets.set(key, [point]);
    }
  };

  const cols = Math.max(1, Math.ceil(Math.sqrt(target * (width / depth))));
  const rows = Math.max(1, Math.ceil(target / cols));
  const cellW = width / cols;
  const cellD = depth / rows;

  for (let row = 0; row < rows && accepted.length < target; row++) {
    for (let col = 0; col < cols && accepted.length < target; col++) {
      const baseX = aabb.minX + (col + 0.5) * cellW;
      const baseZ = aabb.minZ + (row + 0.5) * cellD;
      const x = baseX + jitter * (rng() - 0.5) * cellW;
      const z = baseZ + jitter * (rng() - 0.5) * cellD;
      const point: Vec2 = [x, z];
      if (!pointInAabb(point, aabb)) continue;
      if (rejectedByAvoid(point)) continue;
      if (rejectedByDistance(point)) continue;
      commit(point);
    }
  }

  let attempts = 0;
  while (accepted.length < target && attempts < maxAttempts) {
    attempts++;
    const x = aabb.minX + rng() * width;
    const z = aabb.minZ + rng() * depth;
    const point: Vec2 = [x, z];
    if (rejectedByAvoid(point)) continue;
    if (rejectedByDistance(point)) continue;
    commit(point);
  }

  return accepted;
}
