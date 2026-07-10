import { distanceXZ } from "../world/canyonMath";
import {
  TOTAL_MAIN_LENGTH,
  constrainToCanyon,
  deadendBranches,
  deceptiveBranchIds,
  mainCumulative,
  mainPolyline,
  nearestMainDistance,
  shortcutBranches,
} from "../world/canyon";
import {
  DEFAULT_CAR_TUNING,
  NEUTRAL_CAR_INPUT,
  type CarInput,
  type CarState,
  advanceCar,
  createCarState,
} from "./carKinematics";
import { INITIAL_CAPTURE_STATE, type CaptureState, advanceCapture } from "./captureTension";
import { type MapSlowState, advanceMapSlow, createInitialMapSlowState } from "./mapSlow";
import {
  type RadioLine,
  RADIO_BORDER_NEAR,
  RADIO_CAPTURE_BROKEN,
  RADIO_CAPTURE_CLOSING,
  RADIO_DEADEND_WARNING,
  RADIO_FEINT_FORK,
  RADIO_FEINT_MAIN,
  RADIO_LOSE,
  RADIO_SHORTCUT_APPROACH,
  RADIO_START,
  RADIO_SURGE,
  RADIO_WIN,
  pushRadioLine,
} from "./radio";
import { INITIAL_SURGE_STATE, type SurgeState, applySurge, decaySurgeConfidence, detectSurgeTrigger, surgeMultiplierAt } from "./surge";
import {
  DEFAULT_TRUCK_SEED_ID,
  type TriggerHistory,
  type TruckSample,
  pendingFeintTriggers,
  truckDistanceAt,
  truckPositionAt,
  truckSeedById,
} from "./truckSchedule";

export type RunPhase = "idle" | "playing" | "won" | "lost";

export interface RunResult {
  readonly timeSeconds: number;
  readonly shortcutsTrusted: number;
  readonly surgesTriggered: number;
  readonly finalGapMeters: number;
  readonly missedShortcutLabel: string | null;
}

export interface RunState {
  readonly phase: RunPhase;
  readonly seedId: string;
  readonly elapsed: number;
  readonly car: CarState;
  readonly truck: TruckSample;
  readonly triggerHistory: TriggerHistory;
  readonly capture: CaptureState;
  readonly tensionFraction: number;
  readonly surge: SurgeState;
  readonly mapSlow: MapSlowState;
  readonly lastBranchId: string | null;
  readonly trustedShortcuts: ReadonlySet<string>;
  readonly surgesTriggered: number;
  readonly gap: number;
  readonly gapDelta: number;
  readonly radioLog: readonly RadioLine[];
  readonly result: RunResult | null;
}

function startHeading(): number {
  const [start, next] = mainPolyline;
  return Math.atan2(next[0] - start[0], next[2] - start[2]);
}

export function createInitialRunState(seedId: string = DEFAULT_TRUCK_SEED_ID): RunState {
  const car = createCarState(mainPolyline[0], startHeading());
  const truck = truckPositionAt(0, seedId, {});
  return {
    phase: "idle",
    seedId,
    elapsed: 0,
    car,
    truck,
    triggerHistory: {},
    capture: INITIAL_CAPTURE_STATE,
    tensionFraction: 0,
    surge: INITIAL_SURGE_STATE,
    mapSlow: createInitialMapSlowState(),
    lastBranchId: "main",
    trustedShortcuts: new Set(),
    surgesTriggered: 0,
    gap: distanceXZ(car.position, truck.position),
    gapDelta: 0,
    radioLog: [{ id: "idle", text: RADIO_START, at: 0 }],
    result: null,
  };
}

export function beginRun(seedId: string): RunState {
  return { ...createInitialRunState(seedId), phase: "playing" };
}

export interface RunInput {
  readonly car: CarInput;
  readonly surveyMapHeld: boolean;
}

export const NEUTRAL_RUN_INPUT: RunInput = { car: NEUTRAL_CAR_INPUT, surveyMapHeld: false };

function pickMissedShortcut(trusted: ReadonlySet<string>, truckMainDistance: number): string | null {
  const untaken = shortcutBranches.filter((branch) => !trusted.has(branch.id));
  if (untaken.length === 0) return null;
  let best = untaken[0];
  let bestDelta = Math.abs(mainCumulative[best.fromIndex] - truckMainDistance);
  for (const branch of untaken.slice(1)) {
    const delta = Math.abs(mainCumulative[branch.fromIndex] - truckMainDistance);
    if (delta < bestDelta) {
      best = branch;
      bestDelta = delta;
    }
  }
  return best.label;
}

