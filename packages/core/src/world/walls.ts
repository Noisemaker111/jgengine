import { footprintAabb, type Aabb, type Vec2 } from "./geometry";

export type WallVec3 = readonly [number, number, number];

export interface WallSegment {
  from: Vec2;
  to: Vec2;
  length: number;
  angle: number;
}

export interface EnclosedFootprint {
  polygon: readonly Vec2[];
  aabb: Aabb;
  area: number;
  perimeter: number;
  closed: boolean;
}

export type RoofStyle = "hip" | "gable" | "flat";

export interface RoofPlan {
  style: RoofStyle;
  ridge: readonly [Vec2, Vec2];
  apexHeight: number;
  eaveHeight: number;
  faces: readonly (readonly WallVec3[])[];
}

export interface RoofConfig {
  style?: RoofStyle;
  eaveHeight?: number;
  pitch?: number;
  overhang?: number;
}

/** @internal */
export function wallSegments(points: readonly Vec2[], closed: boolean): WallSegment[] {
  const segments: WallSegment[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    segments.push({ from, to, length: Math.hypot(dx, dz), angle: Math.atan2(dz, dx) });
  }
  return segments;
}

/** @internal */
export function isEnclosed(points: readonly Vec2[], tolerance = 0.5): boolean {
  if (points.length < 3) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= tolerance;
}

/** @internal */
export function enclosePath(points: readonly Vec2[], tolerance = 0.5): readonly Vec2[] {
  if (points.length < 3) return points;
  if (!isEnclosed(points, tolerance)) return points;
  return points.slice(0, points.length - 1);
}

/** @internal */
export function polygonArea(polygon: readonly Vec2[]): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

/** @internal */
export function footprintFromWalls(points: readonly Vec2[], tolerance = 0.5): EnclosedFootprint | null {
  const closed = isEnclosed(points, tolerance);
  const polygon = enclosePath(points, tolerance);
  if (polygon.length < 3) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  let perimeter = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const point = polygon[index]!;
    if (point[0] < minX) minX = point[0];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] < minZ) minZ = point[1];
    if (point[1] > maxZ) maxZ = point[1];
    const next = polygon[(index + 1) % polygon.length]!;
    perimeter += Math.hypot(next[0] - point[0], next[1] - point[1]);
  }
  return {
    polygon,
    aabb: { minX, minZ, maxX, maxZ },
    area: polygonArea(polygon),
    perimeter,
    closed,
  };
}

/** @internal */
export function autoRoof(footprint: EnclosedFootprint, config: RoofConfig = {}): RoofPlan {
  const style = config.style ?? "hip";
  const eaveHeight = config.eaveHeight ?? 3;
  const pitch = config.pitch ?? 0.5;
  const overhang = config.overhang ?? 0.4;
  const aabb = footprint.aabb;
  const minX = aabb.minX - overhang;
  const maxX = aabb.maxX + overhang;
  const minZ = aabb.minZ - overhang;
  const maxZ = aabb.maxZ + overhang;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const ridgeAlongX = width >= depth;
  const halfSpan = (ridgeAlongX ? depth : width) / 2;
  const apexHeight = style === "flat" ? eaveHeight : eaveHeight + halfSpan * pitch;

  if (style === "flat") {
    const face: WallVec3[] = [
      [minX, eaveHeight, minZ],
      [maxX, eaveHeight, minZ],
      [maxX, eaveHeight, maxZ],
      [minX, eaveHeight, maxZ],
    ];
    const flatRidge: readonly [Vec2, Vec2] = [
      [minX, cz],
      [maxX, cz],
    ];
    return { style, ridge: flatRidge, apexHeight, eaveHeight, faces: [face] };
  }

  const ridge: readonly [Vec2, Vec2] = ridgeAlongX
    ? [
        [minX + (style === "hip" ? halfSpan : 0), cz],
        [maxX - (style === "hip" ? halfSpan : 0), cz],
      ]
    : [
        [cx, minZ + (style === "hip" ? halfSpan : 0)],
        [cx, maxZ - (style === "hip" ? halfSpan : 0)],
      ];
  const r0: WallVec3 = [ridge[0][0], apexHeight, ridge[0][1]];
  const r1: WallVec3 = [ridge[1][0], apexHeight, ridge[1][1]];

  const corners: Record<string, WallVec3> = {
    nw: [minX, eaveHeight, minZ],
    ne: [maxX, eaveHeight, minZ],
    se: [maxX, eaveHeight, maxZ],
    sw: [minX, eaveHeight, maxZ],
  };
  const faces: WallVec3[][] = ridgeAlongX
    ? [
        [corners.nw!, corners.ne!, r1, r0],
        [corners.se!, corners.sw!, r0, r1],
      ]
    : [
        [corners.ne!, corners.se!, r1, r0],
        [corners.sw!, corners.nw!, r0, r1],
      ];
  if (style === "hip") {
    faces.push(
      ridgeAlongX
        ? [corners.sw!, corners.nw!, r0]
        : [corners.nw!, corners.ne!, r0],
    );
    faces.push(
      ridgeAlongX
        ? [corners.ne!, corners.se!, r1]
        : [corners.se!, corners.sw!, r1],
    );
  }
  return { style, ridge, apexHeight, eaveHeight, faces };
}

