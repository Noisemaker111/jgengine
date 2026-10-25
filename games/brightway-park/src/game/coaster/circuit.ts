import { pathLength } from "@jgengine/core/nav/pathFollow";

import { GRID } from "../catalog";

/**
 * The coaster's circuit, read from the track the park has actually built. A ride is a closed ring of
 * track pieces; this orders them from the station, measures the loop, and turns those measurements
 * into the lap time and the ride's three ratings - so nothing about the coaster is hand-written.
 */
export type TrackPoint = readonly [number, number, number];

export interface CoasterCircuit {
  /** A lap only exists when the last piece touches the first: an open run is not a ride. */
  readonly closed: boolean;
  /** The loop in travel order, starting at the piece nearest the station. */
  readonly waypoints: readonly TrackPoint[];
  readonly pieces: number;
  /** Rail distance for one lap, metres. */
  readonly length: number;
  /** Direction changes at 45 degrees or more around the loop. */
  readonly corners: number;
  readonly degreesTurned: number;
  /** Height between the circuit's highest and lowest piece, metres. */
  readonly drop: number;
  /** Mean speed one lap is run at, metres per second. */
  readonly averageSpeed: number;
  /** One lap's ride time, seconds; `0` while the circuit is open. */
  readonly lapSeconds: number;
  readonly excitement: number;
  readonly intensity: number;
  readonly nausea: number;
}

const STEPS: readonly (readonly [number, number])[] = [
  [GRID, 0],
  [-GRID, 0],
  [0, GRID],
  [0, -GRID],
];

/** The lift hauls the train at this speed; a drop buys speed above it. */
const CHAIN_SPEED = 6;
/** Every corner scrubs this much off the pace the train can hold. */
const CORNER_SCRUB = 0.35;
const GRAVITY = 9.8;

