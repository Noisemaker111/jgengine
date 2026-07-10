import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { checkpointsFromGates, GATES, LAPS } from "../course/track";
import type { CurrentAssistMood } from "../boats/momentum";

export const MAX_RACE_SEC = 300;

export function createTidewayRaceState(): RaceState {
  const track = raceTrack({ checkpoints: checkpointsFromGates(GATES), laps: LAPS });
  return createRaceState({ track, win: firstPastPost(1) });
}

export type RaceOutcome = "racing" | "win" | "lose";

export function resolveOutcome(raceState: RaceState, playerId: string, elapsedSec: number): RaceOutcome {
  if (raceState.finished) {
    return raceState.ranking[0] === playerId ? "win" : "lose";
  }
  if (elapsedSec >= MAX_RACE_SEC) return "lose";
  return "racing";
}

export interface PlacingRow {
  racerId: string;
  position: number;
  lap: number;
  finished: boolean;
  finishTime: number | null;
  bestSplitSec: number | null;
}

export function computePlacings(raceState: RaceState): readonly PlacingRow[] {
  return raceState.standings().map((progress) => ({
    racerId: progress.racerId,
    position: progress.position,
    lap: progress.lap,
    finished: progress.finished,
    finishTime: progress.finishTime,
    bestSplitSec: progress.splits.length > 0 ? Math.min(...progress.splits) : null,
  }));
}

export function lapTimesFromSplits(splits: readonly number[], gateCount: number): readonly number[] {
  const laps: number[] = [];
  for (let lapIndex = 0; ; lapIndex += 1) {
    const finishIdx = lapIndex * gateCount + (gateCount - 1);
    if (finishIdx >= splits.length) break;
    const prevFinish = lapIndex === 0 ? 0 : (splits[lapIndex * gateCount - 1] ?? 0);
    laps.push(splits[finishIdx]! - prevFinish);
  }
  return laps;
}

export interface SurfTally {
  surfSec: number;
  totalSec: number;
}

export const EMPTY_SURF_TALLY: SurfTally = { surfSec: 0, totalSec: 0 };

export function tallySurfTime(tally: SurfTally, mood: CurrentAssistMood, dt: number): SurfTally {
  return {
    surfSec: tally.surfSec + (mood === "surf" ? dt : 0),
    totalSec: tally.totalSec + dt,
  };
}

export function surfPercent(tally: SurfTally): number {
  if (tally.totalSec <= 0) return 0;
  return (tally.surfSec / tally.totalSec) * 100;
}
