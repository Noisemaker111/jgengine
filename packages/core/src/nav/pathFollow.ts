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

/**
 * Semantic seek target for {@link pathFollowSeek} — the caller-facing progress vocabulary a
 * stateful path behavior restores from, so a follower can start at a distributed phase or resume
 * a serialized route without knowing waypoint internals. `direction` (forward heading) falls out of
 * the resulting {@link PathFollowState.heading}, so it is an output rather than a seek input.
 */
export type PathProgress =
  /** Fraction `0..1` of total path length (looping paths wrap; clamped otherwise). */
  | { readonly kind: "normalized"; readonly value: number }
  /** World-distance travelled from the first waypoint (looping paths wrap; clamped otherwise). */
  | { readonly kind: "distance"; readonly value: number }
  /** Segment `index` (0-based) plus `fraction` `0..1` along that segment. */
  | { readonly kind: "segment"; readonly index: number; readonly fraction: number };

/** Read-only progress readout for inspection/debug tooling, produced by {@link pathFollowProgress}. */
export interface PathFollowProgress {
  /** Cumulative world-distance travelled (matches {@link PathFollowState.distanceTravelled}). */
  distance: number;
  /** Fraction `0..1` of total path length at the current position. */
  normalized: number;
  /** 0-based index of the segment the mover is currently on. */
  segment: number;
  /** Fraction `0..1` along the current segment. */
  fraction: number;
}

interface PathSegment {
  from: Waypoint;
  to: Waypoint;
  len: number;
  /** Waypoint index this segment travels toward (the follower's `target`). */
  dest: number;
}

function pathSegments(waypoints: readonly Waypoint[], loop: boolean): PathSegment[] {
  const count = waypoints.length;
  const segments: PathSegment[] = [];
  const limit = loop ? count : count - 1;
  for (let i = 0; i < limit; i += 1) {
    const from = waypoints[i]!;
    const dest = (i + 1) % count;
    const to = waypoints[dest]!;
    segments.push({ from, to, len: Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]), dest });
  }
  return segments;
}

function distanceForProgress(target: PathProgress, total: number, segments: readonly PathSegment[]): number {
  if (target.kind === "distance") return target.value;
  if (target.kind === "normalized") return target.value * total;
  let distance = 0;
  for (let i = 0; i < target.index && i < segments.length; i += 1) distance += segments[i]!.len;
  const seg = segments[target.index];
  if (seg !== undefined) distance += seg.len * target.fraction;
  return distance;
}

/**
 * Total world-distance of a path — sum of every segment, including the wrap segment back to the
 * first waypoint when `loop` is set. Zero for a degenerate (0- or 1-waypoint) path.
 *
 * @capability path-length total polyline distance for progress math and seeding
 */
export function pathLength(config: PathFollowConfig): number {
  return pathSegments(config.waypoints, config.loop ?? false).reduce((sum, seg) => sum + seg.len, 0);
}

/**
 * Place a follower at a semantic {@link PathProgress} without simulating from the start — the seek
 * adapter behavior lifecycles use to seed distributed phases and restore serialized routes. Pure;
 * returns a fresh {@link PathFollowState} whose `heading` gives travel direction. Looping paths wrap
 * the distance; non-looping paths clamp to `[0, pathLength]` and report `done` at the end.
 *
 * @capability path-follow-seek jump a path-follower to normalized/distance/segment progress
 */
export function pathFollowSeek(config: PathFollowConfig, target: PathProgress): PathFollowState {
  const { waypoints } = config;
  const loop = config.loop ?? false;
  const count = waypoints.length;
  if (count <= 1) return createPathFollow(config);
  const segments = pathSegments(waypoints, loop);
  const total = segments.reduce((sum, seg) => sum + seg.len, 0);
  if (total <= EPSILON) return createPathFollow(config);
  const requested = distanceForProgress(target, total, segments);
  const positioned = loop ? ((requested % total) + total) % total : Math.max(0, Math.min(total, requested));
  let acc = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    const last = i === segments.length - 1;
    if (positioned < acc + seg.len || last) {
      const along = Math.max(0, Math.min(seg.len, positioned - acc));
      const t = seg.len > EPSILON ? along / seg.len : 0;
      const position: Waypoint = [
        seg.from[0] + (seg.to[0] - seg.from[0]) * t,
        seg.from[1] + (seg.to[1] - seg.from[1]) * t,
        seg.from[2] + (seg.to[2] - seg.from[2]) * t,
      ];
      const heading = Math.atan2(seg.to[0] - seg.from[0], seg.to[2] - seg.from[2]);
      const done = !loop && positioned >= total - EPSILON;
      return {
        position,
        target: done ? count - 1 : seg.dest,
        heading,
        done,
        distanceTravelled: loop ? requested : positioned,
      };
    }
    acc += seg.len;
  }
  return createPathFollow(config);
}

/**
 * Read a follower's current progress in every semantic form — the inverse of {@link pathFollowSeek},
 * for editor/debug inspection and progress HUDs. Pure and allocation-light.
 *
 * @capability path-follow-progress read normalized/distance/segment progress from follow state
 */
export function pathFollowProgress(config: PathFollowConfig, state: PathFollowState): PathFollowProgress {
  const loop = config.loop ?? false;
  const segments = pathSegments(config.waypoints, loop);
  const total = segments.reduce((sum, seg) => sum + seg.len, 0);
  let segment = segments.findIndex((seg) => seg.dest === state.target);
  if (segment < 0) segment = 0;
  const seg = segments[segment];
  let fraction = 0;
  if (seg !== undefined && seg.len > EPSILON) {
    const along = Math.hypot(
      state.position[0] - seg.from[0],
      state.position[1] - seg.from[1],
      state.position[2] - seg.from[2],
    );
    fraction = Math.max(0, Math.min(1, along / seg.len));
  }
  let traversed = fraction * (seg?.len ?? 0);
  for (let i = 0; i < segment; i += 1) traversed += segments[i]!.len;
  return {
    distance: state.distanceTravelled,
    normalized: total > EPSILON ? traversed / total : 0,
    segment,
    fraction,
  };
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
