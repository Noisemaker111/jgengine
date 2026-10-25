/**
 * The coaster designer: a coaster is a station and the track laid piece by piece from its front,
 * each piece a straight, a turn, a slope, a chain lift or a loop. The pieces are a sequence, so the
 * track knows where it goes next, how high it is and which way it faces. A test run sends a train
 * round it with real speed: lifts haul it up, drops buy speed, friction and corners take it back, a
 * loop needs speed to get over the top. What the train felt (top speed, biggest drop, G-forces,
 * airtime, loops) becomes the ride's excitement, intensity and nausea.
 *
 * Pure functions over plain data: the park keeps the pieces as world instances and calls these.
 */

export type PieceType = "straight" | "left" | "right" | "up" | "down" | "lift" | "loop";

/** Headings round the compass, clockwise on the lot (z grows towards the gate): east, south, west, north. */
export const HEADINGS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export interface PieceSpec {
  label: string;
  icon: string;
  /** The catalog kind the piece is built as (its model, cost and upkeep). */
  kind: string;
  /** Levels the track climbs (+) or falls (-) across the piece. */
  climb: number;
  /** Quarter turns clockwise across the piece. */
  turn: -1 | 0 | 1;
  /** Rail metres the train runs on the piece. */
  metres: number;
}

export const PIECES: Record<PieceType, PieceSpec> = {
  straight: { label: "Straight", icon: "⬆", kind: "track_straight", climb: 0, turn: 0, metres: 4 },
  left: { label: "Turn left", icon: "↰", kind: "track_turn_left", climb: 0, turn: -1, metres: 6.3 },
  right: { label: "Turn right", icon: "↱", kind: "track_turn_right", climb: 0, turn: 1, metres: 6.3 },
  up: { label: "Slope up", icon: "⤴", kind: "track_slope_up", climb: 1, turn: 0, metres: 5.2 },
  down: { label: "Slope down", icon: "⤵", kind: "track_slope_down", climb: -1, turn: 0, metres: 5.2 },
  lift: { label: "Chain lift", icon: "⛓", kind: "track_lift", climb: 1, turn: 0, metres: 5.2 },
  loop: { label: "Loop", icon: "➰", kind: "track_loop", climb: 0, turn: 0, metres: 16 },
};
export const PIECE_ORDER: readonly PieceType[] = ["straight", "left", "right", "up", "down", "lift", "loop"];
export const PIECE_BY_KIND: Readonly<Record<string, PieceType>> = Object.fromEntries(
  Object.entries(PIECES).map(([type, spec]) => [spec.kind, type as PieceType]),
);

/** Metres a track level stands above the one below. */
export const TRACK_LEVEL = 2;
/** The highest a track may climb, in levels. */
export const TRACK_MAX = 8;

/** A coaster family: which pieces it may use, how tall it may go, and how it feels. */
export interface CoasterStyle {
  label: string;
  blurb: string;
  allowed: ReadonlySet<PieceType>;
  maxLevel: number;
  /** Multipliers on the test run's ratings. */
  excitement: number;
  intensity: number;
  nausea: number;
  /** Rolling friction, as speed lost per metre (m/s). */
  friction: number;
}

const ALL = new Set<PieceType>(PIECE_ORDER);
export const STYLES = {
  wooden: { label: "Wooden", blurb: "Rattling timber: big drops and airtime, no loops.", allowed: new Set<PieceType>(PIECE_ORDER.filter((p) => p !== "loop")), maxLevel: 7, excitement: 1.1, intensity: 1, nausea: 0.9, friction: 0.03 },
  steel: { label: "Steel Looping", blurb: "Smooth steel that can loop. Fast and intense.", allowed: ALL, maxLevel: TRACK_MAX, excitement: 1, intensity: 1.1, nausea: 1.1, friction: 0.02 },
  junior: { label: "Junior", blurb: "A small family coaster: low and gentle, no loops.", allowed: new Set<PieceType>(PIECE_ORDER.filter((p) => p !== "loop")), maxLevel: 3, excitement: 0.85, intensity: 0.6, nausea: 0.6, friction: 0.025 },
} as const satisfies Record<string, CoasterStyle>;
export type StyleId = keyof typeof STYLES;
export const STYLE_ORDER: readonly StyleId[] = ["wooden", "steel", "junior"];
export function styleOf(id: string): CoasterStyle {
  return Object.hasOwn(STYLES, id) ? STYLES[id as StyleId] : STYLES.wooden;
}

/** Where the station stands and which way its trains leave. */
export interface Station {
  /** Corner cell of the station's footprint. */
  cell: readonly [number, number];
  /** Cells a side. */
  size: number;
  /** 0-3 into {@link HEADINGS}. */
  heading: number;
}

/** One laid piece, as the layout walk places it. */
export interface LaidPiece {
  type: PieceType;
  cell: [number, number];
  /** The level the piece starts at. */
  level: number;
  /** The heading the train enters on. */
  heading: number;
}

