export type ObstacleType = "gap" | "censer" | "door" | "narrows" | "zigzag" | "twinCenser";

export interface ObstacleEvent {
  readonly id: string;
  readonly type: ObstacleType;
  readonly beatIndex: number;
  readonly blockedLanes: readonly number[];
}

export const LANES: readonly [0, 1, 2] = [0, 1, 2];

export function gapTileMotif(startBeat: number, lane: number): readonly ObstacleEvent[] {
  return [{ id: `gap-${startBeat}-${lane}`, type: "gap", beatIndex: startBeat, blockedLanes: [lane] }];
}

export function beatGatedDoorMotif(startBeat: number): readonly ObstacleEvent[] {
  return [{ id: `door-${startBeat}`, type: "door", beatIndex: startBeat, blockedLanes: [0, 1, 2] }];
}

export function censerSwingMotif(startBeat: number, beats: number, lane: number): readonly ObstacleEvent[] {
  const events: ObstacleEvent[] = [];
  for (let i = 0; i < beats; i += 1) {
    const swingLane = i % 2 === 0 ? lane : 2 - lane;
    events.push({ id: `censer-${startBeat}-${i}`, type: "censer", beatIndex: startBeat + i, blockedLanes: [swingLane] });
  }
  return events;
}

export function narrowPassageMotif(startBeat: number, beats: number, openLane: number): readonly ObstacleEvent[] {
  const events: ObstacleEvent[] = [];
  const blocked = LANES.filter((lane) => lane !== openLane);
  for (let i = 0; i < beats; i += 1) {
    events.push({ id: `narrows-${startBeat}-${i}`, type: "narrows", beatIndex: startBeat + i, blockedLanes: blocked });
  }
  return events;
}

export function zigzagGapMotif(startBeat: number, beats: number): readonly ObstacleEvent[] {
  const events: ObstacleEvent[] = [];
  for (let i = 0; i < beats; i += 1) {
    const lane = i % 2 === 0 ? 0 : 2;
    events.push({ id: `zigzag-${startBeat}-${i}`, type: "zigzag", beatIndex: startBeat + i, blockedLanes: [lane] });
  }
  return events;
}

export function twinCenserMotif(
  startBeat: number,
  beats: number,
  safeLanes: readonly number[],
): readonly ObstacleEvent[] {
  const events: ObstacleEvent[] = [];
  for (let i = 0; i < beats; i += 1) {
    const safe = safeLanes[i % safeLanes.length]!;
    const blocked = LANES.filter((lane) => lane !== safe);
    events.push({ id: `twin-${startBeat}-${i}`, type: "twinCenser", beatIndex: startBeat + i, blockedLanes: blocked });
  }
  return events;
}

export type MotifSpec =
  | { readonly kind: "gap"; readonly lane: number }
  | { readonly kind: "door" }
  | { readonly kind: "censer"; readonly beats: number; readonly lane: number }
  | { readonly kind: "narrows"; readonly beats: number; readonly openLane: number }
  | { readonly kind: "zigzag"; readonly beats: number }
  | { readonly kind: "twinCenser"; readonly beats: number; readonly safeLanes: readonly number[] };

function motifSpan(spec: MotifSpec): number {
  switch (spec.kind) {
    case "gap":
      return 1;
    case "door":
      return 1;
    case "censer":
      return spec.beats;
    case "narrows":
      return spec.beats;
    case "zigzag":
      return spec.beats;
    case "twinCenser":
      return spec.beats;
  }
}

function buildMotif(spec: MotifSpec, startBeat: number): readonly ObstacleEvent[] {
  switch (spec.kind) {
    case "gap":
      return gapTileMotif(startBeat, spec.lane);
    case "door":
      return beatGatedDoorMotif(startBeat);
    case "censer":
      return censerSwingMotif(startBeat, spec.beats, spec.lane);
    case "narrows":
      return narrowPassageMotif(startBeat, spec.beats, spec.openLane);
    case "zigzag":
      return zigzagGapMotif(startBeat, spec.beats);
    case "twinCenser":
      return twinCenserMotif(startBeat, spec.beats, spec.safeLanes);
  }
}

export interface ChartConfig {
  readonly introBeats: number;
  readonly outroBeats: number;
  readonly totalBeats: number;
  readonly gapBeats: number;
  readonly cycle: readonly MotifSpec[];
}

