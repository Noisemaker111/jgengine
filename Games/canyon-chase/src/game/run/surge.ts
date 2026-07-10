export interface SurgeState {
  readonly confidence: number;
  readonly surgeUntil: number | null;
}

export const INITIAL_SURGE_STATE: SurgeState = { confidence: 0, surgeUntil: null };

export const SURGE_SPEED_MULTIPLIER = 1.35;
export const SURGE_DURATION_SECONDS = 2.5;
export const SURGE_MIN_SPEED = 18;
export const SURGE_CENTER_TOLERANCE = 4;
export const CONFIDENCE_GAIN_PER_SURGE = 0.18;
export const CONFIDENCE_DECAY_PER_SECOND = 0.015;

export function detectSurgeTrigger(
  previousBranchId: string | null,
  currentBranchId: string | null,
  speed: number,
  lateralOffset: number,
  deceptiveBranchIds: ReadonlySet<string>,
): boolean {
  if (currentBranchId === null) return false;
  if (currentBranchId === previousBranchId) return false;
  if (!deceptiveBranchIds.has(currentBranchId)) return false;
  if (speed < SURGE_MIN_SPEED) return false;
  if (Math.abs(lateralOffset) > SURGE_CENTER_TOLERANCE) return false;
  return true;
}

export function applySurge(state: SurgeState, now: number): SurgeState {
  return {
    confidence: Math.min(1, state.confidence + CONFIDENCE_GAIN_PER_SURGE),
    surgeUntil: now + SURGE_DURATION_SECONDS,
  };
}

export function decaySurgeConfidence(state: SurgeState, dt: number): SurgeState {
  return { ...state, confidence: Math.max(0, state.confidence - CONFIDENCE_DECAY_PER_SECOND * dt) };
}

export function isSurging(state: SurgeState, now: number): boolean {
  return state.surgeUntil !== null && now < state.surgeUntil;
}

export function surgeMultiplierAt(state: SurgeState, now: number): number {
  return isSurging(state, now) ? SURGE_SPEED_MULTIPLIER : 1;
}
