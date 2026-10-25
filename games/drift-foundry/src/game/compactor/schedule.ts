import { COMPACTOR_START_Z, CRUSH_BUFFER } from "../run/constants";

export interface CompactorSurge {
  id: string;
  label: string;
  startT: number;
  endT: number;
  speed: number;
}

/** A run's crusher: where it starts, and when it surges. Content, so a shift can change it per run. */
export interface CompactorPlan {
  startZ: number;
  /** Speed between surges, m/s; omitted means {@link COMPACTOR_BASE_SPEED}. */
  baseSpeed?: number;
  surges: readonly CompactorSurge[];
}

export const COMPACTOR_BASE_SPEED = 5.6;

export const COMPACTOR_SURGES: readonly CompactorSurge[] = [
  { id: "surge_1", label: "COMPACTOR'S EATIN' ROW SIX — MOVE IT", startT: 26, endT: 38, speed: 10.5 },
  { id: "surge_2", label: "SHE'S GUNNING THE LINE — DON'T SLOW DOWN", startT: 62, endT: 76, speed: 11.5 },
];

/** The yard's usual shift: the plan every run gets unless a shift changes it. */
export const COMPACTOR_PLAN: CompactorPlan = { startZ: COMPACTOR_START_Z, surges: COMPACTOR_SURGES };

interface SpeedSegment {
  start: number;
  end: number;
  speed: number;
}

const SEGMENT_CACHE = new WeakMap<CompactorPlan, readonly SpeedSegment[]>();

function buildSegments(plan: CompactorPlan): readonly SpeedSegment[] {
  const cached = SEGMENT_CACHE.get(plan);
  if (cached !== undefined) return cached;
  const segments: SpeedSegment[] = [];
  const base = plan.baseSpeed ?? COMPACTOR_BASE_SPEED;
  let cursor = 0;
  for (const surge of [...plan.surges].sort((a, b) => a.startT - b.startT)) {
    if (surge.startT > cursor) segments.push({ start: cursor, end: surge.startT, speed: base });
    segments.push({ start: surge.startT, end: surge.endT, speed: surge.speed });
    cursor = surge.endT;
  }
  segments.push({ start: cursor, end: Number.POSITIVE_INFINITY, speed: base });
  SEGMENT_CACHE.set(plan, segments);
  return segments;
}

export function compactorSpeedAt(t: number, plan: CompactorPlan = COMPACTOR_PLAN): number {
  for (const segment of buildSegments(plan)) if (t >= segment.start && t < segment.end) return segment.speed;
  return plan.baseSpeed ?? COMPACTOR_BASE_SPEED;
}

export function compactorZAt(t: number, plan: CompactorPlan = COMPACTOR_PLAN): number {
  let z = plan.startZ;
  for (const segment of buildSegments(plan)) {
    if (t <= segment.start) break;
    const segmentEnd = Math.min(t, segment.end);
    z += segment.speed * (segmentEnd - segment.start);
    if (t <= segment.end) break;
  }
  return z;
}

export function activeSurge(t: number, plan: CompactorPlan = COMPACTOR_PLAN): CompactorSurge | null {
  return plan.surges.find((surge) => t >= surge.startT && t < surge.endT) ?? null;
}

export function isCaught(kartZ: number, compactorZ: number): boolean {
  return compactorZ >= kartZ - CRUSH_BUFFER;
}

export function compactorGap(kartZ: number, compactorZ: number): number {
  return kartZ - compactorZ;
}
