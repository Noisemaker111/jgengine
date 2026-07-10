import type { Waypoint } from "./pathFollow";

export interface TimetableStop {
  at: Waypoint;
  /** Seconds the mover holds at this waypoint before departing. */
  dwellSeconds?: number;
}

export interface RouteTimetableConfig {
  waypoints: readonly (Waypoint | TimetableStop)[];
  /** World units per second between stops. */
  speed: number;
  /** Wrap from the last waypoint back to the first (a circular line). Default `false` — the mover holds at the terminus. */
  loop?: boolean;
  /** Default dwell applied at every waypoint without its own `dwellSeconds`; default `0`. */
  dwellSeconds?: number;
  /** Shifts the whole timetable so `t = 0` lands mid-route — staggers several movers on one route. */
  offsetSeconds?: number;
}

export interface TimetablePose {
  position: Waypoint;
  /** Yaw (radians) of the travel direction, matching engine `rotationY`; holds through dwells. */
  heading: number;
  /** Index of the segment being travelled (or the stop being dwelt at). */
  segment: number;
  /** True while holding at a stop. */
  dwelling: boolean;
}

/**
 * A deterministic mover over an authored route: position is a pure function of absolute time, so a
 * forecast preview (`poseAt(t + 30)`) and the live mover can never disagree — the seam `nav/pathFollow`'s
 * dt-incremental state can't offer. Trains, ferries, patrol shuttles, crushers: anything on a timetable.
 */
export interface RouteTimetable {
  /** Seconds for one full cycle (travel + dwells); non-loop routes hold at the terminus after this. */
  readonly cycleSeconds: number;
  readonly distance: number;
  poseAt(t: number): TimetablePose;
  positionAt(t: number): Waypoint;
  /** Cycle progress in `[0, 1]` — clamps at `1` on a non-looping route's terminus. */
  progressAt(t: number): number;
}

interface Leg {
  from: Waypoint;
  to: Waypoint;
  heading: number;
  startSeconds: number;
  travelSeconds: number;
  dwellSeconds: number;
}

function stopOf(entry: Waypoint | TimetableStop): TimetableStop {
  return Array.isArray(entry) ? { at: entry as Waypoint } : (entry as TimetableStop);
}

export function createRouteTimetable(config: RouteTimetableConfig): RouteTimetable {
  if (!(config.speed > 0)) throw new Error(`timetable speed must be positive, got ${config.speed}`);
  const stops = config.waypoints.map(stopOf);
  if (stops.length < 2) throw new Error("timetable needs at least two waypoints");
  const loop = config.loop ?? false;
  const defaultDwell = Math.max(0, config.dwellSeconds ?? 0);
  const offset = config.offsetSeconds ?? 0;

  const legs: Leg[] = [];
  let clock = 0;
  let distance = 0;
  const legCount = loop ? stops.length : stops.length - 1;
  for (let i = 0; i < legCount; i += 1) {
    const from = stops[i]!;
    const to = stops[(i + 1) % stops.length]!;
    const dwell = Math.max(0, from.dwellSeconds ?? defaultDwell);
    const dx = to.at[0] - from.at[0];
    const dy = to.at[1] - from.at[1];
    const dz = to.at[2] - from.at[2];
    const length = Math.hypot(dx, dy, dz);
    const heading = length > 1e-9 ? Math.atan2(dx, dz) : 0;
    legs.push({
      from: from.at,
      to: to.at,
      heading,
      startSeconds: clock,
      travelSeconds: length / config.speed,
      dwellSeconds: dwell,
    });
    clock += dwell + length / config.speed;
    distance += length;
  }
  const cycleSeconds = clock;
  const terminus = stops[stops.length - 1]!.at;
  const lastHeading = legs[legs.length - 1]!.heading;

  function poseAt(t: number): TimetablePose {
    let local = t + offset;
    if (loop) {
      local = ((local % cycleSeconds) + cycleSeconds) % cycleSeconds;
    } else {
      local = Math.max(0, local);
      if (local >= cycleSeconds) {
        return { position: terminus, heading: lastHeading, segment: legs.length - 1, dwelling: true };
      }
    }
    let leg = legs[legs.length - 1]!;
    let segment = legs.length - 1;
    for (let i = 0; i < legs.length; i += 1) {
      const candidate = legs[i]!;
      if (local < candidate.startSeconds + candidate.dwellSeconds + candidate.travelSeconds) {
        leg = candidate;
        segment = i;
        break;
      }
    }
    const intoLeg = local - leg.startSeconds;
    if (intoLeg < leg.dwellSeconds) {
      const previous = legs[(segment - 1 + legs.length) % legs.length]!;
      const heading = segment === 0 && !loop ? leg.heading : previous.heading;
      return { position: leg.from, heading, segment, dwelling: true };
    }
    const travelled = intoLeg - leg.dwellSeconds;
    const fraction = leg.travelSeconds <= 0 ? 1 : Math.min(1, travelled / leg.travelSeconds);
    return {
      position: [
        leg.from[0] + (leg.to[0] - leg.from[0]) * fraction,
        leg.from[1] + (leg.to[1] - leg.from[1]) * fraction,
        leg.from[2] + (leg.to[2] - leg.from[2]) * fraction,
      ],
      heading: leg.heading,
      segment,
      dwelling: false,
    };
  }

  return {
    cycleSeconds,
    distance,
    poseAt,
    positionAt: (t) => poseAt(t).position,
    progressAt(t) {
      if (cycleSeconds <= 0) return 1;
      const local = t + offset;
      if (loop) return (((local % cycleSeconds) + cycleSeconds) % cycleSeconds) / cycleSeconds;
      return Math.max(0, Math.min(1, local / cycleSeconds));
    },
  };
}
