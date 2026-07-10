import { COMPACTOR_START_Z, CRUSH_BUFFER } from "../run/constants";

export interface CompactorSurge {
  id: string;
  label: string;
  startT: number;
  endT: number;
  speed: number;
}

export const COMPACTOR_BASE_SPEED = 5.6;

export const COMPACTOR_SURGES: readonly CompactorSurge[] = [
  { id: "surge_1", label: "COMPACTOR'S EATIN' ROW SIX — MOVE IT", startT: 26, endT: 38, speed: 10.5 },
  { id: "surge_2", label: "SHE'S GUNNING THE LINE — DON'T SLOW DOWN", startT: 62, endT: 76, speed: 11.5 },
];

interface SpeedSegment {
  start: number;
  end: number;
  speed: number;
}

function buildSegments(): readonly SpeedSegment[] {
  const segments: SpeedSegment[] = [];
  let cursor = 0;
  for (const surge of [...COMPACTOR_SURGES].sort((a, b) => a.startT - b.startT)) {
    if (surge.startT > cursor) segments.push({ start: cursor, end: surge.startT, speed: COMPACTOR_BASE_SPEED });
    segments.push({ start: surge.startT, end: surge.endT, speed: surge.speed });
    cursor = surge.endT;
  }
  segments.push({ start: cursor, end: Number.POSITIVE_INFINITY, speed: COMPACTOR_BASE_SPEED });
  return segments;
}

const SEGMENTS = buildSegments();

export function compactorSpeedAt(t: number): number {
  for (const segment of SEGMENTS) if (t >= segment.start && t < segment.end) return segment.speed;
  return COMPACTOR_BASE_SPEED;
}

export function compactorZAt(t: number): number {
  let z = COMPACTOR_START_Z;
  for (const segment of SEGMENTS) {
    if (t <= segment.start) break;
    const segmentEnd = Math.min(t, segment.end);
    z += segment.speed * (segmentEnd - segment.start);
    if (t <= segment.end) break;
  }
  return z;
}

export function activeSurge(t: number): CompactorSurge | null {
  return COMPACTOR_SURGES.find((surge) => t >= surge.startT && t < surge.endT) ?? null;
}

export function isCaught(kartZ: number, compactorZ: number): boolean {
  return compactorZ >= kartZ - CRUSH_BUFFER;
}

export function compactorGap(kartZ: number, compactorZ: number): number {
  return kartZ - compactorZ;
}
