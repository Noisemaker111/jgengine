export type VisionPoint = readonly [number, number];

/** Structurally matches `world/walls` `WallSegment` — pass those straight in as occluders. */
export interface VisionWall {
  from: VisionPoint;
  to: VisionPoint;
}

export interface VisionConeConfig {
  range: number;
  /** Full cone opening angle in radians (matches `TelegraphShape`'s cone `angle`). */
  angle: number;
}

function orientation(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const value = (bz - az) * (cx - bx) - (bx - ax) * (cz - bz);
  if (value > 1e-9) return 1;
  if (value < -1e-9) return -1;
  return 0;
}

function onSegment(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): boolean {
  return (
    Math.min(ax, bx) - 1e-9 <= cx &&
    cx <= Math.max(ax, bx) + 1e-9 &&
    Math.min(az, bz) - 1e-9 <= cz &&
    cz <= Math.max(az, bz) + 1e-9
  );
}

/** 2D segment intersection on the XZ plane (collinear overlaps count) — the LoS building block `revealQuery`/`frustumSensor` never shipped (#286.5).
 * @internal
 */
export function segmentsIntersect(a1: VisionPoint, a2: VisionPoint, b1: VisionPoint, b2: VisionPoint): boolean {
  const o1 = orientation(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1]);
  const o2 = orientation(a1[0], a1[1], a2[0], a2[1], b2[0], b2[1]);
  const o3 = orientation(b1[0], b1[1], b2[0], b2[1], a1[0], a1[1]);
  const o4 = orientation(b1[0], b1[1], b2[0], b2[1], a2[0], a2[1]);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1])) return true;
  if (o2 === 0 && onSegment(a1[0], a1[1], a2[0], a2[1], b2[0], b2[1])) return true;
  if (o3 === 0 && onSegment(b1[0], b1[1], b2[0], b2[1], a1[0], a1[1])) return true;
  if (o4 === 0 && onSegment(b1[0], b1[1], b2[0], b2[1], a2[0], a2[1])) return true;
  return false;
}

/** True when no wall segment crosses the sight line.
 * @internal
 */
export function hasWallLineOfSight(from: VisionPoint, to: VisionPoint, walls: readonly VisionWall[]): boolean {
  for (const wall of walls) {
    if (segmentsIntersect(from, to, wall.from, wall.to)) return false;
  }
  return true;
}

/** Angle + range test only — no occlusion. `heading` is engine yaw (radians, `atan2(dx, dz)`).
 * @internal
 */
export function pointInCone(origin: VisionPoint, heading: number, config: VisionConeConfig, point: VisionPoint): boolean {
  const dx = point[0] - origin[0];
  const dz = point[1] - origin[1];
  const distance = Math.hypot(dx, dz);
  if (distance > config.range) return false;
  if (distance < 1e-9) return true;
  let delta = Math.atan2(dx, dz) - heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= config.angle / 2;
}

export interface VisionTarget<TId extends string = string> {
  id: TId;
  at: VisionPoint;
}

/**
 * The guard-sight primitive every stealth game hand-rolled: an angle+range cone on the XZ plane
 * whose sight lines are blocked by 2D wall segments (`world/walls` segments fit structurally).
 * Pure math — feed entity positions and heading each tick.
 */
export interface VisionCone {
  canSee(origin: VisionPoint, heading: number, target: VisionPoint): boolean;
  visibleTargets<TId extends string>(
    origin: VisionPoint,
    heading: number,
    targets: readonly VisionTarget<TId>[],
  ): TId[];
}

/** @internal */
export function createVisionCone(config: VisionConeConfig, walls: readonly VisionWall[] = []): VisionCone {
  function canSee(origin: VisionPoint, heading: number, target: VisionPoint): boolean {
    return pointInCone(origin, heading, config, target) && hasWallLineOfSight(origin, target, walls);
  }
  return {
    canSee,
    visibleTargets(origin, heading, targets) {
      const seen: (typeof targets)[number]["id"][] = [];
      for (const target of targets) {
        if (canSee(origin, heading, target.at)) seen.push(target.id);
      }
      return seen;
    },
  };
}
