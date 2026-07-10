import { positiveMod } from "../track/geometry";
import { ghostPhaseAt } from "./ghosts";
import type { GhostRecord } from "./types";

export interface DialTick {
  ghostId: string;
  lapIndex: number;
  color: string;
  phase: number;
  faded: boolean;
}

export interface ForecastHit {
  ghostId: string;
  lapIndex: number;
  phase: number;
  secondsAhead: number;
}

const FORECAST_HORIZON_SECONDS = 6;
const FORECAST_STEP_SECONDS = 0.15;
const FORECAST_TOLERANCE = 0.02;

export function dialTicks(ghosts: readonly GhostRecord[], now: number): readonly DialTick[] {
  return ghosts.map((ghost) => ({
    ghostId: ghost.id,
    lapIndex: ghost.lapIndex,
    color: ghost.color,
    phase: ghostPhaseAt(ghost, now),
    faded: ghost.faded,
  }));
}

export function forecastCollision(
  playerS: number,
  playerSPerSecond: number,
  ghosts: readonly GhostRecord[],
  now: number,
): ForecastHit | null {
  if (playerSPerSecond <= 0) return null;
  for (let t = FORECAST_STEP_SECONDS; t <= FORECAST_HORIZON_SECONDS; t += FORECAST_STEP_SECONDS) {
    const projectedS = positiveMod(playerS + playerSPerSecond * t, 1);
    for (const ghost of ghosts) {
      if (ghost.faded) continue;
      const ghostS = ghostPhaseAt(ghost, now + t);
      const diff = Math.abs(projectedS - ghostS);
      const wrapped = Math.min(diff, 1 - diff);
      if (wrapped <= FORECAST_TOLERANCE) {
        return { ghostId: ghost.id, lapIndex: ghost.lapIndex, phase: projectedS, secondsAhead: t };
      }
    }
  }
  return null;
}