/** The line of cells the station's platform runs along, back to front. */
export function platformCells(station: Station): [number, number][] {
  const [dx, dz] = HEADINGS[station.heading]!;
  const [c, r] = station.cell;
  const n = station.size;
  // The platform runs along the station's first row (or column) in the direction of travel.
  const start: [number, number] = dx === 1 ? [c, r] : dx === -1 ? [c + n - 1, r] : dz === 1 ? [c, r] : [c, r + n - 1];
  return Array.from({ length: n }, (_, i) => [start[0] + dx * i, start[1] + dz * i] as [number, number]);
}

/** The first cell past the station's front: where the first piece goes. */
export function launchCell(station: Station): [number, number] {
  const cells = platformCells(station);
  const [dx, dz] = HEADINGS[station.heading]!;
  const front = cells[cells.length - 1]!;
  return [front[0] + dx, front[1] + dz];
}

/** Lay the pieces out from the station: the cell, level and heading each one lands on. */
export function walkLayout(station: Station, types: readonly PieceType[]): { pieces: LaidPiece[]; next: { cell: [number, number]; level: number; heading: number } } {
  let cell = launchCell(station);
  let level = 0;
  let heading = station.heading;
  const pieces: LaidPiece[] = [];
  for (const type of types) {
    const spec = PIECES[type];
    pieces.push({ type, cell, level, heading });
    level += spec.climb;
    heading = (heading + spec.turn + 4) % 4;
    const [dx, dz] = HEADINGS[heading]!;
    cell = [cell[0] + dx, cell[1] + dz];
  }
  return { pieces, next: { cell, level, heading } };
}

/** True when the track comes back into the station's back at ground level, facing the way it leaves. */
export function isClosed(station: Station, types: readonly PieceType[]): boolean {
  if (types.length < 4) return false;
  const { next } = walkLayout(station, types);
  const back = platformCells(station)[0]!;
  return next.level === 0 && next.heading === station.heading && next.cell[0] === back[0] && next.cell[1] === back[1];
}

/** Why the next piece can't go on the end of the track, or null when it can. */
export function canAppend(
  station: Station,
  types: readonly PieceType[],
  type: PieceType,
  style: CoasterStyle,
  free: (cell: readonly [number, number]) => boolean,
): string | null {
  if (!style.allowed.has(type)) return `A ${style.label} coaster can't have a ${PIECES[type].label.toLowerCase()}`;
  if (isClosed(station, types)) return "The circuit is complete";
  const { next } = walkLayout(station, types);
  const spec = PIECES[type];
  const top = next.level + Math.max(0, spec.climb);
  if (top > style.maxLevel) return `Too high for a ${style.label} coaster`;
  if (next.level + spec.climb < 0) return "The track can't go below the ground";
  if (!free(next.cell)) return "Something is in the way";
  return null;
}

/** What a test run measured and what it means for riders. */
export interface TestRun {
  /** False when the train couldn't finish: it rolled back or the track is open. */
  ok: boolean;
  /** Why it failed, in words. */
  failure: string | null;
  /** Rail metres for one lap, station included. */
  length: number;
  /** Seconds for one lap. */
  lapSeconds: number;
  topSpeed: number;
  averageSpeed: number;
  /** The biggest single fall, metres. */
  maxDrop: number;
  /** Highest point, metres. */
  maxHeight: number;
  loops: number;
  turns: number;
  /** Seconds of near-weightless crest after a climb. */
  airtime: number;
  /** Peak sideways G in a turn, peak vertical G in a dip or loop. */
  lateralG: number;
  verticalG: number;
  excitement: number;
  intensity: number;
  nausea: number;
  /** The train's speed at the start of each piece, for the readout. */
  speeds: number[];
}

const GRAVITY = 9.8;
/** The station's tyres push the train out at this speed. */
const LAUNCH_SPEED = 3;
/** The chain hauls at least this fast. */
const CHAIN_SPEED = 3;
/** Speed a train needs entering a loop to get over the top. */
export const LOOP_SPEED = 11;
/** Radius of a turn and of a loop, metres. */
const TURN_RADIUS = 8;
const LOOP_RADIUS = 5;
const STATION_METRES = 8;

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Run a train round the track. Each piece is one step of energy: falling buys speed, climbing costs
 * it, friction and corners shave a little, a chain lift never lets it drop below the chain's pace.
 * A climb or loop the train can't make is a failed test (it would roll back), and so is an open track.
 */
