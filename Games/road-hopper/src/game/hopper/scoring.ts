import {
  EXTRA_LIFE_SCORE,
  SCORE_FLY,
  SCORE_FORWARD,
  SCORE_HOME,
  TIME_BONUS_PER_UNIT,
  TIME_LIMIT,
} from "./constants";

/** Remaining time converts to score at TIME_BONUS_PER_UNIT per whole time unit left. */
export function timeBonus(timeRemaining: number): number {
  return Math.max(0, Math.floor(timeRemaining)) * TIME_BONUS_PER_UNIT;
}

/** Award for a hop that reaches a row further forward than any reached this life. */
export function forwardHopScore(newRow: number, furthestRow: number): number {
  return newRow > furthestRow ? SCORE_FORWARD : 0;
}

/** Points for reaching a home bay: base + time bonus + optional bonus fly. */
export function homeScore(timeRemaining: number, fly: boolean): number {
  return SCORE_HOME + timeBonus(timeRemaining) + (fly ? SCORE_FLY : 0);
}

/** Whether crossing this score should grant the one-time extra life. */
export function crossesExtraLife(previousScore: number, nextScore: number): boolean {
  return previousScore < EXTRA_LIFE_SCORE && nextScore >= EXTRA_LIFE_SCORE;
}

export function timeFraction(timeRemaining: number): number {
  return Math.max(0, Math.min(1, timeRemaining / TIME_LIMIT));
}
