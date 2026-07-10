export interface StormPhase {
  readonly label: string;
  readonly endsAt: number;
  readonly paceMps: number;
}

export const STORM_START_OFFSET = -320;

export const STORM_SCHEDULE: readonly StormPhase[] = [
  { label: "Outflow Building", endsAt: 65, paceMps: 6.5 },
  { label: "Lull — Downdraft Stall", endsAt: 80, paceMps: 1.2 },
  { label: "Squall Line", endsAt: 170, paceMps: 12.5 },
  { label: "Lull — Eye Wobble", endsAt: 188, paceMps: 2.5 },
  { label: "Wall Cloud Surge", endsAt: Number.POSITIVE_INFINITY, paceMps: 20 },
];

export function stormPhaseAt(t: number): StormPhase {
  for (const phase of STORM_SCHEDULE) {
    if (t < phase.endsAt) return phase;
  }
  return STORM_SCHEDULE[STORM_SCHEDULE.length - 1]!;
}

export function isLullAt(t: number): boolean {
  return stormPhaseAt(t).label.startsWith("Lull");
}

export function frontProgressAt(t: number): number {
  if (t <= 0) return STORM_START_OFFSET;
  let progress = STORM_START_OFFSET;
  let cursor = 0;
  for (const phase of STORM_SCHEDULE) {
    const segmentEnd = Math.min(phase.endsAt, t);
    const duration = Math.max(0, segmentEnd - cursor);
    progress += duration * phase.paceMps;
    cursor = segmentEnd;
    if (t <= phase.endsAt) break;
  }
  return progress;
}
