export interface DriftMeterState {
  charge: number;
  boosting: boolean;
  boostTimeRemaining: number;
}

export const DRIFT_CHARGE_RATE = 0.6;
export const BOOST_DRAIN_RATE = 0.85;
export const BOOST_DURATION_CAP = 1.6;
export const BOOST_SPEED_MULTIPLIER = 1.45;

export function initialDriftMeter(): DriftMeterState {
  return { charge: 0, boosting: false, boostTimeRemaining: 0 };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function driftStyleFromSlip(slip: number): number {
  return clamp01(slip / 1.1);
}

export function chargeDriftMeter(state: DriftMeterState, dt: number, driftStyle01: number): DriftMeterState {
  if (state.boosting || dt <= 0) return state;
  return { ...state, charge: clamp01(state.charge + DRIFT_CHARGE_RATE * driftStyle01 * dt) };
}

export function startBoost(state: DriftMeterState): DriftMeterState {
  if (state.charge <= 0 || state.boosting) return state;
  return { ...state, boosting: true, boostTimeRemaining: BOOST_DURATION_CAP };
}

export function tickBoost(state: DriftMeterState, dt: number): DriftMeterState {
  if (!state.boosting || dt <= 0) return state;
  const charge = clamp01(state.charge - BOOST_DRAIN_RATE * dt);
  const boostTimeRemaining = Math.max(0, state.boostTimeRemaining - dt);
  const done = charge <= 0 || boostTimeRemaining <= 0;
  return { charge, boosting: !done, boostTimeRemaining: done ? 0 : boostTimeRemaining };
}
