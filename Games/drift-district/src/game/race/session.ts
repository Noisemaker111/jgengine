import type { AxisInput } from "@jgengine/core/input/axisInput";
import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";

import { advanceRival, initRival, type RivalRuntime } from "../rivals/controller";
import { RIVALS } from "../rivals/catalog";
import { createVehicleController, type VehicleController, type VehiclePose } from "../vehicle/controller";
import { CHECKPOINTS, LAPS, SPAWN_HEADING, SPAWN_POSITION } from "./route";
import { gateAt, gateStyleClears, initialShiftState, applyGateTrigger, type ShiftState } from "./shift";

export const PLAYER_RACER_ID = "player";
export const SESSION_STORE_KEY = "session";

export type RacePhase = "start" | "countdown" | "racing" | "finished";
export type RaceOutcome = "win" | "lose" | null;

const COUNTDOWN_SECONDS = 3;
const LAP_TIME_CAP_SECONDS = 75;

export interface RaceToast {
  message: string;
  expiresAt: number;
}

export interface RacerPose {
  position: readonly [number, number, number];
  heading: number;
}

export interface SessionSnapshot {
  phase: RacePhase;
  countdown: number;
  lap: number;
  laps: number;
  currentLapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  totalTime: number;
  speedKmh: number;
  drifting: boolean;
  driftCharge: number;
  boosting: boolean;
  playerPose: RacerPose;
  rivalPoses: Readonly<Record<string, RacerPose>>;
  standings: readonly { racerId: string; position: number; finished: boolean }[];
  shiftState: ShiftState;
  triggeredGates: readonly string[];
  toast: RaceToast | null;
  outcome: RaceOutcome;
  dnf: boolean;
  styleScore: number;
}

interface GateArmState {
  armed: boolean;
}

export interface RaceSession {
  snapshot(): SessionSnapshot;
  confirm(): void;
  restart(): void;
  tick(dt: number, axis: AxisInput, boostPressed: boolean): void;
}

function buildTrack() {
  return raceTrack({ checkpoints: CHECKPOINTS, laps: LAPS });
}

