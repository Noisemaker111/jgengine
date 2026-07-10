import { createRaceState, firstPastPost, type RaceState } from "@jgengine/core/game/race";
import { windField } from "@jgengine/core/world/wind";

import { fanSpoolState, type FanStage, type FanState } from "../flight/fanSchedule";
import { NO_FLOW, resolveActiveFlow, type Vec3 } from "../flight/flowTube";
import { DEFAULT_GLIDER_TUNING, initialGliderState, resolveSteerInput, stepGlider, type GliderInput, type GliderPhysicsState, type RawSteerInput } from "../flight/glider";
import { initialLaminarState, laminarPercent, laminarTier, onRingCrossed, tickLaminar, type LaminarState } from "../flight/laminarStreak";
import { advancePacer, initPacer, type PacerRuntime } from "./pacer";
import { CHECKPOINTS, FANS, FLOW_TUBES, LAPS, RING_COUNT, SPAWN_HEADING, SPAWN_POSITION } from "./route";

export const PLAYER_RACER_ID = "player";
export const PACER_RACER_ID = "pacer";
export const SESSION_STORE_KEY = "session";

export type RacePhase = "start" | "racing" | "finished";
export type RaceOutcome = "win" | "lose" | null;

const RACE_TIMEOUT_SECONDS = 320;
const FAN_WARNING_SECONDS = 5;
const TOAST_HOLD_SECONDS = 3.2;

export interface ControllerToast {
  readonly id: string;
  readonly message: string;
  readonly expiresAt: number;
}

export interface FanReadout {
  readonly id: string;
  readonly power: number;
  readonly stage: FanStage;
  readonly direction: 1 | -1;
  readonly secondsToNextStage: number;
}

export interface RacerPose {
  readonly position: Vec3;
  readonly heading: number;
}

export interface FlowReadout {
  readonly inTube: boolean;
  readonly inCore: boolean;
  readonly centering: number;
  readonly buffet: number;
}

export interface SessionSnapshot {
  readonly phase: RacePhase;
  readonly outcome: RaceOutcome;
  readonly lap: number;
  readonly laps: number;
  readonly ringIndex: number;
  readonly ringsTotal: number;
  readonly totalTime: number;
  readonly pacerDelta: number | null;
  readonly playerPose: RacerPose;
  readonly pacerPose: RacerPose;
  readonly playerSpeed: number;
  readonly flow: FlowReadout;
  readonly laminar: { readonly streak: number; readonly best: number; readonly multiplier: number; readonly tierLabel: string; readonly percent: number };
  readonly fans: readonly FanReadout[];
  readonly toast: ControllerToast | null;
  readonly playerFinished: boolean;
  readonly playerPosition: number;
}

export interface RaceSession {
  snapshot(): SessionSnapshot;
  start(): void;
  restart(): void;
  requestDodge(): void;
  tick(dt: number, raw: RawSteerInput, thrustHeld: boolean, brakeHeld: boolean): void;
}

const AMBIENT_WIND = windField({ direction: [0.3, 1], speed: 1.4, gust: 0.7, turbulence: 0.5, seed: "turbine-city-ambient" });

function fanStatesAt(time: number): Map<string, FanState> {
  const map = new Map<string, FanState>();
  for (const schedule of FANS) map.set(schedule.id, fanSpoolState(schedule, time));
  return map;
}

function fanPowerLookup(states: ReadonlyMap<string, FanState>): (fanId: string) => { power: number; direction: 1 | -1 } {
  return (fanId) => {
    const state = states.get(fanId);
    return state === undefined ? { power: 0, direction: 1 } : { power: state.power, direction: state.direction };
  };
}

