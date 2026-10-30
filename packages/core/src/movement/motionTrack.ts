import type { Easing } from "../anim/easing";
import type { Vec3 } from "../world/geometry";

/** A path and its timing. Give exactly one of `duration` or `speed`. */
export interface MotionTrackConfig {
  /** At least two points; the thing moves through them in order, straight between each pair. */
  points: readonly Vec3[];
  /** Seconds from start to arrival. */
  duration?: number;
  /** Metres per second along the path; duration = path length / speed. */
  speed?: number;
  /** Shapes progress over time. Default linear. */
  easing?: Easing;
  /** Caller-clock time (seconds) the motion starts. */
  startAt: number;
}

/** Plain JSON state of a motion track. */
export interface MotionTrackState {
  startAt: number;
  arrivalReported: boolean;
}

/** A path and its timing that report where the thing is and when it arrives. */
export interface MotionTrack {
  /** Writes the position at `now` into `out` without allocating; returns progress 0..1 (eased). Before startAt: first point; after arrival: last point. */
  sampleInto(now: number, out: [number, number, number]): number;
  /** Time of arrival on the caller's clock. */
  arrivesAt(): number;
  /** True exactly once: on the first call with now >= arrivesAt(). For landing effects. */
  justArrived(now: number): boolean;
  /** Total path length in metres. */
  length(): number;
  /** Replace the path or timing; recomputes arrival. */
  retune(config: Partial<MotionTrackConfig>): void;
  snapshot(): MotionTrackState;
  restore(state: MotionTrackState): void;
  /** Start again at startAt from the config, arrival not reported. */
  reset(): void;
}

const linearEasing: Easing = (t) => t;

function constrain01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

interface MeasuredPath {
  readonly points: readonly Vec3[];
  /** Distance from the first point to each point; `distances[0] === 0`. */
  readonly distances: readonly number[];
  readonly length: number;
  readonly start: Vec3;
  readonly end: Vec3;
}

function measurePath(points: readonly Vec3[]): MeasuredPath {
  const first = points[0];
  const last = points[points.length - 1];
  const start: Vec3 = first === undefined ? [0, 0, 0] : [first[0], first[1], first[2]];
  const end: Vec3 = last === undefined ? start : [last[0], last[1], last[2]];
  const distances: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) break;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    distances.push(total);
  }
  return { points, distances, length: total, start, end };
}

function copyPoint(point: Vec3, out: [number, number, number]): void {
  out[0] = point[0];
  out[1] = point[1];
  out[2] = point[2];
}

type Timing =
  | { readonly kind: "duration"; readonly seconds: number }
  | { readonly kind: "speed"; readonly metresPerSecond: number };

function checkPoints(points: readonly Vec3[]): void {
  if (points.length < 2) throw new Error("a motion track needs at least two points");
}

function resolveTiming(duration: number | undefined, speed: number | undefined): Timing {
  if (duration !== undefined && speed !== undefined) {
    throw new Error("a motion track takes a duration or a speed, not both");
  }
  if (duration === undefined) {
    if (speed === undefined) throw new Error("a motion track needs a duration or a speed");
    if (!(speed > 0)) throw new Error("a motion track speed must be greater than zero");
    return { kind: "speed", metresPerSecond: speed };
  }
  if (!(duration > 0)) throw new Error("a motion track duration must be greater than zero");
  return { kind: "duration", seconds: duration };
}

function durationOf(timing: Timing, pathLength: number): number {
  return timing.kind === "duration" ? timing.seconds : pathLength / timing.metresPerSecond;
}

/**
 * Moves a thing along a path of points over time and reports when it arrives.
 *
 * @capability motion-track move a thing along a path over time and report its arrival
 */
export function createMotionTrack(config: MotionTrackConfig): MotionTrack {
  checkPoints(config.points);
  let timing = resolveTiming(config.duration, config.speed);
  let path = measurePath(config.points);
  let duration = durationOf(timing, path.length);
  let easing = config.easing ?? linearEasing;
  let startAt = config.startAt;
  let configuredStartAt = config.startAt;
  let arrivalReported = false;

  const arrives = (): number => startAt + duration;

  return {
    sampleInto(now, out) {
      if (duration <= 0) {
        if (now < startAt) {
          copyPoint(path.start, out);
          return 0;
        }
        copyPoint(path.end, out);
        return 1;
      }
      const raw = (now - startAt) / duration;
      if (raw <= 0) {
        copyPoint(path.start, out);
        return 0;
      }
      if (raw >= 1) {
        copyPoint(path.end, out);
        return 1;
      }
      const eased = constrain01(easing(raw));
      if (eased <= 0) {
        copyPoint(path.start, out);
        return 0;
      }
      if (eased >= 1) {
        copyPoint(path.end, out);
        return 1;
      }

      const target = eased * path.length;
      let low = 0;
      let high = path.points.length - 1;
      while (low + 1 < high) {
        const mid = (low + high) >> 1;
        const edge = path.distances[mid];
        if (edge !== undefined && edge <= target) low = mid;
        else high = mid;
      }
      const seg = low;
      const from = path.points[seg];
      const to = path.points[seg + 1];
      const fromDistance = path.distances[seg];
      const toDistance = path.distances[seg + 1];
      if (from === undefined || to === undefined || fromDistance === undefined || toDistance === undefined) {
        copyPoint(path.end, out);
        return eased;
      }
      const span = toDistance - fromDistance;
      const t = span > 0 ? (target - fromDistance) / span : 0;
      out[0] = from[0] + (to[0] - from[0]) * t;
      out[1] = from[1] + (to[1] - from[1]) * t;
      out[2] = from[2] + (to[2] - from[2]) * t;
      return eased;
    },
    arrivesAt: arrives,
    justArrived(now) {
      if (arrivalReported || now < arrives()) return false;
      arrivalReported = true;
      return true;
    },
    length: () => path.length,
    retune(patch) {
      const nextPoints = patch.points ?? path.points;
      checkPoints(nextPoints);
      const nextPath = measurePath(nextPoints);
      let nextTiming = timing;
      if (patch.duration !== undefined && patch.speed !== undefined) {
        throw new Error("a motion track takes a duration or a speed, not both");
      }
      if (patch.speed !== undefined) {
        if (!(patch.speed > 0)) throw new Error("a motion track speed must be greater than zero");
        nextTiming = { kind: "speed", metresPerSecond: patch.speed };
      } else if (patch.duration !== undefined) {
        if (!(patch.duration > 0)) throw new Error("a motion track duration must be greater than zero");
        nextTiming = { kind: "duration", seconds: patch.duration };
      }
      const nextStartAt = patch.startAt ?? startAt;
      path = nextPath;
      timing = nextTiming;
      duration = durationOf(nextTiming, nextPath.length);
      easing = patch.easing ?? easing;
      startAt = nextStartAt;
      if (patch.startAt !== undefined) configuredStartAt = patch.startAt;
    },
    snapshot: () => ({ startAt, arrivalReported }),
    restore(state) {
      startAt = state.startAt;
      arrivalReported = state.arrivalReported;
    },
    reset() {
      startAt = configuredStartAt;
      arrivalReported = false;
    },
  };
}