function key(x: number, z: number): string {
  return `${x},${z}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function cornerDegrees(a: TrackPoint, b: TrackPoint, c: TrackPoint): number {
  const inX = b[0] - a[0];
  const inZ = b[2] - a[2];
  const outX = c[0] - b[0];
  const outZ = c[2] - b[2];
  const inLength = Math.hypot(inX, inZ);
  const outLength = Math.hypot(outX, outZ);
  if (inLength === 0 || outLength === 0) return 0;
  const dot = (inX * outX + inZ * outZ) / (inLength * outLength);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

/**
 * Walk the pieces from one of them, straight on wherever the track offers it, and collect the run.
 * The ring has exactly two continuations at the start and one at every corner, so the greedy walk
 * follows it; a branchy track simply yields a shorter run.
 */
function walkThrough(
  points: readonly TrackPoint[],
  byKey: ReadonlyMap<string, number>,
  from: number,
  first: number,
): number[] {
  const order = [from, first];
  const used = new Set(order);
  let dx = points[first]![0] - points[from]![0];
  let dz = points[first]![2] - points[from]![2];
  for (;;) {
    const last = points[order[order.length - 1]!]!;
    let next: number | undefined;
    let straight = false;
    for (const [sx, sz] of STEPS) {
      const candidate = byKey.get(key(last[0] + sx, last[2] + sz));
      if (candidate === undefined || used.has(candidate)) continue;
      if (next === undefined) next = candidate;
      if (sx === dx && sz === dz) {
        next = candidate;
        straight = true;
        break;
      }
    }
    if (next === undefined) return order;
    const step = points[next]!;
    if (!straight) {
      dx = step[0] - last[0];
      dz = step[2] - last[2];
    }
    order.push(next);
    used.add(next);
  }
}

function closes(points: readonly TrackPoint[], byKey: ReadonlyMap<string, number>, order: readonly number[]): boolean {
  const first = points[order[0]!]!;
  const last = points[order[order.length - 1]!]!;
  const neighbour = byKey.get(key(last[0] + (first[0] - last[0] === 0 ? 0 : Math.sign(first[0] - last[0]) * GRID), last[2] + (first[2] - last[2] === 0 ? 0 : Math.sign(first[2] - last[2]) * GRID)));
  return order.length > 2 && neighbour === order[0];
}

/**
 * A crash-worthiness readout of the loop: longer rail, more corners and a real drop all raise the
 * excitement, while speed and corners are what a body feels. Every term is a measurable fact about
 * the track, so re-laying the track moves the score.
 */
export function scoreCircuit(
  length: number,
  corners: number,
  drop: number,
  averageSpeed: number,
): { excitement: number; intensity: number; nausea: number } {
  if (length <= 0) return { excitement: 0, intensity: 0, nausea: 0 };
  return {
    excitement: round1(0.9 * Math.sqrt(length) + 2.4 * Math.max(0, drop) + 0.8 * corners + 0.3 * averageSpeed),
    intensity: round1(Math.max(0, 0.5 * averageSpeed + 0.55 * corners + 1.6 * Math.max(0, drop) - 1.2)),
    nausea: round1(0.2 * corners + 0.12 * averageSpeed),
  };
}

/**
 * One lap's arithmetic: the chain sets the pace, a drop adds the speed its fall buys, and every
 * corner takes a little back. The lap time is the rail distance over that pace.
 */
export function lapArithmetic(length: number, corners: number, drop: number): { averageSpeed: number; lapSeconds: number } {
  if (length <= 0) return { averageSpeed: 0, lapSeconds: 0 };
  const fall = Math.sqrt(2 * GRAVITY * Math.max(0, drop));
  const averageSpeed = Math.max(1.5, Math.max(CHAIN_SPEED, fall) - corners * CORNER_SCRUB);
  return { averageSpeed: round1(averageSpeed), lapSeconds: round1(length / averageSpeed) };
}

const OPEN: CoasterCircuit = {
  closed: false,
  waypoints: [],
  pieces: 0,
  length: 0,
  corners: 0,
  degreesTurned: 0,
  drop: 0,
  averageSpeed: 0,
  lapSeconds: 0,
  excitement: 0,
  intensity: 0,
  nausea: 0,
};

/** Order the pieces into the park's longest run, measure it and score it. `station` ties the run to the ride. */
export function buildCoasterCircuit(pieces: readonly TrackPoint[], station: readonly [number, number] | null): CoasterCircuit {
  if (pieces.length === 0) return OPEN;
  const byKey = new Map<string, number>();
  pieces.forEach((point, index) => byKey.set(key(point[0], point[2]), index));

  let best: number[] = [];
  let bestClosed = false;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let from = 0; from < pieces.length; from += 1) {
    for (const [sx, sz] of STEPS) {
      const first = byKey.get(key(pieces[from]![0] + sx, pieces[from]![2] + sz));
      if (first === undefined || first === from) continue;
      const order = walkThrough(pieces, byKey, from, first);
      const closed = closes(pieces, byKey, order);
      const head = pieces[order[0]!]!;
      const distance = station === null ? 0 : Math.hypot(head[0] - station[0], head[2] - station[1]);
      const better =
        order.length > best.length ||
        (order.length === best.length && closed && !bestClosed) ||
        (order.length === best.length && closed === bestClosed && distance < bestDistance);
      if (better) {
        best = order;
        bestClosed = closed;
        bestDistance = distance;
      }
    }
  }
  if (best.length === 0) return OPEN;

  const waypoints = best.map((index) => pieces[index]!);
  const length = pathLength({ waypoints, speed: CHAIN_SPEED, loop: bestClosed });

  let degreesTurned = 0;
  let corners = 0;
  const vertices = bestClosed ? waypoints.length : waypoints.length - 2;
  for (let i = 0; i < vertices; i += 1) {
    const a = waypoints[(i - 1 + waypoints.length) % waypoints.length]!;
    const b = waypoints[i % waypoints.length]!;
    const c = waypoints[(i + 1) % waypoints.length]!;
    const degrees = cornerDegrees(a, b, c);
    degreesTurned += degrees;
    if (degrees >= 45) corners += 1;
  }

  const heights = waypoints.map((point) => point[1]);
  const drop = round1(Math.max(...heights) - Math.min(...heights));
  const { averageSpeed, lapSeconds } = bestClosed
    ? lapArithmetic(length, corners, drop)
    : { averageSpeed: round1(CHAIN_SPEED), lapSeconds: 0 };
  const score = bestClosed ? scoreCircuit(length, corners, drop, averageSpeed) : { excitement: 0, intensity: 0, nausea: 0 };

  return {
    closed: bestClosed,
    waypoints,
    pieces: waypoints.length,
    length: Math.round(length * 10) / 10,
    corners,
    degreesTurned: Math.round(degreesTurned),
    drop,
    averageSpeed,
    lapSeconds,
    ...score,
  };
}
