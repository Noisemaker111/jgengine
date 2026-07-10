export interface TideStage {
  readonly level: number;
  readonly name: string;
  readonly toast: string | null;
}

export const TIDE_STAGES: readonly TideStage[] = [
  { level: -1.5, name: "The Shallows", toast: null },
  { level: -0.3, name: "The Tidepools Brim", toast: "The tide stirs — the tidepools brim" },
  { level: 0.6, name: "Old Ferry Road", toast: "The tide takes Old Ferry Road" },
  { level: 1.8, name: "The East Causeway", toast: "The tide takes the East Causeway" },
  { level: 3.6, name: "Highstead's Lower Ward", toast: "The tide takes Highstead's Lower Ward" },
];

export const SURGE_INTERVAL_SECONDS = 42;
export const WADE_DEPTH_THRESHOLD = 1;
export const WADE_SPEED_MULTIPLIER = 0.45;
export const MAX_DROWNS = 3;
export const DROWN_PENALTY_SECONDS = 15;

export function tideStageIndexAt(elapsedSeconds: number): number {
  const raw = Math.floor(Math.max(0, elapsedSeconds) / SURGE_INTERVAL_SECONDS);
  return Math.min(TIDE_STAGES.length - 1, raw);
}

export function tideStageAt(elapsedSeconds: number): TideStage {
  return TIDE_STAGES[tideStageIndexAt(elapsedSeconds)]!;
}

export function tideLevelAt(elapsedSeconds: number): number {
  return tideStageAt(elapsedSeconds).level;
}

export function nextTideStage(elapsedSeconds: number): TideStage | null {
  const index = tideStageIndexAt(elapsedSeconds);
  return index >= TIDE_STAGES.length - 1 ? null : TIDE_STAGES[index + 1]!;
}

export function nextSurgeLevel(elapsedSeconds: number): number {
  return nextTideStage(elapsedSeconds)?.level ?? tideLevelAt(elapsedSeconds);
}

export function secondsToNextSurge(elapsedSeconds: number): number | null {
  const index = tideStageIndexAt(elapsedSeconds);
  if (index >= TIDE_STAGES.length - 1) return null;
  const stageStart = index * SURGE_INTERVAL_SECONDS;
  return stageStart + SURGE_INTERVAL_SECONDS - elapsedSeconds;
}

export function waterDepthAt(groundHeight: number, tideLevel: number): number {
  return Math.max(0, tideLevel - groundHeight);
}

export type Passability = "dry" | "wade" | "blocked";

export function passabilityAt(depth: number): Passability {
  if (depth <= 0) return "dry";
  if (depth <= WADE_DEPTH_THRESHOLD) return "wade";
  return "blocked";
}
