import {
  buildRouteCourse,
  MAIN_ROUTE,
  type CourseBranchSpec,
  type CourseFix,
  type CoursePoint,
  type CourseSpan,
  type CourseSpanSpec,
  type CourseVec2,
  type RouteCourse,
} from "@jgengine/core/world/routeCourse";

import type { PickupDef } from "../run/pickups";
import type { RouteGate } from "../route/gates";
import { zoneAt, type TrackZone } from "../zones/catalog";
import { CONVEYOR_MAZE } from "./conveyorMaze";
import { FLOODED_QUARRY } from "./floodedQuarry";
import { RAIL_YARD } from "./railYard";
import { ROW_SIX } from "./rowSix";
import { SLAG_RIVER } from "./slagRiver";
import { SMELTER_CLIMB } from "./smelterClimb";
import type { HazardKind, TrackDef } from "./types";

/** Row Six's barricades span past its fences, the way the corridor was first built. */
const ROW_SIX_LANE: readonly [number, number] = [-20, 20];
const PICKUP_Y = 0.9;

/** A hazard as the run meets it: the span the course found, with the track's own words. */
export interface ActiveHazard {
  id: string;
  kind: HazardKind;
  label: string;
  push: number;
}

/** A track built for the run: its route course and everything placed on it, in world space too. */
export interface Track {
  readonly def: TrackDef;
  readonly id: string;
  readonly label: string;
  readonly course: RouteCourse;
  readonly origin: number;
  readonly exitAt: number;
  /** Run metres at the far end of the main line: the run-out past the gate. */
  readonly end: number;
  readonly gates: readonly RouteGate[];
  readonly pickups: readonly PickupDef[];
  readonly zones: readonly TrackZone[];
  readonly spawn: { position: readonly [number, number, number]; heading: number };
  /** Run metres of a fix: main-line metres from the start line. */
  run(fix: CourseFix): number;
  /** Route-local metres of a run-metre mark on a route. */
  sOf(route: string, run: number): number;
  /** The world point at run metres on a route, `offset` metres left of its centreline. */
  point(route: string, run: number, offset?: number): CoursePoint;
  locate(x: number, z: number, hint?: CourseFix | null): CourseFix;
  /** Hazards covering a fix at run time `time`. */
  hazardsAt(fix: CourseFix, time: number): readonly ActiveHazard[];
  /** Every hazard span on the track, for dressing and the HUD. */
  readonly hazardSpans: readonly (CourseSpan & { kind: HazardKind; label: string })[];
  zoneAt(run: number): TrackZone;
}

function chordVia(provisional: RouteCourse, from: number, to: number): readonly CourseVec2[] {
  const a = provisional.pointAt(MAIN_ROUTE, from);
  const b = provisional.pointAt(MAIN_ROUTE, to);
  return [1 / 3, 2 / 3].map((t) => [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t] as const);
}

