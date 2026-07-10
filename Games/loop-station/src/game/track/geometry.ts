export interface TrackSample {
  x: number;
  y: number;
  z: number;
  headingRad: number;
}

export type LaneChoice = "main" | "branch";

export interface LaneChoices {
  forkA: LaneChoice;
  forkB: LaneChoice;
}

export type TrackZone = "loopA" | "forkA" | "rampUp" | "rampDown" | "loopB" | "forkB" | "grade";

interface Segment {
  length: number;
  zone: TrackZone;
  sampleAt(u: number): TrackSample;
}

export const LOOP_RADIUS = 16;
export const LOOP_CIRCUMFERENCE = 2 * Math.PI * LOOP_RADIUS;
export const LOOP_A_CENTER: readonly [number, number] = [-LOOP_RADIUS, 0];
export const LOOP_B_CENTER: readonly [number, number] = [LOOP_RADIUS, 0];
export const RAMP_LENGTH = 6;
export const BRIDGE_HEIGHT = 5;
export const FORK_A_RANGE: readonly [number, number] = [25, 50];
export const FORK_B_RANGE: readonly [number, number] = [55, 75];
export const FORK_A_BULGE = 9;
export const LANE_HALF_WIDTH = 3;
export const COLLISION_RADIUS = 2.2;
export const BASE_SPEED = 4.5;
export const TRACK_SEED = "loop-station";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function arcPoint(center: readonly [number, number], radius: number, theta: number): readonly [number, number] {
  return [center[0] + radius * Math.cos(theta), center[1] + radius * Math.sin(theta)];
}

interface ArcSpec {
  center: readonly [number, number];
  radius: number;
  startAngle: number;
  direction: 1 | -1;
}

function arcSegment(spec: ArcSpec, uStart: number, uEnd: number, y0: number, y1: number, zone: TrackZone): Segment {
  const length = uEnd - uStart;
  return {
    length,
    zone,
    sampleAt(u) {
      const uAbs = uStart + u;
      const theta = spec.startAngle + (spec.direction * uAbs) / spec.radius;
      const [x, z] = arcPoint(spec.center, spec.radius, theta);
      const tx = spec.direction * -Math.sin(theta);
      const tz = spec.direction * Math.cos(theta);
      const y = length <= 0 ? y0 : lerp(y0, y1, u / length);
      return { x, y, z, headingRad: Math.atan2(tx, tz) };
    },
  };
}

function pointOnArc(spec: ArcSpec, u: number): readonly [number, number] {
  const theta = spec.startAngle + (spec.direction * u) / spec.radius;
  return arcPoint(spec.center, spec.radius, theta);
}

function lineSegment(
  from: readonly [number, number],
  to: readonly [number, number],
  y0: number,
  y1: number,
  zone: TrackZone,
): Segment {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const headingRad = Math.atan2(dx, dz);
  return {
    length,
    zone,
    sampleAt(u) {
      const t = length <= 0 ? 0 : u / length;
      return {
        x: lerp(from[0], to[0], t),
        y: lerp(y0, y1, t),
        z: lerp(from[1], to[1], t),
        headingRad,
      };
    },
  };
}

function bulgeSegments(spec: ArcSpec, uStart: number, uEnd: number, zone: TrackZone): Segment[] {
  const pStart = pointOnArc(spec, uStart);
  const pEnd = pointOnArc(spec, uEnd);
  const uMid = (uStart + uEnd) / 2;
  const pMid = pointOnArc(spec, uMid);
  const outward = normalize2([pMid[0] - spec.center[0], pMid[1] - spec.center[1]]);
  const pBulge: readonly [number, number] = [pMid[0] + outward[0] * FORK_A_BULGE, pMid[1] + outward[1] * FORK_A_BULGE];
  return [lineSegment(pStart, pBulge, 0, 0, zone), lineSegment(pBulge, pEnd, 0, 0, zone)];
}

function chordSegment(spec: ArcSpec, uStart: number, uEnd: number, zone: TrackZone): Segment {
  const pStart = pointOnArc(spec, uStart);
  const pEnd = pointOnArc(spec, uEnd);
  return lineSegment(pStart, pEnd, 0, 0, zone);
}

