import type { Waypoint } from "@jgengine/core/nav/pathFollow";

export interface GuardDef {
  id: string;
  name: string;
  wing: string;
  waypoints: readonly Waypoint[];
  speed: number;
  visionRadius: number;
  visionAngleDeg: number;
  loopSeconds: number;
}

export interface GuardPose {
  position: Waypoint;
  heading: number;
}

interface GuardPath {
  cumulative: readonly number[];
  totalLength: number;
}

const pathCache = new Map<string, GuardPath>();

function segmentDistance(a: Waypoint, b: Waypoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function pathOf(guard: GuardDef): GuardPath {
  const cached = pathCache.get(guard.id);
  if (cached !== undefined) return cached;
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < guard.waypoints.length; i += 1) {
    total += segmentDistance(guard.waypoints[i - 1]!, guard.waypoints[i]!);
    cumulative.push(total);
  }
  const path: GuardPath = { cumulative, totalLength: total };
  pathCache.set(guard.id, path);
  return path;
}

function lerpWaypoint(a: Waypoint, b: Waypoint, t: number): Waypoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function headingBetween(a: Waypoint, b: Waypoint): number {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return Math.atan2(dx, dz);
}

/** Fraction (0..1) of the way through the guard's authored loop at time `t` — the route-phase dial. */
export function guardPhaseAt(guard: GuardDef, t: number): number {
  const { totalLength } = pathOf(guard);
  if (totalLength <= 1e-9 || guard.speed <= 0) return 0;
  const travelled = t <= 0 ? 0 : (guard.speed * t) % totalLength;
  return travelled / totalLength;
}

/**
 * Pure position-at-time for a guard's authored patrol loop. Deterministic:
 * calling this with the same `t` always returns the same pose, so the
 * timetable scrubber's preview(t) and the live tick's position(t) are the
 * exact same function — no incremental accumulation, no drift.
 */
export function guardPositionAt(guard: GuardDef, t: number): GuardPose {
  const waypoints = guard.waypoints;
  if (waypoints.length === 0) return { position: [0, 0, 0], heading: 0 };
  if (waypoints.length === 1 || guard.speed <= 0) return { position: waypoints[0]!, heading: 0 };

  const { cumulative, totalLength } = pathOf(guard);
  if (totalLength <= 1e-9) return { position: waypoints[0]!, heading: 0 };

  const travelled = t <= 0 ? 0 : (guard.speed * t) % totalLength;

  let index = 0;
  for (let i = 1; i < cumulative.length; i += 1) {
    if (cumulative[i]! >= travelled) {
      index = i;
      break;
    }
    index = i;
  }
  const segStart = cumulative[index - 1]!;
  const segEnd = cumulative[index]!;
  const segLength = segEnd - segStart;
  const segT = segLength <= 1e-9 ? 0 : (travelled - segStart) / segLength;
  const from = waypoints[index - 1]!;
  const to = waypoints[index]!;
  return { position: lerpWaypoint(from, to, segT), heading: headingBetween(from, to) };
}