/** Lay a track's course and place its gates, drops and hazards on it. */
export function buildTrack(def: TrackDef): Track {
  const base = { start: def.start, halfWidth: def.halfWidth, pieces: def.pieces };
  const provisional = buildRouteCourse(base);
  const branches: CourseBranchSpec[] = def.branches.map((branch) => ({
    id: branch.id,
    from: branch.from + def.origin,
    to: branch.to + def.origin,
    via: branch.via ?? chordVia(provisional, branch.from + def.origin, branch.to + def.origin),
    halfWidth: branch.halfWidth,
    tag: "branch",
  }));
  const spans: CourseSpanSpec[] = def.hazards.map((hazard) => {
    const onMain = (hazard.route ?? MAIN_ROUTE) === MAIN_ROUTE;
    return {
      id: hazard.id,
      tag: hazard.kind,
      route: hazard.route ?? MAIN_ROUTE,
      from: hazard.from + (onMain ? def.origin : 0),
      to: hazard.to + (onMain ? def.origin : 0),
      ...(hazard.offset === undefined ? {} : { offset: hazard.offset }),
      ...(hazard.cycle === undefined ? {} : { cycle: hazard.cycle }),
      data: { label: hazard.label, push: hazard.push ?? 0, hazard: true },
    };
  });
  const course = buildRouteCourse({ ...base, branches, spans });
  const routeInfo = new Map(course.routes.map((route) => [route.id, route]));

  const sOf = (route: string, run: number): number => {
    const progress = run + def.origin;
    if (route === MAIN_ROUTE) return progress;
    const info = routeInfo.get(route);
    if (info === undefined) throw new Error(`tracks: ${def.id} has no route "${route}"`);
    return ((progress - info.from) / (info.to - info.from)) * info.length;
  };
  const point = (route: string, run: number, offset = 0): CoursePoint => course.pointAt(route, sOf(route, run), offset);

  const corridor = def.id === ROW_SIX.id;
  const gates: RouteGate[] = def.gates.map((gate) => {
    const route = gate.route ?? MAIN_ROUTE;
    const hw = point(route, gate.at).halfWidth;
    return {
      id: gate.id,
      zoneId: zoneAt(gate.at, def.zones).id,
      requirement: gate.requirement,
      route,
      laneX: corridor ? ROW_SIX_LANE : [-(hw + 1), hw + 1],
      atZ: gate.at,
      label: gate.label,
      radioLine: gate.radioLine,
      ...(gate.dropsAt === undefined ? {} : { dropsAt: gate.dropsAt }),
    };
  });
  const pickups: PickupDef[] = def.pickups.map((pickup) => {
    const route = pickup.route ?? MAIN_ROUTE;
    const at = point(route, pickup.at, pickup.lane);
    return { id: `pickup_${pickup.partId}`, partId: pickup.partId, route, at: pickup.at, position: [at.x, PICKUP_Y + (corridor ? 0 : at.elevation), at.z] as const };
  });
  const startPoint = point(MAIN_ROUTE, SPAWN_RUN);
  const hazardSpans = course.spans
    .filter((span) => span.data?.hazard === true)
    .map((span) => ({ ...span, kind: span.tag as HazardKind, label: String(span.data?.label ?? span.tag) }));

  return {
    def,
    id: def.id,
    label: def.label,
    course,
    origin: def.origin,
    exitAt: def.exitAt,
    end: course.length - def.origin,
    gates,
    pickups,
    zones: def.zones,
    spawn: { position: [startPoint.x, corridor ? 0 : startPoint.elevation, startPoint.z], heading: startPoint.heading },
    run: (fix) => fix.progress - def.origin,
    sOf,
    point,
    locate: (x, z, hint) => course.locate(x, z, hint),
    hazardsAt(fix, time) {
      const found: ActiveHazard[] = [];
      for (const span of course.spansAt(fix, time)) {
        if (span.data?.hazard !== true) continue;
        found.push({ id: span.id, kind: span.tag as HazardKind, label: String(span.data.label ?? span.tag), push: Number(span.data.push ?? 0) });
      }
      return found;
    },
    hazardSpans,
    zoneAt: (run) => zoneAt(run, def.zones),
  };
}

/** Where every kart's grid is measured from: the start line is run metre 0, the spawn 4 m past it. */
export const SPAWN_RUN = 4;

export const TRACK_DEFS: readonly TrackDef[] = [ROW_SIX, SLAG_RIVER, RAIL_YARD, SMELTER_CLIMB, CONVEYOR_MAZE, FLOODED_QUARRY];

export const TRACKS: readonly Track[] = TRACK_DEFS.map(buildTrack);

export const ROW_SIX_TRACK: Track = TRACKS[0]!;

export const DEFAULT_TRACK_ID = ROW_SIX.id;

export function trackById(id: string): Track | null {
  return TRACKS.find((track) => track.id === id) ?? null;
}