export function createRaceSession(): RaceSession {
  let phase: RacePhase = "start";
  let totalTime = 0;
  let outcome: RaceOutcome = null;
  let toast: ControllerToast | null = null;
  let toastCounter = 0;
  let dodgeRequested = false;
  let announcedFanCycles = new Set<string>();
  let wasInCore = false;

  let playerGlider: GliderPhysicsState = initialGliderState(SPAWN_POSITION, SPAWN_HEADING);
  let pacerRuntime: PacerRuntime = initPacer(SPAWN_POSITION, SPAWN_HEADING);
  let laminar: LaminarState = initialLaminarState();
  let raceState: RaceState = createRaceState({ track: { checkpoints: CHECKPOINTS, laps: LAPS }, win: firstPastPost(2) });
  raceState.addRacer(PLAYER_RACER_ID, 0);
  raceState.addRacer(PACER_RACER_ID, 0);

  function setToast(message: string, holdSeconds = TOAST_HOLD_SECONDS): void {
    toastCounter += 1;
    toast = { id: `toast-${toastCounter}`, message, expiresAt: totalTime + holdSeconds };
  }

  function resetAll(): void {
    totalTime = 0;
    outcome = null;
    toast = null;
    toastCounter = 0;
    dodgeRequested = false;
    announcedFanCycles = new Set<string>();
    wasInCore = false;
    playerGlider = initialGliderState(SPAWN_POSITION, SPAWN_HEADING);
    pacerRuntime = initPacer(SPAWN_POSITION, SPAWN_HEADING);
    laminar = initialLaminarState();
    raceState = createRaceState({ track: { checkpoints: CHECKPOINTS, laps: LAPS }, win: firstPastPost(2) });
    raceState.addRacer(PLAYER_RACER_ID, 0);
    raceState.addRacer(PACER_RACER_ID, 0);
  }

  function evaluateFanCallouts(states: ReadonlyMap<string, FanState>): void {
    for (const schedule of FANS) {
      const state = states.get(schedule.id);
      if (state === undefined) continue;
      const cycleIndex = Math.floor((totalTime + schedule.phaseOffset) / state.cycleSeconds);
      const key = `${schedule.id}:${cycleIndex}`;
      if (state.stage === "on" && state.secondsToNextStage <= FAN_WARNING_SECONDS && !announcedFanCycles.has(key)) {
        announcedFanCycles.add(key);
        const label = schedule.id.replace("fan-", "").toUpperCase();
        setToast(`Fan ${label} spools down in five.`);
      }
    }
  }

  return {
    snapshot(): SessionSnapshot {
      const states = fanStatesAt(totalTime);
      const flow = resolveActiveFlow(FLOW_TUBES, fanPowerLookup(states), playerGlider.position) ?? NO_FLOW;
      const centering = flow.inTube ? Math.max(0, 1 - flow.radialDistance / 11) : 0;
      const playerProgress = raceState.progressOf(PLAYER_RACER_ID);
      const pacerProgress = raceState.progressOf(PACER_RACER_ID);
      let pacerDelta: number | null = null;
      if (playerProgress !== null && pacerProgress !== null) {
        const common = Math.min(playerProgress.splits.length, pacerProgress.splits.length);
        if (common > 0) pacerDelta = playerProgress.splits[common - 1]! - pacerProgress.splits[common - 1]!;
      }
      const tier = laminarTier(laminar);
      return {
        phase,
        outcome,
        lap: playerProgress?.lap ?? 1,
        laps: LAPS,
        ringIndex: playerProgress?.nextCheckpoint ?? 0,
        ringsTotal: RING_COUNT,
        totalTime,
        pacerDelta,
        playerPose: { position: playerGlider.position, heading: playerGlider.heading },
        pacerPose: { position: pacerRuntime.glider.position, heading: pacerRuntime.glider.heading },
        playerSpeed: Math.hypot(playerGlider.velocity[0], playerGlider.velocity[1], playerGlider.velocity[2]),
        flow: { inTube: flow.inTube, inCore: flow.inCore, centering, buffet: flow.buffet },
        laminar: { streak: laminar.streak, best: laminar.best, multiplier: tier.multiplier, tierLabel: tier.label, percent: laminarPercent(laminar) },
        fans: FANS.map((schedule) => {
          const state = states.get(schedule.id)!;
          return { id: schedule.id, power: state.power, stage: state.stage, direction: state.direction, secondsToNextStage: state.secondsToNextStage };
        }),
        toast,
        playerFinished: playerProgress?.finished ?? false,
        playerPosition: playerProgress?.position ?? 1,
      };
    },
    start() {
      if (phase !== "start") return;
      phase = "racing";
      setToast("Cleared for departure. Hold your line.");
    },
    restart() {
      resetAll();
      phase = "racing";
      setToast("Cleared for departure. Hold your line.");
    },
    requestDodge() {
      dodgeRequested = true;
    },
    tick(dt, raw, thrustHeld, brakeHeld) {
      if (phase !== "racing") return;
      totalTime += dt;

      const states = fanStatesAt(totalTime);
      const lookup = fanPowerLookup(states);
      const ambient = AMBIENT_WIND.at(totalTime);

      const flow = resolveActiveFlow(FLOW_TUBES, lookup, playerGlider.position) ?? NO_FLOW;
      const steer = resolveSteerInput(raw);
      const input: GliderInput = { yaw: steer.yaw, pitch: steer.pitch, thrust: thrustHeld ? 1 : 0, brake: brakeHeld ? 1 : 0, dodgeRequested };
      dodgeRequested = false;

      playerGlider = stepGlider(playerGlider, input, flow, ambient, dt, totalTime, DEFAULT_GLIDER_TUNING);
      laminar = tickLaminar(laminar, flow.inCore, dt);

      if (flow.inCore && !wasInCore) setToast("You're in the core — hold her steady.");
      if (!flow.inTube && wasInCore) setToast("Edge turbulence — streak shattered.");
      wasInCore = flow.inCore;

      const pacerAdvance = advancePacer(pacerRuntime, dt, totalTime, lookup, states, ambient);
      pacerRuntime = pacerAdvance.runtime;

      const positions: Record<string, Vec3> = {
        [PLAYER_RACER_ID]: playerGlider.position,
        [PACER_RACER_ID]: pacerAdvance.position,
      };
      const events = raceState.update(totalTime, positions);
      for (const event of events) {
        if (event.type === "checkpoint.hit" && event.racerId === PLAYER_RACER_ID) {
          laminar = onRingCrossed(laminar, flow.inCore);
          setToast(`Ring ${event.checkpoint + 1} of ${RING_COUNT} locked.`);
        }
        if (event.type === "lap.completed" && event.racerId === PLAYER_RACER_ID) {
          setToast(`Lap ${event.lap + 1} — hold your line.`);
        }
        if (event.type === "race.finished") {
          outcome = event.ranking[0] === PLAYER_RACER_ID ? "win" : "lose";
          phase = "finished";
        }
      }

      evaluateFanCallouts(states);

      if (toast !== null && totalTime > toast.expiresAt) toast = null;

      if (phase === "racing" && totalTime > RACE_TIMEOUT_SECONDS) {
        outcome = "lose";
        phase = "finished";
        raceState.eliminate(PLAYER_RACER_ID);
      }
    },
  };
}