export function advanceRun(state: RunState, input: RunInput, dt: number): RunState {
  if (state.phase !== "playing" || dt <= 0) return state;
  const elapsed = state.elapsed + dt;

  const decayedSurge = decaySurgeConfidence(state.surge, dt);
  const speedMultiplier = surgeMultiplierAt(decayedSurge, elapsed);
  const advancedCar = advanceCar(state.car, input.car, dt, DEFAULT_CAR_TUNING, speedMultiplier);
  const constrained = constrainToCanyon(advancedCar.position);
  const car: CarState = { ...advancedCar, position: constrained.position };
  const currentBranchId = constrained.nearest.edge.branchId;

  let radioLog = state.radioLog;
  let trustedShortcuts: ReadonlySet<string> = state.trustedShortcuts;
  let surgesTriggered = state.surgesTriggered;
  let surge = decayedSurge;

  if (currentBranchId !== state.lastBranchId) {
    if (deceptiveBranchIds.has(currentBranchId) && !trustedShortcuts.has(currentBranchId)) {
      const grown = new Set(trustedShortcuts);
      grown.add(currentBranchId);
      trustedShortcuts = grown;
    }
    const deadend = deadendBranches.find((branch) => branch.id === currentBranchId);
    if (deadend !== undefined) {
      radioLog = pushRadioLine(radioLog, `deadend-${deadend.id}`, RADIO_DEADEND_WARNING[deadend.id] ?? "Survey marks that dead.", elapsed);
    }
    const shortcut = shortcutBranches.find((branch) => branch.id === currentBranchId);
    if (shortcut !== undefined) {
      radioLog = pushRadioLine(radioLog, `shortcut-${shortcut.id}`, RADIO_SHORTCUT_APPROACH[shortcut.id] ?? "Survey says it's a road.", elapsed);
    }
  }

  if (detectSurgeTrigger(state.lastBranchId, currentBranchId, car.speed, constrained.nearest.distance, deceptiveBranchIds)) {
    surge = applySurge(surge, elapsed);
    surgesTriggered += 1;
    radioLog = pushRadioLine(radioLog, "surge", RADIO_SURGE, elapsed);
  }

  const previousMainDistance = state.truck.mainDistance;
  const nextTruckMainDistance = truckDistanceAt(elapsed, state.seedId);
  const pending = pendingFeintTriggers(previousMainDistance, nextTruckMainDistance, state.triggerHistory, state.seedId);
  let triggerHistory = state.triggerHistory;
  for (const check of pending) {
    const distanceToTruck = distanceXZ(car.position, state.truck.position);
    const seed = truckSeedById(state.seedId);
    const feints = distanceToTruck <= seed.feintProximity;
    triggerHistory = { ...triggerHistory, [check.forkId]: feints };
    radioLog = pushRadioLine(radioLog, `feint-${check.forkId}`, feints ? RADIO_FEINT_FORK : RADIO_FEINT_MAIN, elapsed);
  }
  const truck = truckPositionAt(elapsed, state.seedId, triggerHistory);

  const gap = distanceXZ(car.position, truck.position);
  const gapDelta = gap - state.gap;

  const captureAdvance = advanceCapture(state.capture, gap, elapsed);
  if (state.capture.withinRangeSince === null && captureAdvance.state.withinRangeSince !== null) {
    radioLog = pushRadioLine(radioLog, "capture-closing", RADIO_CAPTURE_CLOSING, elapsed);
  }
  if (state.capture.withinRangeSince !== null && captureAdvance.state.withinRangeSince === null) {
    radioLog = pushRadioLine(radioLog, "capture-broken", RADIO_CAPTURE_BROKEN, elapsed);
  }

  const mapSlow = advanceMapSlow(state.mapSlow, {
    carMainDistance: nearestMainDistance(car.position),
    held: input.surveyMapHeld,
    dt,
  });

  let phase: RunPhase = state.phase;
  let result: RunResult | null = state.result;
  if (captureAdvance.captured) {
    phase = "won";
    result = { timeSeconds: elapsed, shortcutsTrusted: trustedShortcuts.size, surgesTriggered, finalGapMeters: gap, missedShortcutLabel: null };
    radioLog = pushRadioLine(radioLog, "win", RADIO_WIN, elapsed);
  } else if (truck.mainDistance >= TOTAL_MAIN_LENGTH) {
    phase = "lost";
    result = {
      timeSeconds: elapsed,
      shortcutsTrusted: trustedShortcuts.size,
      surgesTriggered,
      finalGapMeters: gap,
      missedShortcutLabel: pickMissedShortcut(trustedShortcuts, truck.mainDistance),
    };
    radioLog = pushRadioLine(radioLog, "lose", RADIO_LOSE, elapsed);
  } else if (TOTAL_MAIN_LENGTH - truck.mainDistance < 150 && TOTAL_MAIN_LENGTH - previousMainDistance >= 150) {
    radioLog = pushRadioLine(radioLog, "border-near", RADIO_BORDER_NEAR, elapsed);
  }

  return {
    phase,
    seedId: state.seedId,
    elapsed,
    car,
    truck,
    triggerHistory,
    capture: captureAdvance.state,
    tensionFraction: captureAdvance.tensionFraction,
    surge,
    mapSlow,
    lastBranchId: currentBranchId,
    trustedShortcuts,
    surgesTriggered,
    gap,
    gapDelta,
    radioLog,
    result,
  };
}