export function testRun(station: Station, types: readonly PieceType[], style: CoasterStyle): TestRun {
  const closed = isClosed(station, types);
  let v = LAUNCH_SPEED;
  let time = STATION_METRES / 2;
  let length = STATION_METRES;
  let topSpeed = v;
  let maxDrop = 0;
  let fall = 0;
  let maxHeight = 0;
  let loops = 0;
  let turns = 0;
  let airtime = 0;
  let lateralG = 0;
  let verticalG = 1;
  let failure: string | null = closed ? null : "The track doesn't come back to the station";
  const speeds: number[] = [];
  let level = 0;
  let lastClimb = 0;
  types.forEach((type, index) => {
    if (failure !== null && closed) return;
    const spec = PIECES[type];
    speeds.push(round1(v));
    const rise = spec.climb * TRACK_LEVEL;
    if (type === "lift") {
      v = Math.max(v, CHAIN_SPEED);
    } else {
      const squared = v * v - 2 * GRAVITY * rise - 2 * style.friction * spec.metres * Math.max(1, v);
      if (squared <= 0.5) {
        if (failure === null) failure = `The train rolled back on piece ${index + 1} (${spec.label.toLowerCase()})`;
        v = 0.7;
      } else {
        v = Math.sqrt(squared);
      }
    }
    if (type === "loop") {
      const entry = speeds[speeds.length - 1]!;
      if (entry < LOOP_SPEED && failure === null) failure = `Too slow for the loop on piece ${index + 1} - it needs ${LOOP_SPEED} m/s`;
      loops += 1;
      verticalG = Math.max(verticalG, 1 + (entry * entry) / (LOOP_RADIUS * GRAVITY));
    }
    if (spec.turn !== 0) {
      turns += 1;
      lateralG = Math.max(lateralG, (v * v) / (TURN_RADIUS * GRAVITY));
    }
    // A fall: run the drop on, then feel the pull out of it.
    if (rise < 0) {
      fall += -rise;
      maxDrop = Math.max(maxDrop, fall);
    } else if (fall > 0) {
      verticalG = Math.max(verticalG, 1 + (v * v) / (8 * GRAVITY));
      fall = 0;
    }
    // A crest straight after a climb at speed throws riders out of their seats.
    if (lastClimb > 0 && rise < 0 && v > 8) airtime += 0.4 + (v - 8) * 0.05;
    lastClimb = rise;
    level += spec.climb;
    maxHeight = Math.max(maxHeight, level * TRACK_LEVEL);
    topSpeed = Math.max(topSpeed, v);
    length += spec.metres;
    time += spec.metres / Math.max(0.8, v);
  });
  // The brakes bring it into the platform.
  time += STATION_METRES / 2 / Math.max(1, Math.min(v, LAUNCH_SPEED));
  const ok = failure === null;
  const averageSpeed = length / Math.max(1, time);
  // The ratings, from what the train actually did.
  const rawExcitement =
    0.55 * Math.sqrt(Math.max(0, length - STATION_METRES) / 4) +
    0.22 * maxDrop +
    0.12 * topSpeed +
    1.1 * loops +
    1.4 * airtime +
    0.12 * turns;
  const rawIntensity = 0.16 * topSpeed + 0.9 * lateralG + 0.75 * (verticalG - 1) + 0.9 * loops + 0.12 * maxDrop;
  const rawNausea = 0.55 * loops + 0.06 * turns + 0.55 * lateralG + 0.3 * (verticalG - 1);
  // A ride too intense to enjoy loses its thrill (RCT's sweet spot).
  const tooIntense = Math.max(0, rawIntensity * style.intensity - 8.5);
  const excitement = ok ? round1(Math.min(10, Math.max(0, rawExcitement * style.excitement - tooIntense * 0.8))) : 0;
  return {
    ok,
    failure,
    length: round1(length),
    lapSeconds: round1(time),
    topSpeed: round1(topSpeed),
    averageSpeed: round1(averageSpeed),
    maxDrop: round1(maxDrop),
    maxHeight: round1(maxHeight),
    loops,
    turns,
    airtime: round1(airtime),
    lateralG: round1(lateralG),
    verticalG: round1(verticalG),
    excitement,
    intensity: ok ? round1(Math.min(10, rawIntensity * style.intensity)) : 0,
    nausea: ok ? round1(Math.min(10, rawNausea * style.nausea)) : 0,
    speeds,
  };
}

/** Points along the track for the train to follow: through the station, then every piece, at height. */
export function trainPath(station: Station, types: readonly PieceType[], cellCentre: (col: number, row: number) => [number, number]): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (const cell of platformCells(station)) {
    const [x, z] = cellCentre(cell[0], cell[1]);
    points.push([x, 0, z]);
  }
  const { pieces } = walkLayout(station, types);
  for (const piece of pieces) {
    const [x, z] = cellCentre(piece.cell[0], piece.cell[1]);
    const spec = PIECES[piece.type];
    const y = (piece.level + spec.climb / 2) * TRACK_LEVEL;
    if (piece.type === "loop") {
      // Up and over: a ring of points standing on the piece's cell.
      const [dx, dz] = HEADINGS[piece.heading]!;
      for (let i = 0; i <= 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        const along = Math.sin(angle) * 2;
        points.push([x + dx * along, y + (1 - Math.cos(angle)) * 3, z + dz * along]);
      }
      continue;
    }
    points.push([x, y, z]);
  }
  return points;
}
