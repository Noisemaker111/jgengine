import { createDecayMeterSet, type DecayMeterSet } from "@jgengine/core/survival/decayMeter";

export const CELL_ID = "cell";
export const BATTERY_MAX = 100;
export const COAST_DRAIN_RATE = 1.35;
export const RECHARGE_RATE = 11;
export const LOW_CELL_THRESHOLD = 20;
export const CRITICAL_CELL_THRESHOLD = 8;
export const CRUISE_SPEED_REFERENCE = 18;

export const THROTTLE_LOAD_COEFF = 2.6;
export const CLIMB_LOAD_COEFF = 1.6;
export const BOOST_LOAD_BONUS = 3.1;
export const WIND_LOAD_COEFF = 2.2;

const MAX_CLIMB_REF = 12;
const MAX_WIND_REF = 9;

export interface LoadInputs {
  throttleMagnitude: number;
  verticalSpeed: number;
  boost: boolean;
  headwind: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function computeLoad(inputs: LoadInputs): number {
  const throttleBonus = THROTTLE_LOAD_COEFF * clamp01(inputs.throttleMagnitude);
  const climbBonus = CLIMB_LOAD_COEFF * clamp01(Math.max(0, inputs.verticalSpeed) / MAX_CLIMB_REF);
  const boostBonus = inputs.boost ? BOOST_LOAD_BONUS : 0;
  const windBonus = WIND_LOAD_COEFF * clamp01(Math.max(0, inputs.headwind) / MAX_WIND_REF);
  return 1 + throttleBonus + climbBonus + boostBonus + windBonus;
}

export function createBattery(): DecayMeterSet {
  return createDecayMeterSet([
    {
      id: CELL_ID,
      max: BATTERY_MAX,
      rate: COAST_DRAIN_RATE,
      thresholds: [
        { id: "cell-low", label: "CELL LOW", at: LOW_CELL_THRESHOLD, when: "below", severity: "warning" },
        { id: "cell-critical", label: "CELL CRITICAL", at: CRITICAL_CELL_THRESHOLD, when: "below", severity: "critical" },
      ],
    },
  ]);
}

export function drainBattery(battery: DecayMeterSet, dt: number, load: number): void {
  battery.setRateModifier(CELL_ID, load);
  battery.tick(dt);
}

export function chargeBattery(battery: DecayMeterSet, dt: number): void {
  battery.setRateModifier(CELL_ID, 0);
  battery.tick(dt);
  battery.refill(CELL_ID, RECHARGE_RATE * dt);
}

export function currentDrainRate(load: number): number {
  return COAST_DRAIN_RATE * load;
}

export function estimateRangeMeters(currentCells: number, load: number, cruiseSpeed: number = CRUISE_SPEED_REFERENCE): number {
  const drain = currentDrainRate(load);
  if (drain <= 0) return Number.POSITIVE_INFINITY;
  return (currentCells / drain) * cruiseSpeed;
}

export type BatteryStatus = "ok" | "low" | "critical" | "empty";

export function batteryStatus(currentCells: number): BatteryStatus {
  if (currentCells <= 0) return "empty";
  if (currentCells <= CRITICAL_CELL_THRESHOLD) return "critical";
  if (currentCells <= LOW_CELL_THRESHOLD) return "low";
  return "ok";
}