function normalize2(v: readonly [number, number]): readonly [number, number] {
  const len = Math.hypot(v[0], v[1]);
  return len <= 1e-9 ? [0, 0] : [v[0] / len, v[1] / len];
}

const LOOP_A_SPEC: ArcSpec = { center: LOOP_A_CENTER, radius: LOOP_RADIUS, startAngle: 0, direction: 1 };
const LOOP_B_SPEC: ArcSpec = { center: LOOP_B_CENTER, radius: LOOP_RADIUS, startAngle: Math.PI, direction: -1 };

const LOOP_A_BODY_END = LOOP_CIRCUMFERENCE - RAMP_LENGTH;

export function buildLap(lanes: LaneChoices): readonly Segment[] {
  const segments: Segment[] = [];
  segments.push(arcSegment(LOOP_A_SPEC, 0, FORK_A_RANGE[0], 0, 0, "loopA"));
  if (lanes.forkA === "main") {
    segments.push(arcSegment(LOOP_A_SPEC, FORK_A_RANGE[0], FORK_A_RANGE[1], 0, 0, "forkA"));
  } else {
    segments.push(...bulgeSegments(LOOP_A_SPEC, FORK_A_RANGE[0], FORK_A_RANGE[1], "forkA"));
  }
  segments.push(arcSegment(LOOP_A_SPEC, FORK_A_RANGE[1], LOOP_A_BODY_END, 0, 0, "loopA"));
  segments.push(arcSegment(LOOP_A_SPEC, LOOP_A_BODY_END, LOOP_CIRCUMFERENCE, 0, BRIDGE_HEIGHT, "rampUp"));
  segments.push(arcSegment(LOOP_B_SPEC, 0, RAMP_LENGTH, BRIDGE_HEIGHT, 0, "rampDown"));
  segments.push(arcSegment(LOOP_B_SPEC, RAMP_LENGTH, FORK_B_RANGE[0], 0, 0, "loopB"));
  if (lanes.forkB === "main") {
    segments.push(arcSegment(LOOP_B_SPEC, FORK_B_RANGE[0], FORK_B_RANGE[1], 0, 0, "forkB"));
  } else {
    segments.push(chordSegment(LOOP_B_SPEC, FORK_B_RANGE[0], FORK_B_RANGE[1], "forkB"));
  }
  segments.push(arcSegment(LOOP_B_SPEC, FORK_B_RANGE[1], LOOP_CIRCUMFERENCE, 0, 0, "grade"));
  return segments;
}

export const MAIN_LANES: LaneChoices = { forkA: "main", forkB: "main" };

export function lapLength(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + s.length, 0);
}

export interface ZoneRange {
  start: number;
  end: number;
}

export function zoneRange(segments: readonly Segment[], zone: TrackZone): ZoneRange | null {
  let cursor = 0;
  let start: number | null = null;
  let end = 0;
  for (const seg of segments) {
    if (seg.zone === zone) {
      if (start === null) start = cursor;
      end = cursor + seg.length;
    }
    cursor += seg.length;
  }
  return start === null ? null : { start, end };
}

export function sampleAtDistance(segments: readonly Segment[], distance: number): TrackSample {
  const total = lapLength(segments);
  const d = total <= 0 ? 0 : Math.min(Math.max(distance, 0), total);
  let cursor = 0;
  for (const seg of segments) {
    if (d <= cursor + seg.length || seg === segments[segments.length - 1]) {
      const local = Math.min(Math.max(d - cursor, 0), seg.length);
      return seg.sampleAt(local);
    }
    cursor += seg.length;
  }
  return { x: 0, y: 0, z: 0, headingRad: 0 };
}

export function lateralNormal(headingRad: number): readonly [number, number] {
  return [Math.cos(headingRad), -Math.sin(headingRad)];
}

export function applyLateral(sample: TrackSample, lateral: number): TrackSample {
  const [nx, nz] = lateralNormal(sample.headingRad);
  const offset = lateral * LANE_HALF_WIDTH;
  return { ...sample, x: sample.x + nx * offset, z: sample.z + nz * offset };
}

export function distance3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function positiveMod(value: number, modulus: number): number {
  if (modulus <= 0) return 0;
  const r = value % modulus;
  return r < 0 ? r + modulus : r;
}