export type PaintTarget = "floor" | "wall";

export interface SurfacePaintStore {
  paint(target: PaintTarget, key: string, surface: string): void;
  clear(target: PaintTarget, key: string): void;
  get(target: PaintTarget, key: string): string | null;
  entries(target: PaintTarget): readonly (readonly [string, string])[];
  snapshot(): Record<PaintTarget, Record<string, string>>;
  restore(snapshot: Record<PaintTarget, Record<string, string>>): void;
}

/** @internal */
export function createSurfacePaint(): SurfacePaintStore {
  const maps: Record<PaintTarget, Map<string, string>> = {
    floor: new Map(),
    wall: new Map(),
  };
  return {
    paint(target, key, surface) {
      maps[target].set(key, surface);
    },
    clear(target, key) {
      maps[target].delete(key);
    },
    get(target, key) {
      return maps[target].get(key) ?? null;
    },
    entries(target) {
      return Array.from(maps[target].entries());
    },
    snapshot() {
      return {
        floor: Object.fromEntries(maps.floor),
        wall: Object.fromEntries(maps.wall),
      };
    },
    restore(snapshot) {
      maps.floor = new Map(Object.entries(snapshot.floor ?? {}));
      maps.wall = new Map(Object.entries(snapshot.wall ?? {}));
    },
  };
}

export interface WallDrawTool {
  addPoint(point: Vec2, snap?: number): Vec2;
  undo(): void;
  close(): void;
  clear(): void;
  points(): readonly Vec2[];
  segments(): WallSegment[];
  isClosed(): boolean;
  footprint(): EnclosedFootprint | null;
  roof(config?: RoofConfig): RoofPlan | null;
}

function snapPoint(point: Vec2, grid: number): Vec2 {
  if (!(grid > 0)) return point;
  return [Math.round(point[0] / grid) * grid, Math.round(point[1] / grid) * grid];
}

/** @internal */
export function createWallDrawTool(config: { snap?: number; closeTolerance?: number } = {}): WallDrawTool {
  const defaultSnap = config.snap ?? 0;
  const closeTolerance = config.closeTolerance ?? 0.5;
  let pts: Vec2[] = [];
  let closed = false;

  return {
    addPoint(point, snap) {
      const grid = snap ?? defaultSnap;
      const next = snapPoint(point, grid);
      if (pts.length >= 3 && Math.hypot(next[0] - pts[0]![0], next[1] - pts[0]![1]) <= closeTolerance) {
        closed = true;
        return pts[0]!;
      }
      pts.push(next);
      return next;
    },
    undo() {
      pts.pop();
      closed = false;
    },
    close() {
      if (pts.length >= 3) closed = true;
    },
    clear() {
      pts = [];
      closed = false;
    },
    points() {
      return pts;
    },
    segments() {
      return wallSegments(pts, closed);
    },
    isClosed() {
      return closed;
    },
    footprint() {
      if (!closed && !isEnclosed(pts, closeTolerance)) return null;
      return footprintFromWalls(pts, closeTolerance);
    },
    roof(roofConfig) {
      const fp = this.footprint();
      return fp === null ? null : autoRoof(fp, roofConfig);
    },
  };
}

/** @internal */
export function wallSegmentBounds(segment: WallSegment, thickness: number): Aabb {
  const center: Vec2 = [(segment.from[0] + segment.to[0]) / 2, (segment.from[1] + segment.to[1]) / 2];
  const quarterTurns = Math.abs(Math.round(segment.angle / (Math.PI / 2))) % 2;
  return footprintAabb(center, { w: segment.length, d: thickness }, quarterTurns);
}
