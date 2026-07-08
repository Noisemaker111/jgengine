import type { NavPoint } from "./navGrid";

export type Waypoint = readonly [number, number, number];

export interface PathFollowConfig {
  waypoints: readonly Waypoint[];
  /** World units per second. */
  speed: number;
  /** Wrap back to the first waypoint after the last (never `done`). Default false. */
  loop?: boolean;
}

export interface PathFollowState {
  position: Waypoint;
  /** Index of the waypoint the mover is currently travelling toward. */
  target: number;
  /** Yaw (radians) of the current travel direction, matching engine `rotationY`. */
  heading: number;
  done: boolean;
  /** Total world-distance covered so far — drives progress/leak logic in tower defense. */
  distanceTravelled: number;
}

export interface HeightSampler {
  sampleHeight(x: number, z: number): number;
}

export function pathFromNav(
  points: readonly NavPoint[],
  elevation: number | HeightSampler = 0,
  offset = 0,
): Waypoint[] {
  if (typeof elevation === "number") {
    return points.map((point) => [point[0], elevation + offset, point[1]] as Waypoint);
  }
  return points.map(
    (point) => [point[0], elevation.sampleHeight(point[0], point[1]) + offset, point[1]] as Waypoint,
  );
}

export function createPathFollow(config: PathFollowConfig): PathFollowState {
  const first = config.waypoints[0];
  const start: Waypoint = first ?? [0, 0, 0];
  return {
    position: start,
    target: config.waypoints.length > 1 ? 1 : 0,
    heading: 0,
    done: config.waypoints.length <= 1,
    distanceTravelled: 0,
  };
}

const EPSILON = 1e-9;

/**
 * Advance a path-follower by `speed * dt` along its authored polyline. Pure — returns
 * the next state. Crosses multiple waypoints in one step, loops when configured, and
 * reports `done` at the end of a non-looping path. No navmesh required (#52); feed it a
 * navmesh route via `pathFromNav` for click-to-move (#51).
 */
export function advancePathFollow(
  config: PathFollowConfig,
  state: PathFollowState,
  dt: number,
): PathFollowState {
  const { waypoints, speed } = config;
  const loop = config.loop ?? false;
  const count = waypoints.length;
  if (count <= 1 || state.done || dt <= 0 || speed <= 0) return state;

  let position = state.position;
  let target = state.target;
  let heading = state.heading;
  let distanceTravelled = state.distanceTravelled;
  let budget = speed * dt;
  let done = false;
  let guard = count * 4 + 4;

  while (budget > EPSILON && !done && guard > 0) {
    guard -= 1;
    const dest = waypoints[target]!;
    const dx = dest[0] - position[0];
    const dy = dest[1] - position[1];
    const dz = dest[2] - position[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > EPSILON) heading = Math.atan2(dx, dz);
    if (dist <= budget) {
      position = dest;
      budget -= dist;
      distanceTravelled += dist;
      if (target >= count - 1) {
        if (loop) target = 0;
        else done = true;
      } else {
        target += 1;
      }
    } else {
      const t = budget / dist;
      position = [position[0] + dx * t, position[1] + dy * t, position[2] + dz * t];
      distanceTravelled += budget;
      budget = 0;
    }
  }

  return { position, target, heading, done, distanceTravelled };
}
