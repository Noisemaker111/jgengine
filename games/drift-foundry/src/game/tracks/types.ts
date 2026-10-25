import type { BiomeFog, BiomeSky, OceanPalette, TerrainColors } from "@jgengine/core/world/features";
import type { CoursePiece, CourseSpanCycle, CourseVec2 } from "@jgengine/core/world/routeCourse";

import type { PartIconId } from "../parts/catalog";
import type { TrackZone } from "../zones/catalog";

/**
 * One yard track as authored data. The course itself is the engine's route course
 * (`@jgengine/core/world/routeCourse`): a start, turtle pieces, branches and tagged spans. Everything
 * the run reads off a track - gates, drops, hazards, zones - is placed in *run metres*: metres along
 * the main line from the start line, so the start line is 0 and the gate is `exitAt`. A branch's run
 * metres are the main-line metres it stands in for, so a shortcut's gate sits "at" the main-line
 * distance it skips.
 */

export type HazardKind = "slag" | "train" | "belt" | "flood" | "slick";

/** A hazard over a stretch of one route. `from`/`to` are run metres (main) or branch-local metres (a branch). */
export interface TrackHazardDef {
  id: string;
  kind: HazardKind;
  route?: string;
  from: number;
  to: number;
  /** Lateral band, metres from the centreline (positive left). Default: the whole width. */
  offset?: readonly [number, number];
  cycle?: CourseSpanCycle;
  /** Belt push along the route heading, m/s (negative pushes back). */
  push?: number;
  /** What the radio calls it. */
  label: string;
}

export interface TrackGateDef {
  id: string;
  requirement: "plow" | "jump";
  /** Run metres of the barricade. On a branch, the main-line metres it stands in for. */
  at: number;
  /** Route id; default the main line. */
  route?: string;
  label: string;
  radioLine: string;
  /** A set-piece barricade: open road until this many seconds into the run, then it drops in. */
  dropsAt?: number;
}

export interface TrackPickupDef {
  partId: PartIconId;
  at: number;
  /** Metres off the centreline, positive left. */
  lane: number;
  route?: string;
}

/** A shortcut or alternate line, given as run metres on the main line. */
export interface TrackBranchDef {
  id: string;
  from: number;
  to: number;
  /** World control points. Omitted, the branch is the straight chord between its two junctions. */
  via?: readonly CourseVec2[];
  halfWidth: number;
  label: string;
}

/** A placed library or yard prop the track is dressed with: a landmark or set-piece. */
export interface TrackLandmark {
  /** Object catalog id. */
  object: string;
  /** Run metres along the main line, or a world `[x, z]`. */
  at: number | readonly [number, number];
  /** Metres off the centreline when `at` is run metres. */
  side?: number;
  rotation?: number;
}

export interface TrackDressing {
  /** Wall post object tiled along every route edge. */
  edge: string;
  edgeSpacing: number;
  /** Lamp object down the edges, every `lampSpacing` metres, alternating sides. */
  lamp: string;
  lampSpacing: number;
  /** Props scattered off the course. */
  scatter: readonly string[];
  scatterCount: number;
  landmarks: readonly TrackLandmark[];
}

export interface TrackDef {
  id: string;
  label: string;
  /** One line on the calendar card: what makes this layout this layout. */
  blurb: string;
  /** Main-line metres laid behind the start line: the compactor's run-up and the grid. */
  origin: number;
  start: { x: number; z: number; heading: number; elevation?: number };
  halfWidth: number;
  /** Paved strip half-width; beyond it is the shoulder. */
  pavedHalfWidth: number;
  pieces: readonly CoursePiece[];
  branches: readonly TrackBranchDef[];
  hazards: readonly TrackHazardDef[];
  gates: readonly TrackGateDef[];
  pickups: readonly TrackPickupDef[];
  /** Run metres of the exit gate. */
  exitAt: number;
  /** The yard's zones in run metres, first to last. */
  zones: readonly TrackZone[];
  /** World z the track's lighting band is centred on. */
  bandZ: number;
  ground: TerrainColors;
  fog: BiomeFog;
  sky: BiomeSky;
  weather?: "rain" | "snow";
  /** Ground level around the course, metres; the course rides its own elevation and banks down to this. */
  baseLevel: number;
  /** A liquid sheet across the track's ground: slag, flood water. */
  liquid?: { level: number; color: string; waveHeight: number; palette?: OceanPalette };
  /** Branch ids each rival takes on this track. */
  rivalTake: Readonly<Record<string, readonly string[]>>;
  /** Escape time the line multiplier is judged against, seconds. */
  par: number;
  /** Generic course dressing. Row Six omits it: the corridor keeps its own zone scatter, lamps and towers. */
  dressing?: TrackDressing;
}

export const straight = (length: number, extra: Omit<Extract<CoursePiece, { kind: "straight" }>, "kind" | "length"> = {}): CoursePiece => ({ kind: "straight", length, ...extra });

/** Positive degrees turn toward the left normal (see routeCourse). */
export const turn = (degrees: number, radius: number, extra: Omit<Extract<CoursePiece, { kind: "turn" }>, "kind" | "angle" | "radius"> = {}): CoursePiece => ({
  kind: "turn",
  angle: (degrees * Math.PI) / 180,
  radius,
  ...extra,
});

/**
 * A bulge off the straight line and back: out `degrees`, a straight, back through twice the angle, a
 * straight, and square again. `side` +1 bulges left. The chord across it is the natural shortcut.
 */
export function detour(side: 1 | -1, degrees: number, radius: number, leg: number, tag?: string): readonly CoursePiece[] {
  const extra = tag === undefined ? {} : { tag };
  return [
    turn(side * degrees, radius, extra),
    straight(leg, extra),
    turn(-2 * side * degrees, radius, extra),
    straight(leg, extra),
    turn(side * degrees, radius, extra),
  ];
}

/** Main-line metres a list of pieces covers. */
export function piecesLength(pieces: readonly CoursePiece[]): number {
  return pieces.reduce((sum, piece) => sum + (piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius), 0);
}
