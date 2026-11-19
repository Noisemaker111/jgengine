import type { BiomeFog, BiomeSky, OceanPalette, TerrainColors } from "@jgengine/core/world/features";
import type { CoursePiece, CourseSpanCycle, CourseVec2 } from "@jgengine/core/roads/routeCourse";

import type { PartIconId } from "../parts/catalog";
import type { TrackZone } from "../zones/catalog";

/**
 * One yard track as the run reads it. The course itself is the engine's route course
 * (`@jgengine/core/roads/routeCourse`): a start, turtle pieces, branches and tagged spans. Every
 * track but Row Six is a `course` marker in editor.scene.json joined with its theme file (see
 * `course.ts`); Row Six is written out here in TS, on the corridor's own constants. Everything
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
  label: string;
}

export interface TrackGateDef {
  id: string;
  requirement: "plow" | "jump";
  /** Run metres of the barricade. On a branch, the main-line metres it stands in for. */
  at: number;
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
  via?: readonly CourseVec2[];
  halfWidth: number;
  label: string;
}

export interface TrackLandmark {
  object: string;
  /** Run metres along the main line, or a world `[x, z]`. */
  at: number | readonly [number, number];
  /** Metres off the centreline when `at` is run metres. */
  side?: number;
  rotation?: number;
}

export interface TrackDressing {
  edge: string;
  edgeSpacing: number;
  /** Lamp object down the edges, every `lampSpacing` metres, alternating sides. */
  lamp: string;
  lampSpacing: number;
  scatter: readonly string[];
  scatterCount: number;
  landmarks: readonly TrackLandmark[];
}

export interface TrackDef {
  id: string;
  label: string;
  blurb: string;
  /** Main-line metres laid behind the start line: the compactor's run-up and the grid. */
  origin: number;
  start: { x: number; z: number; heading: number; elevation?: number };
  halfWidth: number;
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
  bandZ: number;
  ground: TerrainColors;
  fog: BiomeFog;
  sky: BiomeSky;
  weather?: "rain" | "snow";
  /** Ground level around the course, metres; the course rides its own elevation and banks down to this. */
  baseLevel: number;
  liquid?: { level: number; color: string; waveHeight: number; palette?: OceanPalette };
  rivalTake: Readonly<Record<string, readonly string[]>>;
  /** Escape time the line multiplier is judged against, seconds. */
  par: number;
  dressing?: TrackDressing;
}

export const straight = (length: number, extra: Omit<Extract<CoursePiece, { kind: "straight" }>, "kind" | "length"> = {}): CoursePiece => ({ kind: "straight", length, ...extra });