export function createRaceSession(seed: string): RaceSession {
  let phase: RacePhase = "start";
  let countdown = COUNTDOWN_SECONDS;
  let lap = 1;
  let currentLapTime = 0;
  let bestLapTime: number | null = null;
  let lastLapTime: number | null = null;
  let totalTime = 0;
  let toast: RaceToast | null = null;
  let outcome: RaceOutcome = null;
  let dnf = false;
  let styleScore = 0;
  let shiftState: ShiftState = initialShiftState();
  let triggeredGates: string[] = [];
  const gateArm = new Map<string, GateArmState>();

  const vehicle: VehicleController = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
  let vehiclePose: VehiclePose = {
    position: SPAWN_POSITION,
    heading: SPAWN_HEADING,
    speedKmh: 0,
    drifting: false,
    slip: 0,
    driftMeter: { charge: 0, boosting: false, boostTimeRemaining: 0 },
  };

  let raceState: RaceState = createRaceState({ track: buildTrack(), win: firstPastPost(RIVALS.length + 1) });
  raceState.addRacer(PLAYER_RACER_ID, 0);
  let rivalRuntimes: Record<string, RivalRuntime> = {};
  let rivalPoses: Record<string, RacerPose> = {};

  function resetRivals(): void {
    rivalRuntimes = {};
    rivalPoses = {};
    for (const rival of RIVALS) {
      raceState.addRacer(rival.id, 0);
      rivalRuntimes[rival.id] = initRival(rival, shiftState);
      rivalPoses[rival.id] = { position: SPAWN_POSITION, heading: SPAWN_HEADING };
    }
  }
  resetRivals();

  function setToast(message: string, holdSeconds = 2.4): void {
    toast = { message, expiresAt: totalTime + holdSeconds };
  }

  function resetAll(): void {
    countdown = COUNTDOWN_SECONDS;
    lap = 1;
    currentLapTime = 0;
    bestLapTime = null;
    lastLapTime = null;
    totalTime = 0;
    toast = null;
    outcome = null;
    dnf = false;
    styleScore = 0;
    shiftState = initialShiftState();
    triggeredGates = [];
    gateArm.clear();
    vehicle.resetTo(SPAWN_POSITION, SPAWN_HEADING);
    vehiclePose = {
      position: SPAWN_POSITION,
      heading: SPAWN_HEADING,
      speedKmh: 0,
      drifting: false,
      slip: 0,
      driftMeter: { charge: 0, boosting: false, boostTimeRemaining: 0 },
    };
    raceState = createRaceState({ track: buildTrack(), win: firstPastPost(RIVALS.length + 1) });
    raceState.addRacer(PLAYER_RACER_ID, 0);
    resetRivals();
  }

  function evaluateGates(): void {
    const point: readonly [number, number] = [vehiclePose.position[0], vehiclePose.position[2]];
    const hitGateId = gateAt(point, 0);
    for (const gateId of gateArm.keys()) {
      if (gateId !== hitGateId) gateArm.set(gateId, { armed: true });
    }
    if (hitGateId === null) return;
    const state = gateArm.get(hitGateId) ?? { armed: true };
    if (!state.armed) return;
    gateArm.set(hitGateId, { armed: false });
    if (!gateStyleClears(hitGateId, vehiclePose.driftMeter.charge, vehiclePose.drifting)) return;
    shiftState = applyGateTrigger(shiftState, seed, hitGateId);
    triggeredGates = [...triggeredGates, hitGateId];
    styleScore += Math.round(vehiclePose.driftMeter.charge * 100);
    setToast("DISTRICT SHIFTED");
  }

  function advanceRivals(dt: number): void {
    for (const rival of RIVALS) {
      const progress = raceState.progressOf(rival.id);
      if (progress !== null && progress.finished) continue;
      const runtime = rivalRuntimes[rival.id]!;
      const result = advanceRival(runtime, rival, shiftState, dt);
      rivalRuntimes[rival.id] = result.runtime;
      rivalPoses[rival.id] = { position: result.position, heading: result.heading };
    }
  }

  function applyStanding(): void {
    if (raceState.finished && outcome === null) {
      const ranking = raceState.ranking;
      outcome = ranking[0] === PLAYER_RACER_ID ? "win" : "lose";
      phase = "finished";
    }
  }

  return {
    snapshot() {
      return {
        phase,
        countdown,
        lap,
        laps: LAPS,
        currentLapTime,
        bestLapTime,
        lastLapTime,
        totalTime,
        speedKmh: vehiclePose.speedKmh,
        drifting: vehiclePose.drifting,
        driftCharge: vehiclePose.driftMeter.charge,
        boosting: vehiclePose.driftMeter.boosting,
        playerPose: { position: vehiclePose.position, heading: vehiclePose.heading },
        rivalPoses,
        standings: raceState.standings().map((s) => ({ racerId: s.racerId, position: s.position, finished: s.finished })),
        shiftState,
        triggeredGates,
        toast,
        outcome,
        dnf,
        styleScore,
      };
    },
    confirm() {
      if (phase === "start") phase = "countdown";
    },
    restart() {
      resetAll();
      phase = "countdown";
    },
    tick(dt, axis, boostPressed) {
      if (phase === "start") return;

      if (phase === "countdown") {
        countdown = Math.max(0, countdown - dt);
        if (countdown <= 0) phase = "racing";
        return;
      }

      if (phase === "finished") return;

      vehiclePose = vehicle.tick(dt, axis, boostPressed);
      evaluateGates();
      advanceRivals(dt);

      currentLapTime += dt;
      totalTime += dt;

      const positions: Record<string, readonly [number, number, number]> = { [PLAYER_RACER_ID]: vehiclePose.position };
      for (const rival of RIVALS) positions[rival.id] = rivalPoses[rival.id]!.position;

      const events = raceState.update(totalTime, positions);
      for (const event of events) {
        if (event.type === "lap.completed" && event.racerId === PLAYER_RACER_ID) {
          lastLapTime = currentLapTime;
          bestLapTime = bestLapTime === null || currentLapTime < bestLapTime ? currentLapTime : bestLapTime;
          lap = Math.min(LAPS, event.lap + 1);
          currentLapTime = 0;
          setToast(`LAP ${lap} — CHASE THE LINE`);
        }
      }

      if (toast !== null && totalTime > toast.expiresAt) toast = null;

      if (!dnf && currentLapTime > LAP_TIME_CAP_SECONDS && phase === "racing") {
        dnf = true;
        outcome = "lose";
        phase = "finished";
        raceState.eliminate(PLAYER_RACER_ID);
      }

      applyStanding();
    },
  };
}
