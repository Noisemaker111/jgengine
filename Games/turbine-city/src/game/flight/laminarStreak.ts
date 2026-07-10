import { tierForStreak, type StreakTier } from "./streakTiers";

export interface LaminarState {
  readonly streak: number;
  readonly best: number;
  readonly timeInCore: number;
  readonly timeTotal: number;
}

export function initialLaminarState(): LaminarState {
  return { streak: 0, best: 0, timeInCore: 0, timeTotal: 0 };
}

export function tickLaminar(state: LaminarState, inCore: boolean, dt: number): LaminarState {
  const timeInCore = state.timeInCore + (inCore ? dt : 0);
  const timeTotal = state.timeTotal + dt;
  if (!inCore && state.streak > 0) return { streak: 0, best: state.best, timeInCore, timeTotal };
  return { ...state, timeInCore, timeTotal };
}

export function onRingCrossed(state: LaminarState, inCore: boolean): LaminarState {
  if (!inCore) return state;
  const streak = state.streak + 1;
  return { ...state, streak, best: Math.max(state.best, streak) };
}

export function laminarPercent(state: LaminarState): number {
  return state.timeTotal > 0 ? state.timeInCore / state.timeTotal : 0;
}

export function laminarTier(state: LaminarState): StreakTier {
  return tierForStreak(state.streak);
}
