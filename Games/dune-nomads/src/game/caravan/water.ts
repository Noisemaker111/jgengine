export const WATER_MAX = 100;
export const WATER_BASE_DRAIN = 0.4;
export const WATER_SPEED_DRAIN_COEFF = 0.05;
export const WATER_HEADWIND_DRAIN_COEFF = 1.2;

export const FULL_REFILL_SECONDS = 45;
export const QUICK_TOPUP_SECONDS = 15;
export const QUICK_TOPUP_AMOUNT = 45;

export function headwindSeverity(windAlignment: number): number {
  return Math.max(0, -windAlignment);
}

export function computeWaterDrainRate(input: { speed: number; headwind: number }): number {
  return WATER_BASE_DRAIN + WATER_SPEED_DRAIN_COEFF * input.speed + WATER_HEADWIND_DRAIN_COEFF * input.headwind;
}

export type DockKind = "full" | "quick";

export interface DockState {
  oasisId: string;
  kind: DockKind;
  elapsed: number;
  duration: number;
}

export function dockDurationFor(kind: DockKind): number {
  return kind === "full" ? FULL_REFILL_SECONDS : QUICK_TOPUP_SECONDS;
}

export function startDock(oasisId: string, kind: DockKind): DockState {
  return { oasisId, kind, elapsed: 0, duration: dockDurationFor(kind) };
}

export interface DockAdvanceResult {
  dock: DockState | null;
  completed: boolean;
  refillAmount: number;
}

export function advanceDock(dock: DockState, dt: number): DockAdvanceResult {
  const elapsed = dock.elapsed + dt;
  if (elapsed < dock.duration) {
    return { dock: { ...dock, elapsed }, completed: false, refillAmount: 0 };
  }
  const refillAmount = dock.kind === "full" ? WATER_MAX : QUICK_TOPUP_AMOUNT;
  return { dock: null, completed: true, refillAmount };
}