export function buildMovementChart(config: ChartConfig, idPrefix: string): readonly ObstacleEvent[] {
  const events: ObstacleEvent[] = [];
  const limit = config.totalBeats - config.outroBeats;
  let cursor = config.introBeats;
  let i = 0;
  while (cursor < limit && config.cycle.length > 0) {
    const spec = config.cycle[i % config.cycle.length]!;
    const span = motifSpan(spec);
    if (cursor + span > limit) break;
    events.push(...buildMotif(spec, cursor).map((event) => ({ ...event, id: `${idPrefix}-${event.id}` })));
    cursor += span + config.gapBeats;
    i += 1;
  }
  return events;
}

export interface Movement {
  readonly id: string;
  readonly title: string;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly totalBeats: number;
  readonly unitsPerBeat: number;
  readonly obstacles: readonly ObstacleEvent[];
}

const UNITS_PER_BEAT = 3;
const BEATS_PER_BAR = 4;

export const MOVEMENTS: readonly Movement[] = [
  {
    id: "movement-i",
    title: "The First Hour",
    bpm: 90,
    beatsPerBar: BEATS_PER_BAR,
    totalBeats: 135,
    unitsPerBeat: UNITS_PER_BEAT,
    obstacles: buildMovementChart(
      {
        introBeats: 16,
        outroBeats: 8,
        totalBeats: 135,
        gapBeats: 5,
        cycle: [
          { kind: "gap", lane: 0 },
          { kind: "door" },
          { kind: "gap", lane: 2 },
          { kind: "narrows", beats: 3, openLane: 1 },
          { kind: "gap", lane: 1 },
          { kind: "door" },
        ],
      },
      "movement-i",
    ),
  },
  {
    id: "movement-ii",
    title: "The Long Aisle",
    bpm: 110,
    beatsPerBar: BEATS_PER_BAR,
    totalBeats: 165,
    unitsPerBeat: UNITS_PER_BEAT,
    obstacles: buildMovementChart(
      {
        introBeats: 12,
        outroBeats: 8,
        totalBeats: 165,
        gapBeats: 4,
        cycle: [
          { kind: "censer", beats: 4, lane: 0 },
          { kind: "gap", lane: 2 },
          { kind: "zigzag", beats: 4 },
          { kind: "door" },
          { kind: "narrows", beats: 3, openLane: 2 },
          { kind: "twinCenser", beats: 4, safeLanes: [0, 2, 1] },
          { kind: "gap", lane: 1 },
          { kind: "door" },
        ],
      },
      "movement-ii",
    ),
  },
  {
    id: "movement-iii",
    title: "The Last Nave",
    bpm: 128,
    beatsPerBar: BEATS_PER_BAR,
    totalBeats: 192,
    unitsPerBeat: UNITS_PER_BEAT,
    obstacles: buildMovementChart(
      {
        introBeats: 12,
        outroBeats: 8,
        totalBeats: 192,
        gapBeats: 3,
        cycle: [
          { kind: "zigzag", beats: 5 },
          { kind: "twinCenser", beats: 4, safeLanes: [1, 0, 2] },
          { kind: "door" },
          { kind: "censer", beats: 4, lane: 2 },
          { kind: "gap", lane: 0 },
          { kind: "narrows", beats: 3, openLane: 0 },
          { kind: "door" },
          { kind: "zigzag", beats: 5 },
          { kind: "twinCenser", beats: 4, safeLanes: [2, 1, 0] },
        ],
      },
      "movement-iii",
    ),
  },
];

export const MOVEMENT_LENGTHS: readonly number[] = MOVEMENTS.map((movement) => movement.totalBeats * movement.unitsPerBeat);

export const MOVEMENT_START_Z: readonly number[] = MOVEMENT_LENGTHS.reduce<number[]>((acc, length, index) => {
  acc.push(index === 0 ? 0 : acc[index - 1]! + MOVEMENT_LENGTHS[index - 1]!);
  return acc;
}, []);

export const COURSE_LENGTH: number = MOVEMENT_LENGTHS.reduce((a, b) => a + b, 0);

export const COURSE_START_Z = -COURSE_LENGTH / 2;

export function worldZFor(movementIndex: number, localZ: number): number {
  return COURSE_START_Z + (MOVEMENT_START_Z[movementIndex] ?? 0) + localZ;
}

export type Grade = "S" | "A" | "B" | "C";

export const GRADE_THRESHOLDS: readonly { grade: Grade; minAccuracy: number }[] = [
  { grade: "S", minAccuracy: 0.95 },
  { grade: "A", minAccuracy: 0.85 },
  { grade: "B", minAccuracy: 0.7 },
  { grade: "C", minAccuracy: 0 },
];

export function gradeForAccuracy(accuracy: number): Grade {
  for (const entry of GRADE_THRESHOLDS) {
    if (accuracy >= entry.minAccuracy) return entry.grade;
  }
  return "C";
}
