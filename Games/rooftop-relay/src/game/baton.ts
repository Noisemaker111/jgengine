import {
  COLD_BATON_GRACE_SECONDS,
  COLD_BATON_PENALTY_PER_SECOND,
  PACE_STREAK_SHAVE_AMOUNT_SECONDS,
  PACE_STREAK_SHAVE_INTERVAL_SECONDS,
  SPRINT_PACE_SPEED,
  TARGET_PACE_SPEED,
  CLEAN_SNAP_BONUS_SECONDS,
  FUMBLE_PENALTY_SECONDS,
} from "./tuning";

export interface BatonState {
  paceStreakSeconds: number;
  coldSeconds: number;
  bonusSeconds: number;
  penaltySeconds: number;
}

export const INITIAL_BATON_STATE: BatonState = {
  paceStreakSeconds: 0,
  coldSeconds: 0,
  bonusSeconds: 0,
  penaltySeconds: 0,
};

export interface BatonTickResult {
  state: BatonState;
  timeDeltaSeconds: number;
  streakShaved: boolean;
}

export function tickBaton(state: BatonState, speed: number, dt: number): BatonTickResult {
  if (dt <= 0) return { state, timeDeltaSeconds: 0, streakShaved: false };

  if (speed >= SPRINT_PACE_SPEED) {
    const paceStreakSeconds = state.paceStreakSeconds + dt;
    const crossedPrev = Math.floor(state.paceStreakSeconds / PACE_STREAK_SHAVE_INTERVAL_SECONDS);
    const crossedNext = Math.floor(paceStreakSeconds / PACE_STREAK_SHAVE_INTERVAL_SECONDS);
    const shaves = crossedNext - crossedPrev;
    const bonus = shaves * PACE_STREAK_SHAVE_AMOUNT_SECONDS;
    return {
      state: {
        paceStreakSeconds,
        coldSeconds: 0,
        bonusSeconds: state.bonusSeconds + bonus,
        penaltySeconds: state.penaltySeconds,
      },
      timeDeltaSeconds: -bonus,
      streakShaved: shaves > 0,
    };
  }

  if (speed < TARGET_PACE_SPEED) {
    const coldSeconds = state.coldSeconds + dt;
    const overGracePrev = Math.max(0, state.coldSeconds - COLD_BATON_GRACE_SECONDS);
    const overGraceNext = Math.max(0, coldSeconds - COLD_BATON_GRACE_SECONDS);
    const penalty = (overGraceNext - overGracePrev) * COLD_BATON_PENALTY_PER_SECOND;
    return {
      state: {
        paceStreakSeconds: 0,
        coldSeconds,
        bonusSeconds: state.bonusSeconds,
        penaltySeconds: state.penaltySeconds + penalty,
      },
      timeDeltaSeconds: penalty,
      streakShaved: false,
    };
  }

  return { state: { ...state, paceStreakSeconds: 0, coldSeconds: 0 }, timeDeltaSeconds: 0, streakShaved: false };
}

export type HandoffQuality = "clean" | "fumble" | "neutral";

export function classifyHandoff(state: BatonState, speed: number): HandoffQuality {
  if (state.paceStreakSeconds > 0 || speed >= SPRINT_PACE_SPEED) return "clean";
  if (speed < TARGET_PACE_SPEED) return "fumble";
  return "neutral";
}

export function handoffTimeDeltaSeconds(quality: HandoffQuality): number {
  if (quality === "clean") return -CLEAN_SNAP_BONUS_SECONDS;
  if (quality === "fumble") return FUMBLE_PENALTY_SECONDS;
  return 0;
}
