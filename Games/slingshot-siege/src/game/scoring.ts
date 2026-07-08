export interface ShotOutcome {
  targetsDestroyed: number;
  targetsTotal: number;
  shotsUsed: number;
  shotsMax: number;
}

export const POINTS_PER_TARGET = 100;
export const POINTS_PER_SHOT_SAVED = 50;

export function levelCleared(outcome: ShotOutcome): boolean {
  return outcome.targetsTotal > 0 && outcome.targetsDestroyed >= outcome.targetsTotal;
}

export function computeLevelScore(outcome: ShotOutcome): number {
  if (!levelCleared(outcome)) return 0;
  const shotsRemaining = Math.max(0, outcome.shotsMax - outcome.shotsUsed);
  return outcome.targetsTotal * POINTS_PER_TARGET + shotsRemaining * POINTS_PER_SHOT_SAVED;
}

export function perfectScore(targetsTotal: number, shotsMax: number): number {
  return computeLevelScore({ targetsDestroyed: targetsTotal, targetsTotal, shotsUsed: 1, shotsMax });
}

export function starsForScore(score: number, targetsTotal: number, shotsMax: number): 0 | 1 | 2 | 3 {
  if (score <= 0) return 0;
  const best = perfectScore(targetsTotal, shotsMax);
  const ratio = best <= 0 ? 0 : score / best;
  if (ratio >= 0.95) return 3;
  if (ratio >= 0.6) return 2;
  return 1;
}
